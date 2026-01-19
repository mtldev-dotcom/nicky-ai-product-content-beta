import type { GeneratedImage } from '@/lib/ai/imageProvider';

/**
 * OpenAI provider (placeholder-first)
 *
 * Notes:
 * - This repo already uses `openai` for text generation, but there is no existing
 *   image-to-image pipeline here yet.
 * - For MVP, if no key is configured (or if the implementation is incomplete),
 *   we return deterministic placeholder URLs so the UI + persistence pipeline works.
 *
 * Follow-up (not in this task): implement true image-to-image using OpenAI Images APIs.
 */
export async function generateWithOpenAI(params: {
  apiKey: string;
  model?: string;
  inputImageUrls: string[];
  prompt: string;
  variants: number;
  modelImageUrl?: string;
  studioImageUrl?: string;
}): Promise<GeneratedImage[]> {
  const { apiKey, inputImageUrls, prompt, variants } = params;

  if (!apiKey) {
    return placeholderOutputs({ inputImageUrls, prompt, variants, provider: 'openai' });
  }

  // Placeholder for now (keeps the integration path stable).
  // We intentionally do NOT attempt to call an API with unknown requirements here.
  // When implementing, modelImageUrl and studioImageUrl will be used to combine images.
  return placeholderOutputs({ inputImageUrls, prompt, variants, provider: 'openai' });
}

function placeholderOutputs(args: {
  inputImageUrls: string[];
  prompt: string;
  variants: number;
  provider: string;
}): GeneratedImage[] {
  const outputs: GeneratedImage[] = [];
  const safeText = encodeURIComponent(`${args.provider} studio`);
  for (let i = 0; i < args.inputImageUrls.length; i++) {
    for (let v = 0; v < args.variants; v++) {
      // Public, non-sensitive placeholder. Keeps UX flowing without secrets.
      outputs.push({ kind: 'url', url: `https://placehold.co/1024x1024/png?text=${safeText}` });
    }
  }
  return outputs;
}


