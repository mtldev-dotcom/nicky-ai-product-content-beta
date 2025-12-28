/**
 * Product blueprint generator.
 * 
 * Converts Evidence + org settings into a canonical ProductBlueprint.
 * Handles multi-language logic (original/mixed/translated).
 * Applies brand voice and generates missing fields.
 */

import OpenAI from 'openai';
import { Evidence, ProductBlueprint, AIMeta } from '@/lib/ingest-types';
import { callLLMWithLogging } from '@/lib/llm/logger';
import { logPipelineEvent } from '@/lib/llm/session-manager';

export interface OrgSettings {
  brandName: string;
  brandVoice: string;
  customInstructions?: string;
  activeLanguages: string[];
}

/**
 * Determines language source for each target language.
 */
export function determineLanguageSource(
  evidence: Evidence,
  targetLanguages: string[]
): Record<string, 'original' | 'mixed' | 'translated'> {
  const result: Record<string, 'original' | 'mixed' | 'translated'> = {};
  
  for (const lang of targetLanguages) {
    // Check if we have complete content in this language
    const hasTitle = evidence.titles.some(t => t.lang === lang);
    const hasDescription = evidence.descriptions.some(t => t.lang === lang && t.text.length > 100);
    const hasShort = evidence.descriptions.some(t => t.lang === lang && t.text.length <= 100);
    
    if (hasTitle && hasDescription && hasShort) {
      result[lang] = 'original';
    } else if (hasTitle || hasDescription || hasShort) {
      result[lang] = 'mixed';
    } else {
      result[lang] = 'translated';
    }
  }
  
  return result;
}

/**
 * Generates product blueprint from evidence.
 */
export async function generateFromEvidence(
  evidence: Evidence,
  settings: OrgSettings,
  sessionId: string,
  openai: OpenAI
): Promise<ProductBlueprint> {
  await logPipelineEvent(sessionId, 'BLUEPRINT_GENERATION_STARTED');
  
  const languageSource = determineLanguageSource(evidence, settings.activeLanguages);
  
  // Build comprehensive prompt
  const evidenceSummary = JSON.stringify({
    titles: evidence.titles.slice(0, 5),
    descriptions: evidence.descriptions.slice(0, 3),
    features: evidence.features.slice(0, 10),
    specs: evidence.specs,
    logistics: evidence.logistics,
    variants: evidence.variants,
    languagesDetected: evidence.languagesDetected,
  }, null, 2).substring(0, 3000);
  
  const prompt = `You are the lead Product Architect for ${settings.brandName}.
Brand Voice: ${settings.brandVoice}
${settings.customInstructions ? `Additional Guidelines: ${settings.customInstructions}` : ''}

Generate a complete product blueprint from the following evidence.

EVIDENCE:
${evidenceSummary}

TARGET LANGUAGES: ${settings.activeLanguages.join(', ')}

LANGUAGE HANDLING RULES:
- For each target language, check if content exists in evidence
- If complete content exists (title + short + long description) → preserve original, only light cleanup
- If partial content exists → preserve existing pieces, expand/complement with AI
- If missing → translate from primary language (usually EN) using brand voice

Return a JSON object matching this structure:
{
  "product": {
    "identity": {
      "title": "string",
      "subtitle": "string",
      "handle": "string (URL-friendly)",
      "brand": "${settings.brandName}",
      "source": "JUST_DROP_IT"
    },
    "descriptions": {
      "[lang]": {
        "title": "string (localized title)",
        "short": "string (1-2 sentences)",
        "long": "string (full description)",
        "features": ["string"],
        "benefits": ["string"],
        "seo": {
          "title": "string (max 60 chars)",
          "description": "string (max 160 chars)",
          "keywords": ["string"]
        }
      }
    },
    "taxonomy": {
      "collectionId": null,
      "typeId": null,
      "categoryIds": [],
      "tags": ["string"]
    },
    "logistics": {
      "weight": number or null,
      "dimensions": { "length": number or null, "width": number or null, "height": number or null },
      "hsCode": null,
      "originCountry": "string or null"
    },
    "variants": [
      {
        "title": "string",
        "options": { "Size": "20 cm" },
        "sku": "string (optional)",
        "prices": { "usd": number },
        "inventory": { "quantity": number }
      }
    ],
    "media": {
      "images": [
        {
          "sourceUrl": "string",
          "alt": "string"
        }
      ]
    }
  },
  "aiMeta": {
    "fieldsFilledByAI": ["descriptions.fr.long", "seo.en.title"],
    "fieldsFromSource": ["logistics.weight"],
    "languageSource": {
      "en": "original",
      "fr": "translated"
    }
  }
}

IMPORTANT:
- Generate ALL required fields
- For languages marked as "original" in evidence, preserve the original text
- For "mixed", combine original with AI expansion
- For "translated", generate full translation
- Mark all AI-generated fields in aiMeta.fieldsFilledByAI
- Mark all source fields in aiMeta.fieldsFromSource
- Generate variants from evidence.variants if present. If evidence.variants.parsed exists, use those options/values to create combinations.
- Include all images from evidence.media.images`;

  try {
    const result = await callLLMWithLogging({
      sessionId,
      step: 'blueprint_generation',
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a product blueprint generator. Return only valid JSON matching the exact structure specified.' },
        { role: 'user', content: prompt },
      ],
      openai,
      responseFormat: 'json_object',
      temperature: 0.7,
      maxTokens: 4000,
    });
    
    let parsed;
    try {
      parsed = JSON.parse(result.content);
    } catch (e) {
      console.error('Failed to parse blueprint JSON. Content length:', result.content.length);
      console.error('Content preview:', result.content.substring(0, 500) + '...');
      throw new Error(`AI returned malformed data. This usually happens when the product has too many variants or languages for a single pass. Try reducing the number of input files.`);
    }
    
    // Validate and normalize the blueprint
    const blueprint = normalizeBlueprint(parsed, evidence, settings, languageSource);
    
    await logPipelineEvent(sessionId, 'BLUEPRINT_COMPLETE');
    
    return blueprint;
  } catch (error) {
    console.error('Blueprint generation failed:', error);
    await logPipelineEvent(sessionId, 'BLUEPRINT_ERROR');
    throw error;
  }
}

/**
 * Normalizes and validates the generated blueprint.
 */
function normalizeBlueprint(
  parsed: any,
  evidence: Evidence,
  settings: OrgSettings,
  languageSource: Record<string, 'original' | 'mixed' | 'translated'>
): ProductBlueprint {
  // Ensure all required fields exist
  const blueprint: ProductBlueprint = {
    product: {
      identity: {
        title: parsed.product?.identity?.title || evidence.titles[0]?.text || 'Untitled Product',
        subtitle: parsed.product?.identity?.subtitle || '',
        handle: parsed.product?.identity?.handle || generateHandle(parsed.product?.identity?.title || evidence.titles[0]?.text || 'product'),
        brand: settings.brandName,
        source: 'JUST_DROP_IT',
      },
      descriptions: {},
      taxonomy: {
        collectionId: null,
        typeId: null,
        categoryIds: parsed.product?.taxonomy?.categoryIds || [],
        tags: parsed.product?.taxonomy?.tags || evidence.seoKeywords.slice(0, 10),
      },
      logistics: {
        weight: evidence.logistics.weight?.value || parsed.product?.logistics?.weight || null,
        dimensions: evidence.logistics.dimensions ? {
          length: evidence.logistics.dimensions.length || null,
          width: evidence.logistics.dimensions.width || null,
          height: evidence.logistics.dimensions.height || null,
        } : parsed.product?.logistics?.dimensions || null,
        hsCode: null,
        originCountry: evidence.logistics.originCountry?.value || null,
      },
      variants: parsed.product?.variants || [],
      media: {
        images: evidence.media.images.map(img => ({
          sourceUrl: img.url,
          alt: `Product image from ${img.source}`,
        })),
      },
    },
    aiMeta: {
      fieldsFilledByAI: parsed.aiMeta?.fieldsFilledByAI || [],
      fieldsFromSource: parsed.aiMeta?.fieldsFromSource || [],
      languageSource: parsed.aiMeta?.languageSource || languageSource,
    },
  };
  
  // Post-process aiMeta to ensure fields present in evidence but handled by AI are tracked
  if (evidence.logistics.weight) blueprint.aiMeta.fieldsFromSource.push('logistics.weight');
  if (evidence.logistics.dimensions) blueprint.aiMeta.fieldsFromSource.push('logistics.dimensions');
  if (evidence.logistics.originCountry) blueprint.aiMeta.fieldsFromSource.push('logistics.originCountry');
  
  // Populate descriptions for each target language
  for (const lang of settings.activeLanguages) {
    const source = languageSource[lang];
    
    if (source === 'original') {
      blueprint.aiMeta.fieldsFromSource.push(`descriptions.${lang}`);
      // Preserve original content
      const origTitle = evidence.titles.find(t => t.lang === lang);
      const origDesc = evidence.descriptions.find(t => t.lang === lang && t.text.length > 100);
      const origShort = evidence.descriptions.find(t => t.lang === lang && t.text.length <= 100);
      
      blueprint.product.descriptions[lang] = {
        title: origTitle?.text || parsed.product?.descriptions?.[lang]?.title || blueprint.product.identity.title,
        short: origShort?.text || origDesc?.text.substring(0, 200) || '',
        long: origDesc?.text || '',
        features: evidence.features.filter(f => f.lang === lang).map(f => f.text),
        benefits: evidence.benefits.filter(b => b.lang === lang).map(b => b.text),
        seo: parsed.product?.descriptions?.[lang]?.seo || {
          title: origTitle?.text || '',
          description: origShort?.text || '',
          keywords: evidence.seoKeywords,
        },
      };
    } else {
      blueprint.aiMeta.fieldsFilledByAI.push(`descriptions.${lang}`);
      // Use generated content from LLM
      blueprint.product.descriptions[lang] = {
        title: parsed.product?.descriptions?.[lang]?.title || blueprint.product.identity.title,
        short: parsed.product?.descriptions?.[lang]?.short || '',
        long: parsed.product?.descriptions?.[lang]?.long || '',
        features: parsed.product?.descriptions?.[lang]?.features || [],
        benefits: parsed.product?.descriptions?.[lang]?.benefits || [],
        seo: parsed.product?.descriptions?.[lang]?.seo || {
          title: '',
          description: '',
          keywords: [],
        },
      };
    }
  }
  
  // Ensure lists are deduplicated
  blueprint.aiMeta.fieldsFilledByAI = [...new Set(blueprint.aiMeta.fieldsFilledByAI)];
  blueprint.aiMeta.fieldsFromSource = [...new Set(blueprint.aiMeta.fieldsFromSource)];
  
  return blueprint;
}

/**
 * Generates a URL-friendly handle from a title.
 */
function generateHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

