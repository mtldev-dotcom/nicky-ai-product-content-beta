import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/crypto';
import { z } from 'zod';
import { TranslateRequestSchema } from '@/lib/api-schemas';

export async function POST(req: Request) {
  try {
    const parsed = TranslateRequestSchema.parse(await req.json());
    const { source, targetLang, options, selectedLang } = parsed;

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

    const systemPrompt = `You are a professional multi-lingual translator for ${brandName}.
    Translate the following product data into ${targetLang} while maintaining the brand's ${brandVoice} voice.
    ${customInstructions ? `Special Instructions: ${customInstructions}` : ''}
    
    CRITICAL: You must return the EXACT same JSON structure as provided.
    For options, ensure each option has a "translations" object containing the key "${selectedLang}".
    For values, ensure each value has a "translations" object containing the key "${selectedLang}".

    Example structure for options:
    "options": [
      {
        "name": "Size",
        "translations": { "${selectedLang}": "Taille" },
        "values": [
          { "value": "S", "translations": { "${selectedLang}": "P" } }
        ]
      }
    ]`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { 
          role: 'user', 
          content: JSON.stringify({
            localization: source,
            options: options
          })
        }
      ],
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error('No content returned from AI');

    return NextResponse.json(JSON.parse(content));
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request' }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Failed to translate';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
