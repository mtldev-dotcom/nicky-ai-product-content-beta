# Product Architect — Full App Guide (Features, UI, User Flows, Backend Flows)

## 1) What this app is

**Product Architect** is a multi-tenant internal SaaS tool for e-commerce teams to produce **production-ready product data** (Medusa-oriented JSON export) using AI, with:

- **AI generation** (text + optional image) → copy + SEO fields
- **JUST DROP IT ingestion** (paste text/URLs, upload files) → evidence extraction → blueprint generation
- **Localization** (per-language content + option translations)
- **Media pipeline** (upload to R2/S3, sync external URLs into org bucket with SSRF protection)
- **Medusa integration** (taxonomy sync, product listing fetch, export-to-local, and push-to-Medusa)
- **Cloud persistence** to Supabase (products + org settings + LLM usage logs)

## 2) Tech stack & repo layout

- **Frontend**: Next.js App Router (`src/app/**`), React, Tailwind, framer-motion
- **Backend**: Next.js Route Handlers (`src/app/api/**/route.ts`) + Server Actions (`src/app/**/actions.ts`)
- **Auth / DB**: Supabase via `@supabase/ssr`
- **State**: Zustand stores:
  - `src/store/useProductStore.ts`
  - `src/store/useSettingsStore.ts`
- **AI**: OpenAI SDK (`openai`) using `gpt-4o-mini`
- **Storage**: Cloudflare R2 (S3-compatible) via AWS SDK (`@aws-sdk/client-s3`)
- **Security primitives**:
  - AES-256-GCM encryption: `src/lib/crypto.ts`
  - SSRF hardening: `src/lib/ssrf.ts`

## 3) Global UI layout

### Root layout

- **File**: `src/app/layout.tsx`
- Applies global fonts, dark theme, and wraps all pages in `Shell`.

### Shell (app chrome)

- **File**: `src/components/layout/Shell.tsx`
- Determines if current route is an auth page (`/login`, `/onboarding`).
  - If **auth page**: hides navigation.
  - Else: shows `Navigation` and renders the main content area with page transitions.

### Navigation

- **File**: `src/components/layout/Navigation.tsx`
- Desktop: left sidebar.
- Mobile: bottom bar.
- Routes:
  - `/` Dashboard
  - `/product-details` Details (copy + SEO + taxonomy + logistics)
  - `/media` Media pipeline
  - `/variants` Variants & option architect
  - `/json` Export view (Medusa-like output)
  - `/usage` LLM usage logs
  - `/settings` Org settings (keys + store + languages)
- Includes a **Sign Out** button wired to server action `signOut` (`src/app/login/actions.ts`).

## 4) Authentication, sessions, tenancy (Supabase)

### Middleware: keep session fresh

- **File**: `src/middleware.ts`
- Delegates to `updateSession` from `src/utils/supabase/middleware.ts`.
- Applies to almost all routes (excludes `_next/static`, `_next/image`, `favicon.ico`, and common image extensions).

### Supabase client creation

- **Browser client**: `src/utils/supabase/client.ts`
- **Server client**: `src/utils/supabase/server.ts`

### Multi-tenant scoping model (expected tables)

The app assumes these tables exist in Supabase (docs mention them; some are not migrated in this repo):

- `organizations`
- `organization_members` (links `user_id` → `organization_id`)
- `organization_settings` (per-org config, secrets encrypted at rest)
- `products` (per-org products/drafts; stores a JSON blob in `data`)

### LLM logging tables (migrated in repo)

Migration:
- `supabase/migrations/20250127000000_create_llm_logging_tables.sql`

Tables:
- `llm_sessions`
- `llm_calls`
- `pipeline_events`

All have RLS enabled and org-scoped policies.

## 5) Settings & secrets (encryption and “replace semantics”)

### UI: Settings page

- **Route**: `/settings`
- **Files**:
  - UI: `src/app/settings/page.tsx`
  - Server actions: `src/app/settings/actions.ts`
  - Schemas: `src/lib/settings-schema.ts`

### What settings exist

- **OpenAI key**: used by `/api/generate`, `/api/enhance`, `/api/translate`, `/api/products/ingest`
- **R2 (S3-compatible) credentials**: used by `/api/media/presigned` and `/api/media/sync`
  - account id, access key id, secret access key, bucket name, public URL base
- **Medusa integration**:
  - store platform (medusa / none / shopify-coming-soon)
  - `medusaUrl` + `medusaApiKey` (admin key)
- **Brand settings**:
  - brandName, brandVoice, customInstructions
- **Localization settings**:
  - `activeLanguages` (org-level)

### Secret handling rules (critical)

Implemented in `src/app/settings/actions.ts`:

- Secrets are **encrypted at rest** using AES-256-GCM (`src/lib/crypto.ts`).
- Browser **never receives decrypted secrets**.
- “Replace semantics”:
  - **empty string** means “keep existing stored secret”
  - **non-empty** means “replace”
  - **null** means “clear” (supported server-side even if UI doesn’t expose it)

See ADR: `docs/adr/0001-secrets-never-leave-server.md`.

## 6) Product state model (Zustand) and persistence

### Product store (single-source of truth for product draft)

- **File**: `src/store/useProductStore.ts`
- Contains:
  - Root fields: title/subtitle/description/handle/status/sku/price/thumbnail
  - Localization map: `localization[lang]`
  - Active languages for this product session: `activeLanguages`
  - Options + variants
  - Media: `images`, `vault`, `ignoredUrls`
  - Taxonomy selections: collection/type/categories/tags/sales channels/shipping profile
  - Logistics: weight + dimensions
  - `aiMeta` (tracks AI vs source fields)

### Product persistence: server-side write

- **Server action**: `src/app/products/actions.ts` → `saveProductToCloud`
- Called by: `useProductStore.saveToDb()`

Behavior:
- Verifies authenticated user
- Derives org via `organization_members`
- Inserts/updates in `products` table under that org
- Stores “everything else” in `data` JSON blob

See ADR: `docs/adr/0003-server-side-product-persistence.md`.

## 7) Pages (UI features) — what/where/how

### 7.1) Dashboard (home)

- **Route**: `/`
- **File**: `src/app/page.tsx`

#### Sections

- **AI Prompt Bar** (text + optional image):
  - Sends `POST /api/generate` with:
    - `{ prompt }` if non-empty
    - `{ image }` if an image was selected (data URL)
  - On success:
    - updates product store root + `localization.en`
    - calls `saveToDb()` to persist to Supabase `products`
    - loads org settings (to get active languages)
    - triggers background translations via `translateAllActiveLanguages()` (`src/lib/translations.ts`)
    - navigates to `/product-details`

- **Import JSON**:
  - Reads a local `.json` file, parses, maps via `mapExternalToProduct` (`src/lib/mapper.ts`)
  - Resets store → bulk loads mapped data → saves → loads settings → background translations → navigates to `/product-details`

- **Create Product**:
  - Navigates to `/create` (starting-point chooser)

- **Recent Products table**:
  - Reads `products` from Supabase filtered by org_id
  - Supports reopening saved products into the editor

- **Medusa catalog table (optional)**:
  - If org settings configured for Medusa (platform + url + api key), calls:
    - `getMedusaProducts(orgId)` (`src/app/product-details/actions.ts`)
  - Shows last 20 products from Medusa Admin API

#### Backend flows used

- `POST /api/generate` → AI copy generation (requires org OpenAI key or `OPENAI_API_KEY`)
- `saveProductToCloud` server action → persist draft
- optional server action call → Medusa fetch

### 7.2) Create Product workspace

- **Route**: `/create`
- **File**: `src/app/create/page.tsx`

Current behavior:
- A single flat intake form replaces the earlier chooser cards
- Inputs are grouped into:
  - images
  - product details text
  - supplier URL
  - optional JSON import
- All non-JSON submissions run through the ingest pipeline and stream progress via SSE

### 7.3) JUST DROP IT (ingest UI)

- **Route**: `/create/drop-it`
- **File**: `src/app/create/drop-it/page.tsx`

#### Inputs

- Multiple **Text Blocks**
- Multiple **URLs**
- Multiple **Files**
  - Images + CSV + JSON + TXT supported for upload
  - Upload flow:
    - call `POST /api/media/presigned` with `{ filename, contentType, forIngest: true }`
    - `PUT` the file to returned presigned URL
    - store returned `publicUrl` and MIME type for ingest payload

#### Generate

On “Generate Product Draft”:
- Calls `POST /api/products/ingest` with:
  - `targetLanguages` (from org settings; falls back to `['en']`)
  - `textBlocks`, `urls`
  - `files[]` items with `{ id, type, mime, url }`
- On success:
  - `resetStore()` then `loadFromBlueprint(data.blueprint)`
  - `saveToDb()`
  - navigate to `/product-details`

#### Backend flow used

- `/api/products/ingest` orchestrates:
  - LLM session creation + pipeline events (`src/lib/llm/session-manager.ts`)
  - classification (`src/lib/ingest/classifier.ts`)
  - extraction (`src/lib/ingest/extractor.ts`)
  - blueprint generation (`src/lib/ingest/blueprint-generator.ts`)

### 7.4) Product Details (copy + SEO + taxonomy + logistics)

- **Route**: `/product-details`
- **Files**:
  - UI: `src/app/product-details/page.tsx`
  - Medusa actions: `src/app/product-details/actions.ts`
  - API routes used: `/api/enhance`, `/api/translate`

#### Sections

- **Language tabs**
  - Filtered to org `settings.activeLanguages` (org-level markets)
  - Per-language “Active/Inactive” toggle (product-level activeLanguages)
  - Auto-translate when activating a language with empty fields

- **Product Copy**
  - Title, Subtitle, Rich-text Description
  - Per-field “Enhance with AI” buttons → `POST /api/enhance`

- **Features**
  - List of strings
  - Per-feature enhance button → `POST /api/enhance` with `fieldType: 'feature'`

- **SEO sidebar**
  - Meta title/description/keywords
  - Enhance buttons → `POST /api/enhance`

- **Store Taxonomy**
  - Sync button calls `getMedusaTaxonomy(orgId)`
  - Lets user choose collection/type, set categories/sales channels, add tags, choose shipping profile

- **Logistics**
  - Weight + dimensions

### 7.5) Variants & Options

- **Route**: `/variants`
- **File**: `src/app/variants/page.tsx`

Capabilities:
- Define product options (attributes) and values
- Generate variants via cartesian product
- Apply bulk pricing + inventory preferences
- Translate options/values to all org active languages via `/api/translate`
- Pull store currencies and stock locations via `getMedusaTaxonomy`

### 7.6) Media pipeline

- **Route**: `/media`
- **File**: `src/app/media/page.tsx`

Capabilities:
- Bulk add external image URLs
- Upload local images (presigned to bucket) via `POST /api/media/presigned` then `PUT`
- For each external URL:
  - optionally ignore syncing (`ignoredUrls`)
  - sync it into bucket via `POST /api/media/sync` (SSRF-hardened)
- Reorder images (drag) and set thumbnail
- Vault logic:
  - `useProductStore.setImages()` sets `vault` to first 3–6 images (else empty)

Security:
- `/api/media/sync` uses `src/lib/ssrf.ts` to block private networks, redirects, and oversize downloads.
See ADR: `docs/adr/0002-ssrf-hardening-media-sync.md`.

### 7.7) JSON export

- **Route**: `/json`
- **File**: `src/app/json/page.tsx`

Outputs a Medusa-like product JSON with:
- root fields
- images with rank
- tags/categories/sales channels
- variants (prefers `product.variants` if present)
- i18n in `metadata.*_i18n`

Also shows a health checklist (required/recommended fields + translation completeness).

### 7.8) Usage & logging UI

- **Route**: `/usage` and `/usage/[sessionId]`
- **Files**:
  - list: `src/app/usage/page.tsx`
  - detail: `src/app/usage/[sessionId]/page.tsx`

Reads from Supabase tables:
- `llm_sessions`
- `pipeline_events`
- `llm_calls`

Shows:
- filtering by module/status/date
- session detail timeline
- expandable LLM call previews

### 7.9) Login / Signup

- **Route**: `/login`
- **Files**:
  - UI: `src/app/login/page.tsx`
  - Actions: `src/app/login/actions.ts`

Actions:
- `login(formData)` → `supabase.auth.signInWithPassword`
- `signup(formData)` → `supabase.auth.signUp` (stores `full_name` in auth metadata)
- `signOut()` → `supabase.auth.signOut`

### 7.10) Onboarding (create organization)

- **Route**: `/onboarding`
- **Files**:
  - UI: `src/app/onboarding/page.tsx`
  - Action: `src/app/onboarding/actions.ts`

Creates:
- `organizations` row
- `organization_members` row (role owner)
- `organization_settings` default row

## 8) Backend API routes (contracts + behavior)

### 8.1) `POST /api/generate`

- **File**: `src/app/api/generate/route.ts`
- Validates request via `GenerateRequestSchema` (`src/lib/api-schemas.ts`).
- Requires auth and org membership.
- Loads org settings:
  - decrypts `openai_api_key` (or fallback to `OPENAI_API_KEY`)
  - brandName/brandVoice/customInstructions
- Calls OpenAI Chat Completions with `response_format: json_object`.
- Returns JSON with:
  - title, description, subtitle, features[], metadata_title, metadata_description, keywords[]

### 8.2) `POST /api/enhance`

- **File**: `src/app/api/enhance/route.ts`
- Validates request via `EnhanceRequestSchema`.
- Requires auth and org membership.
- Uses org OpenAI key (or fallback).
- Returns `{ enhanced }` (string or keywords array).

### 8.3) `POST /api/translate`

- **File**: `src/app/api/translate/route.ts`
- Validates request via `TranslateRequestSchema`.
- Requires auth and org membership.
- Uses org OpenAI key (or fallback).
- Returns a JSON object containing at least:
  - `localization` translated
  - `options` translated (with `translations[selectedLang]` and values translations)

### 8.4) `POST /api/media/presigned`

- **File**: `src/app/api/media/presigned/route.ts`
- Validates request via `MediaPresignedRequestSchema`.
- Requires auth and org membership.
- Loads org R2 settings (decrypt or fall back to env):
  - S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ACCOUNT_ID, S3_BUCKET, S3_FILE_URL
- Generates presigned PUT URL and returns `publicUrl`.
- Namespacing:
  - `${orgId}/uploads/...` for normal image uploads
  - `${orgId}/ingest/...` for ingest files

### 8.5) `POST /api/media/sync`

- **File**: `src/app/api/media/sync/route.ts`
- Requires auth and org membership.
- SSRF-hardens the external URL (`assertSafeExternalUrl`, `fetchExternalWithLimits`)
- Requires `image/*` content type.
- Downloads (max 10MB, 10s), uploads to `${orgId}/sync/...` in bucket.
- Returns new `publicUrl`.

### 8.6) `POST /api/products/ingest`

- **File**: `src/app/api/products/ingest/route.ts`
- Requires auth and org membership.
- Creates `llm_sessions` row (module: `JUST_DROP_IT`).
- Orchestrates:
  - classification: `src/lib/ingest/classifier.ts`
  - extraction: `src/lib/ingest/extractor.ts`
  - blueprint generation: `src/lib/ingest/blueprint-generator.ts`
- Logs `pipeline_events` throughout.
- Returns:
  - `sessionId`
  - `blueprint`
  - `evidence`

## 9) Environment variables (what exists, where used)

### Required for Supabase

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Required for encryption

- `ENCRYPTION_KEY` (64-char hex, 32 bytes)

### Optional OpenAI fallback (when org has no key)

- `OPENAI_API_KEY`

### Optional R2 fallback (when org has no R2 keys)

- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_ACCOUNT_ID`
- `S3_BUCKET`
- `S3_FILE_URL`
- `NEXT_PUBLIC_S3_FILE_URL` (client-only heuristic for “synced” URLs)

### Optional allowlists

- `MEDIA_SYNC_ALLOWED_HOSTS` (for `/api/media/sync`)
- `INGEST_ALLOWED_HOSTS` (for URL scraping inside ingest pipeline)

## 10) Known limitations (as implemented)

- Dashboard can reopen saved products into the editor.
- Push to Medusa exists, but update behavior still needs continued hardening and broader integration coverage.
- **PDF extraction not implemented** (`processPDF()` throws).
- Repo lint is still not globally clean; this guide should not be treated as a statement that lint passes everywhere.


