/**
 * Curated “best” image model choices per provider.
 *
 * UX goal:
 * - Make model selection obvious and low-error (no free-text IDs).
 * - Keep the list small (curated) to reduce choice overload.
 *
 * Note:
 * - If providers rename/retire models, update this map (single source of truth).
 */
export const TOP_IMAGE_MODELS_BY_PROVIDER = {
  openai: ['gpt-image-1', 'dall-e-3', 'dall-e-2'],
  // Includes FLUX.2 edit model (different input schema: `image_urls`).
  fal: ['fal-ai/flux-2/edit', 'fal-ai/flux/dev/image-to-image', 'fal-ai/flux-pro/image-to-image'],
  // Gemini/Google image models (as requested)
  gemini: [
    'gemini-3-pro-image-preview',
    'gemini-2.5-flash-image',
    'imagen-4.0-generate-001',
    'imagen-4.0-ultra-generate-001',
  ],
} as const;

export type AiImageProviderId = keyof typeof TOP_IMAGE_MODELS_BY_PROVIDER;

export function coerceAiImageProviderId(v: unknown): AiImageProviderId {
  return v === 'fal' || v === 'gemini' || v === 'openai' ? v : 'openai';
}

export function topImageModelsForProvider(provider: unknown): readonly string[] {
  return TOP_IMAGE_MODELS_BY_PROVIDER[coerceAiImageProviderId(provider)];
}

export function providerLabel(provider: AiImageProviderId): string {
  switch (provider) {
    case 'fal':
      return 'fal.ai';
    case 'gemini':
      return 'Gemini';
    case 'openai':
    default:
      return 'OpenAI';
  }
}


