# Product Architect — App Description (Short)

This file is a short overview. The **full, authoritative documentation** is in:

- `docs/app-guide.md` (features, pages, sections, user flows, backend flows)
- `docs/audit-report.md` (codebase audit: duplicates, deadcode, issues)

## What the app does

Product Architect helps an organization generate and refine **store-ready product content** and **Medusa-oriented JSON exports** using AI.

Core modules:

- **Generate**: text + optional image → AI copy + SEO (`/api/generate`)
- **JUST DROP IT**: mixed inputs → evidence → blueprint (`/api/products/ingest`)
- **Enhance**: per-field AI improvement (`/api/enhance`)
- **Translate**: localization + option translations (`/api/translate`)
- **Media pipeline**: R2 uploads + SSRF-hardened external sync (`/api/media/presigned`, `/api/media/sync`)
- **Usage logs**: LLM sessions/calls/events (Supabase tables; UI under `/usage`)
