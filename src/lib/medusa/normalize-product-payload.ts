/**
 * Medusa Admin API expects `currency_code` to be a string code (e.g. "usd", "cad"),
 * but parts of our UI/store may temporarily carry richer currency objects.
 *
 * This module normalizes Medusa product payloads before export/push, without
 * mutating the input object.
 */

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function normalizeCurrencyCode(input: unknown, fallback: string = 'usd'): string {
    // Preconditions:
    // - input can be string | object (e.g., { code: "usd" }) | undefined | null
    // Postconditions:
    // - returns a lowercase currency code string
    // - never throws
    if (typeof input === 'string') {
        const trimmed = input.trim();
        return trimmed ? trimmed.toLowerCase() : fallback;
    }

    if (isRecord(input)) {
        const code = input.code;
        if (typeof code === 'string') {
            const trimmed = code.trim();
            return trimmed ? trimmed.toLowerCase() : fallback;
        }
    }

    return fallback;
}

/**
 * Sanitize a Medusa product create/update payload.
 *
 * Normalizes fields that cause 400 errors:
 * - `variants[].prices[].currency_code` -> string code
 * - Removes `inventory` fields from variants (Medusa v2 doesn't accept them)
 * - Normalizes `shipping_profile_id` (null -> undefined)
 * - Removes undefined/null fields that Medusa rejects
 */
export function sanitizeMedusaProductPayload<T>(payload: T): T {
    if (!isRecord(payload)) return payload;

    // Sanitize shipping_profile_id: null -> undefined (Medusa rejects null)
    const sanitizedPayload: Record<string, unknown> = { ...payload };
    if ('shipping_profile_id' in sanitizedPayload && sanitizedPayload.shipping_profile_id === null) {
        delete sanitizedPayload.shipping_profile_id;
    }

    // Sanitize variants
    const variants = sanitizedPayload.variants;
    if (Array.isArray(variants)) {
        const sanitizedVariants = variants.map((variant) => {
            if (!isRecord(variant)) return variant;

            const sanitizedVariant: Record<string, unknown> = { ...variant };

            // Remove inventory field (Medusa v2 doesn't accept it in product payloads)
            if ('inventory' in sanitizedVariant) {
                delete sanitizedVariant.inventory;
            }

            // Sanitize prices
            const prices = sanitizedVariant.prices;
            if (Array.isArray(prices)) {
                const sanitizedPrices = prices.map((p) => {
                    if (!isRecord(p)) return p;
                    return {
                        ...p,
                        currency_code: normalizeCurrencyCode(p.currency_code),
                    };
                });
                sanitizedVariant.prices = sanitizedPrices;
            }

            // Remove undefined/null fields that might cause issues
            Object.keys(sanitizedVariant).forEach((key) => {
                if (sanitizedVariant[key] === undefined || sanitizedVariant[key] === null) {
                    // Keep null for some fields that Medusa accepts as null
                    const nullableFields = ['collection_id', 'type_id', 'weight', 'length', 'height', 'width', 'hs_code', 'origin_country', 'mid_code', 'material'];
                    if (!nullableFields.includes(key)) {
                        delete sanitizedVariant[key];
                    }
                }
            });

            return sanitizedVariant;
        });
        sanitizedPayload.variants = sanitizedVariants;
    }

    // Remove undefined/null fields from root level (except those that Medusa accepts as null)
    const nullableRootFields = ['collection_id', 'type_id', 'external_id', 'weight', 'length', 'height', 'width', 'hs_code', 'origin_country', 'mid_code', 'material'];
    Object.keys(sanitizedPayload).forEach((key) => {
        if (sanitizedPayload[key] === undefined || (sanitizedPayload[key] === null && !nullableRootFields.includes(key))) {
            delete sanitizedPayload[key];
        }
    });

    return sanitizedPayload as T;
}


