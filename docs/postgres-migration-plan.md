# PostgreSQL Migration Plan

This document defines the recommended path to replace the current Supabase-coupled persistence layer with a normal PostgreSQL-backed application stack.

## Scope

The current app uses Supabase for three separate concerns:

1. Authentication and session cookies
2. PostgREST-style data access in server and client code
3. PostgreSQL storage, RLS, and migrations

Because those concerns are entangled, a clean migration cannot be treated as a database-driver swap.

## Current target architecture

The codebase now has the first explicit seam for the migration:

- `src/lib/auth/auth-context.ts`
- `src/lib/data/settings-repository.ts`
- `src/lib/data/usage-repository.ts`
- `src/app/api/org/context/route.ts`
- `src/app/api/usage/sessions/**`

These modules define the direction of travel:

- UI reads org context through a server-owned API boundary
- UI usage pages read data through app APIs instead of direct browser Supabase queries
- settings loading/decryption flows can be moved behind repositories instead of being bound to PostgREST calls

## Migration phases

### Phase 1: Doc and schema audit

- Reconstruct the real baseline schema for:
  - `organizations`
  - `organization_members`
  - `organization_settings`
  - `products`
  - `llm_sessions`
  - `llm_calls`
  - `pipeline_events`
  - `studio_assets`
  - `studio_master_references`
- Stop relying on implicit Supabase-managed schema that is not fully captured in repo migrations.
- Produce repo-owned SQL migrations for a plain PostgreSQL database.

### Phase 2: Auth abstraction

- Move all auth and org-resolution logic behind `src/lib/auth/*`.
- Replace inline patterns such as:
  - `supabase.auth.getUser()`
  - direct `organization_members` lookup in client pages
- Provide canonical helpers:
  - `requireAuthenticatedUser()`
  - `requireCurrentOrgContext()`
  - `requireOrgMembership()`

### Phase 3: DB abstraction

- Move data access into repositories under `src/lib/data/*`.
- Repository coverage should expand in this order:
  - settings
  - usage/logging
  - products
  - studio assets
  - studio masters
- Server actions and route handlers should depend on repositories, not raw `.from(...).select(...)` chains.

### Phase 4: Remove client-side Supabase queries

- Browser pages must stop querying Supabase directly.
- Client components should only:
  - call server actions
  - call authenticated route handlers
  - read Zustand state

Priority pages:

1. dashboard `/`
2. create `/create`
3. product details `/product-details`
4. settings `/settings`
5. preview `/preview`
6. usage `/usage`

### Phase 5: Plain PostgreSQL schema and migrations

- Replace Supabase CLI migration dependency with normal PostgreSQL migrations.
- Keep the same org-scoped data model.
- Preserve JSONB usage where it is already pragmatic:
  - product draft payloads
  - prompt library customization
  - preview layout
  - variant option presets

### Phase 6: Data migration

- Export users, organizations, memberships, settings, products, and logging data.
- Preserve encrypted secret values as-is where possible.
- Validate:
  - row counts
  - foreign-key integrity
  - org ownership
  - product/template flags
  - logging session linkage

### Phase 7: Auth and session replacement

Replace Supabase Auth with an app-owned auth solution.

Required parity:

- login
- signup
- signout
- email confirmation
- session refresh
- middleware/proxy route protection
- onboarding redirect logic

## Non-negotiable invariants

- Secrets never reach the browser.
- All writes remain org-scoped.
- Org membership is verified server-side before accepting any `orgId`.
- SSRF checks remain enforced for external fetches.
- Product persistence stays server-owned.

## Success criteria

The migration is only complete when:

- no client page imports `@/utils/supabase/client`
- no server logic outside the compatibility boundary depends on PostgREST semantics
- production migrations are fully repo-owned
- build, lint, and tests pass without Supabase-specific runtime requirements for core app behavior
