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
 * Sanitize a Medusa product create payload.
 *
 * Currently we only normalize `variants[].prices[].currency_code` to a string,
 * because this is a strict Medusa validation requirement and the source of 400s.
 */
export function sanitizeMedusaProductPayload<T>(payload: T): T {
    if (!isRecord(payload)) return payload;

    const variants = payload.variants;
    if (!Array.isArray(variants)) return payload;

    const sanitizedVariants = variants.map((variant) => {
        if (!isRecord(variant)) return variant;

        const prices = variant.prices;
        if (!Array.isArray(prices)) return variant;

        const sanitizedPrices = prices.map((p) => {
            if (!isRecord(p)) return p;
            return {
                ...p,
                currency_code: normalizeCurrencyCode(p.currency_code),
            };
        });

        return {
            ...variant,
            prices: sanitizedPrices,
        };
    });

    return {
        ...payload,
        variants: sanitizedVariants,
    } as T;
}


