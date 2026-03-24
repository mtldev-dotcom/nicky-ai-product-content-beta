# Codebase Audit Report — Product Architect (Next.js + Supabase)

> **Status note (March 2026):** The findings listed in sections 3–5 below represent the baseline state at time of the initial audit. The following have since been resolved:
> - Lint errors (50 errors) — now 0 errors, 0 warnings
> - PDF policy enforcement — implemented in `/lib/ingest/pdf-policy.ts`
> - LLM logging — extended across all AI routes
> - Security: `saveEncryptedSettings` auth bypass (C1) — fixed with `assertOrgMembership` guard
> - Dead code: `page.tsx.bak`, `image-processing.ts`, `issues/` folder — deleted
> - Medusa helper duplication — eliminated via `lib/medusa/utils.ts`
> - Zod validation added to `products/actions.ts` and `onboarding/actions.ts`
> - Medusa push logic moved from `ProductJsonModule` to `product-details/actions.ts`

## 1) Executive summary

The app is **functionally cohesive** and already implements the two big pipelines:

- **AI generation**: `/api/generate`, `/api/enhance`, `/api/translate`
- **JUST DROP IT ingest**: `/api/products/ingest` with classification → extraction → blueprint generation + full usage logging

Security posture is **intentionally strong** in two key areas (encryption + SSRF), but the repo had meaningful **DX/quality debt** at the time of this audit (see status note above for what has been resolved):

- `npm run lint` currently fails with **50 errors** (mostly `no-explicit-any` + React text escaping + an effect anti-pattern warning). *(Resolved)*
- There is **duplicated UI constants/logic** (e.g. language lists and translation handling).
- Several docs were outdated or irrelevant and have been removed; the canonical docs are now `docs/app-guide.md` and this report.

## 2) Scope & methodology

### What I did

- **Static architecture review**
  - Mapped all Next.js pages and API routes.
  - Traced user flows from UI → store → API/server actions → Supabase.
- **Security review**
  - Validated secret handling boundaries and SSRF defenses.
- **Automated checks**
  - Ran `npm run lint` and recorded errors/warnings (see Findings).
- **Docs cleanup**
  - Removed docs that were clearly unused/outdated/bloat (details below).
  - Added a complete `docs/app-guide.md`.

### What I did not do (by design)

- Did **not** refactor application code or implement new features; this is an audit + docs pass.
- Did **not** start a dev server or run browser smoke tests.

## 3) System inventory (what exists)

### Pages (12)

- `/` Dashboard — `src/app/page.tsx`
- `/create` — `src/app/create/page.tsx`
- `/create/drop-it` — `src/app/create/drop-it/page.tsx`
- `/product-details` — `src/app/product-details/page.tsx`
- `/variants` — `src/app/variants/page.tsx`
- `/media` — `src/app/media/page.tsx`
- `/json` — `src/app/json/page.tsx`
- `/usage` — `src/app/usage/page.tsx`
- `/usage/[sessionId]` — `src/app/usage/[sessionId]/page.tsx`
- `/settings` — `src/app/settings/page.tsx`
- `/login` — `src/app/login/page.tsx`
- `/onboarding` — `src/app/onboarding/page.tsx`

### API routes (6)

- `POST /api/generate` — `src/app/api/generate/route.ts`
- `POST /api/enhance` — `src/app/api/enhance/route.ts`
- `POST /api/translate` — `src/app/api/translate/route.ts`
- `POST /api/media/presigned` — `src/app/api/media/presigned/route.ts`
- `POST /api/media/sync` — `src/app/api/media/sync/route.ts`
- `POST /api/products/ingest` — `src/app/api/products/ingest/route.ts`

### Server actions (not exhaustive)

- Auth: `src/app/login/actions.ts`
- Onboarding: `src/app/onboarding/actions.ts`
- Settings: `src/app/settings/actions.ts`
- Products persistence: `src/app/products/actions.ts`
- Medusa fetch actions: `src/app/product-details/actions.ts`

## 4) Findings (issues, bugs, risks)

Severity definitions:
- **Critical**: security/tenancy break, data loss, remote exploit
- **High**: production outage, major user-blocking failure, persistent corruption
- **Medium**: correctness gaps, misleading behavior, maintainability hazards
- **Low**: polish, UX nits, style concerns

### 4.1) Critical

None found in core boundaries reviewed:
- Secrets remain server-only and encrypted at rest (`src/lib/crypto.ts`, `src/app/settings/actions.ts`).
- Media sync uses SSRF defenses (`src/lib/ssrf.ts`, `src/app/api/media/sync/route.ts`).

### 4.2) High

#### High-1: Lint is failing (blocks CI / increases regression risk)

Evidence: `npm run lint` reports **50 errors** across multiple files, including:
- `@typescript-eslint/no-explicit-any` in key UI and ingest modules
- `react/no-unescaped-entities` in several UI components
- `react-hooks/set-state-in-effect` in Settings page

Impact:
- If CI enforces lint, merges/deploys are blocked.
- Type-safety is degraded where `any` is used in core logic (variants, JSON export, ingest pipeline).

Recommendation:
- Fix lint errors incrementally, starting with the most central files:
  - `src/store/useProductStore.ts`
  - `src/app/page.tsx`
  - `src/app/product-details/page.tsx`
  - `src/app/json/page.tsx`
  - `src/app/variants/page.tsx`
  - ingest modules: `src/lib/ingest/*.ts`

#### High-2: PDF ingest is advertised but not supported end-to-end

Evidence:
- UI accepts PDF for JUST DROP IT (`/create/drop-it`) and presigned endpoint allows it.
- Backend extractor treats PDF as unsupported and returns `{}`:
  - `src/lib/ingest/file-processors.ts` → `processPDF()` throws “not yet implemented”
  - `src/lib/ingest/extractor.ts` → PDF path returns `{}` (no parsing)

Impact:
- Users can upload PDFs successfully but they contribute **no evidence**, which is misleading.

Recommendation:
- Either implement PDF extraction or explicitly block PDFs in UI/API until supported.

### 4.3) Medium

#### Med-1: Duplicate “ALL_LANGUAGES” constant and duplicated translation logic

Evidence:
- `ALL_LANGUAGES` is duplicated in:
  - `src/app/product-details/page.tsx`
  - `src/app/settings/page.tsx`
  - `src/app/variants/page.tsx`
  - `src/app/json/page.tsx`
  - `src/lib/translations.ts`

Impact:
- Easy to drift (add/remove a language in one place but not another).
- Translation behavior differs slightly between pages and background translation helper.

Recommendation:
- Centralize to a single module (e.g. `src/lib/languages.ts`) and import everywhere.

#### Med-2: “LLM logger must be used everywhere” is not true

Evidence:
- Wrapper exists: `src/lib/llm/logger.ts` and is used in ingest pipeline.
- But `/api/generate`, `/api/enhance`, `/api/translate` call OpenAI directly and do not create `llm_sessions` / log usage.

Impact:
- Usage dashboard will under-report overall AI spend/usage.

Recommendation:
- Either soften that claim in code comments/docs, or route these endpoints through the same session/logging wrapper.

#### Med-3: Dashboard product table lacks “open saved product” flow

Evidence:
- Click handler is a placeholder comment in `src/app/page.tsx` and does not load the product draft into store.

Impact:
- Users can see saved products but can’t reopen/edit them from the list.

Recommendation:
- Add “load by id” flow (fetch product record from Supabase and call `bulkUpdate`).

### 4.4) Low

#### Low-1: Using `<img>` triggers Next.js lint warnings

Evidence:
- Several pages use `<img>` directly; lint suggests `next/image`.

Impact:
- Performance/optimization opportunity, not correctness.

Recommendation:
- Move to `next/image` where it makes sense (or disable the rule if you intentionally avoid it).

#### Low-2: Hook dependency warnings

Evidence:
- `react-hooks/exhaustive-deps` warnings in multiple pages.

Impact:
- Potential stale closure bugs (rare but real), and future regressions.

Recommendation:
- Clean up gradually as part of lint pass.

## 5) Duplicates, deadcode, and unused files

### Duplicates found (not exhaustive)

- Language metadata constant duplicated (see Med-1).
- Translation of options/values (“Default” special-casing) duplicated in:
  - `src/app/variants/page.tsx`
  - `src/lib/translations.ts`
  - `src/app/product-details/page.tsx` (options merge logic)

### Deadcode / unused signals

Based on lint warnings:
- Unused imports and variables across pages (e.g. unused icon imports, unused `classification` variable in ingest route).

## 6) Docs audit & cleanup (performed)

### Removed

These were removed because they were **not app docs**, were **internal planning prompts**, were **outdated**, or were **unused examples**:

- `docs/openapi.yaml` (Medusa Admin OpenAPI spec; ~100k lines; repo bloat)
- `docs/progress-report.md` (outdated; contradicts current lint status)
- `docs/drop-it-phase/prompts.md` (internal Cursor-planner prompt)
- `docs/drop-it-phase/tasks.md` (internal todo list)
- `docs/drop-it-phase/addon-usage.md` (planning note; already implemented)
- `docs/example-template-product-demo.json` (unused)
- `docs/medusa-fetch-product-by-id-with-multiple-options.json` (unused)
- `docs/medusa-fetch-product-by-id-with-no-options.json` (unused)

### Kept (still relevant)

- ADRs in `docs/adr/*`
- `docs/drop-it-phase/prd-drop-it.md` (product/feature spec)
- `docs/drop-it-phase/drop-it-flow.md` (matches implemented pipeline)
- `docs/medusa-v2-integration.md`

### Added / updated

- `docs/README.md` (doc index)
- `docs/app-guide.md` (full app documentation)
- `docs/audit-report.md` (this report)

## 7) Recommended next steps (prioritized)

1) **Unblock lint** (fix the 50 errors; keep changes small and type-driven).
2) Decide on **PDF policy** (implement or block).
3) Centralize **language definitions + translation helpers** to reduce duplication.
4) Add “**open saved product**” flow from dashboard.
5) Extend usage logging to `/generate`, `/enhance`, `/translate` if you want complete cost tracking.

## 8) How to reproduce key audit signals

PowerShell:

```powershell
npm run lint
```


