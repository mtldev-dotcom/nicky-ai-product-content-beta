import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { source, targetLang, options, selectedLang } = await req.json();

    if (!source || !targetLang) {
      return NextResponse.json({ error: 'Missing source or target language' }, { status: 400 });
    }

    const systemPrompt = `You are a professional multi-lingual translator for "THE UNCUT BRAND".
    Translate the following product data into ${targetLang}.
    
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
  } catch (error: any) {
    console.error('Translation Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to translate' }, { status: 500 });
  }
}
