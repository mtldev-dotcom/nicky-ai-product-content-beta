import { createClient } from '@/utils/supabase/server';
import { SettingsForClientSchema, type SettingsForClient } from '@/lib/settings-schema';
import { decrypt } from '@/lib/crypto';
import { requireOrgMembership } from '@/lib/auth/auth-context';

type SettingsRow = Record<string, unknown> & {
  organization_id: string;
  openai_api_key?: string | null;
  openrouter_api_key?: string | null;
  fal_api_key?: string | null;
  gemini_api_key?: string | null;
  r2_account_id?: string | null;
  r2_access_key_id?: string | null;
  r2_secret_access_key?: string | null;
  medusa_api_key?: string | null;
  r2_bucket_name?: string | null;
  r2_public_url?: string | null;
  brand_name?: string | null;
  brand_voice?: string | null;
  custom_instructions?: string | null;
  store_platform?: string | null;
  medusa_url?: string | null;
  active_languages?: string[] | null;
  ai_image_provider?: string | null;
  ai_image_model?: string | null;
  ai_studio_prompt_library?: unknown;
  ai_studio_toggle_phrases?: { macro: string; noFingerprints: string; extraRimLight: string } | null;
  preview_layout?: unknown;
  default_sales_channel_id?: string | null;
  default_shipping_profile_id?: string | null;
  default_collection_id?: string | null;
  default_category_ids?: string[] | null;
  variant_option_presets?:
    | Array<{
        id: string;
        name: string;
        options: Array<{ name: string; values: string[] }>;
      }>
    | null;
};

export async function getOrganizationSettingsRow(orgId: string): Promise<SettingsRow | null> {
  await requireOrgMembership(orgId);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organization_settings')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as SettingsRow;
}

export async function getSafeOrganizationSettings(orgId: string): Promise<SettingsForClient | null> {
  const data = await getOrganizationSettingsRow(orgId);
  if (!data) {
    return null;
  }

  return SettingsForClientSchema.parse({
    openaiApiKey: '',
    openrouterApiKey: '',
    falApiKey: '',
    geminiApiKey: '',
    r2AccountId: '',
    r2AccessKeyId: '',
    r2SecretAccessKey: '',
    medusaApiKey: '',
    hasOpenaiApiKey: !!data.openai_api_key,
    hasOpenrouterApiKey: !!data.openrouter_api_key,
    hasFalApiKey: !!data.fal_api_key,
    hasGeminiApiKey: !!data.gemini_api_key,
    hasR2AccountId: !!data.r2_account_id,
    hasR2AccessKeyId: !!data.r2_access_key_id,
    hasR2SecretAccessKey: !!data.r2_secret_access_key,
    hasMedusaApiKey: !!data.medusa_api_key,
    r2BucketName: data.r2_bucket_name ?? '',
    r2PublicUrl: data.r2_public_url ?? '',
    brandName: data.brand_name ?? '',
    brandVoice: data.brand_voice ?? '',
    customInstructions: data.custom_instructions ?? '',
    storePlatform: data.store_platform ?? 'medusa',
    medusaUrl: data.medusa_url ?? '',
    activeLanguages: data.active_languages ?? ['en'],
    aiImageProvider: data.ai_image_provider ?? 'openai',
    aiImageModel: data.ai_image_model ?? '',
    aiStudioPromptLibrary: data.ai_studio_prompt_library ?? null,
    aiStudioTogglePhrases: data.ai_studio_toggle_phrases ?? null,
    previewLayout: data.preview_layout ?? null,
    defaultSalesChannelId: data.default_sales_channel_id ?? null,
    defaultShippingProfileId: data.default_shipping_profile_id ?? null,
    defaultCollectionId: data.default_collection_id ?? null,
    defaultCategoryIds: data.default_category_ids ?? [],
    variantOptionPresets: data.variant_option_presets ?? null,
  });
}

export async function getDecryptedOrganizationSettings(orgId: string) {
  const data = await getOrganizationSettingsRow(orgId);
  if (!data) {
    return null;
  }

  return {
    openaiApiKey: data.openai_api_key ? decrypt(data.openai_api_key, { allowPlaintext: true }) : '',
    falApiKey: data.fal_api_key ? decrypt(data.fal_api_key, { allowPlaintext: true }) : '',
    geminiApiKey: data.gemini_api_key ? decrypt(data.gemini_api_key, { allowPlaintext: true }) : '',
    r2AccountId: data.r2_account_id ? decrypt(data.r2_account_id, { allowPlaintext: true }) : '',
    r2AccessKeyId: data.r2_access_key_id ? decrypt(data.r2_access_key_id, { allowPlaintext: true }) : '',
    r2SecretAccessKey: data.r2_secret_access_key ? decrypt(data.r2_secret_access_key, { allowPlaintext: true }) : '',
    r2BucketName: data.r2_bucket_name ?? '',
    r2PublicUrl: data.r2_public_url ?? '',
    brandName: data.brand_name ?? '',
    brandVoice: data.brand_voice ?? '',
    customInstructions: data.custom_instructions ?? '',
    storePlatform: data.store_platform ?? 'medusa',
    medusaUrl: data.medusa_url ?? '',
    medusaApiKey: data.medusa_api_key ? decrypt(data.medusa_api_key, { allowPlaintext: true }) : '',
    activeLanguages: data.active_languages ?? ['en'],
    aiImageProvider: data.ai_image_provider ?? 'openai',
    aiImageModel: data.ai_image_model ?? '',
    aiStudioPromptLibrary: data.ai_studio_prompt_library ?? null,
    aiStudioTogglePhrases: data.ai_studio_toggle_phrases ?? null,
    defaultSalesChannelId: data.default_sales_channel_id ?? null,
    defaultShippingProfileId: data.default_shipping_profile_id ?? null,
    defaultCollectionId: data.default_collection_id ?? null,
    defaultCategoryIds: data.default_category_ids ?? [],
  };
}
