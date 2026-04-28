import type { SettingsForClient } from '@/lib/settings-schema';

export interface SettingsDraftState {
  openaiApiKey: string;
  openrouterApiKey: string;
  falApiKey: string;
  geminiApiKey: string;
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2BucketName: string;
  r2PublicUrl: string;
  brandName: string;
  brandVoice: string;
  customInstructions: string;
  storePlatform: string;
  medusaUrl: string;
  medusaApiKey: string;
  activeLanguages: string[];
  aiImageProvider: string;
  aiImageModel: string;
  defaultSalesChannelId: string | null;
  defaultShippingProfileId: string | null;
  defaultCollectionId: string | null;
  defaultCategoryIds: string[];
}

interface SettingsDraftSource {
  openaiApiKey: string;
  openrouterApiKey: string;
  falApiKey: string;
  geminiApiKey: string;
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2BucketName: string;
  r2PublicUrl: string;
  brandName: string;
  brandVoice: string;
  customInstructions: string;
  storePlatform: string;
  medusaUrl: string;
  medusaApiKey: string;
  activeLanguages: string[];
  aiImageProvider: string;
  aiImageModel: string;
  defaultSalesChannelId: string | null;
  defaultShippingProfileId: string | null;
  defaultCollectionId: string | null;
  defaultCategoryIds: string[];
}

export function toSettingsDraftState(settings: SettingsDraftSource): SettingsDraftState {
  return {
    openaiApiKey: settings.openaiApiKey,
    openrouterApiKey: settings.openrouterApiKey,
    falApiKey: settings.falApiKey,
    geminiApiKey: settings.geminiApiKey,
    r2AccountId: settings.r2AccountId,
    r2AccessKeyId: settings.r2AccessKeyId,
    r2SecretAccessKey: settings.r2SecretAccessKey,
    r2BucketName: settings.r2BucketName,
    r2PublicUrl: settings.r2PublicUrl,
    brandName: settings.brandName,
    brandVoice: settings.brandVoice,
    customInstructions: settings.customInstructions,
    storePlatform: settings.storePlatform,
    medusaUrl: settings.medusaUrl,
    medusaApiKey: settings.medusaApiKey,
    activeLanguages: settings.activeLanguages,
    aiImageProvider: settings.aiImageProvider,
    aiImageModel: settings.aiImageModel,
    defaultSalesChannelId: settings.defaultSalesChannelId,
    defaultShippingProfileId: settings.defaultShippingProfileId,
    defaultCollectionId: settings.defaultCollectionId,
    defaultCategoryIds: settings.defaultCategoryIds,
  };
}

export interface SettingsSecretPresence {
  hasOpenaiApiKey: boolean;
  hasOpenrouterApiKey: boolean;
  hasFalApiKey: boolean;
  hasGeminiApiKey: boolean;
  hasR2AccountId: boolean;
  hasR2AccessKeyId: boolean;
  hasR2SecretAccessKey: boolean;
  hasMedusaApiKey: boolean;
}

export type SettingsSummary = Pick<
  SettingsForClient,
  | 'hasOpenaiApiKey'
  | 'hasOpenrouterApiKey'
  | 'hasFalApiKey'
  | 'hasGeminiApiKey'
  | 'hasR2AccountId'
  | 'hasR2AccessKeyId'
  | 'hasR2SecretAccessKey'
  | 'hasMedusaApiKey'
>;

export interface MedusaNamedEntity {
  id: string;
  name: string;
}

export interface MedusaCollection {
  id: string;
  title: string;
}

export interface MedusaTaxonomyData {
  collections: MedusaCollection[];
  categories: MedusaNamedEntity[];
  sales_channels: MedusaNamedEntity[];
  product_types: MedusaNamedEntity[];
  shipping_profiles: MedusaNamedEntity[];
  currencies: string[];
  stock_locations: MedusaNamedEntity[];
}
