/**
 * Single source of truth for supported languages.
 *
 * Notes:
 * - This list is used by UI language pickers and translation helpers.
 * - API validation is enforced separately in `src/lib/api-schemas.ts` (Zod).
 */
export const ALL_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
] as const;

export type Language = (typeof ALL_LANGUAGES)[number];
export type LanguageCode = Language['code'];

export function getLanguageByCode(code: string): Language | undefined {
  return ALL_LANGUAGES.find((l) => l.code === code);
}


