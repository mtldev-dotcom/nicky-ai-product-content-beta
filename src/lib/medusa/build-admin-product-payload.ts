/**
 * Build a Medusa Admin Product payload from our internal product representation.
 *
 * Why this exists:
 * - We need ONE canonical place that maps our app's product shape to Medusa's Admin API payload shape.
 * - The dashboard, JSON export page, and "publish to Medusa" actions should all reuse the same mapping.
 *
 * Security:
 * - This module does not perform network requests and does not handle secrets.
 *
 * Notes:
 * - Medusa validates payload shape strictly. We run `sanitizeMedusaProductPayload` to normalize
 *   fields that have historically caused 400s (e.g., `currency_code` must be a string code).
 * - Medusa v2 Admin API does NOT accept inventory levels in product create/update payloads.
 *   Inventory must be managed via Inventory APIs after creation. We intentionally omit inventory here.
 */

import { sanitizeMedusaProductPayload } from '@/lib/medusa/normalize-product-payload';

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

export type LocalizationLike = {
  title?: string;
  subtitle?: string;
  description?: string;
  features?: string[];
  metadata_title?: string;
  metadata_description?: string;
  keywords?: string[];
};

export type ProductOptionValueLike = {
  value?: string;
  translations?: Record<string, string>;
};

export type ProductOptionLike = {
  name?: string;
  translations?: Record<string, string>;
  values?: ProductOptionValueLike[];
};

export type ProductVariantPriceLike = {
  amount?: number;
  currency_code?: unknown;
};

export type ProductVariantLike = {
  title?: string;
  sku?: string;
  options?: Record<string, string>;
  prices?: ProductVariantPriceLike[];
  manage_inventory?: boolean;
  allow_backorder?: boolean;
  // Intentionally omit inventory levels.
};

export type ProductLikeForMedusaPayload = {
  // Root fields (some come from row columns, some from `data` blob)
  title?: string;
  subtitle?: string;
  description?: string;
  handle?: string;
  status?: 'draft' | 'published' | string;
  thumbnail?: string;
  price?: number;
  sku?: string;

  // Store/taxonomy
  collection_id?: string | null;
  type_id?: string | null;
  tags?: string[];
  categories?: string[];
  sales_channels?: string[];
  shipping_profile_id?: string | null;

  // Shipping
  shipping_weight?: number | null;
  shipping_dimensions?: { length?: number; width?: number; height?: number } | null;

  // Media
  images?: string[];
  vault?: string[];

  // i18n
  activeLanguages?: string[];
  localization?: Record<string, LocalizationLike>;

  // Variants/Options
  options?: ProductOptionLike[];
  variants?: ProductVariantLike[];
};

/**
 * Build a Medusa Admin product payload from a product-like object.
 *
 * Preconditions:
 * - `input` should represent the current working product draft in our app.
 *
 * Postconditions:
 * - Returns an object that is safe to send to Medusa Admin create/update endpoints.
 * - Never throws; returns a best-effort payload.
 */
export function buildMedusaAdminProductPayload(input: ProductLikeForMedusaPayload): unknown {
  const title = asString(input.title);
  const status = (input.status === 'published' ? 'published' : 'draft') as 'draft' | 'published';

  const handle =
    asString(input.handle).trim() ||
    (title ? title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '') : '');

  const activeLangs = Array.isArray(input.activeLanguages) && input.activeLanguages.length > 0
    ? input.activeLanguages.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : ['en'];

  const localization = isRecord(input.localization) ? (input.localization as Record<string, LocalizationLike>) : {};

  // Helper to build i18n objects (only include non-empty values).
  const buildI18n = <K extends keyof LocalizationLike>(field: K): Partial<Record<string, LocalizationLike[K]>> => {
    const obj: Partial<Record<string, LocalizationLike[K]>> = {};
    for (const lang of activeLangs) {
      const val = localization[lang]?.[field];
      if (Array.isArray(val)) {
        if (val.length > 0) obj[lang] = val as LocalizationLike[K];
        continue;
      }
      if (typeof val === 'string') {
        if (val.trim().length > 0) obj[lang] = val as LocalizationLike[K];
        continue;
      }
    }
    return obj;
  };

  const options: ProductOptionLike[] = Array.isArray(input.options) ? input.options : [];

  // Variant generation:
  // - Prefer explicit variants (the store/editor manages these).
  // - Fallback to combinations from options.
  // - As last resort, generate a single default variant.
  const getVariants = (): unknown[] => {
    if (Array.isArray(input.variants) && input.variants.length > 0) {
      return input.variants.map((v) => ({
        title: asString(v.title),
        sku: asString(v.sku),
        options: isRecord(v.options) ? v.options : {},
        prices: Array.isArray(v.prices)
          ? v.prices.map((p) => ({
              amount: asNumber(p.amount, 0),
              currency_code: p.currency_code,
            }))
          : [],
        manage_inventory: !!v.manage_inventory,
        allow_backorder: !!v.allow_backorder,
      }));
    }

    // No options => simplest single variant.
    if (options.length === 0) {
      return [
        {
          title: `${title || 'Draft Product'} - Default Variant`,
          sku: `${handle || 'product'}-default`,
          options: {},
          prices: [{ amount: asNumber(input.price, 0), currency_code: 'usd' }],
          manage_inventory: true,
        },
      ];
    }

    // Build combinations from options values.
    type ComboItem = { name: string; value: string };
    const combinations: ComboItem[][] = [[]];

    for (const opt of options) {
      const optName = asString(opt.name);
      const values = Array.isArray(opt.values) ? opt.values : [];
      if (!optName || values.length === 0) continue;

      const nextCombinations: ComboItem[][] = [];
      for (const combo of combinations) {
        for (const v of values) {
          const vv = asString(v.value);
          if (!vv) continue;
          nextCombinations.push([...combo, { name: optName, value: vv }]);
        }
      }

      if (nextCombinations.length > 0) {
        combinations.length = 0;
        combinations.push(...nextCombinations);
      }
    }

    return combinations.map((combo) => {
      const variantValuesTitle = combo.map((c) => c.value).join(' / ');
      const variantOptions = combo.reduce<Record<string, string>>((acc, curr) => {
        acc[curr.name] = curr.value;
        return acc;
      }, {});

      const slugifiedOptions = variantValuesTitle.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '');

      return {
        title: `${title || 'Draft Product'} - ${variantValuesTitle}`,
        sku: `${handle || 'product'}-${slugifiedOptions}`,
        options: variantOptions,
        prices: [{ amount: asNumber(input.price, 0), currency_code: 'usd' }],
        manage_inventory: true,
      };
    });
  };

  const variants = getVariants();

  const subtitle =
    asString(input.subtitle).trim() ||
    (typeof localization.en?.subtitle === 'string' ? localization.en.subtitle : '') ||
    '';

  const output = {
    title,
    subtitle,
    status,
    external_id: null,
    description: asString(input.description),
    handle,
    is_giftcard: false,
    discountable: true,
    thumbnail: asString(input.thumbnail),
    collection_id: input.collection_id ?? null,
    type_id: input.type_id ?? null,
    weight: input.shipping_weight ?? null,
    length: input.shipping_dimensions?.length ?? null,
    height: input.shipping_dimensions?.height ?? null,
    width: input.shipping_dimensions?.width ?? null,
    hs_code: null,
    origin_country: null,
    mid_code: null,
    material: null,
    metadata: {
      brand: 'THE UNCUT BRAND',
      vault: {
        video: null,
        images: Array.isArray(input.vault) ? input.vault : [],
      },
      title_i18n: buildI18n('title'),
      subtitle_i18n: buildI18n('subtitle'),
      description_i18n: buildI18n('description'),
      features_i18n: buildI18n('features'),
      keywords_i18n: buildI18n('keywords'),
      seo_title_i18n: buildI18n('metadata_title'),
      seo_description_i18n: buildI18n('metadata_description'),
      options_i18n:
        options.length > 0
          ? options.map((opt) => {
              const name = asString(opt.name);
              const translations = isRecord(opt.translations) ? (opt.translations as Record<string, string>) : {};
              const values = Array.isArray(opt.values) ? opt.values : [];

              return {
                title_i18n: {
                  en: name,
                  ...Object.fromEntries(
                    Object.entries(translations).map(([lang, trans]) => [
                      lang,
                      name.toLowerCase() === 'default' ? 'Default' : trans,
                    ])
                  ),
                },
                values: values.map((v) => {
                  const vv = asString(v.value);
                  const vTranslations = isRecord(v.translations)
                    ? (v.translations as Record<string, string>)
                    : {};

                  return {
                    value: vv,
                    value_i18n: {
                      en: vv,
                      ...Object.fromEntries(
                        Object.entries(vTranslations).map(([lang, trans]) => [
                          lang,
                          vv.toLowerCase() === 'default' ? 'Default' : trans,
                        ])
                      ),
                    },
                  };
                }),
              };
            })
          : [
              {
                title_i18n: { en: 'Default option' },
                values: [
                  {
                    value: 'Default option value',
                    value_i18n: { en: 'Default option value' },
                  },
                ],
              },
            ],
    },
    options:
      options.length > 0
        ? options.map((opt) => ({
            title: asString(opt.name),
            values: Array.isArray(opt.values) ? opt.values.map((v) => asString(v.value)).filter(Boolean) : [],
          }))
        : [
            {
              title: 'Default option',
              values: ['Default option value'],
            },
          ],
    variants,
    tags: Array.isArray(input.tags) ? input.tags.map((t) => ({ value: t })) : [],
    images: Array.isArray(input.images)
      ? input.images.map((url, index) => ({
          url,
          metadata: null,
          rank: index,
        }))
      : [],
    categories: Array.isArray(input.categories) ? input.categories.map((c) => ({ id: c })) : [],
    sales_channels: Array.isArray(input.sales_channels) ? input.sales_channels.map((sc) => ({ id: sc })) : [],
    /**
     * IMPORTANT:
     * Some Medusa instances validate `shipping_profile_id` strictly as a string.
     * Sending `null` causes 400s like:
     *   Expected type: 'string' for field 'shipping_profile_id', got: 'null'
     *
     * So:
     * - If we have a non-empty string -> send it.
     * - Otherwise -> omit the field entirely (undefined).
     */
    shipping_profile_id:
      typeof input.shipping_profile_id === 'string' && input.shipping_profile_id.trim().length > 0
        ? input.shipping_profile_id
        : undefined,
  };

  return sanitizeMedusaProductPayload(output);
}

export type SavedProductRowForMedusa = {
  id: string;
  title: string;
  handle: string;
  status: string;
  sku: string | null;
  price: number | null;
  data: unknown | null;
};

/**
 * Build a Medusa Admin payload from a saved Supabase product row.
 *
 * Preconditions:
 * - `row.data` should be the JSON blob produced by `useProductStore.saveToDb()`.
 *
 * Postconditions:
 * - Returns a Medusa payload suitable for create/update.
 */
export function buildMedusaAdminProductPayloadFromSavedProduct(row: SavedProductRowForMedusa): unknown {
  const dataObj = isRecord(row.data) ? row.data : {};

  const shippingDimensions = isRecord(dataObj.shipping_dimensions) ? dataObj.shipping_dimensions : null;

  return buildMedusaAdminProductPayload({
    title: row.title,
    handle: row.handle,
    status: row.status,
    sku: row.sku ?? '',
    price: row.price ?? 0,
    subtitle: asString(dataObj.subtitle),
    description: asString(dataObj.description),
    thumbnail: asString(dataObj.thumbnail),
    activeLanguages: asStringArray(dataObj.activeLanguages),
    localization: isRecord(dataObj.localization) ? (dataObj.localization as Record<string, LocalizationLike>) : {},
    images: asStringArray(dataObj.images),
    vault: asStringArray(dataObj.vault),
    options: Array.isArray(dataObj.options) ? (dataObj.options as ProductOptionLike[]) : [],
    variants: Array.isArray(dataObj.variants) ? (dataObj.variants as ProductVariantLike[]) : [],
    collection_id: asString(dataObj.collection_id) || null,
    type_id: asString(dataObj.type_id) || null,
    tags: asStringArray(dataObj.tags),
    categories: asStringArray(dataObj.categories),
    sales_channels: asStringArray(dataObj.sales_channels),
    shipping_profile_id: asString(dataObj.shipping_profile_id) || null,
    shipping_weight: typeof dataObj.shipping_weight === 'number' ? dataObj.shipping_weight : null,
    shipping_dimensions: shippingDimensions
      ? {
          length: asNumber((shippingDimensions as UnknownRecord).length, 0),
          width: asNumber((shippingDimensions as UnknownRecord).width, 0),
          height: asNumber((shippingDimensions as UnknownRecord).height, 0),
        }
      : null,
  });
}


