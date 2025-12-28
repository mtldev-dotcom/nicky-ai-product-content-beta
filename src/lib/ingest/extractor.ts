/**
 * Evidence extraction service.
 * 
 * Transforms raw inputs (text, URLs, files) into structured Evidence.
 * Handles CSV, JSON, images (Vision API), HTML scraping, and text analysis.
 */

import OpenAI from 'openai';
import { Evidence } from '@/lib/ingest-types';
import { callLLMWithLogging } from '@/lib/llm/logger';
import { logPipelineEvent } from '@/lib/llm/session-manager';
import { assertSafeExternalUrl, fetchExternalWithLimits, readResponseAsBufferWithLimit } from '@/lib/ssrf';
import { processCSV, processJSON, processText, detectFileType } from './file-processors';

/**
 * Extracts evidence from text blocks.
 */
export async function extractFromText(
  textBlocks: string[],
  sessionId: string,
  openai: OpenAI
): Promise<Partial<Evidence>> {
  await logPipelineEvent(sessionId, 'EXTRACTION_TEXT_STARTED');
  
  const combinedText = textBlocks.join('\n\n');
  if (!combinedText.trim()) {
    return {};
  }
  
  const prompt = `Extract product information from the following text. Return JSON with:
- titles: array of {text, lang, source: "text"}
- descriptions: array of {text, lang, source: "text"}
- features: array of {text, lang, source: "text"}
- benefits: array of {text, lang, source: "text"} (if present)
- specs: object with keys like "weight", "dimensions", "material", etc. Each value: {value: string, unit?: string, source: "text"}
- logistics: {weight?: {value, unit, source}, dimensions?: {length?, width?, height?, unit, source}, originCountry?: {value, source}}
- variants: {raw: array of variant strings found, parsed?: array of {name, values}}
- seoKeywords: array of relevant keywords
- languagesDetected: array of language codes

IMPORTANT FOR VARIANTS:
If you see strings like "Colors: A/B | Sizes: 1/2", parse them into separate options:
{ "name": "Colors", "values": ["A", "B"] }, { "name": "Sizes", "values": ["1", "2"] }

Text:
${combinedText.substring(0, 4000)}`;

  try {
    const result = await callLLMWithLogging({
      sessionId,
      step: 'extraction_text',
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a product information extraction assistant. Return only valid JSON matching the specified structure.' },
        { role: 'user', content: prompt },
      ],
      openai,
      responseFormat: 'json_object',
      temperature: 0.3,
      maxTokens: 2000,
    });
    
    const parsed = JSON.parse(result.content);
    await logPipelineEvent(sessionId, 'EXTRACTION_TEXT_COMPLETE');
    
    return {
      titles: parsed.titles || [],
      descriptions: parsed.descriptions || [],
      features: parsed.features || [],
      benefits: parsed.benefits || [],
      specs: parsed.specs || {},
      logistics: parsed.logistics || {},
      variants: parsed.variants || { raw: [] },
      seoKeywords: parsed.seoKeywords || [],
      languagesDetected: parsed.languagesDetected || [],
      media: { images: [] },
    };
  } catch (error) {
    console.error('Text extraction failed:', error);
    await logPipelineEvent(sessionId, 'EXTRACTION_TEXT_ERROR');
    return {};
  }
}

/**
 * Extracts evidence from images using Vision API.
 */
export async function extractFromImage(
  imageUrl: string,
  sessionId: string,
  openai: OpenAI
): Promise<Partial<Evidence>> {
  await logPipelineEvent(sessionId, 'EXTRACTION_VISION_STARTED');
  
  const prompt = `Analyze this product image and extract:
- Product title (if visible)
- Product description
- Features visible in the image
- Specifications (dimensions, materials, colors visible)
- Any text visible (OCR)

Return JSON with the same structure as text extraction.`;

  try {
    const result = await callLLMWithLogging({
      sessionId,
      step: 'extraction_vision',
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
          ],
        },
      ],
      openai,
      responseFormat: 'json_object',
      temperature: 0.3,
      maxTokens: 2000,
    });
    
    const parsed = JSON.parse(result.content);
    await logPipelineEvent(sessionId, 'EXTRACTION_VISION_COMPLETE');
    
    return {
      titles: parsed.titles || [],
      descriptions: parsed.descriptions || [],
      features: parsed.features || [],
      benefits: parsed.benefits || [],
      specs: parsed.specs || {},
      logistics: parsed.logistics || {},
      variants: { raw: [] },
      seoKeywords: parsed.seoKeywords || [],
      languagesDetected: parsed.languagesDetected || ['en'],
      media: {
        images: [{ url: imageUrl, source: 'upload' }],
      },
    };
  } catch (error) {
    console.error('Vision extraction failed:', error);
    await logPipelineEvent(sessionId, 'EXTRACTION_VISION_ERROR');
    return {};
  }
}

/**
 * Extracts evidence from a URL (HTML scraping).
 * Uses SSRF protection.
 */
export async function extractFromUrl(
  url: string,
  sessionId: string,
  openai: OpenAI,
  allowedHosts?: string[]
): Promise<Partial<Evidence>> {
  await logPipelineEvent(sessionId, 'EXTRACTION_URL_STARTED', `URL: ${url.substring(0, 100)}`);
  
  try {
    // SSRF protection
    const safeUrl = await assertSafeExternalUrl(url, { allowedHosts });
    
    // Fetch with limits
    const response = await fetchExternalWithLimits(safeUrl, {
      timeoutMs: 10_000,
      maxBytes: 2 * 1024 * 1024, // 2MB max
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }
    
    const html = await response.text();
    
    // 1. Extract Meta Tags
    const metaData: Record<string, string> = {};
    const metaRegex = /<meta\s+property=["']([^"]+)["']\s+content=["']([^"]+)["']/gi;
    let match;
    while ((match = metaRegex.exec(html)) !== null) {
      metaData[match[1]] = match[2];
    }
    
    // 2. Extract JSON-LD (Product Structured Data)
    const jsonLdData: any[] = [];
    const jsonLdRegex = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed) jsonLdData.push(parsed);
      } catch (e) {
        // Skip invalid JSON
      }
    }
    
    // 3. Clean Text Content (excluding scripts and styles)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 15000); // Increased limit to 15KB
    
    // Combine for LLM analysis
    const combinedInput = [
      `URL: ${url}`,
      `META: ${JSON.stringify(metaData)}`,
      `JSON-LD: ${JSON.stringify(jsonLdData)}`,
      `TEXT: ${textContent}`
    ].join('\n\n');
    
    // Use text extraction on the enriched content
    const evidence = await extractFromText([combinedInput], sessionId, openai);
    
    // Add supplier metadata
    const platform = (url || '').toLowerCase().includes('aliexpress') ? 'aliexpress' :
                     (url || '').toLowerCase().includes('amazon') ? 'amazon' : 'other';
    
    await logPipelineEvent(sessionId, 'EXTRACTION_URL_COMPLETE');
    
    return {
      ...evidence,
      supplierMeta: {
        url,
        platform,
      },
    };
  } catch (error) {
    console.error('URL extraction failed:', error);
    await logPipelineEvent(sessionId, 'EXTRACTION_URL_ERROR');
    return {};
  }
}

/**
 * Extracts evidence from a file based on its type.
 */
export async function extractFromFile(
  file: { type: string; mime: string; url: string },
  sessionId: string,
  openai: OpenAI
): Promise<Partial<Evidence>> {
  const fileType = detectFileType(file.mime || '', file.url);
  
  try {
    if (fileType === 'image') {
      return await extractFromImage(file.url, sessionId, openai);
    }
    
    if (fileType === 'csv') {
      // Fetch and parse CSV
      const response = await fetch(file.url);
      const text = await response.text();
      const { headers, rows } = await processCSV(text);
      
      // Convert CSV to text for extraction
      const csvText = `Headers: ${headers.join(', ')}\nRows:\n${rows.slice(0, 10).map(r => r.join(', ')).join('\n')}`;
      return await extractFromText([csvText], sessionId, openai);
    }
    
    if (fileType === 'json') {
      // Fetch and parse JSON
      const response = await fetch(file.url);
      const text = await response.text();
      const json = await processJSON(text);
      
      // Convert JSON to text for extraction
      const jsonText = JSON.stringify(json, null, 2).substring(0, 5000);
      return await extractFromText([jsonText], sessionId, openai);
    }
    
    if (fileType === 'text') {
      // Fetch and extract from text
      const response = await fetch(file.url);
      const text = await response.text();
      return await extractFromText([text], sessionId, openai);
    }
    
    // PDF and other types not yet supported
    return {};
  } catch (error) {
    console.error(`File extraction failed for ${fileType}:`, error);
    return {};
  }
}

/**
 * Main extraction function.
 * Combines evidence from all input sources.
 */
export async function extractEvidence(
  textBlocks: string[],
  urls: string[],
  files: Array<{ type: string; mime: string; url: string }>,
  sessionId: string,
  openai: OpenAI,
  allowedHosts?: string[]
): Promise<Evidence> {
  await logPipelineEvent(sessionId, 'EXTRACTION_STARTED');
  
  // Start with empty evidence
  const evidence: Evidence = {
    titles: [],
    descriptions: [],
    features: [],
    benefits: [],
    specs: {},
    logistics: {},
    variants: { raw: [] },
    seoKeywords: [],
    languagesDetected: [],
    media: { images: [] },
  };
  
  // Extract from text blocks
  if (textBlocks.length > 0) {
    const textEvidence = await extractFromText(textBlocks, sessionId, openai);
    mergeEvidence(evidence, textEvidence);
  }
  
  // Extract from URLs (process in parallel, but limit concurrency)
  const urlPromises = urls.slice(0, 5).map(url => // Limit to 5 URLs
    extractFromUrl(url, sessionId, openai, allowedHosts).catch(err => {
      console.error(`URL extraction failed for ${url}:`, err);
      return {};
    })
  );
  const urlResults = await Promise.all(urlPromises);
  urlResults.forEach(urlEvidence => mergeEvidence(evidence, urlEvidence));
  
  // Extract from files (process in parallel, limit concurrency)
  const filePromises = files.slice(0, 10).map(file => // Limit to 10 files
    extractFromFile(file, sessionId, openai).catch(err => {
      console.error(`File extraction failed:`, err);
      return {};
    })
  );
  const fileResults = await Promise.all(filePromises);
  fileResults.forEach(fileEvidence => mergeEvidence(evidence, fileEvidence));
  
  // Deduplicate and clean
  evidence.titles = deduplicateByText(evidence.titles);
  evidence.descriptions = deduplicateByText(evidence.descriptions);
  evidence.features = deduplicateByText(evidence.features);
  evidence.benefits = deduplicateByText(evidence.benefits);
  evidence.seoKeywords = [...new Set(evidence.seoKeywords)];
  evidence.languagesDetected = [...new Set(evidence.languagesDetected)];
  
  await logPipelineEvent(sessionId, 'EXTRACTION_COMPLETE');
  
  return evidence;
}

/**
 * Merges partial evidence into main evidence object.
 */
function mergeEvidence(main: Evidence, partial: Partial<Evidence>): void {
  if (partial.titles) main.titles.push(...partial.titles);
  if (partial.descriptions) main.descriptions.push(...partial.descriptions);
  if (partial.features) main.features.push(...partial.features);
  if (partial.benefits) main.benefits.push(...partial.benefits);
  if (partial.specs) Object.assign(main.specs, partial.specs);
  if (partial.logistics) {
    if (partial.logistics.weight) main.logistics.weight = partial.logistics.weight;
    if (partial.logistics.dimensions) main.logistics.dimensions = partial.logistics.dimensions;
    if (partial.logistics.originCountry) main.logistics.originCountry = partial.logistics.originCountry;
  }
  if (partial.variants) {
    if (partial.variants.raw) main.variants.raw.push(...partial.variants.raw);
    if (partial.variants.parsed) {
      main.variants.parsed = main.variants.parsed || [];
      main.variants.parsed.push(...partial.variants.parsed);
    }
  }
  if (partial.seoKeywords) main.seoKeywords.push(...partial.seoKeywords);
  if (partial.languagesDetected) main.languagesDetected.push(...partial.languagesDetected);
  if (partial.media?.images) main.media.images.push(...partial.media.images);
  if (partial.supplierMeta) main.supplierMeta = partial.supplierMeta;
}

/**
 * Deduplicates array of objects by text field.
 */
function deduplicateByText<T extends { text: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (!item?.text || typeof item.text !== 'string') return false;
    const key = item.text.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

