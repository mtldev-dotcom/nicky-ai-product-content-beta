# Product Architect: App Description (SaaS Edition)

## App Overview
Product Architect is a high-fidelity SaaS utility for e-commerce operators. It serves as a "command center" for product data, allowing organizations to move from an image or a simple concept to a fully localized, media-rich JSON object in minutes.

## Feature Breakdown

### 1. Visual & Text AI Generation
The primary entry point is an intelligent, multi-modal prompt bar.
- **AI Vision:** Upload a reference image, and the system (powered by GPT-4o-mini Vision) interprets textures, materials, and colors.
- **Contextual Input:** Combine images with text prompts to focus the AI on specific details.
- **Automated Hydration:** Generates human-centric titles, punchy subtitles, professional descriptions, and SEO metadata.

### 2. Multi-Tenant Infrastructure
- **Workspaces:** Secure organizational workspaces where team members collaborate.
- **Tenant Isolation:** Row Level Security (RLS) prevents data leakage between different organizations.
- **Cloud Persistence:** All product blueprints and settings are saved to a secure PostgreSQL database.

### 3. Brand Personality Engine
- **Voice Customization:** Define a global "Brand Voice" (e.g., Luxury, Playful, Technical).
- **Style Guidelines:** Inject custom instructions into the AI agents to ensure every generated product follows brand-specific rules (e.g., "always emphasize sustainability").

### 4. Product Details & Localization
- **Synchronized Hub:** Manage product copy, features, and SEO metadata in a centralized workspace.
- **Market Activation:** Organizations can define their supported markets (languages) in settings. The command center dynamically adapts its header and translation options to match these active locales.
- **AI Auto-Localization:** High-fidelity translation that maintains brand voice across all active markets.

### 5. Store & Catalog Integration
The app serves as a bridge between AI generation and production storefronts.
- **Direct Connectors:** Integrated support for MedusaJS, allowing for seamless synchronization of generated JSON objects to live catalogs.
- **Taxonomy Sync:** A live "Refresh" sync pulls Collections, Categories, Sales Channels, and Product Types directly from the connected Medusa backend, allowing users to map content to their actual store structure in real-time.
- **Logistics Integration:** Manage shipping weights and dimensions within the product blueprint.
- **Credential Vaulting:** Store-specific API keys and endpoints are encrypted before persistence.

### 6. Media Management Pipeline
- **R2/S3 Sync:** One-click "Cloud" icon to download external assets and re-upload them to your private organization-specific bucket.
- **Vaulting Logic:** Optimized delivery for high-performance frontend components.

### 7. Security & Settings
- **AES-256 Encryption:** Organization API keys (OpenAI, R2, Medusa) are encrypted before hitting the database.
- **Server-Only Logic:** Sensitive operations and decryption happen on the server to maintain a zero-trust frontend environment.

## Layout and Design
- **Theme:** "Obsidian" dark mode using zinc and indigo tones.
- **Glassmorphism:** Back-drop blurs and subtle borders for a high-end software-as-a-service feel.
- **Responsiveness:** A mobile-first Command Rail that adapts to sidebar or bottom-bar layout.
