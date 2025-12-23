# Product Architect — AI-Powered E-commerce Content (SaaS Edition)

Product Architect is a professional, multi-tenant SaaS utility for e-commerce operators. It bridges the gap between creative product ideation and rigid data schema requirements, allowing users to move from an image or a simple concept to a fully localized, media-rich JSON object in minutes.

## 🚀 Key Features

### 1. Visual Product Orchestration (AI Vision)
The "command center" now supports image-based input. Upload a product photo, and our AI (powered by GPT-4o-mini Vision) will analyze materials, textures, colors, and design elements to hydrate your product blueprint.

### 2. Multi-Tenant SaaS Infrastructure
- **Secure Auth:** Powered by Supabase, with organizational workspaces.
- **Data Isolation:** PostgreSQL Row Level Security (RLS) ensures your catalog data is visible only to your team.
- **Cloud Sync:** Every generation, import, and setting change is persisted to the cloud in real-time.

### 3. Brand Personality Engine
Align your AI agents with your organization's unique identity. Configure Brand Name, Voice (Minimalist, Luxury, etc.), and custom style instructions that are dynamically applied to all copy generation and translations.

### 4. Product Details & Localization
Align your product data across global markets. 
- **Active Market Filtering:** Configure supported languages (English, Spanish, French, German, Japanese) at the organization level to reduce UI clutter.
- **AI Translation:** Manage high-fidelity copy, features, and SEO metadata with automated AI translation that respects your brand's unique voice.

### 5. Store Integration & Sync
Directly connect your product orchestration pipeline to your storefront. 
- **Platform Selection:** Support for MedusaJS (with Shopify and others in development).
- **Encrypted Credentials:** Store URLs and Admin API keys are vaulted using enterprise-grade encryption.
- **Live Taxonomy Sync:** Real-time fetching of Collections, Product Categories, Sales Channels, and Product Types directly from your MedusaJS backend.
- **Logistics Baseline:** Define default shipping weights and dimensions to streamline the catalog entry process.

### 6. Enterprise-Grade Security
- **Credential Encryption:** All API keys (OpenAI, R2, Medusa) are encrypted using AES-256-GCM before being stored.
- **Server-Side Processing:** Decryption and API calls happen exclusively on the server to prevent exposure of sensitive keys to the browser.

### 7. Smart Variant Architecting
- **Default State:** New products automatically initialize with a standard "Default option" to ensure compatibility with modern headless commerce schemas.
- **Multi-Attribute Support:** Build complex option sets (Size, Color, Material) with multi-language value translations.

## 🛠️ Technical Stack

- **Frontend:** Next.js 15 (App Router) + Tailwind CSS v4
- **State:** Zustand (with Supabase persistence)
- **Backend:** Supabase (Auth, Postgres, RLS)
- **AI:** OpenAI GPT-4o-mini (Vision & Chat)
- **Storage:** Cloudflare R2 / AWS S3
- **Security:** AES-256-GCM Encryption

## 🏁 Getting Started

1. **Environment Setup:**
   Create a `.env.local` file with the following:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ENCRYPTION_KEY=... # 64-character hex string
   ```

2. **Database Setup:**
   Run the SQL migrations provided in `src/utils/supabase/` or use the Supabase CLI.

3. **Install & Run:**
   ```bash
   npm install
   npm run dev
   ```

---
Developed for high-fidelity e-commerce catalog orchestration.
