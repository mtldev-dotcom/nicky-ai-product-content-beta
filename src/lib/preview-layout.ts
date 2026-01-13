/**
 * Preview Layout (org-level) — v1
 *
 * This file is intentionally framework-agnostic so it can be:
 * - used in React components
 * - unit-tested in Node without DOM dependencies
 *
 * We keep validation lightweight (no new deps) and "normalize" inputs so
 * older/sparse payloads never crash the preview page.
 */

export type PreviewCardSize = 'sm' | 'md' | 'lg';

export type PreviewLayoutV1<CardId extends string = string> = {
  version: 1;
  /** The ordered cards shown in the main column. */
  main: CardId[];
  /** The ordered cards shown in the sidebar column. */
  sidebar: CardId[];
  /** Cards that are not shown. */
  hidden: CardId[];
  /** Per-card settings. */
  cardSettings: Record<CardId, { size: PreviewCardSize }>;
};

export type PreviewLayout<CardId extends string = string> = PreviewLayoutV1<CardId>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function coerceCardSize(v: unknown): PreviewCardSize {
  return v === 'sm' || v === 'md' || v === 'lg' ? v : 'md';
}

/**
 * Normalize and validate an unknown layout payload into a safe v1 layout.
 *
 * Preconditions:
 * - `allCardIds` is the full set of cards the UI knows how to render.
 *
 * Postconditions:
 * - Every known card appears in exactly one of {main, sidebar, hidden}.
 * - No duplicates.
 * - Unknown card ids are dropped.
 * - Missing cardSettings are defaulted.
 */
export function normalizePreviewLayout<CardId extends string>(
  raw: unknown,
  allCardIds: readonly CardId[],
  defaults?: Partial<Pick<PreviewLayoutV1<CardId>, 'main' | 'sidebar' | 'hidden'>>
): PreviewLayoutV1<CardId> {
  const allSet = new Set<string>(allCardIds);

  const fallbackMain = (defaults?.main ?? allCardIds.slice(0, Math.min(4, allCardIds.length))) as CardId[];
  const fallbackSidebar = (defaults?.sidebar ?? allCardIds.slice(Math.min(4, allCardIds.length))) as CardId[];
  const fallbackHidden = (defaults?.hidden ?? []) as CardId[];

  // Start from fallbacks; we'll overwrite if raw is well-formed.
  let main: CardId[] = [...fallbackMain];
  let sidebar: CardId[] = [...fallbackSidebar];
  let hidden: CardId[] = [...fallbackHidden];
  let cardSettings: Record<CardId, { size: PreviewCardSize }> = {} as Record<CardId, { size: PreviewCardSize }>;

  if (isRecord(raw) && raw.version === 1) {
    if (isStringArray(raw.main)) main = raw.main.filter((id) => allSet.has(id)) as CardId[];
    if (isStringArray(raw.sidebar)) sidebar = raw.sidebar.filter((id) => allSet.has(id)) as CardId[];
    if (isStringArray(raw.hidden)) hidden = raw.hidden.filter((id) => allSet.has(id)) as CardId[];

    if (isRecord(raw.cardSettings)) {
      const next: Record<string, { size: PreviewCardSize }> = {};
      for (const [k, v] of Object.entries(raw.cardSettings)) {
        if (!allSet.has(k)) continue;
        next[k] = { size: coerceCardSize(isRecord(v) ? v.size : undefined) };
      }
      cardSettings = next as Record<CardId, { size: PreviewCardSize }>;
    }
  }

  // Deduplicate and ensure every card exists in exactly one bucket.
  const used = new Set<CardId>();
  const uniq = (ids: CardId[]) => {
    const out: CardId[] = [];
    for (const id of ids) {
      if (used.has(id)) continue;
      used.add(id);
      out.push(id);
    }
    return out;
  };

  main = uniq(main);
  sidebar = uniq(sidebar);
  hidden = uniq(hidden);

  // Any missing cards go to the end of main (safe default).
  for (const id of allCardIds) {
    if (!used.has(id)) main.push(id);
  }

  // Default missing cardSettings to md.
  const fullSettings: Record<CardId, { size: PreviewCardSize }> = {} as Record<CardId, { size: PreviewCardSize }>;
  for (const id of allCardIds) {
    fullSettings[id] = { size: cardSettings[id]?.size ?? 'md' };
  }

  return {
    version: 1,
    main,
    sidebar,
    hidden,
    cardSettings: fullSettings,
  };
}

