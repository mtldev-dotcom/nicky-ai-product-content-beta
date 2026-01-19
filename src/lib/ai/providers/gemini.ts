import { GoogleGenAI } from '@google/genai';
import type { GeneratedImage } from '@/lib/ai/imageProvider';

/**
 * Gemini provider (image-to-image)
 *
 * Docs used: Gemini API examples show `GoogleGenAI` with `models.generateContent`,
 * passing multimodal `contents` parts (text + inlineData image as base64).
 *
 * Since Gemini returns image data as base64 inline parts, this provider returns
 * `{ kind: 'base64' }` results which the API route will upload to R2 and convert
 * into public URLs for the client.
 */
export async function generateWithGemini(params: {
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
    return placeholderOutputs({ inputImageUrls, variants, provider: 'gemini' });
  }

  const ai = new GoogleGenAI({ apiKey });
  /**
   * Model ID compatibility:
   * - Some Gemini examples use IDs like `gemini-3-pro-image-preview`
   * - Some surfaces show `models/gemini-3-pro-image-preview`
   *
   * We pass through the user-selected string as-is to maximize compatibility,
   * and default to the requested "Nano Banana Pro" model ID.
   */
  const model = (params.model || '').trim() || 'gemini-3-pro-image-preview';

  const outputs: GeneratedImage[] = [];

  // Helper to fetch and convert image to base64
  const fetchImageAsBase64 = async (url: string): Promise<{ mimeType: string; data: string } | null> => {
    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) return null;
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const base64 = buf.toString('base64');
      return { mimeType: contentType, data: base64 };
    } catch {
      return null;
    }
  };

  for (const imageUrl of inputImageUrls) {
    // Fetch product image
    const productImage = await fetchImageAsBase64(imageUrl);
    if (!productImage) continue;

    // Build contents array: prompt + product image + optional model/studio images
    const contents: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      { text: prompt },
      {
        inlineData: {
          mimeType: productImage.mimeType,
          data: productImage.data,
        },
      },
    ];

    // Add model image if provided
    if (modelImageUrl) {
      const modelImage = await fetchImageAsBase64(modelImageUrl);
      if (modelImage) {
        contents.push({
          inlineData: {
            mimeType: modelImage.mimeType,
            data: modelImage.data,
          },
        });
      }
    }

    // Add studio image if provided
    if (studioImageUrl) {
      const studioImage = await fetchImageAsBase64(studioImageUrl);
      if (studioImage) {
        contents.push({
          inlineData: {
            mimeType: studioImage.mimeType,
            data: studioImage.data,
          },
        });
      }
    }

    for (let i = 0; i < variants; i++) {
      try {
        const response = (await ai.models.generateContent({
          model,
          contents,
        })) as unknown as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string; inlineData?: { data?: string; mimeType?: string } }>;
            };
          }>;
        };

        const parts = response?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          const data = part.inlineData?.data;
          const mimeType = part.inlineData?.mimeType || productImage.mimeType;
          if (typeof data === 'string' && data.length > 0) {
            outputs.push({ kind: 'base64', dataBase64: data, mimeType });
          }
        }
      } catch {
        // Best-effort: try the next variant.
      }
    }
  }

  if (outputs.length === 0) {
    return placeholderOutputs({ inputImageUrls, variants, provider: 'gemini' });
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


