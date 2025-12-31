import { fal } from '@fal-ai/client';
import type { GeneratedImage } from '@/lib/ai/imageProvider';

/**
 * fal.ai provider
 *
 * Docs used: `@fal-ai/client` supports server-side credentials via `fal.config({ credentials })`
 * and calling models via `fal.run(model, { input: {...} })`.
 *
 * This implementation targets a common image-to-image convention:
 * - `image_url`: input image
 * - `prompt`: text prompt
 *
 * NOTE:
 * - Different fal models accept different input field names. We keep this minimal
 *   and allow overriding the `model` string (and later, mapping per-model inputs).
 */
export async function generateWithFal(params: {
  apiKey: string;
  model?: string;
  inputImageUrls: string[];
  prompt: string;
  variants: number;
}): Promise<GeneratedImage[]> {
  const { apiKey, inputImageUrls, prompt, variants } = params;
  if (!apiKey) {
    return placeholderOutputs({ inputImageUrls, variants, provider: 'fal' });
  }

  // Server-side auth; never expose this to the browser.
  fal.config({ credentials: apiKey });

  const model = params.model || 'fal-ai/flux/dev/image-to-image';

  const outputs: GeneratedImage[] = [];
  for (const imageUrl of inputImageUrls) {
    for (let i = 0; i < variants; i++) {
      try {
        const result = (await fal.run(model, {
          input: {
            prompt,
            image_url: imageUrl,
            // Some models accept `num_images`. We still request 1 per call for predictable IDs.
            num_images: 1,
          },
        })) as unknown as { images?: Array<{ url?: string }> };

        const url = result?.images?.[0]?.url;
        if (typeof url === 'string' && url.length > 0) {
          outputs.push({ kind: 'url', url });
        }
      } catch {
        // Best-effort: keep going for other images/variants.
      }
    }
  }

  // If everything failed (misconfigured model params, etc), fall back to placeholders so pipeline remains usable.
  if (outputs.length === 0) {
    return placeholderOutputs({ inputImageUrls, variants, provider: 'fal' });
  }

  return outputs;
}

function placeholderOutputs(args: { inputImageUrls: string[]; variants: number; provider: string }): GeneratedImage[] {
  const outputs: GeneratedImage[] = [];
  const safeText = encodeURIComponent(`${args.provider} studio`);
  for (let i = 0; i < args.inputImageUrls.length; i++) {
    for (let v = 0; v < args.variants; v++) {
      outputs.push({ kind: 'url', url: `https://placehold.co/1024x1024/png?text=${safeText}` });
    }
  }
  return outputs;
}


