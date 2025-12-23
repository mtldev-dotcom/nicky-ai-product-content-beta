import { create } from 'zustand';
import { saveEncryptedSettings, loadEncryptedSettings } from '@/app/settings/actions';

interface SettingsState {
  openaiApiKey: string;
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2BucketName: string;
  r2PublicUrl: string;
  brandName: string;
  brandVoice: string;
  customInstructions: string;
  isSaving: boolean;
  setOpenaiApiKey: (key: string) => void;
  setR2Settings: (settings: Partial<Omit<SettingsState, 'setOpenaiApiKey' | 'setR2Settings' | 'saveToDb' | 'loadFromDb' | 'isSaving'>>) => void;
  setBrandSettings: (settings: Partial<Pick<SettingsState, 'brandName' | 'brandVoice' | 'customInstructions'>>) => void;
  saveToDb: (organizationId: string) => Promise<void>;
  loadFromDb: (organizationId: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  openaiApiKey: '',
  r2AccountId: '',
  r2AccessKeyId: '',
  r2SecretAccessKey: '',
  r2BucketName: '',
  r2PublicUrl: '',
  brandName: '',
  brandVoice: '',
  customInstructions: '',
  isSaving: false,
  setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
  setR2Settings: (settings) => set((state) => ({ ...state, ...settings })),
  setBrandSettings: (settings) => set((state) => ({ ...state, ...settings })),
  
  loadFromDb: async (organizationId: string) => {
    try {
      const data = await loadEncryptedSettings(organizationId);
      if (data) {
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
      await saveEncryptedSettings(organizationId, state);
    } catch (err) {
      console.error('Error saving settings:', err);
      alert('Failed to save settings to cloud');
    } finally {
      set({ isSaving: false });
    }
  },
}));

