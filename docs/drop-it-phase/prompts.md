**PROMPT FOR CURSOR PLANNER**

You are a senior full-stack TypeScript engineer working inside my existing app in this repository.  
Your job: **design, implement, and wire up the “JUST DROP IT” module** according to the PRD below, using the existing architecture and best practices in this codebase.

---

## **🔧 High-Level Context**

We are building an internal tool (Product Architect style) for e-commerce operators that turns messy product input into a clean, store-ready product object (Medusa-compatible, but don’t hardcode Medusa where not necessary).

The new feature: **JUST DROP IT**

“Anything in → Normalize → Generate → Review → Save/Sync.”

Users can paste or drop **mixed content** (text, URLs, CSV, JSON, screenshots, etc.) and the app will:

1. Ingest and classify inputs  
2. Extract structured “evidence” (titles, specs, variants, logistics, etc.)  
3. Use LLM(s) to produce a **canonical product blueprint**  
4. Respect multi-language rules (don’t overwrite user-provided language content)  
5. Let the user review/edit before saving & syncing

---

## **📋 Your Mission**

1. **Understand the existing codebase**  
   * Detect:  
     * API layer (Next.js API routes / tRPC / REST controllers / etc.)  
     * Current product model / types  
     * Any existing “AI” or “ingest” utilities or services  
     * Any Medusa or external API client  
   * **Do NOT assume new frameworks**; follow current patterns.  
2. **Design and implement the JUST DROP IT module** end-to-end:  
   * Frontend UI (drop zone / uploader / review screen)  
   * Backend API for ingestion, classification, evidence extraction, blueprint generation  
   * Type-safe models for “Evidence” and “ProductBlueprint”  
   * Integration with existing product persistence \+ Medusa sync (if present)  
3. Keep changes incremental and safe:  
   * Small, coherent diffs  
   * Reuse existing utilities and patterns  
   * Add tests and docs where appropriate

---

## **🧱 Functional Requirements (from PRD)**

Treat these as **requirements \+ acceptance criteria**.  
Implement them carefully.

### **FR-1 — Input Interface (Frontend)**

**Goal:** A new “JUST DROP IT” entry flow on the “Create Product” page.

Requirements:

* New **entry option/card** in the “Create Product” flow:  
  * Label: “JUST DROP IT”  
  * Description: “Paste anything: AliExpress page, CSV snippet, screenshots, product notes, etc.”  
* Inside this flow:  
  * Text input area for:  
    * Arbitrary text blocks (supplier descriptions, notes, etc.)  
    * URLs (AliExpress, Amazon, generic URLs)  
  * Drag-and-drop zone supporting multiple files:  
    * At least: `.txt`, `.csv`, `.json`, `.png`, `.jpg`, `.jpeg`, `.pdf`  
  * Allow combining:  
    * Text \+ URLs \+ files in one request  
* Show a small “examples” helper below the input like:  
  * AliExpress URL  
  * CSV rows  
  * Supplier long description

**Acceptance:**

* User can add multiple items (text blocks \+ URLs \+ files) before clicking “Generate”.  
* Unsupported file types show a clear, non-blocking error (e.g., toast or inline).  
* Nothing is sent to backend until user explicitly triggers “Generate product draft”.

---

### **FR-2 — Backend Ingest Endpoint**

Create a backend endpoint, e.g.:

* `POST /api/products/ingest` (or equivalent route in this repo)

Request body should normalize the frontend payload into something like:

type IngestRequest \= {  
  orgId: string;  
  brandId?: string;  
  targetLanguages: string\[\]; // e.g. \['en', 'fr'\]  
  textBlocks: string\[\];      // free-form text segments  
  urls: string\[\];            // supplier URLs, etc.  
  files: {  
    id: string;  
    type: 'image' | 'csv' | 'json' | 'pdf' | 'other';  
    mime: string;  
    // use existing file upload logic in the codebase; if we have signed URLs, reuse that  
    url: string;  
  }\[\];  
};

**Tasks:**

* Parse and validate the request (Zod or equivalent).  
* Enforce org/user permissions using existing auth/tenant pattern.  
* Return structured result or detailed error with helpful message.

**Acceptance:**

* Invalid payload returns 4xx with structured error.  
* Unauthorized org/user returns 401/403 as appropriate.  
* Endpoint wired to the frontend JUST DROP IT form.

---

### **FR-3 — Input Classification & Evidence Extraction**

**Goal:** Transform messy inputs → structured “evidence” object.

Responsibilities:

1. **Classification**  
   * For each asset:  
     * Determine language(s)  
     * Determine type and subtype:  
       * `text`, `url`, `csv`, `json`, `image`, `pdf`  
     * For URLs, detect domain category (e.g. AliExpress, Amazon, other)  
   * Use:  
     * Lightweight LLM or existing utilities for language detection and coarse classification.  
     * Basic heuristics for domain detection.  
2. **Evidence extraction**  
   * Extract “signals” into an `Evidence` structure:  
     * Candidate titles  
     * Long descriptions  
     * Bullet lists / features / benefits  
     * Specs/logistics (materials, dimensions, weight, origin, etc.)  
     * Variant information (sizes, colors, lengths, etc.)  
     * Pricing and currency if provided  
     * Candidate category/taxonomy hints  
     * Source mapping (where each piece came from)

Use a type like:

type Evidence \= {  
  titles: { text: string; lang: string; source: string }\[\];  
  descriptions: { text: string; lang: string; source: string }\[\];  
  features: { text: string; lang: string; source: string }\[\];  
  benefits: { text: string; lang: string; source: string }\[\];  
  specs: Record\<string, { value: string; unit?: string; source: string }\>;  
  logistics: {  
    weight?: { value: number; unit: string; source: string };  
    dimensions?: { length?: number; width?: number; height?: number; unit: string; source: string };  
    originCountry?: { value: string; source: string };  
  };  
  variants: {  
    raw: string\[\];  
    parsed?: {  
      name: string;  
      values: string\[\];  
    }\[\];  
  };  
  seoKeywords: string\[\];  
  languagesDetected: string\[\];  
  media: {  
    images: { url: string; source: string }\[\];  
  };  
  supplierMeta?: {  
    url?: string;  
    platform?: 'aliexpress' | 'amazon' | 'other';  
  };  
};

**Acceptance:**

* Evidence object is always returned, even if partially filled.  
* Classification step fails gracefully (e.g., one file can fail without crashing the whole pipeline).  
* Evidence is logged or traceable for debugging (in a safe, non-sensitive way, e.g. internal logs).

---

### **FR-4 — Product Blueprint Generation (LLM-Orchestrated)**

**Goal:** Convert `Evidence` \+ org settings \+ target languages → canonical `ProductBlueprint`.

Design:

type ProductBlueprint \= {  
  product: {  
    identity: {  
      title: string;  
      subtitle: string;  
      handle: string;  
      brand: string;  
      source: 'JUST\_DROP\_IT';  
    };  
    descriptions: {  
      \[lang: string\]: {  
        short: string;  
        long: string;  
        features: string\[\];  
        benefits: string\[\];  
        seo: {  
          title: string;  
          description: string;  
          keywords: string\[\];  
        };  
      };  
    };  
    taxonomy: {  
      collectionId?: string | null;  
      typeId?: string | null;  
      categoryIds: string\[\];  
      tags: string\[\];  
    };  
    logistics: {  
      weight?: number | null;  
      dimensions?: {  
        length?: number | null;  
        width?: number | null;  
        height?: number | null;  
      };  
      hsCode?: string | null;  
      originCountry?: string | null;  
    };  
    variants: {  
      title: string;  
      options: Record\<string, string\>; // e.g. { Size: '20 cm' }  
      sku?: string;  
      prices: Record\<string, number\>;  // currency\_code \-\> amount  
      inventory?: {  
        stockLocationId?: string;  
        quantity?: number;  
      };  
    }\[\];  
    media: {  
      images: {  
        sourceUrl: string;  
        syncedUrl?: string;  
        alt: string;  
      }\[\];  
    };  
  };  
  aiMeta: {  
    fieldsFilledByAI: string\[\];      // e.g. \['descriptions.fr.long'\]  
    fieldsFromSource: string\[\];      // e.g. \['logistics.weight'\]  
    languageSource: {  
      \[lang: string\]: 'original' | 'mixed' | 'translated';  
    };  
  };  
};

Rules:

* Use org brand voice and tone if available.  
* Generate:  
  * Title, subtitle, handle  
  * Long \+ short descriptions  
  * Features, benefits  
  * SEO title, description, keywords  
  * Suggested taxonomy (collections, categories, tags) from evidence  
  * Variants inferred from specs when possible  
* If logistics or any field is missing but inferrable, the LLM may suggest defaults but they must be clearly flagged as AI-generated in `aiMeta`.

**Multi-language logic** (critical):

* `targetLanguages` comes from org settings/user selection.  
* For each language:  
  * If **complete text exists** in evidence for that language (title \+ short \+ long), **preserve original** (light clean-up allowed, no full rewrite).  
  * If **partial text exists**, preserve original pieces and ask AI to expand/complement, marking it as `mixed`.  
  * If **missing**, AI generates translation from primary language (usually EN) and brand voice → mark as `translated`.

**Acceptance:**

* Resulting `ProductBlueprint` always has all mandatory identity \+ at least one language fully filled.  
* `aiMeta.languageSource` correctly reflects original/mixed/translated for each language.  
* `aiMeta.fieldsFilledByAI` and `fieldsFromSource` are correctly populated.

---

### **FR-5 — Review & Editing UI**

**Goal:** Allow user to adjust blueprint before saving/syncing.

UI requirements:

* When backend returns `ProductBlueprint`, navigate user to a **Review Product** screen.  
* Layout suggestion (adapt to existing design system):  
  * Left: Stepper or tabs for:  
    * Identity  
    * Descriptions (with language switcher)  
    * Variants  
    * Media  
    * SEO  
  * Right: read-only JSON preview of `ProductBlueprint` (collapsible).  
* Visual cues:  
  * Mark fields that are AI-generated vs source-based (e.g., small “AI” pill vs “Source”).  
  * For logistics fields that were generated, show subtle warning like “AI-suggested – verify before publishing”.  
* Controls:  
  * Per-section “Regenerate \[this section\]” action (e.g., regenerate FR description only).  
  * Save edits in local form state before sending back.  
  * Warn user if leaving page with unsaved changes.

**Acceptance:**

* User can edit all key fields before saving.  
* JSON preview updates on change.  
* Navigation away with unsaved changes triggers confirmation.  
* Regeneration only affects targeted fields/sections.

---

### **FR-6 — Save & Sync**

Actions available from Review screen:

1. **Save as Draft**  
   * Persist blueprint as a product draft in existing product storage (reusing existing models).  
   * Mark source as `JUST_DROP_IT`.  
2. **Save & Sync**  
   * Save draft and trigger sync to Medusa (or current commerce backend).  
   * If sync error occurs:  
     * Show concise, readable error message.  
     * Keep product stored as Draft with sync status `error`.

**Acceptance:**

* Drafts are visible in the main product list with:  
  * Source: JUST\_DROP\_IT  
  * Status: Draft / Sync error  
* Sync success and error states clearly displayed.  
* Sync failure does not lose user data.

---

### **FR-7 — Non-Functional Requirements**

* Target end-to-end generation time: **\<= 10–15 seconds**, when possible.  
* Pipeline must be resilient:  
  * One failing file or URL should not crash entire ingest.  
* Log enough detail for debugging:  
  * Without logging any secrets or sensitive credentials.  
* Follow existing error-handling, logging, and telemetry patterns in this codebase.

---

## **🧪 Testing & QA**

* Add unit tests for:  
  * Input validation & parsing  
  * Evidence extraction utility functions  
  * Multi-language merge logic (`original` vs `mixed` vs `translated`)  
* Add integration tests (or e2e if supported) for:  
  * Successful ingest → blueprint → save draft  
  * Mixed files/text → partial evidence → still working blueprint  
  * Sync success and sync error flows

---

## **📚 Documentation**

* Update or create:  
  * `docs/just-drop-it.md` describing:  
    * API contract  
    * Example payloads  
    * Example responses  
  * Add a brief section to the main README or product docs:  
    * “How to use JUST DROP IT”

---

## **🔁 How I Want You (Cursor Planner) To Work**

1. Analyze the existing repo structure and find:  
   * API layer  
   * Product model  
   * Any existing AI integrations  
   * Any existing product creation/editor UI  
2. Propose a **step-by-step implementation plan**:  
   * Backend ingest API  
   * Evidence extraction utilities  
   * LLM orchestration and blueprint builder  
   * Frontend JUST DROP IT flow  
   * Review screen and save/sync wiring  
   * Tests \+ docs  
3. Execute the plan in **small, incremental steps**:  
   * Keep diffs minimal and coherent.  
   * Reuse conventions already used in the project.  
4. As you code:  
   * Add clear comments where logic is non-obvious.  
   * Keep types strict and explicit (TypeScript).  
   * Prefer pure, testable functions for parsing/extraction logic.
