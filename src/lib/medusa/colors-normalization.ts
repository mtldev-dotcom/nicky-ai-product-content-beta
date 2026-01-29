/**
 * Colors normalization (single source of truth)
 *
 * Canonical rules (matches legacy scripts in /home/mtldev/clawd/tools/medusa):
 * - trim
 * - lowercase
 * - replace `+` with `/`
 * - normalize spaces around `/`
 * - remove all remaining whitespace
 * - collapse accidental multiple slashes
 */

export function canonicalizeColorValue(input: unknown): string {
  let s = String(input ?? '').trim();
  if (!s) return '';
  s = s.toLowerCase();
  s = s.replace(/\s*\+\s*/g, '/');
  s = s.replace(/\s*\/\s*/g, '/');
  s = s.replace(/\s+/g, '');
  // collapse accidental multi slashes (global)
  s = s.replace(/\/+/, '/');
  return s;
}

export function isColorsTitle(title: unknown): boolean {
  const t = String(title ?? '').trim().toLowerCase();
  return ['colors', 'couleurs'].includes(t);
}

export function isColorishTitle(title: unknown): boolean {
  const t = String(title ?? '').trim().toLowerCase();
  // Common marketplace variations
  return [
    'color',
    'colors',
    'couleur',
    'couleurs',
    'metal color',
    'metal colors',
    'main stone color',
    'main stone colors',
    'stone color',
    'stone colors',
  ].includes(t);
}

export function normalizeColorsTitle(title: unknown): 'Colors' {
  // Canonical title for UI + Medusa + metadata
  return 'Colors';
}

function titleCaseSegment(seg: string): string {
  if (!seg) return seg;
  return seg[0].toUpperCase() + seg.slice(1).toLowerCase();
}

export const frColorMap: Record<string, string> = {
  black: 'Noir',
  silver: 'Argent',
  gold: 'Or',
  blue: 'Bleu',
  red: 'Rouge',
  green: 'Vert',
  purple: 'Violet',
  copper: 'Cuivre',
};

export function displayEnFromCanonical(canon: string): string {
  return canon.split('/').map(titleCaseSegment).join('/');
}

export function displayFrFromCanonical(canon: string): string {
  return canon.split('/').map((seg) => frColorMap[seg] ?? titleCaseSegment(seg)).join('/');
}
