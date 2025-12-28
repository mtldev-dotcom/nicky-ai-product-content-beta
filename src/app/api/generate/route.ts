import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/crypto';
import { GenerateRequestSchema } from '@/lib/api-schemas';
import { createSession, updateSessionError, updateSessionStatus } from '@/lib/llm/session-manager';
import { callLLMWithLogging } from '@/lib/llm/logger';

const ProductSchema = z.object({
  title: z.string(),
  description: z.string(),
  subtitle: z.string().optional(),
  features: z.array(z.string()),
  metadata_title: z.string(),
  metadata_description: z.string(),
  keywords: z.array(z.string()),
});

export async function POST(req: Request) {
  let sessionId: string | null = null;
  try {
    const parsed = GenerateRequestSchema.parse(await req.json());
    const { prompt, image } = parsed;

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

    // Get organization settings
    const { data: settings } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .single();

    let apiKey = settings?.openai_api_key;
    if (apiKey) {
      // allowPlaintext supports legacy rows that stored plaintext before encryption was introduced
      apiKey = decrypt(apiKey, { allowPlaintext: true });
    } else {
      apiKey = process.env.OPENAI_API_KEY;
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const brandName = settings?.brand_name || 'a professional brand';
    const brandVoice = settings?.brand_voice || 'professional, clear, and engaging';
    const customInstructions = settings?.custom_instructions || '';

    const openai = new OpenAI({ apiKey });

    // Best-effort session creation (must never break the endpoint).
    try {
      sessionId = await createSession({
        orgId: membership.organization_id,
        userId: user.id,
        module: 'GENERATE',
        inputSummary: `prompt=${prompt ? `${prompt.length} chars` : 'none'}, image=${image ? 'yes' : 'no'}`,
      });
    } catch (e) {
      console.error('LLM logging disabled for this request (session create failed):', e);
      sessionId = null;
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are the lead Product Architect and Head of Copy for ${brandName}. 
        Your brand voice is ${brandVoice}.
        
        Core Directives:
        - Take a product concept (text and/or image) and generate high-fidelity, production-ready product data.
        - Style & Tone: Always adhere to the brand voice specified above.
        ${customInstructions ? `- Additional Brand Guidelines: ${customInstructions}` : ''}
        
        Visual Analysis (if image provided):
        - Identify materials, textures, colors, and unique design elements.
        - Infer quality markers and artisanal details.
        
        Response Requirements:
        - Title: Catchy, clear, and brand-aligned.
        - Subtitle: A punchy one-liner (max 60 chars).
        - Description: Professional, persuasive, and human-centric.
        - Features: A list of 4-6 key selling points.
        - SEO Metadata: Optimized title and description for search engines.
        - Keywords: A list of relevant search terms.
        
        Return ONLY valid JSON following this schema:
        {
          "title": "...",
          "description": "...",
          "subtitle": "...",
          "features": ["...", "..."],
          "metadata_title": "...",
          "metadata_description": "...",
          "keywords": ["...", "..."]
        }`
      }
    ];

    const userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'low' | 'high' | 'auto' } }> = [];
    if (prompt) {
      userContent.push({ type: 'text', text: prompt });
    }
    if (image) {
      userContent.push({ 
        type: 'image_url', 
        image_url: { url: image, detail: 'low' } 
      });
    }

    messages.push({ role: 'user', content: userContent });

    const content = sessionId
      ? (
          await callLLMWithLogging({
            sessionId,
            step: 'GENERATE',
            model: 'gpt-4o-mini',
            messages,
            openai,
            responseFormat: 'json_object',
          })
        ).content
      : (
          await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            response_format: { type: 'json_object' },
          })
        ).choices[0]?.message?.content;

    if (!content) throw new Error('No content returned from AI');

    const parsedData = ProductSchema.parse(JSON.parse(content));

    if (sessionId) {
      await updateSessionStatus({
        sessionId,
        status: 'success',
        blueprintSummary: JSON.stringify({
          title: parsedData.title,
          hasImage: Boolean(image),
        }),
      });
    }

    return NextResponse.json(parsedData);
  } catch (error: unknown) {
    if (sessionId) {
      const message = error instanceof Error ? error.message : 'Failed to generate content';
      await updateSessionError(sessionId, message);
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request' }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Failed to generate content';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

