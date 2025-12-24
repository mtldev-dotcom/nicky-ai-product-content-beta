import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/crypto';

export async function POST(req: Request) {
  try {
    const { field, currentValue, fieldType, language } = await req.json();

    if (!field || !fieldType) {
      return NextResponse.json({ error: 'Missing field or fieldType' }, { status: 400 });
    }

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
      try {
        apiKey = decrypt(apiKey);
      } catch (e) {
        console.error('Decryption failed for OpenAI API key:', e);
      }
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

    // Get language name for prompt
    const langNames: Record<string, string> = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'ja': 'Japanese'
    };
    const langName = langNames[language] || 'English';

    // Field-specific instructions
    const fieldInstructions: Record<string, string> = {
      'title': 'Create a catchy, clear, and brand-aligned product title. Keep it concise and impactful.',
      'subtitle': 'Create a punchy one-liner subtitle (max 60 characters). Make it memorable and brand-aligned.',
      'description': 'Enhance this description to be more professional, persuasive, and human-centric while maintaining brand voice.',
      'feature': 'Enhance this feature to be more compelling and brand-aligned. Keep it concise.',
      'metadata_title': 'Optimize this SEO title for search engines (max 60 characters). Make it keyword-rich and compelling.',
      'metadata_description': 'Optimize this SEO description for search engines (max 160 characters). Make it keyword-rich and compelling.',
      'keywords': 'Generate relevant SEO keywords based on the product content. Return as a comma-separated list.'
    };

    const systemPrompt = `You are the lead Product Architect and Head of Copy for ${brandName}.
Your brand voice is ${brandVoice}.
${customInstructions ? `Additional Brand Guidelines: ${customInstructions}` : ''}

Task: Enhance and optimize the following ${fieldType} field for a product.

${fieldInstructions[fieldType] || 'Enhance this content to align with the brand voice and make it more compelling.'}

CRITICAL REQUIREMENTS:
- The output MUST be in ${langName} (the same language as the input)
- Do NOT translate the content - enhance it in the same language
- Maintain the brand voice: ${brandVoice}
- Make it more compelling, professional, and aligned with ${brandName}'s identity
${fieldType === 'subtitle' ? '- Maximum 60 characters' : ''}
${fieldType === 'metadata_title' ? '- Maximum 60 characters, SEO optimized' : ''}
${fieldType === 'metadata_description' ? '- Maximum 160 characters, SEO optimized' : ''}
${fieldType === 'keywords' ? '- Return as a comma-separated list of keywords' : ''}

Return ONLY the enhanced text, nothing else. No explanations, no JSON, just the enhanced content.`;

    const userPrompt = currentValue 
      ? `Current ${fieldType}:\n${currentValue}\n\nEnhance this ${fieldType} according to the brand guidelines.`
      : `Generate a ${fieldType} for a product following the brand guidelines.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: fieldType === 'description' ? 500 : fieldType === 'keywords' ? 100 : 150
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error('No content returned from AI');

    // For keywords, parse comma-separated list into array
    if (fieldType === 'keywords') {
      const keywords = content.split(',').map(k => k.trim()).filter(Boolean);
      return NextResponse.json({ enhanced: keywords });
    }

    return NextResponse.json({ enhanced: content.trim() });
  } catch (error: any) {
    console.error('Enhancement Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to enhance content' }, { status: 500 });
  }
}

