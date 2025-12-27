## ADR 0002: SSRF hardening for media sync

### Status
Accepted

### Context
The media pipeline supports syncing external image URLs into an organization-specific R2/S3 bucket via `/api/media/sync`.

Server-side fetching of user-provided URLs is a classic SSRF vector (e.g., `http://localhost`, cloud metadata endpoints, or internal network services). The endpoint also needs bounds to prevent large downloads or slow responses from tying up server resources.

### Decision
`/api/media/sync` enforces the following defenses:
- Only `http` and `https` schemes are allowed.
- `localhost` and **private network targets** are blocked (including DNS-resolved private IPs).
- Redirects are disallowed (prevents redirect-to-internal tricks).
- Hard limits:
  - timeout: 10 seconds
  - max download: 10 MB
  - content-type must be `image/*`
- Optional allowlist via env var:
  - `MEDIA_SYNC_ALLOWED_HOSTS="images.unsplash.com,cdn.shopify.com,.example-cdn.com"`

### Consequences
- Some sources may be blocked until allowlisted (expected for security).
- Error responses are user-facing but non-leaky (no stack traces or internal details).

### Implementation notes
- URL + DNS validation: `src/lib/ssrf.ts`
- Request validation: `src/lib/api-schemas.ts`
- Route handler: `src/app/api/media/sync/route.ts`


