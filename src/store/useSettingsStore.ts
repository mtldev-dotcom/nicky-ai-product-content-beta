import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  openaiApiKey: string;
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2BucketName: string;
  r2PublicUrl: string;
  setOpenaiApiKey: (key: string) => void;
  setR2Settings: (settings: Partial<Omit<SettingsState, 'setOpenaiApiKey' | 'setR2Settings'>>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      openaiApiKey: '',
      r2AccountId: '',
      r2AccessKeyId: '',
      r2SecretAccessKey: '',
      r2BucketName: '',
      r2PublicUrl: '',
      setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
      setR2Settings: (settings) => set((state) => ({ ...state, ...settings })),
    }),
    {
      name: 'product-architect-settings',
    }
  )
);

