/**
 * Input classification service.
 * 
 * Detects languages, file types, URL sources, and content segments.
 * Uses lightweight LLM calls for classification.
 */

import OpenAI from 'openai';
import { callLLMWithLogging } from '@/lib/llm/logger';
import { detectFileType } from './file-processors';

export interface ClassificationResult {
  languages: string[];
  fileTypes: Array<{ type: string; mime: string }>;
  urlSources: Array<{ url: string; platform: 'aliexpress' | 'amazon' | 'other' }>;
  contentSegments: {
    titles: string[];
    bullets: string[];
    specs: string[];
    descriptions: string[];
  };
}

/**
 * Classifies a URL to determine the source platform.
 */
export function classifyUrlSource(url: string): 'aliexpress' | 'amazon' | 'other' {
  if (!url || typeof url !== 'string') return 'other';
  const urlLower = url.toLowerCase();
  if (urlLower.includes('aliexpress.com') || urlLower.includes('aliexpress')) {
    return 'aliexpress';
  }
  if (urlLower.includes('amazon.com') || urlLower.includes('amazon.')) {
    return 'amazon';
  }
  return 'other';
}

/**
 * Detects languages in text using LLM.
 * Uses callLLMWithLogging for observability.
 */
export async function detectLanguages(
  text: string,
  sessionId: string,
  openai: OpenAI
): Promise<string[]> {
  if (!text || text.trim().length === 0) {
    return ['en']; // Default to English
  }
  
  const prompt = `Analyze the following text and identify all languages present. Return a JSON object with a "languages" array of language codes (e.g., {"languages": ["en", "fr"]}). Use ISO 639-1 codes. If you cannot determine, return {"languages": ["en"]}.
  
Text to analyze:
${text.substring(0, 1000)}`;

  try {
    const result = await callLLMWithLogging({
      sessionId,
      step: 'classification',
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a language detection assistant. Return only valid JSON objects with a "languages" array.' },
        { role: 'user', content: prompt },
      ],
      openai,
      responseFormat: 'json_object',
      temperature: 0.1,
      maxTokens: 50,
    });
    
    const parsed = JSON.parse(result.content);
    const languages = Array.isArray(parsed.languages) ? parsed.languages : ['en'];
    
    // Validate language codes
    const validCodes = ['en', 'es', 'fr', 'de', 'ja', 'zh', 'pt', 'it', 'ru', 'ko'];
    return languages.filter((lang: any) => 
      lang && typeof lang === 'string' && validCodes.includes(lang.toLowerCase())
    ).slice(0, 5);
  } catch (error) {
    console.error('Language detection failed:', error);
    return ['en']; // Fallback to English
  }
}

/**
 * Classifies content segments (titles, bullets, specs, descriptions).
 */
export async function classifyContentSegments(
  text: string,
  sessionId: string,
  openai: OpenAI
): Promise<ClassificationResult['contentSegments']> {
  if (!text || text.trim().length === 0) {
    return { titles: [], bullets: [], specs: [], descriptions: [] };
  }
  
  const prompt = `Analyze the following product text and extract:
1. Product titles (main title candidates)
2. Bullet points / features
3. Specifications (dimensions, weight, materials, etc.)
4. Long descriptions

Return a JSON object with arrays: { "titles": [], "bullets": [], "specs": [], "descriptions": [] }

Text:
${text.substring(0, 2000)}`;

  try {
    const result = await callLLMWithLogging({
      sessionId,
      step: 'classification',
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a product information extraction assistant. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      openai,
      responseFormat: 'json_object',
      temperature: 0.3,
      maxTokens: 500,
    });
    
    const parsed = JSON.parse(result.content);
    return {
      titles: Array.isArray(parsed.titles) ? parsed.titles : [],
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
      specs: Array.isArray(parsed.specs) ? parsed.specs : [],
      descriptions: Array.isArray(parsed.descriptions) ? parsed.descriptions : [],
    };
  } catch (error) {
    console.error('Content classification failed:', error);
    return { titles: [], bullets: [], specs: [], descriptions: [] };
  }
}

/**
 * Main classification function.
 * Processes all inputs and returns classification results.
 */
export async function classifyInputs(
  textBlocks: string[],
  urls: string[],
  files: Array<{ type: string; mime: string; url: string }>,
  sessionId: string,
  openai: OpenAI
): Promise<ClassificationResult> {
  // Combine all text for language detection
  const allText = [...textBlocks, ...urls].join(' ');
  
  // Detect languages
  const languages = await detectLanguages(allText, sessionId, openai);
  
  // Classify file types
  const fileTypes = files.map(file => ({
    type: detectFileType(file.mime || '', file.url),
    mime: file.mime || '',
  }));
  
  // Classify URL sources
  const urlSources = urls.map(url => ({
    url,
    platform: classifyUrlSource(url),
  }));
  
  // Classify content segments from text blocks
  const combinedText = textBlocks.join('\n\n');
  const contentSegments = await classifyContentSegments(combinedText, sessionId, openai);
  
  return {
    languages,
    fileTypes,
    urlSources,
    contentSegments,
  };
}

