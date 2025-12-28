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

    return {
      id: crypto.randomUUID(),
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

  return {
    title,
    description,
    sku,
    price,
    images,
    options,
    ignoredUrls: [],
    localization: {
      en: enLoc,
      es: { ...emptyLoc },
      fr: { ...emptyLoc },
      de: { ...emptyLoc },
      ja: { ...emptyLoc },
    },
    activeLanguages: ['en'],
    thumbnail: images[0] || ''
  };
}

