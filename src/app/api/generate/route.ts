import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert E-commerce Product Architect. 
          Your task is to take a product concept and generate high-fidelity, production-ready product data.
          
          Guidelines:
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
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error('No content returned from AI');

    const parsedData = ProductSchema.parse(JSON.parse(content));

    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error('AI Generation Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate content' }, { status: 500 });
  }
}

