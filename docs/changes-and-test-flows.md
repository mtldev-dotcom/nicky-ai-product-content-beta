# Changes & Test Flows (Roadmap Execution Summary)

This document summarizes **what changed** during the roadmap execution and provides a **manual test matrix** you can run to validate core user flows.

## What changed (high-level)

### Phase 1 — Stabilize & Clean Up

- **Lint + build stability**
  - Removed many `any` usages and aligned types across core modules so the codebase is lint-clean (no errors) and builds successfully.
  - Key files touched:
    - `src/store/useProductStore.ts`
    - `src/app/page.tsx`
    - `src/app/product-details/page.tsx`
    - `src/app/json/page.tsx`
    - `src/app/variants/page.tsx`
    - `src/lib/ingest/classifier.ts`
    - `src/lib/ingest/extractor.ts`
    - `src/lib/ingest/blueprint-generator.ts`
    - `src/lib/mapper.ts`
    - `src/lib/translations.ts`

- **Languages centralized**
  - Added `src/lib/languages.ts` as the single source of truth for supported languages.
  - Updated pages/helpers that previously had inline language lists to import from `src/lib/languages.ts`.

- **PDF policy: explicitly blocked**
  - UI no longer offers PDF in JUST DROP IT upload; copy now states PDFs are not supported.
  - Backend rejects PDFs with a friendly error: **"PDF files are not supported yet"**.
  - Key files:
    - `src/app/create/drop-it/page.tsx`
    - `src/lib/ingest/pdf-policy.ts`
    - `src/app/api/products/ingest/route.ts`
  - Added README note:
    - `README.md` (PDF TODO)
  - Added basic unit test + test script:
    - `tests/pdf-policy.test.ts`
    - `package.json` (`npm test`)

### Phase 2 — Observability (LLM Logging Everywhere)

- **LLM logging now covers ALL AI endpoints**
  - `/api/generate`, `/api/enhance`, `/api/translate` now:
    - Create an `llm_sessions` row (best-effort)
    - Use `callLLMWithLogging(...)` so each call writes to `llm_calls`
    - Update session success/error
  - If session creation fails, endpoints **still work** (fallback to direct OpenAI call).
  - Key files:
    - `src/app/api/generate/route.ts`
    - `src/app/api/enhance/route.ts`
    - `src/app/api/translate/route.ts`
    - `src/lib/llm/logger.ts`
    - `src/lib/llm/session-manager.ts`

- **Logging safety tightened**
  - Improved redaction coverage and reduced stored prompt “full” size.
  - Key files:
    - `src/lib/llm/redaction.ts`
    - `src/lib/llm/logger.ts`
  - Usage filters include `ENHANCE` and `TRANSLATE`:
    - `src/app/usage/page.tsx`

### Phase 3 — UX Quality-of-Life

- **Open product from dashboard**
  - Clicking a saved product on `/` now loads it into the editor and navigates to `/product-details`.
  - Key files:
    - `src/store/useProductStore.ts` (`loadFromSavedProduct`)
    - `src/app/page.tsx` (row click → fetch → hydrate → navigate)

- **JUST DROP IT UX refinements**
  - Upload errors are shown as an inline warning list (partial success).
  - After successful ingest, the page fetches `pipeline_events` and shows:
    - counts of processed/failed URLs, images, and text
    - quick links to `View Logs` (`/usage/[sessionId]`) and `Continue to Editor`
  - Key files:
    - `src/app/create/drop-it/page.tsx`

### Phase 4 — Product Power-Ups

- **Push to Medusa (create-only)**
  - Added internal API route: `POST /api/medusa/push-product`
  - Added “Push to Medusa” button on `/json` page.
  - Key files:
    - `src/app/api/medusa/push-product/route.ts`
    - `src/app/json/page.tsx`

- **Template / blueprint vault (optional, implemented as first pass)**
  - Added `products.is_template` (migration) + API to toggle template flag + dashboard UI to use templates.
  - Key files:
    - `supabase/migrations/20251228020000_add_is_template_to_products.sql`
    - `src/app/api/products/set-template/route.ts`
    - `src/app/page.tsx`

## Preconditions / required setup

- **Templates require DB migration**
  - Apply: `supabase/migrations/20251228020000_add_is_template_to_products.sql`

- **Medusa push requires settings**
  - Set `storePlatform=medusa`, `medusaUrl`, and `medusaApiKey` via `/settings`.

- **LLM logging requires tables + RLS**
  - `llm_sessions`, `llm_calls`, `pipeline_events` must exist and be writable for authenticated users within their org.

## How to run checks locally

- **Lint**: `npm run lint`
- **Build/typecheck**: `npm run build`
- **Unit tests**: `npm test`

## Manual test flows (recommended order)

### 0) Smoke: can the app run + compile?
- Run:
  - `npm run lint`
  - `npm run build`
  - `npm test`

### 1) Auth + onboarding + settings
- **Login**: sign up / sign in at `/login`.
- **Onboarding**: ensure org membership exists (or create org via `/onboarding` if your flow requires it).
- **Settings** (`/settings`):
  - Save OpenAI key (or confirm fallback env key works).
  - Configure Medusa integration (URL + key).
  - Sync Medusa taxonomy and set **default selections for new products** (sales channel, shipping profile, collection, categories).
  - Choose active languages and verify tabs/filtering across pages.

Expected:
- Settings save succeeds.
- Secrets are not displayed back in plaintext after reload (replace semantics).
 - Default Medusa selections persist across refresh.

### 2) Dashboard generate/import/save baseline
- `/` dashboard:
  - Generate a product (prompt-only).
  - Confirm it navigates into the editor flow and can be saved.

Expected:
- A `products` row exists for the org and appears under “Recent Products”.
 - The new product draft has default taxonomy fields set (if configured in settings).

### 3) Open product from dashboard
- On `/`, click an existing saved product row.

Expected:
- The store hydrates and you land on `/product-details` with the product’s data loaded.
- If the product is missing/corrupt, you see a friendly error (no crash).

### 4) JUST DROP IT (happy path)
- Go to `/create/drop-it`:
  - Provide: 1 text block + 1 image (PNG/JPG) + optional URL.
  - Click “Generate Product Draft”.

Expected:
- Ingest completes and you see the **Ingest Summary** card.
- Click “Continue to Editor” → `/product-details`.
- Click “View Logs” → `/usage/[sessionId]` and see events + LLM calls.

### 5) JUST DROP IT (partial success path)
- `/create/drop-it`:
  - Add at least one invalid/unreachable URL (or a URL that will fail SSRF checks).
  - Add valid text so ingest can still succeed.

Expected:
- Blueprint still generates.
- Summary shows partial failures (URL failed count).
- Logs show `EXTRACTION_URL_ERROR` events.

### 6) PDF policy enforcement
- **UI**: verify the file picker does not allow `.pdf`.
- **Backend**: (optional) manually call `/api/products/ingest` with a file entry marked as pdf.

Expected:
- API returns error text: **"PDF files are not supported yet"**.

### 7) AI endpoint logging (Generate/Enhance/Translate)
- Trigger each endpoint:
  - `/api/generate`: use the dashboard generator.
  - `/api/enhance`: use “enhance” in product details.
  - `/api/translate`: use translation helper / translate action.

Expected:
- `/usage` shows sessions for modules: `GENERATE`, `ENHANCE`, `TRANSLATE`.
- Each session detail page shows `llm_calls` with **redacted + truncated** previews.

### 7b) Variants pricing UI regression check (runtime safety)
- Open `/variants` with:
  - a fresh product (generated or manual), and
  - an older saved product/template (if you have one).

Expected:
- The variants list renders without crashing even if older data contains non-string currency codes.

### 8) Push to Medusa (create-only)
- On `/json`, click “Push to Medusa”.

Expected:
- Success message appears with a Medusa product id (if returned).
- Failure surfaces a clear error (auth/validation/etc.).

### 9) Templates (mark + use)
- Apply the migration first (required).
- On `/` dashboard:
  - Click the star to mark a product as template.
  - Confirm it appears in the “Templates” section.
  - Click “Use Template”.

Expected:
- You land on `/product-details` with the template’s content loaded as a **new draft** (should not overwrite the template row).
- The new draft should be saveable as a new product.


