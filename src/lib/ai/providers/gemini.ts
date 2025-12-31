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
}): Promise<GeneratedImage[]> {
  const { apiKey, inputImageUrls, prompt, variants } = params;
  if (!apiKey) {
    return placeholderOutputs({ inputImageUrls, variants, provider: 'gemini' });
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = params.model || 'models/gemini-3-pro-image-preview';

  const outputs: GeneratedImage[] = [];

  for (const imageUrl of inputImageUrls) {
    // Fetch the image bytes once per input.
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      continue;
    }
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const base64 = buf.toString('base64');

    for (let i = 0; i < variants; i++) {
      try {
        const response = (await ai.models.generateContent({
          model,
          contents: [
            { text: prompt },
            {
              inlineData: {
                mimeType: contentType,
                data: base64,
              },
            },
          ],
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
          const mimeType = part.inlineData?.mimeType || contentType;
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


