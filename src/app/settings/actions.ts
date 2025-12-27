'use server'

import { createClient } from '@/utils/supabase/server';
import { encrypt, decrypt } from '@/lib/crypto';
import { revalidatePath } from 'next/cache';
import { SettingsForClientSchema, type SettingsForClient, SettingsUpdateSchema, type SettingsUpdate } from '@/lib/settings-schema';

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
    updated_at: new Date().toISOString(),
  };

  // Use update when row exists, otherwise insert.
  const { error } = existing
    ? await supabase.from('organization_settings').update(payload).eq('organization_id', orgId)
    : await supabase.from('organization_settings').insert(payload);

  if (error) {
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
    r2AccountId: '',
    r2AccessKeyId: '',
    r2SecretAccessKey: '',
    medusaApiKey: '',

    // Indicate whether secrets exist
    hasOpenaiApiKey: !!data.openai_api_key,
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
  };
}

