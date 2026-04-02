# JUST DROP IT — Complete Ingest Pipeline Flow

**Last updated:** 2026-04-02  
**Entry point:** `POST /api/products/ingest`  
**Main files:** `src/app/api/products/ingest/route.ts`, `src/lib/ingest/classifier.ts`

---

## Overview

This document explains **every step** of the JUST DROP IT ingest pipeline, from form submission to blueprint generation. The pipeline consists of **4 AI agents** that run sequentially, streaming events to the client via SSE (Server-Sent Events).

---

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (/create page)                    │
│  1. Upload images to R2                                     │
│  2. Build request body                                      │
│  3. POST /api/products/ingest                               │
│  4. Listen to SSE stream                                    │
│  5. On complete: loadFromBlueprint → saveToDb → redirect    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              SERVER (/api/products/ingest)                  │
│  ─────────────────────────────────────────────────────      │
│  Phase 1: Auth & Setup                                      │
│  ─────────────────────────────────────────────────────      │
│  Phase 2: SSE Stream Setup                                  │
│  ─────────────────────────────────────────────────────      │
│  Phase 3: Agent 1 - Classifier                              │
│  ─────────────────────────────────────────────────────      │
│  Phase 4: Agent 2 - Extractor                               │
│  ─────────────────────────────────────────────────────      │
│  Phase 5: Agent 3 - Blueprint Generator                     │
│  ─────────────────────────────────────────────────────      │
│  Phase 6: Finalizing                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Client Preparation (Before POST)

**File:** `src/app/create/page.tsx`

```
User clicks "Generate Product Draft"
         ↓
Client validates: at least one input exists (images, text, or URL)
         ↓
Images uploaded to R2 via:
  - File upload: POST /api/media/presigned → PUT to R2
  - URL sync: POST /api/media/sync → Server fetches + uploads
         ↓
Client builds request body:
{
  "targetLanguages": ["en", "fr"],
  "textBlocks": ["user input from textarea"],
  "urls": ["https://aliexpress.com/..."],
  "files": [
    { "id": "abc123", "type": "image", "mime": "image/jpeg", 
      "url": "https://pub-xxx.r2.dev/uploads/..." }
  ]
}
         ↓
POST /api/products/ingest with JSON body
```

---

## Phase 1: Authentication & Setup (Server)

**File:** `src/app/api/products/ingest/route.ts`

### Step 1.1: Parse and Validate Request Body

```typescript
// Parse JSON body
let body: unknown;
try {
  body = await req.json();
} catch {
  return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
}

// Validate with Zod schema
let parsed: ReturnType<typeof IngestRequestSchema.parse>;
try {
  parsed = IngestRequestSchema.parse(body);
} catch {
  return Response.json({ error: 'Invalid request body' }, { status: 400 });
}
```

**Schema validated:**
- `targetLanguages`: Array of language codes (e.g., `["en", "fr"]`)
- `textBlocks`: Array of strings (user input)
- `urls`: Array of URLs (must be valid HTTP/HTTPS)
- `files`: Array of `{ id, type, mime, url }`

---

### Step 1.2: Authenticate User

```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
```

---

### Step 1.3: Verify Organization Membership

```typescript
const { data: membership } = await supabase
  .from('organization_members')
  .select('organization_id')
  .eq('user_id', user.id)
  .single();
if (!membership) return Response.json({ error: 'No organization found' }, { status: 403 });

const orgId = membership.organization_id;
```

---

### Step 1.4: Load Organization Settings

```typescript
const { data: settings } = await supabase
  .from('organization_settings')
  .select('*')
  .eq('organization_id', orgId)
  .single();
```

---

### Step 1.5: Decrypt OpenAI API Key

```typescript
let apiKey = settings?.openai_api_key;
if (apiKey) apiKey = decrypt(apiKey, { allowPlaintext: true });
else apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) return Response.json({ error: 'OpenAI API key not configured' }, { status: 500 });

const openai = new OpenAI({ apiKey });
```

---

### Step 1.6: Build Organization Settings

```typescript
const activeLanguages = settings?.active_languages || parsed.targetLanguages;
const orgSettings = {
  brandName: settings?.brand_name || 'a professional brand',
  brandVoice: settings?.brand_voice || 'professional, clear, and engaging',
  customInstructions: settings?.custom_instructions || '',
  activeLanguages,
};
```

---

## Phase 2: SSE Stream Setup

```typescript
const encoder = new TextEncoder();

const stream = new ReadableStream({
  async start(controller) {
    // emit function sends events to client
    const emit: StreamEmit = (event: IngestStreamEvent) => {
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      } catch {
        // Client may have disconnected — ignore
      }
    };

    // pipelineEvent helper logs to DB + emits to client
    const pipelineEvent = async (eventType: string, detail?: string) => {
      await logPipelineEvent(sessionId, eventType, detail);
      emit({ type: 'pipeline_event', event: eventType, detail, ts: Date.now() });
    };

    // ... pipeline work happens here ...
  },
});

// Return SSE response
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // Disable nginx buffering
  },
});
```

---

## Phase 3: Agent 1 — Classifier

**File:** `src/lib/ingest/classifier.ts`

### Step 3.1: PDF Check

```typescript
assertPdfNotSupported(parsed.files);  // Throws if PDF detected
```

---

### Step 3.2: Create Session Record

```typescript
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
```

**Database:** Creates row in `llm_sessions` table.

---

### Step 3.3: Language Detection

**Function:** `detectLanguages()`

```typescript
// Input: Combined text from all sources
const allText = [...textBlocks, ...urls].join(' ');

if (!text || text.trim().length === 0) {
  return ['en']; // Default to English
}

// Build prompt for GPT-4o-mini
const prompt = `Analyze the following text and identify all languages present. 
Return a JSON object with a "languages" array of language codes.
Use ISO 639-1 codes. If you cannot determine, return {"languages": ["en"]}.

Text to analyze:
${text.substring(0, 1000)}`;

// Call LLM with logging
const result = await callLLMWithLogging({
  sessionId,
  step: 'classification',
  model: 'gpt-4o-mini',
  messages: [
    { 
      role: 'system', 
      content: 'You are a language detection assistant. Return only valid JSON objects with a "languages" array.' 
    },
    { role: 'user', content: prompt }
  ],
  openai,
  responseFormat: 'json_object',
  temperature: 0.1,
  maxTokens: 50,
  emit,
});

// Parse response
const parsed = JSON.parse(result.content) as { languages?: unknown };
const languagesRaw = parsed.languages;
const languages = Array.isArray(languagesRaw) ? languagesRaw : ['en'];

// Validate language codes
const validCodes = ['en', 'es', 'fr', 'de', 'ja', 'zh', 'pt', 'it', 'ru', 'ko'];
return languages
  .filter((lang: unknown): lang is string => typeof lang === 'string' && lang.length > 0)
  .map((lang) => lang.toLowerCase())
  .filter((lang) => validCodes.includes(lang))
  .slice(0, 5);
```

**Returns:** `["en", "fr"]`

**Emits:**
- `llm_call` event with token usage
- `pipeline_event: CLASSIFICATION_STARTED`
- `pipeline_event: CLASSIFICATION_COMPLETE`

---

### Step 3.4: File Type Classification

**Function:** `detectFileType()` (from `file-processors.ts`)

```typescript
const fileTypes = files.map(file => ({
  type: detectFileType(file.mime || '', file.url),
  mime: file.mime || '',
}));

// detectFileType logic:
if (mime.startsWith('image/')) return 'image';
if (mime === 'text/csv') return 'csv';
if (mime === 'application/json') return 'json';
if (mime === 'text/plain') return 'text';
if (url.endsWith('.csv')) return 'csv';
// ... etc
```

**Returns:** `[{ type: "image", mime: "image/jpeg" }]`

---

### Step 3.5: URL Source Classification

**Function:** `classifyUrlSource()`

```typescript
const urlSources = urls.map(url => ({
  url,
  platform: classifyUrlSource(url),
}));

// classifyUrlSource logic:
function classifyUrlSource(url: string): 'aliexpress' | 'amazon' | 'other' {
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
```

**Returns:** `[{ url: "...", platform: "aliexpress" }]`

---

### Step 3.6: Content Segment Classification

**Function:** `classifyContentSegments()`

```typescript
const prompt = `Analyze the following product text and extract:
1. Product titles (main title candidates)
2. Bullet points / features
3. Specifications (dimensions, weight, materials, etc.)
4. Long descriptions

Return a JSON object with arrays: { "titles": [], "bullets": [], "specs": [], "descriptions": [] }

Text:
${combinedText.substring(0, 2000)}`;

const result = await callLLMWithLogging({
  sessionId,
  step: 'classification',
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are a product information extraction assistant. Return only valid JSON.' },
    { role: 'user', content: prompt }
  ],
  openai,
  responseFormat: 'json_object',
  temperature: 0.3,
  maxTokens: 500,
  emit,
});

const parsed = JSON.parse(result.content);
return {
  titles: Array.isArray(parsed.titles) ? parsed.titles : [],
  bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
  specs: Array.isArray(parsed.specs) ? parsed.specs : [],
  descriptions: Array.isArray(parsed.descriptions) ? parsed.descriptions : [],
};
```

**Returns:**
```json
{
  "titles": ["Wireless Bluetooth Headphones"],
  "bullets": ["Noise cancelling", "40hr battery"],
  "specs": ["Weight: 250g", "Bluetooth 5.0"],
  "descriptions": ["Premium audio experience..."]
}
```

---

### ClassificationResult Output

```typescript
{
  languages: ["en", "fr"],
  fileTypes: [{ type: "image", mime: "image/jpeg" }],
  urlSources: [{ url: "...", platform: "aliexpress" }],
  contentSegments: {
    titles: ["Wireless Bluetooth Headphones"],
    bullets: ["Noise cancelling", "40hr battery"],
    specs: ["Weight: 250g", "Bluetooth 5.0"],
    descriptions: ["Premium audio experience..."]
  }
}
```

---

## Phase 4: Agent 2 — Extractor

**File:** `src/lib/ingest/extractor.ts`

### Step 4.1: Extract from Text Blocks

```typescript
const prompt = `Extract product information from the following text. Return JSON with:
- titles: array of {text, lang, source: "text"}
- descriptions: array of {text, lang, source: "text"}
- features: array of {text, lang, source: "text"}
- benefits: array of {text, lang, source: "text"}
- specs: object with keys like "weight", "dimensions", "material"
- logistics: {weight, dimensions, originCountry}
- variants: {raw: [], parsed: []}
- seoKeywords: array
- languagesDetected: array

Text:
${combinedText.substring(0, 4000)}`;

const result = await callLLMWithLogging({
  sessionId,
  step: 'extraction_text',
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are a product information extraction assistant. Return only valid JSON.' },
    { role: 'user', content: prompt }
  ],
  openai,
  responseFormat: 'json_object',
  temperature: 0.3,
  maxTokens: 2000,
  emit,
});

const parsed = JSON.parse(result.content);
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
```

---

### Step 4.2: Extract from URLs (in Parallel)

```typescript
const urlResults = await Promise.all(urls.slice(0, 5).map(async (url) => {
  try {
    // SSRF protection
    const safeUrl = await assertSafeExternalUrl(url, { allowedHosts });
    
    // Fetch with limits
    const response = await fetchExternalWithLimits(safeUrl, {
      timeoutMs: 10_000,
      maxBytes: 2 * 1024 * 1024,  // 2MB max
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }
    
    // Scrape HTML
    const html = await response.text();
    
    // Extract metadata
    const metaData: Record<string, string> = {};
    const metaRegex = /<meta\s+property=["']([^"]+)["']\s+content=["']([^"]+)["']/gi;
    let match;
    while ((match = metaRegex.exec(html)) !== null) {
      metaData[match[1]] = match[2];
    }
    
    // Extract JSON-LD (Product structured data)
    const jsonLdData: unknown[] = [];
    const jsonLdRegex = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const parsed: unknown = JSON.parse(match[1].trim());
        if (parsed) jsonLdData.push(parsed);
      } catch {
        // Skip invalid JSON
      }
    }
    
    // Clean text content
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 15000);
    
    // Combine for LLM analysis
    const combinedInput = [
      `URL: ${url}`,
      `META: ${JSON.stringify(metaData)}`,
      `JSON-LD: ${JSON.stringify(jsonLdData)}`,
      `TEXT: ${textContent}`
    ].join('\n\n');
    
    // Use text extraction on enriched content
    const evidence = await extractFromText([combinedInput], sessionId, openai, emit);
    
    // Add supplier metadata
    const platform = url.toLowerCase().includes('aliexpress') ? 'aliexpress' :
                     url.toLowerCase().includes('amazon') ? 'amazon' : 'other';
    
    return {
      ...evidence,
      supplierMeta: { url, platform }
    };
  } catch (error) {
    console.error(`URL extraction failed for ${url}:`, error);
    return {};
  }
}));
```

**Emits:**
- `url_fetch: started`
- `url_fetch: done` or `url_fetch: error`

---

### Step 4.3: Extract from Images (Vision API)

```typescript
const prompt = `Analyze this product image and extract:
- Product title (if visible)
- Product description
- Features visible in the image
- Specifications (dimensions, materials, colors visible)
- Any text visible (OCR)

Return JSON with the same structure as text extraction.`;

const result = await callLLMWithLogging({
  sessionId,
  step: 'extraction_vision',
  model: 'gpt-4o-mini',  // Multimodal model
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } }
      ]
    }
  ],
  openai,
  responseFormat: 'json_object',
  temperature: 0.3,
  maxTokens: 2000,
  emit,
});

const parsed = JSON.parse(result.content);
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
  }
};
```

---

### Step 4.4: Extract from CSV/JSON Files

```typescript
// CSV
if (fileType === 'csv') {
  const response = await fetch(file.url);
  const text = await response.text();
  const { headers, rows } = await processCSV(text);
  const csvText = `Headers: ${headers.join(', ')}\nRows:\n${rows.slice(0, 10).map(r => r.join(', ')).join('\n')}`;
  return await extractFromText([csvText], sessionId, openai, emit);
}

// JSON
if (fileType === 'json') {
  const response = await fetch(file.url);
  const text = await response.text();
  const json = await processJSON(text);
  const jsonText = JSON.stringify(json, null, 2).substring(0, 5000);
  return await extractFromText([jsonText], sessionId, openai, emit);
}

// Text
if (fileType === 'text') {
  const response = await fetch(file.url);
  const text = await response.text();
  return await extractFromText([text], sessionId, openai, emit);
}
```

---

### Step 4.5: Merge All Evidence

```typescript
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

// Deduplicate
evidence.titles = deduplicateByText(evidence.titles);
evidence.descriptions = deduplicateByText(evidence.descriptions);
evidence.features = deduplicateByText(evidence.features);
evidence.benefits = deduplicateByText(evidence.benefits);
evidence.seoKeywords = [...new Set(evidence.seoKeywords)];
evidence.languagesDetected = [...new Set(evidence.languagesDetected)];
```

**Final Evidence Object:**
```typescript
{
  titles: [{ text: "...", lang: "en", source: "text" }],
  descriptions: [{ text: "...", lang: "en", source: "url" }],
  features: [{ text: "...", lang: "en", source: "vision" }],
  benefits: [],
  specs: { weight: { value: "250", unit: "g", source: "text" } },
  logistics: {},
  variants: { raw: ["Black/White", "S/M/L"] },
  seoKeywords: ["wireless", "bluetooth", "headphones"],
  languagesDetected: ["en", "fr"],
  media: { images: [{ url: "...", source: "upload" }] },
  supplierMeta: { url: "...", platform: "aliexpress" }
}
```

**Emits:**
- `pipeline_event: EXTRACTION_STARTED`
- Multiple `llm_call` events
- `pipeline_event: EXTRACTION_COMPLETE`

---

## Phase 5: Agent 3 — Blueprint Generator

**File:** `src/lib/ingest/blueprint-generator.ts`

### Step 5.1: Build Prompt with Brand Voice

```typescript
const prompt = `You are an expert e-commerce product copywriter. Generate a complete 
product listing based on the extracted evidence.

BRAND VOICE: ${orgSettings.brandVoice}
BRAND NAME: ${orgSettings.brandName}
CUSTOM INSTRUCTIONS: ${orgSettings.customInstructions}

EVIDENCE SUMMARY:
- Titles: ${evidence.titles.map(t => t.text).join(', ')}
- Descriptions: ${evidence.descriptions.map(d => d.text).join(', ')}
- Features: ${evidence.features.map(f => f.text).join(', ')}
- Specs: ${JSON.stringify(evidence.specs)}
- Variants: ${JSON.stringify(evidence.variants)}
- Images: ${evidence.media.images.map(i => i.url).join(', ')}

TARGET LANGUAGES: ${orgSettings.activeLanguages.join(', ')}

For each language, generate:
- title, short description, long description
- features (bullet points)
- SEO: title, description, keywords

Return JSON matching ProductBlueprint schema.`;
```

---

### Step 5.2: Generate ProductBlueprint

```typescript
const result = await callLLMWithLogging({
  sessionId,
  step: 'blueprint-generation',
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are an expert e-commerce product copywriter. Return only valid JSON.' },
    { role: 'user', content: prompt }
  ],
  openai,
  responseFormat: 'json_object',
  temperature: 0.7,
  maxTokens: 4000,
  emit,
});

const blueprint = JSON.parse(result.content) as ProductBlueprint;
```

---

### Step 5.3: Normalize Blueprint

```typescript
function normalizeBlueprint(blueprint: ProductBlueprint, activeLanguages: string[]): ProductBlueprint {
  // Ensure all active languages have entries
  for (const lang of activeLanguages) {
    if (!blueprint.product.descriptions[lang]) {
      // Copy from English or first available
      const sourceLang = blueprint.product.descriptions.en || 
                        Object.values(blueprint.product.descriptions)[0];
      blueprint.product.descriptions[lang] = { ...sourceLang };
    }
  }
  
  // Deduplicate AI meta
  blueprint.aiMeta.fieldsFilledByAI = [...new Set(blueprint.aiMeta.fieldsFilledByAI)];
  
  return blueprint;
}
```

---

### ProductBlueprint Output

```typescript
{
  product: {
    identity: {
      title: "Wireless Bluetooth Headphones",
      subtitle: "Premium Audio with Active Noise Cancelling",
      handle: "wireless-bluetooth-headphones",
      sku: "WBH-001"
    },
    descriptions: {
      en: {
        short: "Experience premium sound...",
        long: "These wireless headphones...",
        features: ["Active Noise Cancelling", "40hr battery"],
        seo: { title: "...", description: "...", keywords: [...] }
      },
      fr: { ... }  // Translated version
    },
    variants: [
      {
        title: "Black / S",
        sku: "WBH-001-BLK-S",
        prices: { usd: 99.99, eur: 89.99 },
        options: { "Color": "black", "Size": "S" },
        inventory: { stockLocationId: "...", quantity: 100 }
      }
    ],
    media: {
      images: [
        { sourceUrl: "...", syncedUrl: "...", caption: "" }
      ]
    },
    taxonomy: {
      collectionId: "",
      typeId: "",
      tags: ["wireless", "bluetooth", "audio"],
      categoryIds: []
    },
    logistics: {
      weight: 0.25,
      dimensions: { length: 20, width: 18, height: 8 }
    }
  },
  aiMeta: {
    fieldsFilledByAI: ["title", "description", "features"],
    fieldsFromSource: ["sku", "price"],
    languageSource: { en: "original", fr: "translated" }
  }
}
```

**Emits:**
- `pipeline_event: BLUEPRINT_STARTED`
- `llm_call` event
- `pipeline_event: BLUEPRINT_COMPLETE`

---

## Phase 6: Finalizing

```typescript
// Update session status to success
await updateSessionStatus({
  sessionId,
  status: 'success',
  evidenceSummary: minimizeContent(evidenceSummary, 1024),
  blueprintSummary: minimizeContent(blueprintSummary, 1024),
});

// Emit complete event to client
emit({
  type: 'complete',
  sessionId,
  blueprint,
  evidence,
  ts: Date.now()
});

// Close stream
controller.close();
```

---

## Phase 7: Client Receives Stream

**File:** `src/app/create/page.tsx`

```typescript
const res = await fetch('/api/products/ingest', {
  method: 'POST',
  body: JSON.stringify(payload)
});

if (!res.ok) {
  // Handle error
  return;
}

const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    
    const event = JSON.parse(line.slice(6));
    
    // Handle events
    switch (event.type) {
      case 'session_created':
        setSessionId(event.sessionId);
        break;
      case 'pipeline_event':
        if (event.event === 'CLASSIFICATION_STARTED')
          setProgress('Classifying');
        if (event.event === 'EXTRACTION_STARTED')
          setProgress('Extracting');
        if (event.event === 'BLUEPRINT_STARTED')
          setProgress('Generating');
        if (event.event === 'BLUEPRINT_COMPLETE')
          setProgress('Finalizing');
        addLogEvent(event);
        break;
      case 'llm_call':
        addLogEvent(event);
        break;
      case 'url_fetch':
        addLogEvent(event);
        break;
      case 'complete':
        // Pipeline finished
        setBlueprint(event.blueprint);
        setEvidence(event.evidence);
        break;
      case 'error':
        showError(event.message);
        break;
    }
  }
}

// After complete event
loadFromBlueprint(blueprint);  // Hydrate Zustand store
await saveToDb();               // Save to Supabase
router.push('/product-details'); // Redirect to editor
```

---

## SSE Event Types

All events are defined in `src/lib/ingest/stream-types.ts`:

```typescript
export type IngestStreamEvent =
  | { type: 'session_created'; sessionId: string; ts: number }
  | { type: 'pipeline_event'; event: string; detail?: string; ts: number }
  | { type: 'llm_call'; step: string; model: string; promptPreview: string; responsePreview: string; tokens: { prompt: number; completion: number }; ts: number }
  | { type: 'url_fetch'; url: string; status: 'started' | 'done' | 'error'; ts: number }
  | { type: 'complete'; sessionId: string; blueprint: ProductBlueprint; evidence: Evidence; ts: number }
  | { type: 'error'; message: string; ts: number };
```

---

## Database Tables Updated

### `llm_sessions`
```sql
INSERT INTO llm_sessions (
  session_id,
  organization_id,
  user_id,
  module,
  status,
  input_summary,
  blueprint_summary,
  evidence_summary,
  tokens_prompt,
  tokens_completion,
  estimated_cost
) VALUES (...)
```

### `llm_calls`
```sql
INSERT INTO llm_calls (
  session_id,
  step,
  model,
  prompt_preview,
  prompt_full,
  response_preview,
  response_full,
  tokens_prompt,
  tokens_completion
) VALUES (...)
```

### `pipeline_events`
```sql
INSERT INTO pipeline_events (
  session_id,
  event_type,
  detail
) VALUES (...)
```

---

## Error Handling

### Graceful Degradation

- **Language detection fails** → Defaults to `["en"]`
- **URL fetch fails** → Continues with other URLs, logs error
- **Image extraction fails** → Continues with other files
- **Blueprint generation fails** → Returns error event to client

### Client-Side Error Handling

```typescript
case 'error':
  setErrorMessage(event.message);
  setProgress('error');
  break;
```

---

## Performance Characteristics

| Phase | Typical Duration | Token Usage |
|-------|-----------------|-------------|
| Classification | 2-5 seconds | 500-1000 tokens |
| Extraction | 5-15 seconds | 2000-5000 tokens |
| Blueprint Generation | 3-8 seconds | 3000-6000 tokens |
| **Total** | **10-28 seconds** | **5500-12000 tokens** |

---

## Key Files Reference

| File | Role |
|------|------|
| `src/app/api/products/ingest/route.ts` | SSE endpoint — auth, pipeline orchestration |
| `src/lib/ingest/classifier.ts` | Agent 1: language + content classification |
| `src/lib/ingest/extractor.ts` | Agent 2: text / URL / image / file extraction |
| `src/lib/ingest/blueprint-generator.ts` | Agent 3: ProductBlueprint generation |
| `src/lib/ingest/stream-types.ts` | Event type definitions |
| `src/lib/llm/logger.ts` | `callLLMWithLogging` wrapper |
| `src/lib/llm/session-manager.ts` | Session create/update + event logging |
| `src/lib/ssrf.ts` | SSRF protection for URL fetches |
| `src/lib/ingest/pdf-policy.ts` | PDF rejection policy |
| `src/components/create/GenerationLogPanel.tsx` | Real-time terminal log UI |

---

## Related Documentation

- [create-product-flow.md](./create-product-flow.md) — Full create product flow reference
- [drop-it-phase/prd-drop-it.md](./drop-it-phase/prd-drop-it.md) — JUST DROP IT PRD
- [drop-it-phase/drop-it-flow.md](./drop-it-phase/drop-it-flow.md) — Technical flow
- [r2-bucket-cleanup.md](./r2-bucket-cleanup.md) — R2 bucket image management
