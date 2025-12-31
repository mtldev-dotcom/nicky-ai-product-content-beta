import { create } from 'zustand';
import { saveEncryptedSettings, loadEncryptedSettings } from '@/app/settings/actions';
import type { SettingsUpdate } from '@/lib/settings-schema';

interface SettingsState {
  openaiApiKey: string;
  hasOpenaiApiKey: boolean;
  falApiKey: string;
  hasFalApiKey: boolean;
  geminiApiKey: string;
  hasGeminiApiKey: boolean;
  r2AccountId: string;
  hasR2AccountId: boolean;
  r2AccessKeyId: string;
  hasR2AccessKeyId: boolean;
  r2SecretAccessKey: string;
  hasR2SecretAccessKey: boolean;
  r2BucketName: string;
  r2PublicUrl: string;
  brandName: string;
  brandVoice: string;
  customInstructions: string;
  storePlatform: string;
  medusaUrl: string;
  medusaApiKey: string;
  hasMedusaApiKey: boolean;
  activeLanguages: string[];

  // AI image generation defaults (non-secrets)
  aiImageProvider: string;
  aiImageModel: string;

  // AI Studio Photo prompt customization (non-secrets)
  aiStudioPromptLibrary: unknown | null;
  aiStudioTogglePhrases: { macro: string; noFingerprints: string; extraRimLight: string } | null;

  // Medusa defaults for new product drafts
  defaultSalesChannelId: string | null;
  defaultShippingProfileId: string | null;
  defaultCollectionId: string | null;
  defaultCategoryIds: string[];

  isSaving: boolean;
  setOpenaiApiKey: (key: string) => void;
  setFalApiKey: (key: string) => void;
  setGeminiApiKey: (key: string) => void;
  setAiImageDefaults: (settings: Partial<Pick<SettingsState, 'aiImageProvider' | 'aiImageModel'>>) => void;
  setAiStudioPromptLibrary: (library: unknown | null) => void;
  setAiStudioTogglePhrases: (phrases: SettingsState['aiStudioTogglePhrases']) => void;
  setR2Settings: (settings: Partial<Pick<SettingsState, 'r2AccountId' | 'r2AccessKeyId' | 'r2SecretAccessKey' | 'r2BucketName' | 'r2PublicUrl'>>) => void;
  setBrandSettings: (settings: Partial<Pick<SettingsState, 'brandName' | 'brandVoice' | 'customInstructions'>>) => void;
  setStoreSettings: (
    settings: Partial<
      Pick<
        SettingsState,
        | 'storePlatform'
        | 'medusaUrl'
        | 'medusaApiKey'
        | 'activeLanguages'
        | 'defaultSalesChannelId'
        | 'defaultShippingProfileId'
        | 'defaultCollectionId'
        | 'defaultCategoryIds'
      >
    >
  ) => void;
  saveToDb: (organizationId: string) => Promise<void>;
  loadFromDb: (organizationId: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  openaiApiKey: '',
  hasOpenaiApiKey: false,
  falApiKey: '',
  hasFalApiKey: false,
  geminiApiKey: '',
  hasGeminiApiKey: false,
  r2AccountId: '',
  hasR2AccountId: false,
  r2AccessKeyId: '',
  hasR2AccessKeyId: false,
  r2SecretAccessKey: '',
  hasR2SecretAccessKey: false,
  r2BucketName: '',
  r2PublicUrl: '',
  brandName: '',
  brandVoice: '',
  customInstructions: '',
  storePlatform: 'medusa',
  medusaUrl: '',
  medusaApiKey: '',
  hasMedusaApiKey: false,
  activeLanguages: ['en'],
  aiImageProvider: 'openai',
  aiImageModel: '',
  aiStudioPromptLibrary: null,
  aiStudioTogglePhrases: null,
  defaultSalesChannelId: null,
  defaultShippingProfileId: null,
  defaultCollectionId: null,
  defaultCategoryIds: [],
  isSaving: false,
  setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
  setFalApiKey: (falApiKey) => set({ falApiKey }),
  setGeminiApiKey: (geminiApiKey) => set({ geminiApiKey }),
  setAiImageDefaults: (settings) => set((state) => ({ ...state, ...settings })),
  setAiStudioPromptLibrary: (aiStudioPromptLibrary) => set({ aiStudioPromptLibrary }),
  setAiStudioTogglePhrases: (aiStudioTogglePhrases) => set({ aiStudioTogglePhrases }),
  setR2Settings: (settings) => set((state) => ({ ...state, ...settings })),
  setBrandSettings: (settings) => set((state) => ({ ...state, ...settings })),
  setStoreSettings: (settings) => set((state) => ({ ...state, ...settings })),
  
  loadFromDb: async (organizationId: string) => {
    try {
      const data = await loadEncryptedSettings(organizationId);
      if (data) {
        // `data` is safe for browser: secrets are blank + has* flags describe presence.
        set({ ...data });
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  },

  saveToDb: async (organizationId: string) => {
    set({ isSaving: true });
    try {
      const state = get();
      /**
       * Only send fields that the server action expects.
       * Note: secrets use "update semantics":
       * - "" => keep existing secret
       * - non-empty => replace
       */
      const payload: SettingsUpdate = {
        openaiApiKey: state.openaiApiKey,
        falApiKey: state.falApiKey,
        geminiApiKey: state.geminiApiKey,
        r2AccountId: state.r2AccountId,
        r2AccessKeyId: state.r2AccessKeyId,
        r2SecretAccessKey: state.r2SecretAccessKey,
        medusaApiKey: state.medusaApiKey,

        r2BucketName: state.r2BucketName,
        r2PublicUrl: state.r2PublicUrl,
        brandName: state.brandName,
        brandVoice: state.brandVoice,
        customInstructions: state.customInstructions,
        storePlatform: state.storePlatform,
        medusaUrl: state.medusaUrl,
        activeLanguages: state.activeLanguages,

        aiImageProvider: state.aiImageProvider,
        aiImageModel: state.aiImageModel,

        aiStudioPromptLibrary: state.aiStudioPromptLibrary,
        aiStudioTogglePhrases: state.aiStudioTogglePhrases,

        defaultSalesChannelId: state.defaultSalesChannelId,
        defaultShippingProfileId: state.defaultShippingProfileId,
        defaultCollectionId: state.defaultCollectionId,
        defaultCategoryIds: state.defaultCategoryIds,
      };

      await saveEncryptedSettings(organizationId, payload);
    } catch (err) {
      console.error('Error saving settings:', err);
      alert('Failed to save settings to cloud');
    } finally {
      set({ isSaving: false });
    }
  },
}));

