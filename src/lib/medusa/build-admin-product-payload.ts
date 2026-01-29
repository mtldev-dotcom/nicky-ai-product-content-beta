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
import { canonicalizeColorValue, isColorishTitle, normalizeColorsTitle, displayEnFromCanonical, displayFrFromCanonical } from '@/lib/medusa/colors-normalization';

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
  id?: string;
  name?: string;
  title?: string; // Some sources use 'title' instead of 'name'
  translations?: Record<string, string>;
  values?: ProductOptionValueLike[];
};

export type ProductVariantPriceLike = {
  amount?: number;
  currency_code?: unknown;
};

export type ProductVariantLike = {
  id?: string;
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
 *
 * @param input Product data to build payload from
 * @param isUpdate If true, variant IDs will be included (for updates). If false, variant IDs are omitted (for creates).
 */
export function buildMedusaAdminProductPayload(input: ProductLikeForMedusaPayload, isUpdate: boolean = false): unknown {
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

  const baseOptions: ProductOptionLike[] = Array.isArray(input.options)
    ? input.options.map((opt) => {
        // Ensure option has a name or title (required for payload)
        if (!opt.name && !opt.title) return { ...opt, name: 'Option', title: 'Option' };
        if (!opt.name && opt.title) return { ...opt, name: opt.title };
        if (opt.name && !opt.title) return { ...opt, title: opt.name };
        return opt;
      })
    : [];

  // Colors normalization (payload boundary):
  // - force title to "Colors"
  // - canonicalize values to lowercase slash format (silver/blue)
  // - ensure EN/FR translations exist for metadata.options_i18n
  const normalizedOptions: ProductOptionLike[] = baseOptions.map((opt) => {
    const name = asString(opt.name || opt.title);
    if (!isColorishTitle(name)) return opt;

    const canonTitle = normalizeColorsTitle(name);
    const values = Array.isArray(opt.values) ? opt.values : [];
    const seen = new Set<string>();
    const nextValues = values
      .map((v) => {
        const vv = canonicalizeColorValue(v?.value);
        if (!vv || seen.has(vv)) return null;
        seen.add(vv);
        return {
          value: vv,
          translations: {
            ...(isRecord(v?.translations) ? (v.translations as Record<string, string>) : {}),
            en: displayEnFromCanonical(vv),
            fr: displayFrFromCanonical(vv),
          },
        };
      })
      .filter((x): x is ProductOptionValueLike => Boolean(x));

    return {
      ...opt,
      name: canonTitle,
      title: canonTitle,
      translations: { en: 'Colors', fr: 'Couleurs' },
      values: nextValues,
    };
  });

  // Use the normalized option set from this point onward.
  const options = normalizedOptions;

  // Variant generation:
  // - Prefer explicit variants (the store/editor manages these).
  // - Fallback to combinations from options.
  // - As last resort, generate a single default variant.
  const getVariants = (): unknown[] => {
    // 1. Map Explicit Variants (if any)
    if (Array.isArray(input.variants) && input.variants.length > 0) {
      return input.variants.map((v) => {
        const explicitOptsRaw = isRecord(v.options) ? v.options : {};

        // Canonicalize Colors option values in explicit variant options (UI format) at payload boundary.
        // We keep the key mapping logic below, but ensure values are canonical for Colors.
        const explicitOpts: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(explicitOptsRaw)) {
          if (isColorishTitle(k)) {
            explicitOpts[normalizeColorsTitle(k)] = canonicalizeColorValue(val);
          } else {
            explicitOpts[k] = val;
          }
        }

        // Map variant options to Medusa format: { "option_id": "value" }
        // The variant.options can be in two formats:
        // 1. UI format: { "Color": "Black" } (option name as key)
        // 2. Medusa format: { "opt_123": "Black" } (option ID as key) - after reconciliation
        // We need to handle both and convert to Medusa format
        const mappedOptionsObj: Record<string, string> = {};

        // Check if options are already in Medusa format (keys look like Medusa IDs)
        const hasMedusaFormat = Object.keys(explicitOpts).some((key) =>
          key.startsWith('opt_') || key.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        );

        if (hasMedusaFormat) {
          // Options are already in Medusa format (after reconciliation)
          // Use them directly, but validate values exist in options
          for (const [optId, valueStr] of Object.entries(explicitOpts)) {
            if (typeof valueStr !== 'string' || !valueStr.trim().length) continue;

            // Find the option by ID to validate the value
            const rootOpt = options.find((o) => asString(o.id) === optId);
            if (rootOpt) {
              const optionValues = Array.isArray(rootOpt.values)
                ? rootOpt.values.map((v) => asString(v.value)).filter(Boolean)
                : [];

              // Validate value exists (case-sensitive, then case-insensitive)
              let finalValue = valueStr;
              const valueExists = optionValues.some((optVal) => optVal === valueStr);

              if (!valueExists && optionValues.length > 0) {
                const caseInsensitiveMatch = optionValues.find(
                  (optVal) => optVal.toLowerCase() === valueStr.toLowerCase()
                );
                if (caseInsensitiveMatch) {
                  finalValue = caseInsensitiveMatch;
                } else {
                  // Value doesn't exist - skip to avoid error
                  continue;
                }
              }

              mappedOptionsObj[optId] = finalValue;
            } else {
              // Option ID not found - might be invalid, but include it anyway
              // (reconciliation should have handled this, but be defensive)
              mappedOptionsObj[optId] = valueStr;
            }
          }
        } else {
          // Options are in UI format: { "Color": "Black" }
          // Map by option name to option ID
          for (const rootOpt of options) {
            const rootName = asString(rootOpt.name);
            const val = explicitOpts[rootName];
            const valueStr = asString(val);

            // Skip if value is empty
            if (!valueStr.trim().length) {
              continue;
            }

            // Verify the value exists in the option's values array
            const optionValues = Array.isArray(rootOpt.values)
              ? rootOpt.values.map((v) => asString(v.value)).filter(Boolean)
              : [];

            // Check if the value exists in the option's values (case-sensitive exact match)
            let finalValue = valueStr;
            const valueExists = optionValues.some((optVal) => optVal === valueStr);

            if (!valueExists && optionValues.length > 0) {
              // Value doesn't match - try case-insensitive match
              const caseInsensitiveMatch = optionValues.find(
                (optVal) => optVal.toLowerCase() === valueStr.toLowerCase()
              );
              if (caseInsensitiveMatch) {
                finalValue = caseInsensitiveMatch;
              } else {
                // No match found - skip this option to avoid error
                continue;
              }
            }

            // Medusa requires variant options as an object: { "option_id": "value" }
            // This format is required for BOTH creates and updates
            // For creates: We include option IDs in product-level options, so we can reference them here
            // For updates: Options already exist in Medusa, so we use their IDs (from reconciliation)
            const optId = asString(rootOpt.id);
            if (optId && optId.trim().length > 0) {
              // Object format: key is option_id, value is the option value string
              mappedOptionsObj[optId] = finalValue;
            }
          }
        }

        // Build variant payload
        // For creates: omit id field (Medusa doesn't accept it for new variants)
        // For updates: include id if it exists
        const variantPayload: Record<string, unknown> = {
          title: asString(v.title),
          sku: asString(v.sku),
          prices: Array.isArray(v.prices)
            ? v.prices.map((p) => ({
              amount: asNumber(p.amount, 0),
              currency_code: p.currency_code,
            }))
            : [],
          manage_inventory: !!v.manage_inventory,
          allow_backorder: !!v.allow_backorder,
        };

        // Medusa requires variant options as an object format: { "option_id": "value" }
        // This applies to BOTH creates and updates
        // Option IDs are included in product-level options for creates, so we can reference them
        if (Object.keys(mappedOptionsObj).length > 0) {
          variantPayload.options = mappedOptionsObj;
        }

        // Only include variant id for updates (Medusa rejects id for new variants)
        // Validate that the variant ID looks like a Medusa ID (not a client-generated UUID)
        // Medusa IDs are typically UUIDs, but we should only include them if this is an update
        // and the ID appears to be from Medusa (not a random client UUID)
        if (isUpdate && v.id) {
          const variantId = asString(v.id);
          // Basic validation: Medusa IDs are UUIDs, but we can't definitively distinguish
          // between client-generated and Medusa-generated UUIDs without additional context.
          // For now, we trust that if isUpdate is true and an ID exists, it's a valid Medusa ID.
          // TODO: Add more robust validation by checking against known Medusa variant IDs
          if (variantId && variantId.trim().length > 0) {
            // Additional safety: only include if it looks like a UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(variantId)) {
              variantPayload.id = variantId;
            }
          }
        }

        return variantPayload;
      });
    }

    // 2. Fallback: No variants => simplest single default variant.
    if (options.length === 0) {
      return [
        {
          title: `${title || 'Draft Product'} - Default Variant`,
          sku: `${handle || 'product'}-default`,
          // Omit options field when empty (Medusa doesn't require it)
          prices: [{ amount: asNumber(input.price, 0), currency_code: 'usd' }],
          manage_inventory: true,
        },
      ];
    }

    // 3. Fallback: Build combinations from options values (no IDs yet usually, or we don't have explicit variant IDs).
    type ComboItem = { name: string; value: string; rootOptId?: string };
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
          nextCombinations.push([...combo, { name: optName, value: vv, rootOptId: opt.id }]);
        }
      }

      if (nextCombinations.length > 0) {
        combinations.length = 0;
        combinations.push(...nextCombinations);
      }
    }

    return combinations.map((combo) => {
      const variantValuesTitle = combo.map((c) => c.value).join(' / ');
      const slugifiedOptions = variantValuesTitle.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '');

      const fallbackVariant: Record<string, unknown> = {
        title: `${title || 'Draft Product'} - ${variantValuesTitle}`,
        sku: `${handle || 'product'}-${slugifiedOptions}`,
        prices: [{ amount: asNumber(input.price, 0), currency_code: 'usd' }],
        manage_inventory: true,
      };

      // Medusa requires variant options as an object format: { "option_id": "value" }
      // This applies to BOTH creates and updates
      // Option IDs are included in product-level options for creates, so we can reference them
      const variantOptionsObj: Record<string, string> = {};
      for (const c of combo) {
        if (c.rootOptId && c.rootOptId.trim().length > 0 && c.value.trim().length > 0) {
          variantOptionsObj[c.rootOptId] = c.value;
        }
      }
      if (Object.keys(variantOptionsObj).length > 0) {
        fallbackVariant.options = variantOptionsObj;
      }

      return fallbackVariant;
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
        ? options.map((opt) => {
          // Include option IDs for BOTH creates and updates
          // For creates: Medusa will accept client-generated UUIDs or assign its own IDs
          // These IDs are needed for variant options to reference them in object format
          // For updates: Use existing Medusa option IDs
          
          // Get title from name, title, or fallback to 'Option'
          // Product store uses 'name', but Medusa uses 'title', so handle both
          const optionTitle = asString(opt.name) || asString(opt.title) || 'Option';
          
          const optionPayload: { id?: string; title: string; values: string[] } = {
            title: optionTitle,
            values: Array.isArray(opt.values) ? opt.values.map((v) => asString(v.value)).filter(Boolean) : [],
          };
          
          // Include id for both creates and updates
          // For creates, this allows variant options to reference option IDs in object format
          // For updates, this is the Medusa-assigned ID from reconciliation
          const optId = asString(opt.id);
          if (optId && optId.trim().length > 0) {
            optionPayload.id = optId;
          }
          
          return optionPayload;
        })
        : [
          {
            title: 'Default option',
            values: ['Default option value'],
          },
        ],
    variants,
    tags: Array.isArray(input.tags) ? input.tags.map((t) => ({ value: t })) : [],
    images: Array.isArray(input.images)
      ? input.images
          .map((img, index) => {
            // Handle both string URLs and object formats { url: string }
            let url: string = '';
            if (typeof img === 'string') {
              url = img;
            } else if (isRecord(img)) {
              const imgRecord = img as UnknownRecord;
              url = asString(imgRecord.url || imgRecord.src || '');
            }
            // Only include valid URLs
            if (!url || url.trim().length === 0) return null;
            return {
              url: url.trim(),
              metadata: null,
              rank: index,
            };
          })
          .filter((img): img is { url: string; metadata: null; rank: number } => img !== null)
      : [],
    categories: Array.isArray(input.categories)
      ? input.categories
          .map((c) => {
            // Handle both string IDs and object formats { id: string }
            let id = '';
            if (typeof c === 'string') {
              id = c;
            } else if (isRecord(c)) {
              const cRecord = c as UnknownRecord;
              id = asString(cRecord.id);
            }
            return id ? { id } : null;
          })
          .filter((c): c is { id: string } => c !== null)
      : [],
    sales_channels: Array.isArray(input.sales_channels)
      ? input.sales_channels
          .map((sc) => {
            // Handle both string IDs and object formats { id: string }
            let id = '';
            if (typeof sc === 'string') {
              id = sc;
            } else if (isRecord(sc)) {
              const scRecord = sc as UnknownRecord;
              id = asString(scRecord.id);
            }
            return id ? { id } : null;
          })
          .filter((sc): sc is { id: string } => sc !== null)
      : [],
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


