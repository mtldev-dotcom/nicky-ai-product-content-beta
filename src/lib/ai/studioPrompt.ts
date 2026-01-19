import { PROMPT_LIBRARY_JSON, type PromptLibrary } from '@/lib/ai/promptLibrary';

export type JewelryType = (typeof PROMPT_LIBRARY_JSON)['jewelryTypes'][number];
export type StudioSetupId = (typeof PROMPT_LIBRARY_JSON)['setups'][number]['id'];
export type StudioModelId = (typeof PROMPT_LIBRARY_JSON)['models'][number]['id'];

export type StudioPromptOptions = {
  macro: boolean;
  noFingerprints: boolean;
  extraRimLight: boolean;
  darkness: number; // 0-100
};

export type StudioTogglePhrases = {
  macro: string;
  noFingerprints: string;
  extraRimLight: string;
};

export const DEFAULT_STUDIO_TOGGLE_PHRASES: StudioTogglePhrases = {
  macro: 'macro close-up, extreme detail on metal grain',
  noFingerprints: 'no reflections, no fingerprints. no dust, no smudges.',
  extraRimLight: 'extra rim light for clean edge separation, still realistic',
};

function coerceLibrary(v: unknown | null | undefined): PromptLibrary {
  // We store org overrides as JSON; if it is malformed, fall back safely.
  if (v && typeof v === 'object') return v as PromptLibrary;
  return PROMPT_LIBRARY_JSON;
}

export function getSetupById(id: string, library?: PromptLibrary) {
  const lib = library ?? PROMPT_LIBRARY_JSON;
  return lib.setups.find((s) => s.id === id) || null;
}

export function getModelById(id: string, library?: PromptLibrary) {
  const lib = library ?? PROMPT_LIBRARY_JSON;
  return lib.models.find((m) => m.id === id) || null;
}

function clampInt(n: number, min: number, max: number): number {
  const x = Number.isFinite(n) ? Math.round(n) : min;
  return Math.max(min, Math.min(max, x));
}

function buildTogglesAndModifiers(opts: StudioPromptOptions, phrases: StudioTogglePhrases): string {
  const parts: string[] = [];

  /**
   * Toggle → prompt mapping.
   *
   * We intentionally keep these short and composable. The model already receives
   * the industrial studio base + setup + (optional) model prompt.
   */
  if (opts.macro) {
    parts.push(phrases.macro);
  }

  if (opts.noFingerprints) {
    parts.push(phrases.noFingerprints);
  }

  if (opts.extraRimLight) {
    parts.push(phrases.extraRimLight);
  }

  const darkness = clampInt(opts.darkness, 0, 100);
  if (darkness >= 70) {
    parts.push(`background slightly darker (${darkness}/100), deeper shadows but preserve detail`);
  } else if (darkness <= 30) {
    parts.push(`background slightly lighter (${darkness}/100), keep high-contrast mood`);
  } else {
    parts.push(`background darkness subtle (${darkness}/100)`);
  }

  // Always enforce no text/watermarks even if toggles don't include it.
  parts.push("no text, no logos, no watermark");

  return parts.join('. ') + '.';
}

export function buildStudioPrompt(params: {
  setupId: string;
  modelId: string;
  options: StudioPromptOptions;
  library?: unknown | null;
  togglePhrases?: StudioTogglePhrases | null;
  modelImageUrl?: string | null;
  studioImageUrl?: string | null;
  customPromptInstructions?: string | null;
}): { promptText: string; setupTitle: string; modelTitle: string } {
  const lib = coerceLibrary(params.library);
  const phrases = params.togglePhrases ?? DEFAULT_STUDIO_TOGGLE_PHRASES;

  const setup = getSetupById(params.setupId, lib);
  if (!setup) throw new Error(`Unknown setupId: ${params.setupId}`);

  const model = getModelById(params.modelId, lib);
  if (!model) throw new Error(`Unknown modelId: ${params.modelId}`);

  // If custom prompt instructions are provided, use them as the complete prompt
  if (params.customPromptInstructions && params.customPromptInstructions.trim().length > 0) {
    return { 
      promptText: params.customPromptInstructions.trim(), 
      setupTitle: setup.title, 
      modelTitle: model.title 
    };
  }

  const togglesAndModifiers = buildTogglesAndModifiers(params.options, phrases);

  const template = lib.finalPromptTemplate.template;
  
  // If modelImageUrl is provided, use minimal model prompt (image will be provided separately)
  // Otherwise, use the full text-based model prompt
  const modelPrompt = params.modelImageUrl 
    ? 'Use the provided model image as reference for the human model appearance and pose.'
    : model.prompt;
  
  // If studioImageUrl is provided, use minimal setup prompt (image will be provided separately)
  // Otherwise, use the full text-based setup prompt
  const setupPrompt = params.studioImageUrl
    ? 'Use the provided studio image as reference for the background and lighting setup.'
    : setup.prompt;

  const promptText = template
    .replace('{GLOBAL_BASE}', lib.brand.globalBase)
    .replace('{SETUP_PROMPT}', setupPrompt)
    .replace('{MODEL_PROMPT}', modelPrompt)
    .replace('{TOGGLES_AND_MODIFIERS}', togglesAndModifiers);

  return { promptText, setupTitle: setup.title, modelTitle: model.title };
}


