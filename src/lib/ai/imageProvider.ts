/**
 * Image provider adapter
 *
 * Goal:
 * - Keep the rest of the app agnostic to vendor SDKs.
 * - Make provider swaps cheap (OpenAI ↔ fal.ai ↔ Gemini).
 *
 * IMPORTANT:
 * - Some providers return URLs, others return base64 blobs. We normalize both.
 */

import { generateWithFal } from '@/lib/ai/providers/fal';
import { generateWithGemini } from '@/lib/ai/providers/gemini';
import { generateWithOpenAI } from '@/lib/ai/providers/openai';

export type ImageProviderId = 'openai' | 'fal' | 'gemini';

export type GeneratedImage =
  | { kind: 'url'; url: string }
  | { kind: 'base64'; mimeType: string; dataBase64: string };

export type GenerateStudioImagesParams = {
  provider: ImageProviderId;
  providerModel?: string | null;
  inputImageUrls: string[];
  prompt: string;
  variants: number;

  /**
   * Optional: Model or studio image URLs to use as additional input images.
   * These will be combined with inputImageUrls (product images) for multi-image generation.
   */
  modelImageUrl?: string | null;
  studioImageUrl?: string | null;

  /**
   * Provider credentials (server-only).
   * - These should come from decrypted org settings or env vars.
   */
  openaiApiKey?: string | null;
  falApiKey?: string | null;
  geminiApiKey?: string | null;
};

export async function generateStudioImages(params: GenerateStudioImagesParams): Promise<GeneratedImage[]> {
  const variants = Math.max(1, Math.min(8, Math.floor(params.variants || 1)));
  const inputImageUrls = params.inputImageUrls.filter((u) => typeof u === 'string' && u.length > 0);
  if (inputImageUrls.length === 0) return [];

  const prompt = (params.prompt || '').trim();
  if (!prompt) throw new Error('Missing prompt');

  // Combine product images with optional model/studio images
  // For now, we'll pass model/studio URLs separately to providers
  // Providers can decide how to combine them (some support multiple images, others may need different handling)

  switch (params.provider) {
    case 'fal':
      return generateWithFal({
        apiKey: params.falApiKey || '',
        model: params.providerModel || undefined,
        inputImageUrls,
        prompt,
        variants,
        modelImageUrl: params.modelImageUrl || undefined,
        studioImageUrl: params.studioImageUrl || undefined,
      });
    case 'gemini':
      return generateWithGemini({
        apiKey: params.geminiApiKey || '',
        model: params.providerModel || undefined,
        inputImageUrls,
        prompt,
        variants,
        modelImageUrl: params.modelImageUrl || undefined,
        studioImageUrl: params.studioImageUrl || undefined,
      });
    case 'openai':
    default:
      return generateWithOpenAI({
        apiKey: params.openaiApiKey || '',
        model: params.providerModel || undefined,
        inputImageUrls,
        prompt,
        variants,
        modelImageUrl: params.modelImageUrl || undefined,
        studioImageUrl: params.studioImageUrl || undefined,
      });
  }
}


