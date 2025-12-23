import { create } from 'zustand';
import { createClient } from '@/utils/supabase/client';

export interface Localization {
  title: string;
  subtitle: string;
  description: string;
  short_description: string;
  long_description: string;
  features: string[];
  metadata_title: string;
  metadata_description: string;
  keywords: string[];
}

export interface ProductOptionValue {
  value: string; // The "raw" value like "black" or "18"
  translations: Record<string, string>; // { en: "Black", fr: "Noir" }
}

export interface ProductOption {
  id: string;
  name: string; // e.g., "Color"
  translations: Record<string, string>; // { en: "Color", fr: "Couleur" }
  values: ProductOptionValue[];
}

export interface ProductState {
  id?: string;
  organizationId?: string;
  isSaving: boolean;
  
  // Medusa Top-level
  title: string;
  subtitle: string;
  description: string;
  handle: string;
  status: 'draft' | 'published';
  thumbnail: string;
  sku: string;
  price: number;
  
  // Metadata localization
  activeLanguages: string[];
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
  reorderImages: (images: string[]) => void;
  setThumbnail: (url: string) => void;
  
  // Enhanced Option Actions
  addOption: (name: string) => void;
  updateOption: (id: string, name: string, translations: Record<string, string>) => void;
  addOptionValue: (optionId: string, value: string) => void;
  updateOptionValue: (optionId: string, valueIndex: number, translations: Record<string, string>) => void;
  removeOptionValue: (optionId: string, valueIndex: number) => void;
  removeOption: (id: string) => void;
  
  resetStore: () => void;
  bulkUpdate: (data: Partial<ProductState>) => void;
  setOrganizationId: (id: string) => void;
  setIsSaving: (saving: boolean) => void;
  saveToDb: () => Promise<void>;
}

const INITIAL_LOCALIZATION: Localization = {
  title: '',
  subtitle: '',
  description: '',
  short_description: '',
  long_description: '',
  features: [],
  metadata_title: '',
  metadata_description: '',
  keywords: [],
};

export const useProductStore = create<ProductState>((set, get) => ({
  title: '',
  subtitle: '',
  description: '',
  handle: '',
  status: 'draft',
  thumbnail: '',
  sku: '',
  price: 0,
  activeLanguages: ['en'],
  isSaving: false,
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
    
    // Auto-slugify handle if title changes and no handle provided
    if (data.title && !data.handle) {
      newState.handle = data.title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '');
    }

    if (data.title || data.description || data.subtitle) {
      const enLoc = state.localization.en;
      newState.localization.en = {
        ...enLoc,
        title: data.title ?? enLoc.title,
        subtitle: data.subtitle ?? enLoc.subtitle,
        description: data.description ?? enLoc.description,
        long_description: data.description ?? enLoc.long_description,
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

    if (lang === 'en') {
      return {
        ...nextState,
        title: newLoc.title ?? state.title,
        subtitle: newLoc.subtitle ?? state.subtitle,
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
    const vault = images.slice(0, 6);
    const thumb = images.length > 0 ? images[0] : '';
    return {
      images,
      vault: vault.length >= 3 ? vault : [],
      thumbnail: state.thumbnail || thumb,
    };
  }),

  reorderImages: (images) => set((state) => ({
    images,
    vault: images.slice(0, 6),
    thumbnail: images.includes(state.thumbnail) ? state.thumbnail : (images[0] || ''),
  })),

  setThumbnail: (url) => set({ thumbnail: url }),

  addOption: (name) => set((state) => ({
    options: [...state.options, { 
      id: crypto.randomUUID(), 
      name, 
      translations: { en: name },
      values: [] 
    }],
  })),

  updateOption: (id, name, translations) => set((state) => ({
    options: state.options.map((opt) => (opt.id === id ? { ...opt, name, translations } : opt)),
  })),

  addOptionValue: (optionId, value) => set((state) => ({
    options: state.options.map((opt) => 
      opt.id === optionId 
        ? { ...opt, values: [...opt.values, { value, translations: { en: value } }] } 
        : opt
    ),
  })),

  updateOptionValue: (optionId, valueIndex, translations) => set((state) => ({
    options: state.options.map((opt) => 
      opt.id === optionId 
        ? { 
            ...opt, 
            values: opt.values.map((v, i) => i === valueIndex ? { ...v, translations } : v) 
          } 
        : opt
    ),
  })),

  removeOptionValue: (optionId, valueIndex) => set((state) => ({
    options: state.options.map((opt) => 
      opt.id === optionId 
        ? { ...opt, values: opt.values.filter((_, i) => i !== valueIndex) } 
        : opt
    ),
  })),

  removeOption: (id) => set((state) => ({
    options: state.options.filter((opt) => opt.id !== id),
  })),

  resetStore: () => set({
    title: '',
    subtitle: '',
    description: '',
    handle: '',
    status: 'draft',
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

  setOrganizationId: (id) => set({ organizationId: id }),
  setIsSaving: (saving) => set({ isSaving: saving }),

  saveToDb: async () => {
    const state = get();
    if (!state.organizationId) return;

    set({ isSaving: true });
    const supabase = createClient();

    const productData = {
      organization_id: state.organizationId,
      title: state.title,
      handle: state.handle,
      status: state.status,
      sku: state.sku,
      price: state.price,
      data: {
        subtitle: state.subtitle,
        description: state.description,
        thumbnail: state.thumbnail,
        activeLanguages: state.activeLanguages,
        localization: state.localization,
        images: state.images,
        vault: state.vault,
        options: state.options,
      }
    };

    try {
      if (state.id) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', state.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert(productData)
          .select()
          .single();
        if (error) throw error;
        set({ id: data.id });
      }
    } catch (err) {
      console.error('Error saving product:', err);
      alert('Failed to save product to cloud');
    } finally {
      set({ isSaving: false });
    }
  },

  bulkUpdate: (data) => set((state) => ({ ...state, ...data })),
}));
