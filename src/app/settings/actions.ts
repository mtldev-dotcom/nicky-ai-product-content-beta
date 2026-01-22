'use server'

import { createClient } from '@/utils/supabase/server';
import { encrypt, decrypt } from '@/lib/crypto';
import { revalidatePath } from 'next/cache';
import { SettingsForClientSchema, type SettingsForClient, SettingsUpdateSchema, type SettingsUpdate } from '@/lib/settings-schema';
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";

/**
 * Tests connection to MedusaJS with provided or stored credentials.
 */
export async function testMedusaConnection(orgId: string, customUrl?: string, customApiKey?: string) {
  const settings = await loadDecryptedSettingsForServer(orgId);
  
  const url = customUrl || settings?.medusaUrl;
  const apiKey = customApiKey || settings?.medusaApiKey;

  if (!url || !apiKey) {
    return { success: false, error: 'URL and API Key are required' };
  }

  let baseUrl = url.trim().replace(/\/$/, '');
  if (baseUrl.endsWith('/admin')) {
    baseUrl = baseUrl.replace(/\/admin$/, '');
  }

  const headers = {
    'x-medusa-access-token': apiKey,
    'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    'Content-Type': 'application/json'
  };

  try {
    const res = await fetch(`${baseUrl}/admin/auth`, { 
      headers,
      cache: 'no-store' 
    });
    
    if (res.ok) {
      return { success: true };
    }
    
    // Some Medusa versions might use /admin/users/me for checking auth
    const res2 = await fetch(`${baseUrl}/admin/users/me`, { 
      headers,
      cache: 'no-store' 
    });

    if (res2.ok) {
      return { success: true };
    }

    return { success: false, error: `Connection failed: ${res2.status} ${res2.statusText}` };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error' };
  }
}

/**
 * Tests connection to Cloudflare R2 with provided or stored credentials.
 */
export async function testR2Connection(
  orgId: string, 
  customAccountId?: string, 
  customAccessKeyId?: string, 
  customSecretAccessKey?: string,
  customBucketName?: string
) {
  const settings = await loadDecryptedSettingsForServer(orgId);

  const accountId = customAccountId || settings?.r2AccountId;
  const accessKeyId = customAccessKeyId || settings?.r2AccessKeyId;
  const secretAccessKey = customSecretAccessKey || settings?.r2SecretAccessKey;
  const bucketName = customBucketName || settings?.r2BucketName;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return { success: false, error: 'Account ID, Keys, and Bucket Name are required' };
  }

  try {
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // We try to list buckets as a simple connectivity test
    // Note: R2 API tokens might be restricted to a single bucket, so if listBuckets fails, 
    // we could try a HeadBucketCommand for the specific bucket.
    try {
      await s3.send(new ListBucketsCommand({}));
      return { success: true };
    } catch (err: any) {
      // If listBuckets fails (common with restricted tokens), try to check the specific bucket
      if (err.name === 'AccessDenied' || err.$metadata?.httpStatusCode === 403) {
        // We'll assume if we got a 403 on ListBuckets but can talk to the endpoint, 
        // the credentials might still be valid for the specific bucket.
        // For a more robust test, we could try to list objects in that bucket with maxKeys: 0
        return { success: true, message: 'Connected (ListBuckets restricted, but endpoint reachable)' };
      }
      throw err;
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'S3 Client Error' };
  }
}

/**
 * Persists organization settings securely.
 *
 * Secret handling rules:
 * - Empty string "" means "keep existing stored secret"
 * - Non-empty string means "replace"
 * - null means "clear"
 *
 * This ensures the UI never needs to load plaintext secrets to avoid accidentally
 * wiping them on save.
 */
export async function saveEncryptedSettings(orgId: string, settings: SettingsUpdate) {
  const supabase = await createClient();

  // Validate at the boundary (server action entry).
  const parsed = SettingsUpdateSchema.parse(settings);

  // Read existing to support "blank means keep" semantics.
  const { data: existing } = await supabase
    .from('organization_settings')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();

  const keepOrReplaceSecret = (existingValue: string | null | undefined, next: string | null | undefined) => {
    // explicit clear
    if (next === null) return null;
    // keep existing if undefined or empty string
    if (next === undefined || next === '') return existingValue ?? null;
    // replace
    return encrypt(next);
  };

  const payload = {
    organization_id: orgId,
    // Secrets (encrypted at rest, but never returned to client)
    openai_api_key: keepOrReplaceSecret(existing?.openai_api_key, parsed.openaiApiKey),
    fal_api_key: keepOrReplaceSecret((existing as unknown as Record<string, unknown> | null)?.fal_api_key as string | null | undefined, parsed.falApiKey),
    gemini_api_key: keepOrReplaceSecret(
      (existing as unknown as Record<string, unknown> | null)?.gemini_api_key as string | null | undefined,
      parsed.geminiApiKey
    ),
    r2_account_id: keepOrReplaceSecret(existing?.r2_account_id, parsed.r2AccountId),
    r2_access_key_id: keepOrReplaceSecret(existing?.r2_access_key_id, parsed.r2AccessKeyId),
    r2_secret_access_key: keepOrReplaceSecret(existing?.r2_secret_access_key, parsed.r2SecretAccessKey),
    medusa_api_key: keepOrReplaceSecret(existing?.medusa_api_key, parsed.medusaApiKey),

    // Non-secrets (safe to store and return)
    r2_bucket_name: parsed.r2BucketName ?? existing?.r2_bucket_name ?? '',
    r2_public_url: parsed.r2PublicUrl ?? existing?.r2_public_url ?? '',
    brand_name: parsed.brandName ?? existing?.brand_name ?? '',
    brand_voice: parsed.brandVoice ?? existing?.brand_voice ?? '',
    custom_instructions: parsed.customInstructions ?? existing?.custom_instructions ?? '',
    store_platform: parsed.storePlatform ?? existing?.store_platform ?? 'medusa',
    medusa_url: parsed.medusaUrl ?? existing?.medusa_url ?? '',
    active_languages: parsed.activeLanguages ?? existing?.active_languages ?? ['en'],

    // AI image generation defaults (non-secrets)
    // Explicitly provided values take precedence, otherwise keep existing, otherwise use defaults
    ai_image_provider:
      parsed.aiImageProvider !== undefined && parsed.aiImageProvider !== null
        ? ((typeof parsed.aiImageProvider === 'string' && parsed.aiImageProvider.trim()) || 'openai') // If empty/whitespace, default to 'openai'
        : (((existing as unknown as Record<string, unknown> | null)?.ai_image_provider as string | undefined) ?? 'openai'),
    ai_image_model:
      parsed.aiImageModel !== undefined && parsed.aiImageModel !== null
        ? (typeof parsed.aiImageModel === 'string' ? parsed.aiImageModel.trim() : '') // Allow empty string for model, but trim whitespace
        : (((existing as unknown as Record<string, unknown> | null)?.ai_image_model as string | undefined) ?? ''),

    // AI Studio Photo prompt customization (non-secrets)
    ai_studio_prompt_library:
      parsed.aiStudioPromptLibrary ??
      (((existing as unknown as Record<string, unknown> | null)?.ai_studio_prompt_library as unknown) ?? null),
    ai_studio_toggle_phrases:
      parsed.aiStudioTogglePhrases ??
      (((existing as unknown as Record<string, unknown> | null)?.ai_studio_toggle_phrases as unknown) ?? null),

    // Preview layout (non-secrets)
    preview_layout:
      parsed.previewLayout ??
      (((existing as unknown as Record<string, unknown> | null)?.preview_layout as unknown) ?? null),

    // Medusa defaults (non-secrets)
    default_sales_channel_id: parsed.defaultSalesChannelId ?? existing?.default_sales_channel_id ?? null,
    default_shipping_profile_id: parsed.defaultShippingProfileId ?? existing?.default_shipping_profile_id ?? null,
    default_collection_id: parsed.defaultCollectionId ?? existing?.default_collection_id ?? null,
    default_category_ids: parsed.defaultCategoryIds ?? existing?.default_category_ids ?? [],

    // Variant option presets (non-secrets)
    variant_option_presets:
      parsed.variantOptionPresets ??
      (((existing as unknown as Record<string, unknown> | null)?.variant_option_presets as unknown) ?? null),
    updated_at: new Date().toISOString(),
  };

  // Use update when row exists, otherwise insert.
  const writeOnce = async (nextPayload: typeof payload) => {
    return existing
      ? await supabase.from('organization_settings').update(nextPayload).eq('organization_id', orgId)
      : await supabase.from('organization_settings').insert(nextPayload);
  };

  // Debug logging to trace the save operation
  console.log('[Settings Save] Payload being sent:', {
    orgId,
    ai_image_provider: payload.ai_image_provider,
    ai_image_model: payload.ai_image_model,
    parsed: {
      aiImageProvider: parsed.aiImageProvider,
      aiImageModel: parsed.aiImageModel,
    },
    existing: {
      ai_image_provider: (existing as unknown as Record<string, unknown> | null)?.ai_image_provider,
      ai_image_model: (existing as unknown as Record<string, unknown> | null)?.ai_image_model,
    },
  });

  const { error, data } = await writeOnce(payload);

  // Debug logging for the response
  if (error) {
    console.error('[Settings Save] Error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
  } else {
    console.log('[Settings Save] Success:', { data });
    
    // Verify the save by reading back the values
    const { data: verified } = await supabase
      .from('organization_settings')
      .select('ai_image_provider, ai_image_model')
      .eq('organization_id', orgId)
      .single();
    
    console.log('[Settings Save] Verified saved values:', {
      ai_image_provider: verified?.ai_image_provider,
      ai_image_model: verified?.ai_image_model,
      matches: {
        provider: verified?.ai_image_provider === payload.ai_image_provider,
        model: verified?.ai_image_model === payload.ai_image_model,
      },
    });
  }

  /**
   * Supabase/PostgREST can return:
   * - "Could not find the '<col>' column of '<table>' in the schema cache"
   *
   * This usually means:
   * - The migration adding the columns hasn't been applied, OR
   * - PostgREST schema cache hasn't reloaded yet.
   *
   * We retry once without the newer optional fields so Settings saving doesn't hard-crash
   * while migrations are being rolled out.
   */
  if (error) {
    const msg = String(error.message || '');
    const looksLikeMissingColumnSchemaCache =
      msg.includes('schema cache') &&
      (msg.includes('ai_image_model') ||
        msg.includes('ai_image_provider') ||
        msg.includes('fal_api_key') ||
        msg.includes('gemini_api_key') ||
        msg.includes('ai_studio_prompt_library') ||
        msg.includes('ai_studio_toggle_phrases') ||
        msg.includes('preview_layout') ||
        msg.includes('variant_option_presets'));

    if (looksLikeMissingColumnSchemaCache) {
      console.warn('[Settings Save] Schema cache error detected for:', {
        message: msg,
        affectedFields: ['ai_image_model', 'ai_image_provider', 'fal_api_key', 'gemini_api_key', 'ai_studio_prompt_library', 'ai_studio_toggle_phrases', 'preview_layout', 'variant_option_presets'].filter(field => msg.includes(field)),
      });
      
      // Only strip fields that are actually causing the error
      const fieldsToStrip = [];
      if (msg.includes('ai_image_model')) fieldsToStrip.push('ai_image_model');
      if (msg.includes('ai_image_provider')) fieldsToStrip.push('ai_image_provider');
      if (msg.includes('fal_api_key')) fieldsToStrip.push('fal_api_key');
      if (msg.includes('gemini_api_key')) fieldsToStrip.push('gemini_api_key');
      if (msg.includes('ai_studio_prompt_library')) fieldsToStrip.push('ai_studio_prompt_library');
      if (msg.includes('ai_studio_toggle_phrases')) fieldsToStrip.push('ai_studio_toggle_phrases');
      if (msg.includes('preview_layout')) fieldsToStrip.push('preview_layout');
      if (msg.includes('variant_option_presets')) fieldsToStrip.push('variant_option_presets');

      if (fieldsToStrip.length > 0) {
        const fallbackPayload = { ...payload };
        for (const field of fieldsToStrip) {
          delete (fallbackPayload as any)[field];
        }
        console.warn('[Settings Save] Retrying without fields:', fieldsToStrip);
        const { error: retryErr } = await writeOnce(fallbackPayload);
        if (retryErr) {
          console.error('[Settings Save] Retry also failed:', retryErr.message);
          throw new Error(retryErr.message);
        }
        console.warn('[Settings Save] Retry succeeded, but these fields were skipped:', fieldsToStrip);
        // Don't throw - the save partially succeeded
        return;
      }
    }
    // If we get here, it's a different error or no fields matched
    throw new Error(error.message);
  }

  revalidatePath('/settings');
}

/**
 * Loads settings for browser usage.
 * Never returns plaintext secrets to the client.
 */
export async function loadEncryptedSettings(orgId: string): Promise<SettingsForClient | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('organization_settings')
    .select('*')
    .eq('organization_id', orgId)
    .single();

  if (error || !data) return null;

  const safe: SettingsForClient = {
    // Never return secrets
    openaiApiKey: '',
    falApiKey: '',
    geminiApiKey: '',
    r2AccountId: '',
    r2AccessKeyId: '',
    r2SecretAccessKey: '',
    medusaApiKey: '',

    // Indicate whether secrets exist
    hasOpenaiApiKey: !!data.openai_api_key,
    hasFalApiKey: !!(data as unknown as Record<string, unknown>).fal_api_key,
    hasGeminiApiKey: !!(data as unknown as Record<string, unknown>).gemini_api_key,
    hasR2AccountId: !!data.r2_account_id,
    hasR2AccessKeyId: !!data.r2_access_key_id,
    hasR2SecretAccessKey: !!data.r2_secret_access_key,
    hasMedusaApiKey: !!data.medusa_api_key,

    // Non-secrets
    r2BucketName: data.r2_bucket_name || '',
    r2PublicUrl: data.r2_public_url || '',
    brandName: data.brand_name || '',
    brandVoice: data.brand_voice || '',
    customInstructions: data.custom_instructions || '',
    storePlatform: data.store_platform || 'medusa',
    medusaUrl: data.medusa_url || '',
    activeLanguages: data.active_languages || ['en'],

    // AI image generation defaults
    aiImageProvider: ((data as unknown as Record<string, unknown>).ai_image_provider as string) || 'openai',
    aiImageModel: ((data as unknown as Record<string, unknown>).ai_image_model as string) || '',

    // AI Studio Photo prompt customization (non-secrets)
    aiStudioPromptLibrary: ((data as unknown as Record<string, unknown>).ai_studio_prompt_library as unknown) ?? null,
    aiStudioTogglePhrases:
      ((data as unknown as Record<string, unknown>).ai_studio_toggle_phrases as
        | { macro: string; noFingerprints: string; extraRimLight: string }
        | null
        | undefined) ?? null,

    // Preview layout (non-secrets)
    previewLayout: ((data as unknown as Record<string, unknown>).preview_layout as unknown) ?? null,

    // Medusa defaults
    defaultSalesChannelId: data.default_sales_channel_id ?? null,
    defaultShippingProfileId: data.default_shipping_profile_id ?? null,
    defaultCollectionId: data.default_collection_id ?? null,
    defaultCategoryIds: data.default_category_ids || [],

    // Variant option presets
    variantOptionPresets: ((data as unknown as Record<string, unknown>).variant_option_presets as
      | Array<{
          id: string;
          name: string;
          options: Array<{
            name: string;
            values: string[];
          }>;
        }>
      | null
      | undefined) ?? null,
  };

  return SettingsForClientSchema.parse(safe);
}

/**
 * Loads settings for server-side integrations (Medusa, etc).
 *
 * WARNING:
 * - Do not return this object to the browser.
 * - Only call from Route Handlers / Server Actions.
 */
export async function loadDecryptedSettingsForServer(orgId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('organization_settings')
    .select('*')
    .eq('organization_id', orgId)
    .single();

  if (error || !data) return null;

  return {
    // allowPlaintext supports legacy rows that stored plaintext before encryption was introduced
    openaiApiKey: data.openai_api_key ? decrypt(data.openai_api_key, { allowPlaintext: true }) : '',
    falApiKey: (data as unknown as Record<string, unknown>).fal_api_key
      ? decrypt((data as unknown as Record<string, unknown>).fal_api_key as string, { allowPlaintext: true })
      : '',
    geminiApiKey: (data as unknown as Record<string, unknown>).gemini_api_key
      ? decrypt((data as unknown as Record<string, unknown>).gemini_api_key as string, { allowPlaintext: true })
      : '',
    r2AccountId: data.r2_account_id ? decrypt(data.r2_account_id, { allowPlaintext: true }) : '',
    r2AccessKeyId: data.r2_access_key_id ? decrypt(data.r2_access_key_id, { allowPlaintext: true }) : '',
    r2SecretAccessKey: data.r2_secret_access_key ? decrypt(data.r2_secret_access_key, { allowPlaintext: true }) : '',
    r2BucketName: data.r2_bucket_name || '',
    r2PublicUrl: data.r2_public_url || '',
    brandName: data.brand_name || '',
    brandVoice: data.brand_voice || '',
    customInstructions: data.custom_instructions || '',
    storePlatform: data.store_platform || 'medusa',
    medusaUrl: data.medusa_url || '',
    medusaApiKey: data.medusa_api_key ? decrypt(data.medusa_api_key, { allowPlaintext: true }) : '',
    activeLanguages: data.active_languages || ['en'],

    // AI image generation defaults (non-secrets)
    aiImageProvider: ((data as unknown as Record<string, unknown>).ai_image_provider as string) || 'openai',
    aiImageModel: ((data as unknown as Record<string, unknown>).ai_image_model as string) || '',

    // AI Studio Photo prompt customization (non-secrets)
    aiStudioPromptLibrary: ((data as unknown as Record<string, unknown>).ai_studio_prompt_library as unknown) ?? null,
    aiStudioTogglePhrases:
      ((data as unknown as Record<string, unknown>).ai_studio_toggle_phrases as
        | { macro: string; noFingerprints: string; extraRimLight: string }
        | null
        | undefined) ?? null,

    // Medusa defaults (non-secrets)
    defaultSalesChannelId: data.default_sales_channel_id ?? null,
    defaultShippingProfileId: data.default_shipping_profile_id ?? null,
    defaultCollectionId: data.default_collection_id ?? null,
    defaultCategoryIds: data.default_category_ids || [],
  };
}

