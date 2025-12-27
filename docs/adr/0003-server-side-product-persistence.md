## ADR 0003: Server-side product persistence (org-scoped writes)

### Status
Accepted

### Context
Product Architect is multi-tenant. Client-side writes to Supabase using an anon key are only safe if Row Level Security (RLS) policies are perfect and remain perfect over time.

We want the application code to enforce org scoping at the boundary as well, not only via RLS.

### Decision
All product saves are performed via a **server action** that:
- validates the authenticated user
- derives `organization_id` from `organization_members`
- writes the product under that org only (and scopes updates by `id + organization_id`)

### Consequences
- Product saving no longer relies on client-side Supabase writes.
- RLS remains important, but the blast radius of mistakes is reduced because the server code does not trust client-provided org ids.

### Implementation notes
- Server action: `src/app/products/actions.ts` (`saveProductToCloud`)
- Store integration: `src/store/useProductStore.ts` calls the server action in `saveToDb()`


