/**
 * JUST DROP IT ingest endpoint.
 * 
 * Accepts mixed inputs (text, URLs, files) and returns a ProductBlueprint.
 * Orchestrates: classification → extraction → blueprint generation.
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/crypto';
import { IngestRequestSchema } from '@/lib/api-schemas';
import { createSession, updateSessionStatus, updateSessionError, logPipelineEvent } from '@/lib/llm/session-manager';
import { classifyInputs } from '@/lib/ingest/classifier';
import { extractEvidence } from '@/lib/ingest/extractor';
import { generateFromEvidence } from '@/lib/ingest/blueprint-generator';
import { minimizeContent } from '@/lib/llm/redaction';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let sessionId: string | null = null;
  
  try {
    const body = await req.json();
    const parsed = IngestRequestSchema.parse(body);
    
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get organization for user
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    
    const orgId = membership.organization_id;
    
    // Get organization settings
    const { data: settings } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', orgId)
      .single();
    
    // Get OpenAI API key
    let apiKey = settings?.openai_api_key;
    if (apiKey) {
      apiKey = decrypt(apiKey, { allowPlaintext: true });
    } else {
      apiKey = process.env.OPENAI_API_KEY;
    }
    
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }
    
    const openai = new OpenAI({ apiKey });
    
    // Create input summary for logging
    const inputSummary = [
      `${parsed.textBlocks.length} text block(s)`,
      `${parsed.urls.length} URL(s)`,
      `${parsed.files.length} file(s)`,
    ].filter(Boolean).join(', ');
    
    // Create LLM session
    sessionId = await createSession({
      orgId,
      userId: user.id,
      module: 'JUST_DROP_IT',
      inputSummary,
    });
    
    await logPipelineEvent(sessionId, 'INGEST_RECEIVED', inputSummary);
    
    // Get active languages from settings or use targetLanguages from request
    const activeLanguages = settings?.active_languages || parsed.targetLanguages;
    
    // Step 1: Classification
    await logPipelineEvent(sessionId, 'CLASSIFICATION_STARTED');
    const classification = await classifyInputs(
      parsed.textBlocks,
      parsed.urls,
      parsed.files,
      sessionId,
      openai
    );
    await logPipelineEvent(sessionId, 'CLASSIFICATION_COMPLETE');
    
    // Step 2: Evidence Extraction
    await logPipelineEvent(sessionId, 'EXTRACTION_STARTED');
    const allowedHosts = (process.env.INGEST_ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean);
    const evidence = await extractEvidence(
      parsed.textBlocks,
      parsed.urls,
      parsed.files,
      sessionId,
      openai,
      allowedHosts
    );
    
    // Create evidence summary for logging
    const evidenceSummary = JSON.stringify({
      titlesCount: evidence.titles.length,
      descriptionsCount: evidence.descriptions.length,
      featuresCount: evidence.features.length,
      languages: evidence.languagesDetected,
      imagesCount: evidence.media.images.length,
    });
    await logPipelineEvent(sessionId, 'EXTRACTION_COMPLETE', evidenceSummary);
    
    // Step 3: Blueprint Generation
    await logPipelineEvent(sessionId, 'BLUEPRINT_STARTED');
    const orgSettings = {
      brandName: settings?.brand_name || 'a professional brand',
      brandVoice: settings?.brand_voice || 'professional, clear, and engaging',
      customInstructions: settings?.custom_instructions || '',
      activeLanguages: activeLanguages,
    };
    
    const blueprint = await generateFromEvidence(
      evidence,
      orgSettings,
      sessionId,
      openai
    );
    
    // Create blueprint summary for logging
    const blueprintSummary = JSON.stringify({
      title: blueprint.product.identity.title,
      languages: Object.keys(blueprint.product.descriptions),
      variantsCount: blueprint.product.variants.length,
      imagesCount: blueprint.product.media.images.length,
    });
    await logPipelineEvent(sessionId, 'BLUEPRINT_COMPLETE', blueprintSummary);
    
    // Update session status to success
    await updateSessionStatus({
      sessionId,
      status: 'success',
      evidenceSummary: minimizeContent(evidenceSummary, 1024),
      blueprintSummary: minimizeContent(blueprintSummary, 1024),
    });
    
    return NextResponse.json({
      sessionId,
      blueprint,
      evidence,
    });
    
  } catch (error) {
    console.error('Ingest error:', error);
    
    // Update session with error if we have one
    if (sessionId) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await updateSessionError(sessionId, errorMessage);
    }
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message.includes('validation') ? 400 : 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to process ingest request' },
      { status: 500 }
    );
  }
}

