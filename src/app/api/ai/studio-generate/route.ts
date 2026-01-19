import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/server';
import { StudioGenerateRequestSchema } from '@/lib/api-schemas';
import { buildStudioPrompt } from '@/lib/ai/studioPrompt';
import { generateStudioImages, type GeneratedImage, type ImageProviderId } from '@/lib/ai/imageProvider';
import { loadDecryptedSettingsForServer } from '@/app/settings/actions';
import { createSession, logPipelineEvent, updateSessionError, updateSessionStatus } from '@/lib/llm/session-manager';
import { logCallPreview } from '@/lib/llm/logger';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function extForMime(mimeType: string): string {
  const mt = (mimeType || '').toLowerCase();
  if (mt.includes('png')) return 'png';
  if (mt.includes('webp')) return 'webp';
  if (mt.includes('jpg') || mt.includes('jpeg')) return 'jpg';
  return 'png';
}

async function uploadBase64ToR2(params: {
  userId: string;
  bucket: string;
  publicUrlBase: string;
  s3Client: S3Client;
  mimeType: string;
  dataBase64: string;
}): Promise<string> {
  /**
   * Upload generated image bytes to the same R2 bucket used for media uploads.
   *
   * Preconditions:
   * - `s3Client` is configured with org credentials or env vars.
   *
   * Postconditions:
   * - Returns a public URL that can be stored in product media list.
   */
  const ext = extForMime(params.mimeType);
  const id = crypto.randomUUID();
  // Use per-user folders instead of per-organization for better isolation
  const key = `${params.userId}/ai-studio/${Date.now()}-${id}.${ext}`;
  const body = Buffer.from(params.dataBase64, 'base64');

  const command = new PutObjectCommand({
    Bucket: params.bucket,
    Key: key,
    ContentType: params.mimeType,
    Body: body,
  });

  await params.s3Client.send(command);
  return `${params.publicUrlBase}/${key}`;
}

function toProviderId(v: unknown): ImageProviderId {
  if (v === 'fal' || v === 'gemini' || v === 'openai') return v;
  return 'openai';
}

export async function POST(req: Request) {
  let sessionId: string | null = null;
  try {
    const parsed = StudioGenerateRequestSchema.parse(await req.json());

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }

    const orgId = membership.organization_id as string;

    // Best-effort usage logging session (must never break the endpoint).
    try {
      sessionId = await createSession({
        orgId,
        userId: user.id,
        module: 'AI_STUDIO_IMAGE',
        inputSummary: `productId=${parsed.productId}, inputs=${parsed.inputImages.length}, jewelryType=${parsed.jewelryType}, setupId=${parsed.setupId}, modelId=${parsed.modelId}, variants=${parsed.variants}`,
      });
      await logPipelineEvent(sessionId, 'STUDIO_GENERATE_RECEIVED');
    } catch (e) {
      console.error('AI Studio usage logging disabled for this request (session create failed):', e);
      sessionId = null;
    }

    // Load product row (org scoped) so we can patch the `data` blob.
    const { data: productRow, error: readErr } = await supabase
      .from('products')
      .select('data')
      .eq('id', parsed.productId)
      .eq('organization_id', orgId)
      .single();

    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 400 });
    }

    const settings = await loadDecryptedSettingsForServer(orgId);
    if (!settings) {
      return NextResponse.json({ error: 'Organization settings not found' }, { status: 500 });
    }

    // If selectedAssetId is provided, look up the asset to determine type and get image URL
    let modelImageUrl = parsed.modelImageUrl || null;
    let studioImageUrl = parsed.studioImageUrl || null;

    if (parsed.selectedAssetId) {
      const { data: asset, error: assetError } = await supabase
        .from('studio_assets')
        .select('id, type, image_url, organization_id')
        .eq('id', parsed.selectedAssetId)
        .eq('organization_id', orgId)
        .single();

      if (!assetError && asset) {
        if (asset.type === 'model') {
          modelImageUrl = asset.image_url;
        } else if (asset.type === 'studio') {
          studioImageUrl = asset.image_url;
        }
      }
    }

    // Build prompt from the canonical library.
    // If modelImageUrl or studioImageUrl are provided, they will replace text-based prompts.
    // If customPromptInstructions are provided, they will replace the entire prompt template.
    const { promptText } = buildStudioPrompt({
      setupId: parsed.setupId,
      modelId: parsed.modelId,
      options: {
        macro: parsed.options.macro,
        noFingerprints: parsed.options.noFingerprints,
        extraRimLight: parsed.options.extraRimLight,
        darkness: parsed.options.darkness,
      },
      library: settings.aiStudioPromptLibrary,
      togglePhrases: settings.aiStudioTogglePhrases,
      modelImageUrl,
      studioImageUrl,
      customPromptInstructions: parsed.customPromptInstructions || null,
    });

    if (sessionId) {
      await logPipelineEvent(sessionId, 'STUDIO_PROMPT_BUILT', JSON.stringify({ setupId: parsed.setupId, modelId: parsed.modelId }));
      await logCallPreview({
        sessionId,
        step: 'STUDIO_PROMPT',
        model: 'prompt_template',
        promptText,
        responseText: null,
      });
    }

    // Validate setup ↔ jewelry type consistency server-side (defense in depth).
    // We only validate that the setupId exists in the library via `buildStudioPrompt`.
    // `jewelryType` is kept for UI filtering and persisted metadata.

    const provider: ImageProviderId = parsed.provider ? toProviderId(parsed.provider) : toProviderId(settings.aiImageProvider);
    const providerModel = parsed.providerModel || settings.aiImageModel || undefined;

    // Provider keys: org settings first, then env for compatibility.
    const openaiApiKey = settings.openaiApiKey || process.env.OPENAI_API_KEY || '';
    const falApiKey = settings.falApiKey || process.env.FAL_API_KEY || '';
    const geminiApiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';

    if (sessionId) {
      await logPipelineEvent(
        sessionId,
        'STUDIO_PROVIDER_REQUEST',
        JSON.stringify({
          provider,
          providerModel: providerModel || null,
          inputCount: parsed.inputImages.length,
          variants: parsed.variants,
        })
      );
    }

    const generated = await generateStudioImages({
      provider,
      providerModel,
      inputImageUrls: parsed.inputImages.map((x) => x.url),
      prompt: promptText,
      variants: parsed.variants,
      modelImageUrl: modelImageUrl || undefined,
      studioImageUrl: studioImageUrl || undefined,
      openaiApiKey,
      falApiKey,
      geminiApiKey,
    });

    // Configure R2 client for uploads (needed for Gemini base64 outputs).
    const bucket = settings.r2BucketName || process.env.S3_BUCKET || '';
    const publicUrlBase = settings.r2PublicUrl || process.env.S3_FILE_URL || '';
    
    // Support both S3_ACCOUNT_ID and S3_ENDPOINT (extract account ID from endpoint URL)
    let accountId = settings.r2AccountId || process.env.S3_ACCOUNT_ID || '';
    if (!accountId && process.env.S3_ENDPOINT) {
      // Extract account ID from endpoint URL: https://{accountId}.r2.cloudflarestorage.com/...
      const endpointMatch = process.env.S3_ENDPOINT.match(/https?:\/\/([a-f0-9]+)\.r2\.cloudflarestorage\.com/);
      if (endpointMatch && endpointMatch[1]) {
        accountId = endpointMatch[1];
      }
    }
    
    const accessKeyId = settings.r2AccessKeyId || process.env.S3_ACCESS_KEY_ID || '';
    const secretAccessKey = settings.r2SecretAccessKey || process.env.S3_SECRET_ACCESS_KEY || '';

    const hasR2 = Boolean(bucket && publicUrlBase && accountId && accessKeyId && secretAccessKey);

    const s3Client = hasR2
      ? new S3Client({
          region: 'auto',
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId, secretAccessKey },
        })
      : null;

    const outputUrls: string[] = [];
    for (const item of generated) {
      if (item.kind === 'url') {
        if (typeof item.url === 'string' && (item.url.startsWith('https://') || item.url.startsWith('http://'))) {
          outputUrls.push(item.url);
        }
        continue;
      }

      // base64 → R2
      if (!hasR2 || !s3Client) {
        // If we can't upload, we skip base64 outputs (otherwise we'd leak huge blobs to the client).
        continue;
      }

      const url = await uploadBase64ToR2({
        userId: user.id,
        bucket,
        publicUrlBase,
        s3Client,
        mimeType: item.mimeType,
        dataBase64: item.dataBase64,
      });
      outputUrls.push(url);
    }

    const now = new Date().toISOString();
    const inputs = parsed.inputImages.map((x) => x.url);

    // Build response generations list.
    const generations = outputUrls.map((outputImageUrl, idx) => ({
      id: crypto.randomUUID(),
      inputImageUrl: inputs[idx % inputs.length] || inputs[0] || '',
      promptText,
      outputImageUrl,
      createdAt: now,
    }));

    // Patch product.data blob.
    const existingData = isRecord(productRow?.data) ? (productRow!.data as JsonRecord) : {};
    const existingImagesRaw = (existingData as any).images;
    const existingImages = Array.isArray(existingImagesRaw) ? existingImagesRaw.filter((x: unknown) => typeof x === 'string') : [];

    const nextImages = [...existingImages];
    for (const u of outputUrls) {
      if (!nextImages.includes(u)) nextImages.push(u);
    }

    const existingAiStudio = isRecord((existingData as any).aiStudio) ? ((existingData as any).aiStudio as JsonRecord) : {};
    const existingGenerationsRaw = (existingAiStudio as any).generations;
    const existingGenerations = Array.isArray(existingGenerationsRaw) ? existingGenerationsRaw : [];

    const persistedGenerations = generations.map((g) => ({
      ...g,
      productId: parsed.productId,
      jewelryType: parsed.jewelryType,
      setupId: parsed.setupId,
      modelId: parsed.modelId,
      provider,
      providerModel: providerModel || null,
      options: parsed.options,
    }));

    const nextData: JsonRecord = {
      ...existingData,
      images: nextImages,
      // If thumbnail is missing, set it to the first image (keeps UI consistent elsewhere).
      thumbnail:
        typeof (existingData as any).thumbnail === 'string' && (existingData as any).thumbnail.length > 0
          ? (existingData as any).thumbnail
          : (nextImages[0] || ''),
      aiStudio: {
        ...existingAiStudio,
        generations: [...existingGenerations, ...persistedGenerations],
      },
    };

    const { error: writeErr } = await supabase
      .from('products')
      .update({ data: nextData })
      .eq('id', parsed.productId)
      .eq('organization_id', orgId);

    if (writeErr) {
      return NextResponse.json({ error: writeErr.message }, { status: 500 });
    }

    if (sessionId) {
      await logPipelineEvent(
        sessionId,
        'STUDIO_PROVIDER_RESPONSE',
        JSON.stringify({ outputCount: outputUrls.length })
      );
      await logCallPreview({
        sessionId,
        step: 'STUDIO_OUTPUTS',
        model: `${provider}${providerModel ? `:${providerModel}` : ''}`,
        promptText,
        responseText: JSON.stringify({ outputUrls }),
        tokensPrompt: 0,
        tokensCompletion: 0,
      });
      await updateSessionStatus({
        sessionId,
        status: 'success',
        blueprintSummary: JSON.stringify({
          productId: parsed.productId,
          provider,
          providerModel: providerModel || null,
          inputs: parsed.inputImages.length,
          outputs: outputUrls.length,
        }),
      });
    }

    return NextResponse.json({ generations });
  } catch (error: unknown) {
    if (sessionId) {
      const msg = error instanceof Error ? error.message : 'Failed to generate studio images';
      await updateSessionError(sessionId, msg);
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Failed to generate studio images';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


