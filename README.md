# Product Architect

**Product Architect** is a high-fidelity e-commerce utility designed to bridge the gap between creative product ideation and rigid data schema requirements. It serves as a "command center" for product data, allowing operators to move from a simple concept to a fully localized, media-rich JSON blueprint in minutes.

![Obsidian Theme](https://img.shields.io/badge/Theme-Obsidian-indigo)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-blue)

---

## 🚀 Key Features

### 1. AI Content Generation
Interpret product concepts through an intelligent prompt bar. Powered by OpenAI's `gpt-4o-mini`, the system generates:
- Human-centric titles and punchy subtitles.
- Professional, brand-aligned descriptions.
- SEO-optimized metadata and keyword lists.

### 2. Multi-Language Localizer
A tabbed interface for 5 global languages (EN, ES, FR, DE, JA) featuring:
- **Auto-Translation**: Activating a language triggers an AI pass that localizes all product copy and attributes.
- **Root Synchronization**: Changes to English (EN) properties automatically sync with root product fields.

### 3. Media Management Pipeline
A 10X workflow for asset handling:
- **Bulk Import**: Paste a list of URLs to instantly populate your gallery.
- **Cloud Sync**: One-click "Bucket Sync" to re-upload external images to your private Cloudflare R2/S3 bucket.
- **DND Reordering**: Drag-and-drop gallery management with real-time thumbnail promotion and vaulting logic (3-6 images).
- **Health Signals**: Visual indicators (Emerald/Amber) for synced vs. external assets.

### 4. Variant & Option Architect
A robust builder for product attributes (Size, Color, Material):
- **Localized Options**: Define attribute names and values with automatic translation support.
- **Schema Mapping**: Options are structured for 1:1 compatibility with MedusaJS and headless platforms.

### 5. Smart Import & Export
- **Heuristic Import**: Upload existing JSON (Medusa, Shopify, or Custom) and watch the app map fields automatically.
- **JSON Blueprint**: A syntax-highlighted review center with real-time "Health Checks" to ensure production-ready status before export.

---

## 🛠 Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS v4 + Framer Motion
- **State**: Zustand (with persistence)
- **Icons**: Lucide React
- **AI**: OpenAI GPT-4o-mini
- **Storage**: AWS S3 SDK (Cloudflare R2 compatible)

---

## ⚙️ Environment Setup

Create a `.env.local` file in the root directory:

```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_key

# Cloudflare R2 / S3 Configuration
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET=your_bucket_name
S3_REGION=auto
S3_ENDPOINT=https://your_id.r2.cloudflarestorage.com
S3_FILE_URL=https://pub-your_id.r2.dev
```

---

## 🛠 Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server**:
   ```bash
   npm run dev
   ```

3. **Configure Settings**:
   Navigate to the **Settings** tab in-app to manage your API keys and Storage credentials (stored locally in your browser).

---

## 📐 Schema Compliance

The output JSON is strictly aligned with **THE UNCUT BRAND** internal schema, ensuring 1:1 compatibility with MedusaJS admin endpoints and custom headless frontends.

---

## 📝 Roadmap

- [ ] Clerk/NextAuth Integration for secure multi-user access.
- [ ] Bulk Image Compression before R2 upload.
- [ ] Direct "Publish to Medusa" API integration.
- [ ] Custom Prompt Engineering for varied brand tones.

---

Built by THE UNCUT BRAND.
