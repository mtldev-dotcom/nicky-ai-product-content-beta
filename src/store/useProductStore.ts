import { create } from 'zustand';
import { saveProductToCloud } from '@/app/products/actions';
import type { ProductBlueprint } from '@/lib/ingest-types';
import { canonicalizeColorValue, isColorishTitle, normalizeColorsTitle, displayEnFromCanonical, displayFrFromCanonical } from '@/lib/medusa/colors-normalization';

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
  options: Record<string, string>; // e.g., { "Colors": "silver/blue" }
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
  medusaProductId?: string;

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
  loadFromBlueprint: (blueprint: ProductBlueprint) => void;
  loadFromSavedProduct: (record: SavedProductRecord) => void;
  applyMedusaDefaultsForNewProduct: (defaults: MedusaDefaults) => void;
}

export type MedusaDefaults = {
  defaultSalesChannelId?: string | null;
  defaultShippingProfileId?: string | null;
  defaultCollectionId?: string | null;
  defaultCategoryIds?: string[];
};

export type SavedProductRecord = {
  id: string;
  title: string;
  handle: string;
  status: 'draft' | 'published';
  sku: string | null;
  price: number | null;
  data: unknown | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
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

  addOption: (name) => set((state) => {
    const rawName = name.trim();
    const isColorish = isColorishTitle(rawName);
    const finalName = isColorish ? normalizeColorsTitle(rawName) : rawName;

    const translations = isColorish
      ? { en: 'Colors', fr: 'Couleurs' }
      : { en: finalName };

    return {
      options: [...state.options, {
        id: crypto.randomUUID(),
        name: finalName,
        translations,
        values: []
      }],
      // Options changed -> clear variants to prevent mismatched combinations
      variants: [],
    };
  }),

  updateOption: (id, name, translations) => set((state) => ({
    options: state.options.map((opt) => (opt.id === id ? { ...opt, name, translations } : opt)),
  })),

  addOptionValue: (optionId, value) => set((state) => {
    const opt = state.options.find((o) => o.id === optionId);
    const isColors = opt ? isColorishTitle(opt.name) : false;

    const raw = value.trim();
    const canon = isColors ? canonicalizeColorValue(raw) : raw;

    // Dedupe (case-sensitive for non-colors, canonical for colors)
    const key = canon;

    return {
      options: state.options.map((o) => {
        if (o.id !== optionId) return o;

        const exists = o.values.some((v) => (isColors ? canonicalizeColorValue(v.value) : v.value) === key);
        if (exists) return o;

        const translations = isColors
          ? { en: displayEnFromCanonical(canon), fr: displayFrFromCanonical(canon) }
          : { en: raw };

        return { ...o, values: [...o.values, { value: canon, translations }] };
      }),
      // Changing values invalidates variant matrix
      variants: [],
    };
  }),

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
    variants: [], // Clear variants when options change
  })),

  removeOption: (id) => set((state) => ({
    options: state.options.filter((opt) => opt.id !== id),
    variants: [], // Clear variants when options change
  })),

  setVariants: (variants) => set({ variants }),

  updateVariant: (id, data) => set((state) => ({
    variants: state.variants.map((v) => (v.id === id ? { ...v, ...data } : v)),
  })),

  resetStore: () => set({
    // IMPORTANT: reset should start a NEW draft (never overwrite an existing row)
    id: undefined,
    title: '',
    subtitle: '',
    description: '',
    handle: '',
    status: 'draft',
    thumbnail: '',
    sku: '',
    price: 0,
    medusaProductId: undefined,
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
        // Preserve medusaProductId in data blob for persistence
        medusa_product_id: state.medusaProductId || undefined,
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

  loadFromBlueprint: (blueprint) => {
    /**
     * Load ProductBlueprint into product store.
     *
     * Preconditions:
     * - `blueprint` must match `ProductBlueprint` shape (server-generated output).
     *
     * Postconditions:
     * - Product store state is hydrated from the blueprint for editing and export.
     */
    const product = blueprint.product;
    const aiMeta = blueprint.aiMeta;

    // Build localization from descriptions
    const localization: Record<string, Localization> = {};
    const activeLanguages: string[] = [];

    type BlueprintDescription = ProductBlueprint['product']['descriptions'][string];
    const descriptionEntries = Object.entries(product.descriptions) as Array<[string, BlueprintDescription]>;

    for (const [lang, desc] of descriptionEntries) {
      activeLanguages.push(lang);
      localization[lang] = {
        title: desc.title || product.identity.title || '',
        subtitle: product.identity.subtitle || desc.short || '',
        description: desc.long || '',
        features: desc.features || [],
        metadata_title: desc.seo?.title || '',
        metadata_description: desc.seo?.description || '',
        keywords: desc.seo?.keywords || [],
      };
    }

    // Convert variants
    type BlueprintVariant = ProductBlueprint['product']['variants'][number];
    const variants = (product.variants || []).map((v: BlueprintVariant, idx: number) => ({
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
    const images = (product.media?.images || [])
      .map((img) => img.syncedUrl || img.sourceUrl)
      .filter((u): u is string => typeof u === 'string' && u.length > 0);

    // Extract unique options and values from variants (normalize Colors)
    const optionMap: Record<string, Set<string>> = {};
    (product.variants || []).forEach((v) => {
      if (v.options) {
        Object.entries(v.options).forEach(([name, value]) => {
          const keyName = isColorishTitle(name) ? 'Colors' : name;
          if (!optionMap[keyName]) optionMap[keyName] = new Set();
          if (typeof value === 'string') {
            const vv = isColorishTitle(name) ? canonicalizeColorValue(value) : value;
            optionMap[keyName].add(vv);
          }
        });
      }
    });

    const options: ProductOption[] = Object.entries(optionMap).map(([name, values]) => {
      const isColors = isColorishTitle(name);
      const optName = isColors ? 'Colors' : name;

      return {
        id: crypto.randomUUID(),
        name: optName,
        translations: isColors ? { en: 'Colors', fr: 'Couleurs' } : { en: optName },
        values: Array.from(values).map(v => ({
          value: isColors ? canonicalizeColorValue(v) : v,
          translations: isColors
            ? { en: displayEnFromCanonical(canonicalizeColorValue(v)), fr: displayFrFromCanonical(canonicalizeColorValue(v)) }
            : { en: v }
        }))
      };
    });

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
      // Ensure all expected language keys exist (store assumes at least `en` exists).
      localization: {
        en: { ...INITIAL_LOCALIZATION },
        es: { ...INITIAL_LOCALIZATION },
        fr: { ...INITIAL_LOCALIZATION },
        de: { ...INITIAL_LOCALIZATION },
        ja: { ...INITIAL_LOCALIZATION },
        ...localization,
      },
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

  loadFromSavedProduct: (record) => {
    /**
     * Hydrate the store from a saved `products` row in Supabase.
     *
     * Preconditions:
     * - `record.data` was produced by `saveToDb()` and contains the store payload.
     *
     * Postconditions:
     * - The editor can continue from the saved state.
     */
    const data = record.data;
    const dataObj = isRecord(data) ? data : {};

    const subtitle = typeof dataObj.subtitle === 'string' ? dataObj.subtitle : '';
    const description = typeof dataObj.description === 'string' ? dataObj.description : '';
    const thumbnail = typeof dataObj.thumbnail === 'string' ? dataObj.thumbnail : '';

    const activeLanguages = Array.isArray(dataObj.activeLanguages)
      ? dataObj.activeLanguages.filter((x): x is string => typeof x === 'string')
      : ['en'];

    const localization = isRecord(dataObj.localization) ? (dataObj.localization as Record<string, Localization>) : {};

    const images = Array.isArray(dataObj.images) ? dataObj.images.filter((x): x is string => typeof x === 'string') : [];
    const vault = Array.isArray(dataObj.vault) ? dataObj.vault.filter((x): x is string => typeof x === 'string') : [];
    const ignoredUrls = Array.isArray(dataObj.ignoredUrls) ? dataObj.ignoredUrls.filter((x): x is string => typeof x === 'string') : [];

    const options = Array.isArray(dataObj.options) ? (dataObj.options as ProductOption[]) : [];
    const variants = Array.isArray(dataObj.variants) ? (dataObj.variants as ProductVariant[]) : [];

    const collection_id = typeof dataObj.collection_id === 'string' ? dataObj.collection_id : '';
    const type_id = typeof dataObj.type_id === 'string' ? dataObj.type_id : '';
    const tags = Array.isArray(dataObj.tags) ? dataObj.tags.filter((x): x is string => typeof x === 'string') : [];
    const categories = Array.isArray(dataObj.categories) ? dataObj.categories.filter((x): x is string => typeof x === 'string') : [];
    const sales_channels = Array.isArray(dataObj.sales_channels)
      ? dataObj.sales_channels.filter((x): x is string => typeof x === 'string')
      : [];

    const shipping_profile_id = typeof dataObj.shipping_profile_id === 'string' ? dataObj.shipping_profile_id : '';
    const shipping_weight = typeof dataObj.shipping_weight === 'number' ? dataObj.shipping_weight : 0;
    const shipping_dimensions = isRecord(dataObj.shipping_dimensions)
      ? {
        length: typeof dataObj.shipping_dimensions.length === 'number' ? dataObj.shipping_dimensions.length : 0,
        width: typeof dataObj.shipping_dimensions.width === 'number' ? dataObj.shipping_dimensions.width : 0,
        height: typeof dataObj.shipping_dimensions.height === 'number' ? dataObj.shipping_dimensions.height : 0,
      }
      : { length: 0, width: 0, height: 0 };

    const aiMeta = isRecord(dataObj.aiMeta) ? (dataObj.aiMeta as ProductState['aiMeta']) : undefined;

    // Extract medusaProductId from data blob (stored as medusa_product_id)
    const medusaProductId = typeof dataObj.medusa_product_id === 'string' 
      ? dataObj.medusa_product_id 
      : undefined;

    set({
      id: record.id,
      title: record.title || '',
      handle: record.handle || '',
      medusaProductId,
      status: record.status || 'draft',
      sku: record.sku || '',
      price: record.price ?? 0,

      subtitle,
      description,
      thumbnail,
      activeLanguages: activeLanguages.length > 0 ? activeLanguages : ['en'],

      localization: {
        en: { ...INITIAL_LOCALIZATION },
        es: { ...INITIAL_LOCALIZATION },
        fr: { ...INITIAL_LOCALIZATION },
        de: { ...INITIAL_LOCALIZATION },
        ja: { ...INITIAL_LOCALIZATION },
        ...localization,
      },

      images,
      vault,
      ignoredUrls,
      options,
      variants,

      collection_id,
      type_id,
      tags,
      categories,
      sales_channels,

      shipping_profile_id,
      shipping_weight,
      shipping_dimensions,
      aiMeta,
    });
  },

  applyMedusaDefaultsForNewProduct: (defaults) =>
    set((state) => {
      /**
       * Apply org-level default Medusa taxonomy selections, but ONLY for new drafts.
       * We do not override user choices or existing persisted products.
       */
      if (state.id) return state;

      const next: Partial<ProductState> = {};

      if (!state.collection_id && defaults.defaultCollectionId) {
        next.collection_id = defaults.defaultCollectionId;
      }

      if (state.categories.length === 0 && defaults.defaultCategoryIds && defaults.defaultCategoryIds.length > 0) {
        next.categories = defaults.defaultCategoryIds;
      }

      if (state.sales_channels.length === 0 && defaults.defaultSalesChannelId) {
        next.sales_channels = [defaults.defaultSalesChannelId];
      }

      if (!state.shipping_profile_id && defaults.defaultShippingProfileId) {
        next.shipping_profile_id = defaults.defaultShippingProfileId;
      }

      return Object.keys(next).length > 0 ? { ...state, ...next } : state;
    }),
}));
