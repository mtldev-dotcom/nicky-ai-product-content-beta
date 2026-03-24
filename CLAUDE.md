# CLAUDE.md — Product Architect

This file is the authoritative guide for Claude working in this repo. Read it fully before writing any code.

---

## What this app is

**Product Architect** is a multi-tenant SaaS for AI-powered e-commerce catalog management. Users upload product images or concepts; the app generates production-ready, localized product data and syncs it to MedusaJS stores.

**Who it's for:** Small-to-medium e-commerce operators using MedusaJS who need to create and manage large product catalogs efficiently.

**Core flows:**
1. **JUST DROP IT** — upload an image/JSON → AI classifies, extracts, and generates a product blueprint
2. **Editor** — edit product fields, variants, options, localization, and media
3. **Push to Medusa** — validate and sync a product to MedusaJS via two-phase creation or update strategy
4. **Studio** — AI image generation for product photography

---

## Tech stack (exact versions)

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16 |
| UI | React | 19 |
| Language | TypeScript | 5 (strict) |
| Styling | Tailwind CSS | v4 |
| Animations | Framer Motion | latest |
| Rich text | TipTap | latest |
| Client state | Zustand | latest |
| Icons | Lucide React | latest |
| Database | Supabase (PostgreSQL + RLS) | latest |
| Auth | Supabase Auth | latest |
| AI (text) | OpenAI (GPT-4o-mini), OpenRouter (fallback) | latest |
| AI (images) | OpenAI, Google Gemini, fal.ai | latest |
| Media storage | Cloudflare R2 / AWS S3 | via @aws-sdk/client-s3 |
| E-commerce | MedusaJS Admin API | v2 |
| Validation | Zod | latest |
| Deployment | Nixpacks (Railway / similar) | via nixpacks.toml |

---

## Architecture decisions

Three immutable ADRs govern security behavior. Do not work around them:

- **ADR-0001**: Secrets never leave the server. API keys are encrypted at rest (AES-256-GCM via `src/lib/crypto.ts`). They are decrypted only in server actions and API route handlers. They are never passed to client components.
- **ADR-0002**: All external URL fetches go through SSRF validation (`src/lib/ssrf.ts`) before the request is made. The media sync endpoint is the primary enforcement point.
- **ADR-0003**: Product persistence happens via server action (`src/app/products/actions.ts`), not via direct client Supabase writes. Org membership is verified server-side before any write.

Additional architectural constraints:
- All data is org-scoped. Every query must include `.eq('organization_id', ...)`. Never query without this filter.
- The Supabase server client (from `@/utils/supabase/server`) must be used in all server-side code. The browser client is only for UI auth state.
- `assertOrgMembership()` in `settings/actions.ts` is the canonical pattern for verifying a caller belongs to a given org. Use it any time an `orgId` is accepted as a parameter.

---

## Folder structure rules

```
src/
├── app/
│   ├── api/              — API route handlers (HTTP boundary). Auth, validation, thin orchestration only.
│   ├── [page]/
│   │   ├── page.tsx      — Page component (UI only, no business logic)
│   │   └── actions.ts    — Server actions for this page ('use server')
│   └── layout.tsx
├── components/
│   ├── ui/               — Reusable primitive components (Toast, Lightbox, etc.)
│   ├── layout/           — Shell, Navigation
│   └── [feature]/        — Feature-specific components. UI only — no direct Medusa/DB calls.
├── lib/
│   ├── medusa/           — All MedusaJS integration logic
│   │   └── utils.ts      — Shared primitives (isRecord, asString, etc.) — import from here, never redefine
│   ├── ingest/           — Product ingestion pipeline (classify → extract → generate)
│   ├── llm/              — LLM session tracking and logging
│   ├── ai/               — Image generation providers
│   └── *.ts              — Other shared utilities
├── store/
│   ├── useProductStore.ts    — Ephemeral product draft state (Zustand)
│   └── useSettingsStore.ts   — Org settings cache (Zustand)
└── utils/supabase/       — Supabase client setup (do not modify)
```

**What goes where:**
- Business logic → `src/lib/`
- Auth-gated mutations → `src/app/[page]/actions.ts` (server actions)
- HTTP endpoints → `src/app/api/`
- UI state only → `src/components/` and Zustand stores
- Never put Medusa API calls, Supabase writes, or secret decryption in a component

---

## Coding standards

### Validation
- Every server action entry point must call `Schema.parse(input)` using Zod before doing anything else.
- Every API route must parse request bodies with a Zod schema at the top of the handler.
- TypeScript types are compile-time only. Runtime validation requires Zod.

### Auth pattern (server actions)
```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) throw new Error('Unauthorized');

const { data: membership } = await supabase
  .from('organization_members')
  .select('organization_id')
  .eq('user_id', user.id)
  .eq('organization_id', orgId)  // if orgId is a parameter
  .maybeSingle();
if (!membership) throw new Error('Forbidden');
```

Or call `assertOrgMembership(supabase, orgId)` from `settings/actions.ts` — same thing.

### Auth pattern (API routes)
```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

const { data: membership } = await supabase
  .from('organization_members')
  .select('organization_id')
  .eq('user_id', user.id)
  .single();
if (!membership?.organization_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
```

### Error handling
- Use the `MedusaValidationError`, `MedusaNotFoundError`, etc. hierarchy from `src/lib/medusa/error-handler.ts` for Medusa errors.
- Server actions return typed result objects (`{ success: true, data } | { success: false, error: string }`), not thrown errors visible to the client.
- API routes return `NextResponse.json({ error })` with appropriate HTTP status codes.

### Medusa integration
- Always call `sanitizeMedusaProductPayload()` before sending any payload to Medusa (normalizes currency codes, etc.).
- Always call `validateMedusaProductPayload()` before a create or update to catch issues early.
- Use `shouldUseTwoPhase()` and `createProductTwoPhase()` for product creates (handles option ID mapping).
- For updates, use `updateProductInMedusa()` from `update-product-strategy.ts`.
- Import shared primitives (`isRecord`, `asString`, `asNumber`, `asStringArray`, `extractOptionValues`) from `src/lib/medusa/utils.ts`. Never redefine these locally.

### Secrets
- Never decrypt a secret in a component or client-side code.
- Use `loadDecryptedSettingsForServer(orgId)` only from server actions and API route handlers.
- Encrypt secrets with `encrypt()` from `src/lib/crypto.ts` before storing.
- The "blank string = keep existing, null = clear, non-empty = replace" convention for secrets is documented in `settings/actions.ts` — maintain it.

### State management
- Zustand stores own ephemeral client state only.
- Stores call server actions for persistence (never direct Supabase writes from a store).
- Do not put Medusa types or API-specific logic into stores.

---

## Security rules (non-negotiable)

1. **Secrets never reach the browser.** `loadDecryptedSettingsForServer` must only be called server-side.
2. **All external URL fetches through SSRF guard.** Use `assertSafeExternalUrl()` from `src/lib/ssrf.ts`.
3. **All writes are org-scoped.** Every INSERT/UPDATE/DELETE must include `organization_id`.
4. **Org membership must be verified** before accepting any `orgId` parameter in a server action.
5. **No raw SQL.** Use the Supabase query builder exclusively (RLS policies depend on it).
6. **Supabase migrations are immutable.** Never modify files in `supabase/migrations/`. Add new files.

---

## How to add a new feature

1. Write the server action in `src/app/[relevant-page]/actions.ts` first (or a new `actions.ts`).
2. Add any shared business logic to the appropriate `src/lib/` module.
3. If you need a new API endpoint, add a `route.ts` in `src/app/api/[group]/[endpoint]/route.ts`.
4. Build the UI component last — it should only call actions/API routes, not contain business logic.
5. If the feature touches Medusa, reuse the existing lib functions. Do not add another copy of `isRecord`.
6. Add a Supabase migration if you need a schema change (see below).
7. Add a test for the business logic (see testing expectations below).

---

## How to add a new API route

1. Create `src/app/api/[group]/[endpoint]/route.ts`.
2. Export `export const runtime = 'nodejs';` if you use Node.js APIs (crypto, Buffer, etc.).
3. Define a Zod schema for the request body at the top of the file.
4. First thing in the handler: parse the request with the schema.
5. Second thing: verify auth and resolve the org.
6. Third thing: business logic (call lib functions, not inline).
7. Return `NextResponse.json(...)` with typed responses.
8. Never return decrypted secrets in the response.

---

## How to add a Supabase migration

1. Create a new file in `supabase/migrations/` with format: `YYYYMMDDHHMMSS_describe_change.sql`.
2. Write the migration as idempotent SQL where possible (`IF NOT EXISTS`, etc.).
3. If adding new columns, update `src/lib/settings-schema.ts` (for settings) or relevant types.
4. Update `src/app/settings/actions.ts` if the new column is a secret (add to `keepOrReplaceSecret` pattern) or a non-secret (add to payload and `loadEncryptedSettings` return).
5. Test locally with `supabase db push` or apply via the Supabase dashboard.
6. Do NOT backfill data in migrations that can fail silently — use a separate script.

---

## Testing expectations

- Tests live in `tests/` and use Node.js native test runner (`node --import tsx --test tests/*.test.ts`).
- Run tests: `npm test`.
- Every new lib function with non-trivial logic should have a unit test.
- Medusa integration logic (payload building, normalization, mapping) must be tested — see `tests/medusa-*.test.ts` for patterns.
- Server actions that modify data should have at least a smoke test with mocked Supabase.
- Do not add tests that require a live Supabase connection (those are not CI-safe).
- When a bug is fixed, add a regression test before fixing it.

---

## Docs conventions

- Architecture decisions go in `docs/adr/` — these are permanent and immutable.
- Feature specs go in `docs/` or `docs/drop-it-phase/` — keep them current.
- Active work-in-progress logs go in `docs/in-progress/`.
- Superseded docs go in `docs/archived/`.
- Update `docs/progress-report.md` when completing a significant feature or refactor.
- Keep `docs/README.md` up to date as an index.
