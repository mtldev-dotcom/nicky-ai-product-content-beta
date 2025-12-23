import { create } from 'zustand';

export interface Localization {
  title: string;
  description: string;
  subtitle?: string;
  features?: string[];
  metadata_title?: string;
  metadata_description?: string;
  keywords?: string[];
}

export interface ProductOption {
  id: string;
  name: string; // e.g., "Size"
  values: string[]; // e.g., ["S", "M", "L"]
}

export interface ProductState {
  // Root properties (Synchronized with EN)
  title: string;
  description: string;
  thumbnail: string;
  sku: string;
  price: number;
  
  // Metadata localization
  activeLanguages: string[]; // e.g., ["en", "es", "fr", "de", "ja"]
  localization: Record<string, Localization>;
  
  // Media
  images: string[];
  vault: string[];
  
  // Variants/Options
  options: ProductOption[];
  
  // Actions
  updateRoot: (data: Partial<Omit<ProductState, 'localization' | 'images' | 'vault' | 'options'>>) => void;
  updateLocalization: (lang: string, data: Partial<Localization>) => void;
  toggleLanguage: (lang: string) => void;
  setImages: (images: string[]) => void;
  addOption: (name: string) => void;
  updateOption: (id: string, values: string[]) => void;
  removeOption: (id: string) => void;
  resetStore: () => void;
  bulkUpdate: (data: Partial<ProductState>) => void;
}

const INITIAL_LOCALIZATION: Localization = {
  title: '',
  description: '',
  subtitle: '',
  features: [],
  metadata_title: '',
  metadata_description: '',
  keywords: [],
};

export const useProductStore = create<ProductState>((set, get) => ({
  title: '',
  description: '',
  thumbnail: '',
  sku: '',
  price: 0,
  activeLanguages: ['en'],
  localization: {
    en: { ...INITIAL_LOCALIZATION },
    es: { ...INITIAL_LOCALIZATION },
    fr: { ...INITIAL_LOCALIZATION },
    de: { ...INITIAL_LOCALIZATION },
    ja: { ...INITIAL_LOCALIZATION },
  },
  images: [],
  vault: [],
  options: [],

  updateRoot: (data) => set((state) => {
    const newState = { ...state, ...data };
    
    // Sync logic: If EN title/description changes, update root
    if (data.title || data.description) {
      const enLoc = state.localization.en;
      newState.localization.en = {
        ...enLoc,
        title: data.title ?? enLoc.title,
        description: data.description ?? enLoc.description,
      };
    }
    
    return newState;
  }),

  updateLocalization: (lang, data) => set((state) => {
    const newLoc = { ...state.localization[lang], ...data };
    const nextState = {
      localization: {
        ...state.localization,
        [lang]: newLoc,
      },
    };

    // Sync logic: If updating EN, sync back to root
    if (lang === 'en') {
      return {
        ...nextState,
        title: newLoc.title ?? state.title,
        description: newLoc.description ?? state.description,
      };
    }

    return nextState;
  }),

  toggleLanguage: (lang) => set((state) => ({
    activeLanguages: state.activeLanguages.includes(lang)
      ? state.activeLanguages.filter((l) => l !== lang)
      : [...state.activeLanguages, lang],
  })),

  setImages: (images) => set((state) => {
    // Vault logic: 3-6 images
    const vault = images.slice(0, 6);
    const thumbnail = images.length > 0 ? images[0] : '';
    
    return {
      images,
      vault: vault.length >= 3 ? vault : [],
      thumbnail: thumbnail || state.thumbnail,
    };
  }),

  addOption: (name) => set((state) => ({
    options: [...state.options, { id: crypto.randomUUID(), name, values: [] }],
  })),

  updateOption: (id, values) => set((state) => ({
    options: state.options.map((opt) => (opt.id === id ? { ...opt, values } : opt)),
  })),

  removeOption: (id) => set((state) => ({
    options: state.options.filter((opt) => opt.id !== id),
  })),

  resetStore: () => set({
    title: '',
    description: '',
    thumbnail: '',
    sku: '',
    price: 0,
    activeLanguages: ['en'],
    localization: {
      en: { ...INITIAL_LOCALIZATION },
      es: { ...INITIAL_LOCALIZATION },
      fr: { ...INITIAL_LOCALIZATION },
      de: { ...INITIAL_LOCALIZATION },
      ja: { ...INITIAL_LOCALIZATION },
    },
    images: [],
    vault: [],
    options: [],
  }),

  bulkUpdate: (data) => set((state) => ({ ...state, ...data })),
}));

