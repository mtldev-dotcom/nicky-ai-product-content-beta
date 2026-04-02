# Create New Product — Full Flow Reference

> **Last updated:** 2026-04-02  
> **Entry point:** `/create` (`src/app/create/page.tsx`)  
> **Destination:** `/product-details` (`src/app/product-details/page.tsx`)

---

## Overview

The Create Product page is a single-page form with four always-visible input sections. On submission it runs the full 4-agent JUST DROP IT ingest pipeline and streams real-time logs back to the browser. The pipeline output is a `ProductBlueprint` which gets loaded into the Zustand product store and saved to Supabase before the user is redirected to the editor.

There is one alternative path: **JSON Import**, which bypasses AI entirely and loads a product directly from a structured JSON file.

---

## Page Layout

```
/create

┌─ Dev Tools (dev-only, collapsible) ──────────────────────┐
└──────────────────────────────────────────────────────────┘

┌─ 1. Images ──────────────────────────────────────────────┐
│  Drag & drop zone (upload to R2)                         │
│  Image URL input → [Add] (syncs via /api/media/sync)     │
│  Thumbnail row for uploaded images                       │
│  Ctrl+V paste → same R2 upload flow                      │
└──────────────────────────────────────────────────────────┘

┌─ 2. Product Details ─────────────────────────────────────┐
│  Large textarea                                          │
│  Freeform: title, description, notes, specs, variants    │
└──────────────────────────────────────────────────────────┘

┌─ 3. Supplier URL (optional) ─────────────────────────────┐
│  Single URL input (AliExpress, Amazon, other)            │
└──────────────────────────────────────────────────────────┘

┌─ 4. JSON Import (optional) ──────────────────────────────┐
│  File picker → bypasses AI entirely                      │
│  Must match docs/product-demo.json format                │
└──────────────────────────────────────────────────────────┘

[Generation Log — appears once pipeline starts]

[Generate Product Draft →]   ← sticky CTA with 4-dot progress
```

**Minimum required to submit:** at least one of — images, product details text, or supplier URL.

---

## Path A — AI Pipeline (Generate Product Draft button)

### Step 1: Client — input validation & upload

1. User fills any combination of the 4 input sections.
2. Images are uploaded to Cloudflare R2 via presigned PUT:
   - File drag/drop or click: `POST /api/media/presigned` → PUT to R2
   - Image URL: `POST /api/media/sync` → server fetches + uploads to R2
   - Ctrl+V paste: same as file upload via `handleFileSelect`
3. On "Generate", client validates at least one source exists.
4. `resetStore()` clears any previous product draft.
5. `applyMedusaDefaultsForNewProduct()` seeds collection/channel defaults from org settings.

### Step 2: Client → Server — POST /api/products/ingest

**Request body** (validated by `IngestRequestSchema`):
```json
{
  "targetLanguages": ["en", "fr"],
  "textBlocks": ["raw notes or product copy..."],
  "urls": ["https://www.aliexpress.com/item/..."],
  "files": [
    { "id": "abc", "type": "image", "mime": "image/jpeg", "url": "https://pub-...r2.dev/..." }
  ]
}
```

**Response:** `text/event-stream` (SSE) — the route streams events as the pipeline runs.

Auth errors (401/403) before the stream opens are returned as plain JSON.

### Step 3: Server — 4-agent pipeline (streaming)

The ingest route creates a `ReadableStream` and emits SSE events throughout:

#### Agent 1 — Classifier (`src/lib/ingest/classifier.ts`)

**Event:** `pipeline_event: CLASSIFICATION_STARTED`

1. **Language detection** — `gpt-4o-mini` call on the combined text. Returns ISO-639-1 codes.
2. **Content segment classification** — `gpt-4o-mini` splits the text into `{ titles, bullets, specs, descriptions }`.
3. **URL source classification** — regex-based, detects `aliexpress` / `amazon` / `other`.
4. **File type detection** — from MIME type and URL extension.

**Event:** `pipeline_event: CLASSIFICATION_COMPLETE`

Each `gpt-4o-mini` call emits an `llm_call` event: `{ step, model, promptPreview, responsePreview, tokens }`.

#### Agent 2 — Extractor (`src/lib/ingest/extractor.ts`)

**Event:** `pipeline_event: EXTRACTION_STARTED`

Runs in parallel across all sources:

| Source | What happens |
|---|---|
| **Text blocks** | `gpt-4o-mini` extracts structured fields: titles, descriptions, features, benefits, specs, logistics, variants, seoKeywords |
| **Supplier URL** | Emits `url_fetch: started` → SSRF-guarded fetch → HTML scrape (meta, JSON-LD, body) → same text extraction LLM call → `url_fetch: done/error` |
| **Image files** | `gpt-4o-mini` Vision API (multimodal) → extracts product title, features, visible text, specs |
| **CSV / JSON files** | Parsed client-side → converted to text → same text extraction LLM call |

Each LLM call emits an `llm_call` SSE event.

All partial evidence is merged into a single `Evidence` object and deduplicated.

**Event:** `pipeline_event: EXTRACTION_COMPLETE`

#### Agent 3 — Blueprint Generator (`src/lib/ingest/blueprint-generator.ts`)

**Event:** `pipeline_event: BLUEPRINT_STARTED`

1. Determines language source for each target language (`original` / `mixed` / `translated`).
2. Builds a comprehensive prompt including:
   - Full evidence summary (titles, descriptions, features, specs, variants, images)
   - Org brand voice and custom instructions
   - Target languages with handling rules (preserve vs. expand vs. translate)
3. `gpt-4o-mini` call → returns a `ProductBlueprint` JSON object.
4. `normalizeBlueprint()` fills in any missing fields and deduplicates AI meta.

Emits `llm_call` SSE event.

**Event:** `pipeline_event: BLUEPRINT_COMPLETE`

#### Agent 4 — Finalizing (implicit)

- LLM session updated to `status: success` in Supabase (`llm_sessions` table).
- `complete` SSE event emitted with full `{ sessionId, blueprint, evidence }`.

### Step 4: Client — receiving stream events

The create page consumes the SSE stream line by line with buffered parsing:

| Event type | Client action |
|---|---|
| `session_created` | Stores `sessionId` for the "View session" log link |
| `pipeline_event: CLASSIFICATION_STARTED` | Sets progress dot to "Classifying" |
| `pipeline_event: EXTRACTION_STARTED` | Sets progress dot to "Extracting" |
| `pipeline_event: BLUEPRINT_STARTED` | Sets progress dot to "Generating" |
| `pipeline_event: BLUEPRINT_COMPLETE` | Sets progress dot to "Finalizing" |
| `llm_call` | Appended to `logEvents` → rendered in `GenerationLogPanel` |
| `url_fetch` | Appended to `logEvents` → rendered in log panel |
| `complete` | Calls `loadFromBlueprint(blueprint)` → `saveToDb()` → redirect to `/product-details` |
| `error` | Shows error banner, stops generation |

### Step 5: Client — save and redirect

1. `loadFromBlueprint(blueprint)` hydrates the Zustand `useProductStore` with all generated fields.
2. `saveToDb()` calls the server action `saveProduct()` which persists the draft to Supabase (`products` table, org-scoped).
3. Router navigates to `/product-details`.

---

## Path B — JSON Import (bypass AI)

1. User clicks "Import JSON file" in section 4.
2. A hidden `<input type="file" accept=".json">` opens.
3. `FileReader` reads the file as text and `JSON.parse()` it.
4. `mapExternalToProduct(json)` in `src/lib/mapper.ts` maps the JSON to the internal product store shape.
   - Accepts `docs/product-demo.json` format: `{ title, description, subtitle, sku, price, images[], options[], features[], metadata_title, metadata_description, keywords[] }`
   - Also accepts the internal complex format (with `_i18n` fields, options_i18n, etc.)
5. `bulkUpdate(mappedData)` loads the mapped data into the Zustand store.
6. `applyMedusaDefaultsForNewProduct()` seeds channel/collection defaults.
7. `saveToDb()` persists immediately.
8. Background `translateAllActiveLanguages()` is kicked off (non-blocking).
9. Router navigates to `/product-details` — **no AI pipeline runs**.

---

## Generation Log Panel

`src/components/create/GenerationLogPanel.tsx`

Displayed below the form sections once the first SSE event arrives. Auto-scrolls to the bottom. Shows:

```
◆ Session 7f8a2b1c… started

▸ CLASSIFYING INPUTS
  ⟳ gpt-4o-mini · classification · 45↑ 12↓
  ⟳ gpt-4o-mini · classification · 156↑ 89↓
  ✓ Classification done

▸ EXTRACTING EVIDENCE
  → Fetching aliexpress.com/item/...
  ⟳ gpt-4o-mini · extraction-text · 320↑ 180↓
  ✓ URL loaded
  ⟳ gpt-4o-mini · extraction-vision · 1204↑ 340↓
  ✓ Extraction done

▸ GENERATING BLUEPRINT
  ⟳ gpt-4o-mini · blueprint-generation · 2100↑ 890↓
  ✓ Blueprint done

✅ Blueprint ready
✓ Done — 6,735 tokens total

[View session →]   (links to /usage/[sessionId])
```

Token format: `Xin↑ Yout↓` (numbers ≥1000 shown as e.g. `1.2k`).

---

## LLM Logging & Session Storage

Every generation run creates a session record and is fully observable after the fact:

| Table | What's stored |
|---|---|
| `llm_sessions` | Session ID, org, user, module (`JUST_DROP_IT`), status, token totals, cost estimate, input/blueprint summaries |
| `llm_calls` | Every individual LLM call: step, model, prompt (truncated 4KB), response (truncated 2KB), token counts |
| `pipeline_events` | High-level breadcrumbs: `CLASSIFICATION_STARTED`, `EXTRACTION_URL_COMPLETE`, etc. |

Session viewer: `/usage/[sessionId]`  
Sessions list: `/usage`

---

## R2 Media Upload Notes

- Presigned PUT URL generated by `POST /api/media/presigned`
- Browser uploads directly to R2 — **requires R2 bucket CORS policy** to allow PUT from your origin
- CORS config needed in Cloudflare Dashboard → R2 → bucket → Settings → CORS:
  ```json
  [{ "AllowedOrigins": ["https://your-domain.com"], "AllowedMethods": ["GET","PUT","HEAD"], "AllowedHeaders": ["*"] }]
  ```
- Public URL is `${S3_FILE_URL}/${fileKey}` — trailing slash in `S3_FILE_URL` is stripped automatically

---

## Key Files

| File | Role |
|---|---|
| `src/app/create/page.tsx` | Page — form UI, stream consumer, log panel host |
| `src/app/api/products/ingest/route.ts` | SSE endpoint — auth, pipeline orchestration, streaming |
| `src/lib/ingest/classifier.ts` | Agent 1: language + content classification |
| `src/lib/ingest/extractor.ts` | Agent 2: text / URL / image / file extraction |
| `src/lib/ingest/blueprint-generator.ts` | Agent 3: ProductBlueprint generation with brand voice |
| `src/lib/ingest/stream-types.ts` | `IngestStreamEvent` union type + `StreamEmit` callback |
| `src/lib/llm/logger.ts` | `callLLMWithLogging` wrapper — DB logging + SSE emit |
| `src/lib/llm/session-manager.ts` | Session create/update + pipeline event logging |
| `src/lib/mapper.ts` | `mapExternalToProduct` — JSON import mapper |
| `src/components/create/GenerationLogPanel.tsx` | Real-time terminal log UI |
| `src/app/api/media/presigned/route.ts` | Generates R2 presigned PUT URLs |
| `src/app/api/media/sync/route.ts` | Fetches external image → uploads to R2 |
| `src/store/useProductStore.ts` | Zustand store — `loadFromBlueprint`, `saveToDb`, `bulkUpdate` |

---

## Adding a New Pipeline Event to the Log

1. In the relevant ingest lib file, call `emit?.({ type: 'pipeline_event', event: 'MY_EVENT', ts: Date.now() })` (the `emit` param is already threaded through all functions).
2. In `GenerationLogPanel.tsx`, add the event name to `SECTION_LABELS`, `DONE_LABELS`, or `ERROR_LABELS` as appropriate.
3. The event is also written to the `pipeline_events` Supabase table via `logPipelineEvent()`.

## Adding a new `llm_call` event

Any call made through `callLLMWithLogging` with `emit` passed in will automatically emit an `llm_call` event. Pass `emit` to any new `callLLMWithLogging` call in the pipeline — no other changes needed.
