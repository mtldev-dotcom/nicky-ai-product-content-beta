/**
 * JUST DROP IT ingest endpoint — SSE streaming.
 *
 * Streams pipeline events to the client as they happen, then emits a final
 * `complete` event with the full blueprint + evidence payload.
 * Auth errors before the stream starts return plain JSON (not SSE).
 */

import OpenAI from 'openai';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/crypto';
import { IngestRequestSchema } from '@/lib/api-schemas';
import { createSession, updateSessionStatus, updateSessionError, logPipelineEvent } from '@/lib/llm/session-manager';
import { classifyInputs } from '@/lib/ingest/classifier';
import { extractEvidence } from '@/lib/ingest/extractor';
import { generateFromEvidence } from '@/lib/ingest/blueprint-generator';
import { minimizeContent } from '@/lib/llm/redaction';
import { assertPdfNotSupported } from '@/lib/ingest/pdf-policy';
import type { StreamEmit, IngestStreamEvent } from '@/lib/ingest/stream-types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // ── Auth & setup (before stream starts) ──────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let parsed: ReturnType<typeof IngestRequestSchema.parse>;
  try {
    parsed = IngestRequestSchema.parse(body);
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();
  if (!membership) return Response.json({ error: 'No organization found' }, { status: 403 });

  const orgId = membership.organization_id;

  const { data: settings } = await supabase
    .from('organization_settings')
    .select('*')
    .eq('organization_id', orgId)
    .single();

  let apiKey = settings?.openai_api_key;
  if (apiKey) apiKey = decrypt(apiKey, { allowPlaintext: true });
  else apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: 'OpenAI API key not configured' }, { status: 500 });

  const openai = new OpenAI({ apiKey });
  const activeLanguages = settings?.active_languages || parsed.targetLanguages;
  const orgSettings = {
    brandName: settings?.brand_name || 'a professional brand',
    brandVoice: settings?.brand_voice || 'professional, clear, and engaging',
    customInstructions: settings?.custom_instructions || '',
    activeLanguages,
  };

  // ── SSE stream ────────────────────────────────────────────────────────────
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit: StreamEmit = (event: IngestStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client may have disconnected — ignore
        }
      };

      const pipelineEvent = async (eventType: string, detail?: string) => {
        await logPipelineEvent(sessionId, eventType, detail);
        emit({ type: 'pipeline_event', event: eventType, detail, ts: Date.now() });
      };

      let sessionId = '';
      try {
        // Phase 0: PDF check
        assertPdfNotSupported(parsed.files);

        // Create session
        const inputSummary = [
          `${parsed.textBlocks.length} text block(s)`,
          `${parsed.urls.length} URL(s)`,
          `${parsed.files.length} file(s)`,
        ].join(', ');

        sessionId = await createSession({
          orgId,
          userId: user.id,
          module: 'JUST_DROP_IT',
          inputSummary,
        });

        emit({ type: 'session_created', sessionId, ts: Date.now() });
        await logPipelineEvent(sessionId, 'INGEST_RECEIVED', inputSummary);

        // Phase 1: Classification
        await pipelineEvent('CLASSIFICATION_STARTED');
        const classification = await classifyInputs(
          parsed.textBlocks,
          parsed.urls,
          parsed.files,
          sessionId,
          openai,
          emit
        );
        await pipelineEvent('CLASSIFICATION_COMPLETE');
        void classification; // used for side effects only

        // Phase 2: Extraction
        await pipelineEvent('EXTRACTION_STARTED');
        const allowedHosts = (process.env.INGEST_ALLOWED_HOSTS || '')
          .split(',').map(s => s.trim()).filter(Boolean);
        const evidence = await extractEvidence(
          parsed.textBlocks,
          parsed.urls,
          parsed.files,
          sessionId,
          openai,
          allowedHosts,
          emit
        );
        const evidenceSummary = JSON.stringify({
          titlesCount: evidence.titles.length,
          descriptionsCount: evidence.descriptions.length,
          featuresCount: evidence.features.length,
          languages: evidence.languagesDetected,
          imagesCount: evidence.media.images.length,
        });
        await pipelineEvent('EXTRACTION_COMPLETE', evidenceSummary);

        // Phase 3: Blueprint generation
        await pipelineEvent('BLUEPRINT_STARTED');
        const blueprint = await generateFromEvidence(
          evidence,
          orgSettings,
          sessionId,
          openai,
          emit
        );
        const blueprintSummary = JSON.stringify({
          title: blueprint.product.identity.title,
          languages: Object.keys(blueprint.product.descriptions),
          variantsCount: blueprint.product.variants.length,
          imagesCount: blueprint.product.media.images.length,
        });
        await pipelineEvent('BLUEPRINT_COMPLETE', blueprintSummary);

        // Finalise session
        await updateSessionStatus({
          sessionId,
          status: 'success',
          evidenceSummary: minimizeContent(evidenceSummary, 1024),
          blueprintSummary: minimizeContent(blueprintSummary, 1024),
        });

        emit({ type: 'complete', sessionId, blueprint, evidence, ts: Date.now() });

      } catch (error) {
        console.error('Ingest pipeline error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        emit({ type: 'error', message, ts: Date.now() });
        if (sessionId) await updateSessionError(sessionId, message).catch(() => null);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    },
  });
}
