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

### 4. Enterprise-Grade Security
- **Credential Encryption:** All API keys (OpenAI, R2) are encrypted using AES-256-GCM before being stored.
- **Server-Side Processing:** Decryption and API calls happen exclusively on the server to prevent exposure of sensitive keys to the browser.

### 5. High-Fidelity Media Pipeline
- **Smart Sync:** One-click syncing of external images to your private Cloudflare R2 bucket.
- **Tenant Isolation:** Media assets are automatically organized into tenant-specific paths.
- **Vaulting Logic:** Automated optimization for frontend gallery delivery.

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
