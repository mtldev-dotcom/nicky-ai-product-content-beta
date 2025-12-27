## ADR 0001: Secrets never leave the server

### Status
Accepted

### Context
Product Architect stores organization-specific credentials (OpenAI, Cloudflare R2/S3, Medusa Admin API key) in Supabase. These are required for server-side route handlers to call external services.

Historically, it was easy to accidentally load decrypted secrets into browser state (e.g., Settings UI), which increases risk of exposure (XSS, extension leakage, logs, screenshots) and violates “server-only decryption” guarantees.

### Decision
- Secrets are **encrypted at rest** using AES-256-GCM with `ENCRYPTION_KEY` on the server.
- The browser **never receives** decrypted secrets.
- The Settings UI uses **replace semantics** for secrets:
  - Empty input means “keep existing stored secret”.
  - Non-empty input means “replace stored secret with this new value”.

### Consequences
- Users cannot “view” stored secrets in the UI after saving; they can only replace them.
- Server-side integrations must decrypt secrets at call time (route handlers / server actions only).

### Implementation notes
- `src/app/settings/actions.ts` exports:
  - `loadEncryptedSettings()` → **safe-for-client** payload (no secrets, only `has*` flags)
  - `loadDecryptedSettingsForServer()` → server-only decrypted payload
- `src/lib/settings-schema.ts` defines safe client schema and update semantics.


