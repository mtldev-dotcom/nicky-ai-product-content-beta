/**
 * Convert a Medusa Admin Product (retrieved from `/admin/products/{id}`) into our
 * local Supabase `products` row shape.
 *
 * Goal:
 * - Allow users to "export" (copy) or "move" (copy+delete) a Medusa product into local storage,
 *   while keeping the editor able to open it (data blob resembles `saveToDb()` output).
 *
 * Notes:
 * - We keep a raw snapshot under `data.medusa_raw` for auditability and to avoid data loss.
 * - We intentionally keep price/variant amounts as-is (Medusa often uses minor units).
 * - For `keepLinked=false` (move), we DO NOT set `data.medusa_product_id` so the UI doesn't imply
 *   the item still exists in Medusa after deletion. We instead store `data.medusa_source_id`.
 */

import crypto from 'node:crypto';
import { type UnknownRecord, isRecord, asString, asNumber } from '@/lib/medusa/utils';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/ /g, '-')
    .replace(/[^\w-]/g, '');
}

function pickImageUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((img) => {
      if (typeof img === 'string') return img;
      if (!isRecord(img)) return '';
      const url = img.url;
      return typeof url === 'string' ? url : '';
    })
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
}

function pickTagValues(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => {
      if (typeof t === 'string') return t;
      if (!isRecord(t)) return '';
      const value = t.value;
      return typeof value === 'string' ? value : '';
    })
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
}

function pickCategoryIds(categories: unknown): string[] {
  if (!Array.isArray(categories)) return [];
  return categories
    .map((c) => {
      if (typeof c === 'string') return c;
      if (!isRecord(c)) return '';
      const id = c.id;
      return typeof id === 'string' ? id : '';
    })
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
}

function mapOptions(options: unknown) {
  if (!Array.isArray(options)) return [];
  return options.map((opt) => {
    const o = isRecord(opt) ? opt : {};
    const name = asString(o.title) || asString(o.name) || 'Option';
    const values = Array.isArray(o.values)
      ? o.values
          .map((v) => {
            if (typeof v === 'string') return v;
            if (!isRecord(v)) return '';
            return asString(v.value) || asString(v.label) || '';
          })
          .filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];

    return {
      id: crypto.randomUUID(),
      name,
      translations: { en: name },
      values: values.map((v) => ({ value: v, translations: { en: v } })),
    };
  });
}

function mapVariants(variants: unknown) {
  if (!Array.isArray(variants)) return [];
  return variants.map((variant) => {
    const v = isRecord(variant) ? variant : {};
    const prices = Array.isArray(v.prices)
      ? v.prices
          .map((p) => {
            const pr = isRecord(p) ? p : {};
            return {
              amount: asNumber(pr.amount, 0),
              currency_code: asString(pr.currency_code, 'usd') || 'usd',
            };
          })
          .filter((p) => typeof p.amount === 'number')
      : [];

    // Medusa returns option values in an array; our editor stores a name->value map.
    // We keep this empty (safe) unless we can confidently map it.
    const options: Record<string, string> = {};

    return {
      id: crypto.randomUUID(),
      title: asString(v.title),
      sku: asString(v.sku),
      manage_inventory: !!v.manage_inventory,
      allow_backorder: !!v.allow_backorder,
      prices,
      options,
      inventory: [], // intentionally empty; editor expects inventory array but Medusa inventory is managed elsewhere
    };
  });
}

export type LocalProductSavePayload = {
  title: string;
  handle: string;
  status: 'draft' | 'published';
  sku: string;
  price: number;
  data: Record<string, unknown>;
};

/**
 * Map a Medusa product to a local product row payload.
 *
 * - keepLinked=true  => sets `data.medusa_product_id` for UI linkage.
 * - keepLinked=false => sets `data.medusa_source_id` only.
 */
export function mapMedusaProductToLocalSavePayload(input: {
  medusaProduct: unknown;
  keepLinked: boolean;
}): LocalProductSavePayload {
  const p = isRecord(input.medusaProduct) ? input.medusaProduct : {};

  const title = asString(p.title) || 'Imported Product';
  const handle = asString(p.handle) || slugify(title);

  const subtitle = asString(p.subtitle);
  const description = asString(p.description);
  const thumbnail = asString(p.thumbnail);
  const images = pickImageUrls(p.images);

  const variants = mapVariants(p.variants);
  const options = mapOptions(p.options);

  const firstSku = variants.find((v) => typeof v.sku === 'string' && v.sku.length > 0)?.sku || '';
  const firstPrice =
    variants.find((v) => Array.isArray(v.prices) && v.prices.length > 0)?.prices?.[0]?.amount ?? 0;

  const collectionId = asString(p.collection_id) || null;
  const typeId = asString(p.type_id) || null;

  const tags = pickTagValues(p.tags);
  const categories = pickCategoryIds(p.categories);

  // We store imported products as local drafts by default (safer).
  // The original Medusa status is preserved in the raw snapshot.
  const status: 'draft' = 'draft';

  const medusaId = asString(p.id);
  const linkFields = input.keepLinked
    ? { medusa_product_id: medusaId }
    : { medusa_source_id: medusaId, medusa_deleted_from_source: true };

  const data = {
    subtitle,
    description,
    thumbnail: thumbnail || images[0] || '',
    activeLanguages: ['en'],
    localization: {
      en: {
        title,
        subtitle,
        description,
        features: [],
        metadata_title: title,
        metadata_description: description,
        keywords: [],
      },
    },
    images,
    vault: [],
    ignoredUrls: [],
    options,
    variants,
    collection_id: collectionId,
    type_id: typeId,
    tags,
    categories,
    sales_channels: [],
    shipping_profile_id: null,
    shipping_weight: asNumber(p.weight, 0),
    shipping_dimensions: {
      length: asNumber(p.length, 0),
      width: asNumber(p.width, 0),
      height: asNumber(p.height, 0),
    },
    ...linkFields,
    medusa_raw: p, // raw snapshot for audit/debug
  };

  return {
    title,
    handle,
    status,
    sku: firstSku || handle,
    price: typeof firstPrice === 'number' ? firstPrice : 0,
    data,
  };
}


