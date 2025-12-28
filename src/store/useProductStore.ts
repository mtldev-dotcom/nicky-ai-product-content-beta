import { create } from 'zustand';
import { saveProductToCloud } from '@/app/products/actions';

export interface Localization {
  title: string;
  subtitle: string;
  description: string;
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

export interface ProductVariant {
  id: string;
  title: string;
  sku: string;
  manage_inventory: boolean;
  allow_backorder: boolean;
  prices: {
    amount: number;
    currency_code: string;
  }[];
  options: Record<string, string>; // e.g., { "Color": "Black" }
  inventory: {
    location_id: string;
    stocked_quantity: number;
  }[];
}

export interface ProductState {
  id?: string;
  organizationId?: string;
  isSaving: boolean;
  translatingLanguages: Set<string>; // Track which languages are currently being translated
  
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
  ignoredUrls: string[];
  
  // Variants/Options
  options: ProductOption[];
  variants: ProductVariant[];
  
  // Taxonomy/Store Integration
  collection_id: string;
  type_id: string;
  tags: string[];
  categories: string[];
  sales_channels: string[];
  shipping_profile_id: string;
  shipping_weight: number;
  shipping_dimensions: { length: number; width: number; height: number };
  
  // AI Metadata
  aiMeta?: {
    fieldsFilledByAI: string[];
    fieldsFromSource: string[];
    languageSource: Record<string, 'original' | 'mixed' | 'translated'>;
  };
  
  // Actions
  updateRoot: (data: Partial<Omit<ProductState, 'localization' | 'images' | 'vault' | 'options' | 'variants' | 'ignoredUrls'>>) => void;
  updateLocalization: (lang: string, data: Partial<Localization>) => void;
  toggleLanguage: (lang: string) => void;
  setImages: (images: string[]) => void;
  reorderImages: (images: string[]) => void;
  setThumbnail: (url: string) => void;
  toggleIgnoreSync: (url: string) => void;
  
  // Enhanced Option Actions
  addOption: (name: string) => void;
  updateOption: (id: string, name: string, translations: Record<string, string>) => void;
  addOptionValue: (optionId: string, value: string) => void;
  updateOptionValue: (optionId: string, valueIndex: number, translations: Record<string, string>) => void;
  removeOptionValue: (optionId: string, valueIndex: number) => void;
  removeOption: (id: string) => void;
  
  // Variant Actions
  setVariants: (variants: ProductVariant[]) => void;
  updateVariant: (id: string, data: Partial<ProductVariant>) => void;
  
  resetStore: () => void;
  bulkUpdate: (data: Partial<ProductState>) => void;
  setOrganizationId: (id: string) => void;
  setIsSaving: (saving: boolean) => void;
  saveToDb: () => Promise<void>;
  setTranslatingLanguage: (lang: string, isTranslating: boolean) => void;
  loadFromBlueprint: (blueprint: any) => void;
}

const INITIAL_LOCALIZATION: Localization = {
  title: '',
  subtitle: '',
  description: '',
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
  translatingLanguages: new Set<string>(),
  localization: {
    en: { ...INITIAL_LOCALIZATION },
    es: { ...INITIAL_LOCALIZATION },
    fr: { ...INITIAL_LOCALIZATION },
    de: { ...INITIAL_LOCALIZATION },
    ja: { ...INITIAL_LOCALIZATION },
  },
  images: [],
  vault: [],
  ignoredUrls: [],
  options: [],
  variants: [],
  collection_id: '',
  type_id: '',
  tags: [],
  categories: [],
  sales_channels: [],
  shipping_profile_id: '',
  shipping_weight: 0,
  shipping_dimensions: { length: 0, width: 0, height: 0 },

  updateRoot: (data) => set((state) => {
    const newState = { ...state, ...data };
    
    // Auto-slugify handle if title changes and no handle provided
    if (data.title && !data.handle && typeof data.title === 'string') {
      newState.handle = data.title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '');
    }

    if (data.title || data.description || data.subtitle) {
      const enLoc = state.localization.en;
      newState.localization.en = {
        ...enLoc,
        title: data.title ?? enLoc.title,
        subtitle: data.subtitle ?? enLoc.subtitle,
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

  toggleIgnoreSync: (url) => set((state) => ({
    ignoredUrls: state.ignoredUrls.includes(url)
      ? state.ignoredUrls.filter((u) => u !== url)
      : [...state.ignoredUrls, url],
  })),

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

  setVariants: (variants) => set({ variants }),

  updateVariant: (id, data) => set((state) => ({
    variants: state.variants.map((v) => (v.id === id ? { ...v, ...data } : v)),
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
    translatingLanguages: new Set<string>(),
    localization: {
      en: { ...INITIAL_LOCALIZATION },
      es: { ...INITIAL_LOCALIZATION },
      fr: { ...INITIAL_LOCALIZATION },
      de: { ...INITIAL_LOCALIZATION },
      ja: { ...INITIAL_LOCALIZATION },
    },
    images: [],
    vault: [],
    ignoredUrls: [],
    options: [],
    variants: [],
    collection_id: '',
    type_id: '',
    tags: [],
    categories: [],
    sales_channels: [],
    shipping_profile_id: '',
    shipping_weight: 0,
    shipping_dimensions: { length: 0, width: 0, height: 0 },
  }),

  setOrganizationId: (id) => set({ organizationId: id }),
  setIsSaving: (saving) => set({ isSaving: saving }),

  saveToDb: async () => {
    const state = get();
    set({ isSaving: true });

    /**
     * Persist via server action so org scoping is enforced server-side.
     *
     * Preconditions:
     * - User is authenticated (server action checks).
     *
     * Postconditions:
     * - Product is saved under the caller's organization.
     */
    const payload = {
      id: state.id,
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
        ignoredUrls: state.ignoredUrls,
        options: state.options,
        variants: state.variants,
        collection_id: state.collection_id,
        type_id: state.type_id,
        tags: state.tags,
        categories: state.categories,
        sales_channels: state.sales_channels,
        shipping_profile_id: state.shipping_profile_id,
        shipping_weight: state.shipping_weight,
        shipping_dimensions: state.shipping_dimensions,
        aiMeta: state.aiMeta,
      },
    } as const;

    try {
      const { id } = await saveProductToCloud(payload);
      if (!state.id) set({ id });
    } catch (err) {
      console.error('Error saving product:', err);
      alert('Failed to save product to cloud');
    } finally {
      set({ isSaving: false });
    }
  },

  bulkUpdate: (data) => set((state) => ({ ...state, ...data })),
  
  setTranslatingLanguage: (lang, isTranslating) => set((state) => {
    const newSet = new Set(state.translatingLanguages);
    if (isTranslating) {
      newSet.add(lang);
    } else {
      newSet.delete(lang);
    }
    return { translatingLanguages: newSet };
  }),

  loadFromBlueprint: (blueprint: any) => {
    // Load ProductBlueprint into product store
    const product = blueprint.product;
    const aiMeta = blueprint.aiMeta || {};
    
    // Build localization from descriptions
    const localization: Record<string, Localization> = {};
    const activeLanguages: string[] = [];
    
    for (const [lang, desc] of Object.entries(product.descriptions || {})) {
      activeLanguages.push(lang);
      const typedDesc = desc as any;
      localization[lang] = {
        title: typedDesc.title || product.identity.title || '',
        subtitle: product.identity.subtitle || typedDesc.short || '',
        description: typedDesc.long || '',
        features: typedDesc.features || [],
        metadata_title: typedDesc.seo?.title || '',
        metadata_description: typedDesc.seo?.description || '',
        keywords: typedDesc.seo?.keywords || [],
      };
    }
    
    // Convert variants
    const variants = (product.variants || []).map((v: any, idx: number) => ({
      id: crypto.randomUUID(),
      title: v.title || `Variant ${idx + 1}`,
      sku: v.sku || '',
      manage_inventory: !!v.inventory,
      allow_backorder: false,
      prices: Object.entries(v.prices || {}).map(([currency, amount]) => ({
        amount: typeof amount === 'number' ? amount : 0,
        currency_code: currency,
      })),
      options: v.options || {},
      inventory: v.inventory ? [{
        location_id: v.inventory.stockLocationId || '',
        stocked_quantity: v.inventory.quantity || 0,
      }] : [],
    }));
    
    // Convert images
    const images = (product.media?.images || []).map((img: any) => img.syncedUrl || img.sourceUrl).filter(Boolean);
    
    // Extract unique options and values from variants
    const optionMap: Record<string, Set<string>> = {};
    (product.variants || []).forEach((v: any) => {
      if (v.options) {
        Object.entries(v.options).forEach(([name, value]) => {
          if (!optionMap[name]) optionMap[name] = new Set();
          if (typeof value === 'string') optionMap[name].add(value);
        });
      }
    });

    const options: ProductOption[] = Object.entries(optionMap).map(([name, values]) => ({
      id: crypto.randomUUID(),
      name,
      translations: { en: name },
      values: Array.from(values).map(v => ({
        value: v,
        translations: { en: v }
      }))
    }));
    
    set({
      title: product.identity.title,
      subtitle: product.identity.subtitle,
      description: localization[activeLanguages[0]]?.description || '',
      handle: product.identity.handle,
      status: 'draft',
      thumbnail: images[0] || '',
      sku: variants[0]?.sku || '',
      price: variants[0]?.prices[0]?.amount || 0,
      activeLanguages,
      localization,
      images,
      options,
      variants,
      collection_id: product.taxonomy.collectionId || '',
      type_id: product.taxonomy.typeId || '',
      tags: product.taxonomy.tags || [],
      categories: product.taxonomy.categoryIds || [],
      sales_channels: [],
      shipping_profile_id: '',
      shipping_weight: product.logistics.weight || 0,
      shipping_dimensions: {
        length: product.logistics.dimensions?.length || 0,
        width: product.logistics.dimensions?.width || 0,
        height: product.logistics.dimensions?.height || 0,
      },
      aiMeta: {
        fieldsFilledByAI: aiMeta.fieldsFilledByAI || [],
        fieldsFromSource: aiMeta.fieldsFromSource || [],
        languageSource: aiMeta.languageSource || {},
      },
    });
  },
}));
