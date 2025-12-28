# Product Architect — AI-Powered E-commerce Content (SaaS Edition)

Product Architect is a professional, multi-tenant SaaS utility for e-commerce operators. It bridges the gap between creative product ideation and rigid data schema requirements, allowing users to move from an image or a simple concept to a fully localized, media-rich JSON object in minutes.

## Documentation

- `docs/README.md` — documentation index
- `docs/app-guide.md` — full app guide (features, pages, user flows, backend flows)
- `docs/audit-report.md` — codebase audit report (duplicates, dead files, issues, recommendations)

## Key Features

### 1. Visual Product Orchestration (AI Vision)
The "command center" now supports image-based input. Upload a product photo, and our AI (powered by GPT-4o-mini Vision) will analyze materials, textures, colors, and design elements to hydrate your product blueprint.

### 2. Multi-Tenant SaaS Infrastructure
- **Secure Auth:** Powered by Supabase, with organizational workspaces.
- **Data Isolation:** PostgreSQL Row Level Security (RLS) ensures your catalog data is visible only to your team.
- **Cloud Sync:** Settings and product blueprints can be persisted to Supabase (server-side writes for products; settings are stored encrypted-at-rest).

### 3. Brand Personality Engine
Align your AI agents with your organization's unique identity. Configure Brand Name, Voice (Minimalist, Luxury, etc.), and custom style instructions that are dynamically applied to all copy generation and translations.

### 4. Product Details & Localization
Align your product data across global markets. 
- **Active Market Filtering:** Configure supported languages (English, Spanish, French, German, Japanese) at the organization level to reduce UI clutter.
- **AI Translation:** Manage high-fidelity copy, features, and SEO metadata with automated AI translation that respects your brand's unique voice.

### 5. Store Integration & Sync
Directly connect your product orchestration pipeline to your storefront. 
- **Platform Selection:** Support for MedusaJS (with Shopify and others in development).
- **Encrypted Credentials:** Store API keys are encrypted at rest with AES-256-GCM.
- **Live Taxonomy Sync:** Real-time fetching of Collections, Product Categories, Sales Channels, and Product Types directly from your MedusaJS backend.
- **Logistics Baseline:** Define default shipping weights and dimensions to streamline the catalog entry process.

### 6. Enterprise-Grade Security
- **Credential Encryption:** All API keys (OpenAI, R2, Medusa) are encrypted using AES-256-GCM before being stored.
- **Server-Side Processing:** Decryption and API calls happen on the server. The Settings UI never loads plaintext secrets back into the browser once saved.
- **SSRF Protections:** The media sync endpoint validates URLs, blocks private networks, disallows redirects, and enforces size/time limits.

### 7. Smart Variant Architecting
- **Recursive Generation:** Automatically generate the Cartesian product of all attributes (e.g., Color x Size x Material).
- **Multi-Currency Pricing:** Define specific price points for every active currency in your MedusaJS store using major currency units (decimals).
- **Collision Resistance:** Automated SKU and Title generation logic incorporates product identity to prevent global data conflicts.
- **Inventory Readiness:** Map stock levels to specific MedusaJS Stock Locations.
- **Quick Add:** One-click "Default Variant" setup for rapid catalog prototyping.

## Technical Stack

- **Frontend:** Next.js 16 (App Router) + Tailwind CSS v4
- **State:** Zustand
- **Backend:** Supabase (Auth, Postgres, RLS)
- **AI:** OpenAI GPT-4o-mini (Vision & Chat)
- **Storage:** Cloudflare R2 / AWS S3
- **Security:** AES-256-GCM Encryption

## Getting Started

### 1) Environment Setup
Create a `.env.local` file with at minimum:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ENCRYPTION_KEY=... # 64-character hex string (32 bytes), hex encoded
```

Optional (fallbacks if org-level settings are not configured):

```bash
# Used by /api/generate, /api/enhance, /api/translate if org OpenAI key not set
OPENAI_API_KEY=...

# Used by /api/media/presigned and /api/media/sync if org R2 credentials not set
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_ACCOUNT_ID=...        # Cloudflare R2 Account ID
S3_BUCKET=...
S3_FILE_URL=...          # Public base URL where bucket objects are served

# Used only in the browser UI to detect "synced" images (optional)
NEXT_PUBLIC_S3_FILE_URL=...

# Optional: comma-separated allowlist of hosts that /api/media/sync may fetch from.
# Examples: "images.unsplash.com,cdn.shopify.com,.example-cdn.com"
MEDIA_SYNC_ALLOWED_HOSTS=
```

### 2) Database Setup (Supabase)
This repo assumes the following tables exist (names referenced in code):
- `organizations`
- `organization_members`
- `organization_settings`
- `products`

RLS policies must enforce organization scoping. (Schema/migrations are not bundled in `src/utils/supabase/`.)

### 3) Install & Run

```bash
npm install
npm run dev
```

### Production build

```bash
npm run build
npm run start
```

---
Developed for high-fidelity e-commerce catalog orchestration.
