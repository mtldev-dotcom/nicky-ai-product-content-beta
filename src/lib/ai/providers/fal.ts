import { fal } from '@fal-ai/client';
import type { GeneratedImage } from '@/lib/ai/imageProvider';

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function extractFalImageUrls(result: unknown): string[] {
  /**
   * fal client responses vary by method/model:
   * - Some return `{ images: [{ url }] }`
   * - Others return `{ data: { images: [{ url }] } }` (notably `subscribe`, and some `run` responses)
   *
   * We normalize to a list of URL strings.
   */
  const root = isRecord(result) ? result : null;
  const imagesRaw =
    (root && Array.isArray(root.images) ? root.images : null) ||
    (root && isRecord(root.data) && Array.isArray(root.data.images) ? root.data.images : null) ||
    [];

  const urls: string[] = [];
  for (const img of imagesRaw) {
    if (!isRecord(img)) continue;
    const url = img.url;
    if (typeof url === 'string' && url.length > 0) urls.push(url);
  }
  return urls;
}

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
 * Special case:
 * - `fal-ai/flux-2/edit` expects `image_urls` (array) rather than `image_url` (string).
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
  modelImageUrl?: string;
  studioImageUrl?: string;
}): Promise<GeneratedImage[]> {
  const { apiKey, inputImageUrls, prompt, variants, modelImageUrl, studioImageUrl } = params;
  if (!apiKey) {
    return placeholderOutputs({ inputImageUrls, variants, provider: 'fal' });
  }

  // Server-side auth; never expose this to the browser.
  fal.config({ credentials: apiKey });

  const model = params.model || 'fal-ai/flux/dev/image-to-image';

  // Build combined image array: product images + optional model/studio images
  const buildImageArray = (productImageUrl: string): string[] => {
    const images: string[] = [productImageUrl];
    // Add model image if provided (for human model reference)
    if (modelImageUrl) images.push(modelImageUrl);
    // Add studio image if provided (for background/lighting reference)
    if (studioImageUrl) images.push(studioImageUrl);
    return images;
  };

  const outputs: GeneratedImage[] = [];
  for (const imageUrl of inputImageUrls) {
    for (let i = 0; i < variants; i++) {
      try {
        const combinedImages = buildImageArray(imageUrl);
        
        const result = (await fal.run(model, {
          input:
            model === 'fal-ai/flux-2/edit' || combinedImages.length > 1
              ? {
                  /**
                   * FLUX.2 edit schema (from fal docs):
                   * - required: prompt, image_urls (max 4)
                   * - optional: num_images (default 1)
                   *
                   * For multi-image support, use image_urls array.
                   * Limit to max 4 images as per fal API.
                   */
                  prompt,
                  image_urls: combinedImages.slice(0, 4),
                  num_images: 1,
                }
              : {
                  /**
                   * Common image-to-image schema used by many fal models.
                   * Single image URL for models that don't support multiple images.
                   */
                  prompt,
                  image_url: imageUrl,
                  num_images: 1,
                },
        })) as unknown as { images?: Array<{ url?: string }> };

        const urls = extractFalImageUrls(result);
        for (const url of urls) {
          outputs.push({ kind: 'url', url });
        }
      } catch {
        // Best-effort: keep going for other images/variants, but leave a breadcrumb for debugging.
        // NOTE: Never log credentials here.
        console.error('fal image generation failed', { model });
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


