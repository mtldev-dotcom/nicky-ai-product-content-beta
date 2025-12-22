# Product Architect: App Description

## App Overview
Product Architect is a high-fidelity utility for e-commerce operators. It bridges the gap between creative product ideation and rigid data schema requirements. The app serves as a "command center" for product data, allowing users to move from a simple idea to a fully localized, media-rich JSON object in minutes.

## Feature Breakdown

### 1. AI Content Generation
The primary entry point is an intelligent prompt bar. Powered by high-speed generative AI, the system interprets product concepts and generates:
- Human-centric titles and punchy subtitles.
- Professional descriptions in the brand's tone.
- SEO-optimized metadata.
- Pre-defined feature lists and keywords.

### 2. Multi-Language Localizer
A tabbed interface allows toggling between five key global languages. 
- **Synchronization**: Changing the English (EN) title or description updates the root product properties, while other languages populate the `metadata` localization object.
- **Toggle System**: Users can selectively activate translations, adding only the languages necessary for their specific market.

### 3. Media Management Pipeline
The "Media Assets" section is a 10X workflow for asset handling:
- **Bulk Import**: Paste a list of URLs to instantly populate the product gallery.
- **Device Upload**: Direct "Push to Bucket" functionality for local files.
- **Bucket Syncing**: One-click "Cloud" icon on any external URL to download and re-upload it to your private Cloudflare R2/S3 bucket, ensuring asset longevity and circumventing broken external links.
- **Primary/Thumbnail Selection**: The first image is automatically promoted to the root `thumbnail` property, with visual indicators in the editor.
- **Vaulting Logic**: Assets are intelligently mirrored into a `metadata.vault` object if the count falls within a specific range (3-6 images), optimizing for high-performance frontend gallery components.

### 4. Variant & Option Architect
A robust builder for product attributes (Size, Color, Material):
- Supports localized option titles and values.
- Dynamic addition/removal of values with real-time JSON mapping.

### 5. Settings & Security
A dedicated settings area handles the sensitive S3/R2 credentials. Data is persisted locally in the browser, ensuring the tool is ready for use across sessions without re-configuration.

## Layout and Design
- **Theme**: High-contrast "Obsidian" dark mode utilizing zinc and indigo tones.
- **Sidebar**: A mobile-first, responsive navigation rail that docks to the bottom on small screens and expands to a functional sidebar on desktop.
- **Glassmorphism**: Heavy use of backdrop blurs and subtle borders to create depth and hierarchy.
- **Interactions**: Smooth CSS transitions for language switching and section expansion, providing a software-like (SaaS) experience rather than a static website.

## Description
**Product Architect — Summary**

Product Architect is a professional AI-powered web app for e-commerce teams that turns a simple product idea into a complete, production-ready product JSON in minutes. It acts as a centralized command center that combines content creation, localization, media handling, and schema compliance into one streamlined workflow.

The app uses AI to generate brand-aligned titles, descriptions, SEO metadata, and feature lists from natural-language prompts. It supports multi-language product localization with synchronized root and metadata fields, allowing sellers to activate only the languages they need. A built-in media pipeline handles bulk image imports, direct uploads, and one-click syncing of external assets into private Cloudflare R2/S3 buckets, ensuring long-term reliability and clean data structures. Advanced logic automatically assigns thumbnails and vaults selected assets for high-performance frontend use.

Product Architect also includes a flexible variant and option builder with localized values, real-time JSON mapping, and schema validation. Designed with a modern dark, SaaS-style UI, it targets senior catalog managers and developers working with headless e-commerce platforms who need speed, accuracy, and structured data—without sacrificing creative control.
