/**
 * Shared primitive utilities for the Medusa integration layer.
 *
 * These helpers exist because Medusa API responses use `unknown`-typed JSON
 * blobs that must be safely narrowed before use. They were previously
 * copy-pasted across every file in this directory; this is the single source
 * of truth.
 */

export type UnknownRecord = Record<string, unknown>;

/** Type guard: truthy for plain objects, false for arrays and null. */
export function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Safely coerce `v` to a string, returning `fallback` for non-strings. */
export function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** Safely coerce `v` to a finite number, returning `fallback` for non-numbers or NaN/Infinity. */
export function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Safely coerce `v` to a non-empty string array, filtering out non-strings and empty strings. */
export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/**
 * Extract option values as trimmed strings from the various shapes Medusa
 * returns for option value arrays (plain strings, or `{ value: string }` objects).
 */
export function extractOptionValues(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  return values
    .map((v) => {
      if (typeof v === 'string') return v.trim();
      if (isRecord(v)) {
        const value = v.value;
        if (typeof value === 'string') return value.trim();
      }
      return '';
    })
    .filter((v): v is string => v.length > 0);
}
