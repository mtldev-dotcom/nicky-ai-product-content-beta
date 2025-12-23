import { ProductState, Localization } from '@/store/useProductStore';

export function mapExternalToProduct(rawJson: any): Partial<ProductState> {
  // Deep search for a value by possible keys
  const findValue = (obj: any, keys: string[]): any => {
    for (const key of keys) {
      if (obj[key] !== undefined) return obj[key];
    }
    return undefined;
  };

  const title = findValue(rawJson, ['title', 'name', 'product_name']) || '';
  const description = findValue(rawJson, ['description', 'body_html', 'content']) || '';
  const sku = findValue(rawJson, ['sku', 'handle', 'id']) || '';
  const price = parseFloat(findValue(rawJson, ['price', 'amount', 'unit_price'])) || 0;
  
  // Extract images
  let images: string[] = [];
  const rawImages = findValue(rawJson, ['images', 'gallery', 'media']);
  if (Array.isArray(rawImages)) {
    images = rawImages.map(img => typeof img === 'string' ? img : (img.url || img.src)).filter(Boolean);
  }

  // Extract Options/Variants
  const options = (rawJson.options || []).map((opt: any) => ({
    id: crypto.randomUUID(),
    name: opt.title || opt.name || 'Option',
    values: Array.isArray(opt.values) ? opt.values.map((v: any) => typeof v === 'string' ? v : (v.value || v.label)) : []
  }));

  // Setup Localization (EN by default)
  const enLoc: Localization = {
    title,
    description,
    subtitle: findValue(rawJson, ['subtitle', 'teaser']) || '',
    features: findValue(rawJson, ['features', 'benefits']) || [],
    metadata_title: findValue(rawJson, ['metadata_title', 'seo_title']) || title,
    metadata_description: findValue(rawJson, ['metadata_description', 'seo_description']) || description,
    keywords: findValue(rawJson, ['keywords', 'tags']) || []
  };

  return {
    title,
    description,
    sku,
    price,
    images,
    options,
    localization: {
      en: enLoc,
      es: { title: '', description: '' },
      fr: { title: '', description: '' },
      de: { title: '', description: '' },
      ja: { title: '', description: '' },
    },
    activeLanguages: ['en'],
    thumbnail: images[0] || ''
  };
}

