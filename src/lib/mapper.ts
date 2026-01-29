import { ProductState, Localization } from '@/store/useProductStore';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function mapExternalToProduct(rawJson: unknown): Partial<ProductState> {
  const root = isRecord(rawJson) ? rawJson : {};

  // Deep search for a value by possible keys
  const findValue = (obj: Record<string, unknown>, keys: string[]): unknown => {
    for (const key of keys) {
      if (obj[key] !== undefined) return obj[key];
    }
    return undefined;
  };

  const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
  const asNumber = (v: unknown): number => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };

  const title = asString(findValue(root, ['title', 'name', 'product_name'])) || '';
  const description = asString(findValue(root, ['description', 'body_html', 'content'])) || '';
  const sku = asString(findValue(root, ['sku', 'handle', 'id'])) || '';
  const price = asNumber(findValue(root, ['price', 'amount', 'unit_price'])) || 0;

  // Extract images
  let images: string[] = [];
  const rawImages = findValue(root, ['images', 'gallery', 'media']);
  if (Array.isArray(rawImages)) {
    images = rawImages
      .map((img) => {
        if (typeof img === 'string') return img;
        if (isRecord(img)) {
          const url = img.url;
          const src = img.src;
          if (typeof url === 'string') return url;
          if (typeof src === 'string') return src;
        }
        return '';
      })
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
  }

  // Extract Options/Variants
  const optionsRaw = isRecord(rawJson) ? rawJson.options : undefined;
  const options = (Array.isArray(optionsRaw) ? optionsRaw : []).map((opt) => {
    const optRecord = isRecord(opt) ? opt : {};
    const optName = (typeof optRecord.title === 'string' && optRecord.title) ||
      (typeof optRecord.name === 'string' && optRecord.name) ||
      'Option';

    const valuesRaw = optRecord.values;
    const values = Array.isArray(valuesRaw)
      ? valuesRaw
        .map((v) => {
          if (typeof v === 'string') return v;
          if (isRecord(v)) {
            const vv = v.value;
            const label = v.label;
            if (typeof vv === 'string') return vv;
            if (typeof label === 'string') return label;
          }
          return '';
        })
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
        .map((val) => ({ value: val, translations: { en: val } }))
      : [];

    // Preserve Medusa ID if present (critical for updates)
    const medusaId = asString(optRecord.id);
    const localId = medusaId || crypto.randomUUID();
    
    return {
      id: localId,
      medusaId: medusaId || undefined, // Preserve Medusa ID separately for updates
      name: optName,
      translations: { en: optName },
      values,
    };
  });

  // Setup Localization (EN by default)
  const emptyLoc: Localization = {
    title: '',
    subtitle: '',
    description: '',
    features: [],
    metadata_title: '',
    metadata_description: '',
    keywords: [],
  };

  const enLoc: Localization = {
    ...emptyLoc,
    title,
    description,
    subtitle: asString(findValue(root, ['subtitle', 'teaser'])) || '',
    features: Array.isArray(findValue(root, ['features', 'benefits']))
      ? (findValue(root, ['features', 'benefits']) as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    metadata_title: asString(findValue(root, ['metadata_title', 'seo_title'])) || title,
    metadata_description: asString(findValue(root, ['metadata_description', 'seo_description'])) || description,
    keywords: Array.isArray(findValue(root, ['keywords', 'tags']))
      ? (findValue(root, ['keywords', 'tags']) as unknown[]).filter((x): x is string => typeof x === 'string')
      : []
  };

  // Extract Metadata for i18n
  const metadata = isRecord(root['metadata']) ? root['metadata'] : {};

  // Helper to extract i18n fields from metadata
  // e.g., title_i18n: { en: "...", fr: "..." }
  const getI18n = (field: string): Record<string, string> => {
    const val = metadata[`${field}_i18n`];
    return isRecord(val) ? (val as Record<string, string>) : {};
  };

  const getI18nArray = (field: string): Record<string, string[]> => {
    const val = metadata[`${field}_i18n`];
    return isRecord(val) ? (val as Record<string, string[]>) : {};
  };

  // 1. Identify all active languages from metadata
  const foundLanguages = new Set<string>(['en']);
  const checkLangs = (obj: Record<string, unknown>) => {
    Object.keys(obj).forEach(lang => foundLanguages.add(lang));
  };

  checkLangs(getI18n('title'));
  checkLangs(getI18n('subtitle'));
  checkLangs(getI18n('description'));
  checkLangs(getI18n('seo_title'));
  checkLangs(getI18n('seo_description'));
  // features_i18n and keywords_i18n are Record<string, string[]>

  const activeLanguages = Array.from(foundLanguages);

  // 2. Build Localization for all languages
  const localization: Record<string, Localization> = {};

  // Initialize all found languages with empty structure or EN defaults
  activeLanguages.forEach(lang => {
    localization[lang] = {
      title: getI18n('title')[lang] || (lang === 'en' ? enLoc.title : ''),
      subtitle: getI18n('subtitle')[lang] || (lang === 'en' ? enLoc.subtitle : ''),
      description: getI18n('description')[lang] || (lang === 'en' ? enLoc.description : ''),
      metadata_title: getI18n('seo_title')[lang] || (lang === 'en' ? enLoc.metadata_title : ''),
      metadata_description: getI18n('seo_description')[lang] || (lang === 'en' ? enLoc.metadata_description : ''),
      features: getI18nArray('features')[lang] || (lang === 'en' ? enLoc.features : []),
      keywords: getI18nArray('keywords')[lang] || (lang === 'en' ? enLoc.keywords : []),
    };
  });

  // 3. Enhance Options with i18n
  // metadata.options_i18n is array of objects, corresponding to options order? 
  // Or match by title?
  // The user JSON example shows `options_i18n` as an array matching the `options` array order.
  const optionsI18n = Array.isArray(metadata['options_i18n']) ? metadata['options_i18n'] : [];

  const enhancedOptions = options.map((opt, idx) => {
    const i18nData = optionsI18n[idx];
    if (!isRecord(i18nData)) return opt;

    // Option Name Translations
    const titleI18n = isRecord(i18nData.title_i18n) ? (i18nData.title_i18n as Record<string, string>) : {};

    // Value Translations
    const valuesI18nRaw = Array.isArray(i18nData.values) ? i18nData.values : [];

    const enhancedValues = opt.values.map((val, vIdx) => {
      const valI18nData = valuesI18nRaw[vIdx];
      const valTranslations: Record<string, string> = { en: val.value };

      if (isRecord(valI18nData) && isRecord(valI18nData.value_i18n)) {
        Object.entries(valI18nData.value_i18n).forEach(([lang, trans]) => {
          if (typeof trans === 'string') valTranslations[lang] = trans;
        });
      }
      return { ...val, translations: valTranslations };
    });

    return {
      ...opt,
      translations: { en: opt.name, ...titleI18n },
      values: enhancedValues
    };
  });

  // Extract Categories
  const categoriesRaw = findValue(root, ['categories', 'product_categories']);
  const categories = Array.isArray(categoriesRaw)
    ? categoriesRaw
      .map((c) => {
        if (isRecord(c)) return asString(c.id);
        return '';
      })
      .filter((id) => id.length > 0)
    : [];

  // Extract Variants
  const variantsRaw = findValue(root, ['variants']);
  const variants = Array.isArray(variantsRaw)
    ? variantsRaw.map((v) => {
      if (!isRecord(v)) return null;

      const variantTitle = asString(v.title);
      const variantSku = asString(v.sku);
      const variantId = asString(v.id);

      // Map prices
      const pricesRaw = v.prices;
      const prices = Array.isArray(pricesRaw)
        ? pricesRaw.map((p) => {
          if (!isRecord(p)) return null;
          return {
            amount: asNumber(p.amount),
            currency_code: asString(p.currency_code)
          };
        }).filter((p): p is { amount: number; currency_code: string } => p !== null)
        : [];

      // Map options -> { OptionName: OptionValue }
      // Medusa variants have `options` array: [{ option_id: "...", value: "..." }]
      // BUT we need to map them back to Option Names.
      // We can do this by matching option_id to the generic options array we parsed earlier, 
      // OR rely on the fact that mapped options should be in same order?
      // Medusa `options` on variant usually contains `option_id`.
      // The root `options` array contains `id` and `title`.

      const variantOptions: Record<string, string> = {};
      const vOptionsRaw = v.options;
      if (Array.isArray(vOptionsRaw)) {
        vOptionsRaw.forEach(vo => {
          if (!isRecord(vo)) return;
          const val = asString(vo.value);

          // Try to find the option name from root options
          const optId = asString(vo.option_id);
          if (optId) {
            // Check mapping from root options
            // The root options we parsed above MIGHT not have their original IDs if we didn't extract them.
            // We need to ensure we extracted root option IDs.
            const foundOpt = (Array.isArray(optionsRaw) ? optionsRaw : []).find(o => isRecord(o) && o.id === optId);
            if (isRecord(foundOpt)) {
              const optName = asString(foundOpt.title) || asString(foundOpt.name) || 'Option';
              variantOptions[optName] = val;
              return;
            }
          }
          // If we can't map by ID, we might have trouble.
          // Fallback: If no option_id, maybe it has name? No, Medusa strict.
        });
      }

      // Preserve Medusa variant ID if present (critical for updates)
      const medusaVariantId = variantId;
      const localVariantId = medusaVariantId || crypto.randomUUID();
      
      // Also preserve Medusa format options (option IDs as keys) for updates
      // UI format: { "Color": "Black" } (stored in options)
      // Medusa format: { "opt_123": "Black" } (stored in medusaOptions)
      const medusaVariantOptions: Record<string, string> = {};
      if (Array.isArray(vOptionsRaw)) {
        vOptionsRaw.forEach((vo) => {
          if (!isRecord(vo)) return;
          const optId = asString(vo.option_id);
          const val = asString(vo.value);
          if (optId && val) {
            medusaVariantOptions[optId] = val;
          }
        });
      }
      
      return {
        id: localVariantId,
        medusaId: medusaVariantId || undefined, // Preserve Medusa ID separately for updates
        title: variantTitle,
        sku: variantSku,
        manage_inventory: v.manage_inventory !== false, // Default true
        allow_backorder: !!v.allow_backorder,
        prices,
        options: variantOptions, // UI format: { "Color": "Black" }
        medusaOptions: Object.keys(medusaVariantOptions).length > 0 
          ? medusaVariantOptions 
          : undefined, // Medusa format: { "opt_123": "Black" } (for updates)
        inventory: [] // We don't map inventory levels deeply yet, complicated structure
      };
    }).filter((v): v is any => v !== null)
    : [];


  // Extract additional Medusa fields
  const subtitle = asString(root.subtitle) || asString(findValue(root, ['subtitle', 'teaser'])) || '';
  const handle = asString(root.handle) || '';
  const status = (root.status === 'published' ? 'published' : 'draft') as 'draft' | 'published';
  const thumbnail = asString(root.thumbnail) || images[0] || '';
  
  // Extract taxonomy fields
  const collection_id = asString(root.collection_id) || '';
  const type_id = asString(root.type_id) || '';
  const shipping_profile_id = asString(root.shipping_profile_id) || '';
  
  // Extract tags (Medusa format: [{ value: "tag" }])
  const tagsRaw = root.tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw
        .map((t) => {
          if (typeof t === 'string') return t;
          if (isRecord(t)) return asString(t.value);
          return '';
        })
        .filter((t): t is string => t.length > 0)
    : [];
  
  // Extract sales_channels (Medusa format: [{ id: "sc_..." }])
  const salesChannelsRaw = root.sales_channels;
  const sales_channels = Array.isArray(salesChannelsRaw)
    ? salesChannelsRaw
        .map((sc) => {
          if (isRecord(sc)) return asString(sc.id);
          return '';
        })
        .filter((id): id is string => id.length > 0)
    : [];
  
  // Extract shipping dimensions
  const shipping_weight = asNumber(root.weight) || 0;
  const shipping_dimensions = {
    length: asNumber(root.length) || 0,
    width: asNumber(root.width) || 0,
    height: asNumber(root.height) || 0,
  };

  // Extract vault from metadata
  const vaultMetadata = isRecord(metadata.vault) ? metadata.vault : {};
  const vaultImages = Array.isArray(vaultMetadata.images) 
    ? vaultMetadata.images.filter((img): img is string => typeof img === 'string' && img.length > 0)
    : [];

  return {
    title,
    subtitle,
    description,
    handle,
    status,
    sku,
    price,
    images,
    thumbnail,
    options: enhancedOptions,
    variants,
    categories,
    tags,
    sales_channels,
    collection_id,
    type_id,
    shipping_profile_id,
    shipping_weight,
    shipping_dimensions,
    vault: vaultImages,
    ignoredUrls: [],
    localization: {
      ...localization,
      // Ensure we have at least these defaults if not found above
      en: localization['en'] || enLoc,
      es: localization['es'] || { ...emptyLoc },
      fr: localization['fr'] || { ...emptyLoc },
      de: localization['de'] || { ...emptyLoc },
      ja: localization['ja'] || { ...emptyLoc },
    },
    activeLanguages,
  };
}

