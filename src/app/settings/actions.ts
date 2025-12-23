'use server'

import { createClient } from '@/utils/supabase/server';
import { encrypt, decrypt } from '@/lib/crypto';
import { revalidatePath } from 'next/cache';

export async function saveEncryptedSettings(orgId: string, settings: any) {
  const supabase = await createClient();

  // Encrypt sensitive fields
  const encryptedSettings = {
    organization_id: orgId,
    openai_api_key: settings.openaiApiKey ? encrypt(settings.openaiApiKey) : null,
    r2_account_id: settings.r2AccountId ? encrypt(settings.r2AccountId) : null,
    r2_access_key_id: settings.r2AccessKeyId ? encrypt(settings.r2AccessKeyId) : null,
    r2_secret_access_key: settings.r2SecretAccessKey ? encrypt(settings.r2SecretAccessKey) : null,
    r2_bucket_name: settings.r2BucketName, // Bucket name is generally not sensitive
    r2_public_url: settings.r2PublicUrl,
    brand_name: settings.brandName,
    brand_voice: settings.brandVoice,
    custom_instructions: settings.customInstructions,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('organization_settings')
    .upsert(encryptedSettings);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/settings');
}

export async function loadEncryptedSettings(orgId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('organization_settings')
    .select('*')
    .eq('organization_id', orgId)
    .single();

  if (error || !data) return null;

  // Decrypt sensitive fields
  return {
    openaiApiKey: data.openai_api_key ? decrypt(data.openai_api_key) : '',
    r2AccountId: data.r2_account_id ? decrypt(data.r2_account_id) : '',
    r2AccessKeyId: data.r2_access_key_id ? decrypt(data.r2_access_key_id) : '',
    r2SecretAccessKey: data.r2_secret_access_key ? decrypt(data.r2_secret_access_key) : '',
    r2BucketName: data.r2_bucket_name || '',
    r2PublicUrl: data.r2_public_url || '',
    brandName: data.brand_name || '',
    brandVoice: data.brand_voice || '',
    customInstructions: data.custom_instructions || '',
  };
}

