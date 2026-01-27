/**
 * Utility functions for parsing Medusa API responses.
 *
 * Medusa responses can have different formats:
 * - `{ product: { id, ... } }` - for product operations
 * - `{ variant: { id, ... } }` - for variant operations
 * - `{ option: { id, ... } }` - for option operations
 * - `{ id, ... }` - direct entity format
 */

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/**
 * Extract product ID from Medusa response.
 * Handles both `{ product: { id } }` and `{ id }` formats.
 */
export function extractProductId(response: unknown): string | null {
  if (!isRecord(response)) return null;

  // Try nested format first: { product: { id } }
  if (isRecord(response.product)) {
    const id = response.product.id;
    if (typeof id === 'string' && id.length > 0) {
      return id;
    }
  }

  // Try direct format: { id }
  if (typeof response.id === 'string' && response.id.length > 0) {
    return response.id;
  }

  return null;
}

/**
 * Extract variant ID from Medusa response.
 * Handles both `{ variant: { id } }` and `{ id }` formats.
 */
export function extractVariantId(response: unknown): string | null {
  if (!isRecord(response)) return null;

  // Try nested format first: { variant: { id } }
  if (isRecord(response.variant)) {
    const id = response.variant.id;
    if (typeof id === 'string' && id.length > 0) {
      return id;
    }
  }

  // Try direct format: { id }
  if (typeof response.id === 'string' && response.id.length > 0) {
    return response.id;
  }

  return null;
}

/**
 * Extract option ID from Medusa response.
 * Handles both `{ option: { id } }` and `{ id }` formats.
 */
export function extractOptionId(response: unknown): string | null {
  if (!isRecord(response)) return null;

  // Try nested format first: { option: { id } }
  if (isRecord(response.option)) {
    const id = response.option.id;
    if (typeof id === 'string' && id.length > 0) {
      return id;
    }
  }

  // Try direct format: { id }
  if (typeof response.id === 'string' && response.id.length > 0) {
    return response.id;
  }

  return null;
}

/**
 * Parse Medusa API response text, handling both JSON and non-JSON responses.
 */
export function parseMedusaResponse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

/**
 * Extract error message from Medusa API error response.
 */
export function extractMedusaErrorMessage(response: unknown): string {
  if (!isRecord(response)) {
    return 'Unknown error';
  }

  // Try common error message fields
  if (typeof response.message === 'string') {
    return response.message;
  }

  if (typeof response.error === 'string') {
    return response.error;
  }

  // Try errors array
  if (Array.isArray(response.errors)) {
    const errorMessages = response.errors
      .map((e) => {
        if (typeof e === 'string') return e;
        if (isRecord(e)) {
          return asString(e.message) || asString(e.error) || JSON.stringify(e);
        }
        return String(e);
      })
      .filter((msg) => msg.length > 0);

    if (errorMessages.length > 0) {
      return errorMessages.join('; ');
    }
  }

  // Fallback to stringified response
  return JSON.stringify(response);
}
