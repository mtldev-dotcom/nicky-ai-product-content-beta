## **1\. Refined user flows**

### **First login / onboarding**

**Goal:** make onboarding mandatory but painless, and clearly tied to value.

**Flow:**

1. **Auth → “Welcome Wizard” (full-screen, 3–5 steps max)**  
   Steps:  
   * **Org basics:** org name, default currency, default region / markets.  
   * **AI settings:**  
     * Org OpenAI key (optional if you have a global fallback)  
     * Brand voice preset (Minimalist / Luxury / Street / Custom text area).  
   * **Store integration:**  
     * Choose platform (Medusa now, Shopify “coming soon”)  
     * API credentials, test connection button  
     * On success: “Fetched Collections / Product Types” confirmation.  
   * **Storage:** R2/S3 credentials \+ “Test Upload” for a dummy image.  
   * **Languages:** choose active languages (EN/FR/...); EN is primary.  
2. **Rules:**  
   * User **cannot reach product dashboard** until “Minimum required” fields are done:  
     * Org \+ at least 1 language  
     * At least 1 AI config (org key or fallback)  
     * Either: store integration OR “I’ll sync store later” toggle.  
   * Show a **progress bar** on top: 0–100% org setup.  
   * If user leaves halfway, save partial in `organization_settings` and show a **“resume setup” banner** on dashboard.

---

### **Dashboard / homepage**

Instead of just “product table \+ create button”, make it feel like a **catalog command center**.

**Top of page:**

* Left: “Products” \+ count (e.g., `32 Products`)  
* Right: primary CTA → **“Create Product”** (opens the 3-option chooser)  
* Secondary: “Import history” (shows logs of AI/JSON/manual imports)

**Table essentials:**

Columns:

* Product thumbnail  
* Title  
* Status: `Draft / Ready / Synced / Sync Error`  
* Source: `JUST_DROP_IT / Vision Upload / JSON Import / Manual`  
* Last updated  
* Store sync state: small Medusa icon with ✅ or ⚠️

Controls:

* Filters: by status, by source, by collection  
* Search: by title, SKU  
* Bulk actions:  
  * Delete  
  * “Sync to Storefront”  
  * “Re-generate SEO only”

Row actions:

* Edit (full editor)  
* Quick actions menu (`...`): Duplicate, View raw JSON, View sync log

---

### **“Create New Product” entry flow**

You already have:

1. **Opt 1 – AI \+ images/text**  
2. **Opt 2 – Upload JSON**  
3. **Opt 3 – Manual**

I’d wrap them into a **single “Choose your starting point” page** instead of 3 random buttons:

#### **Layout**

* Title: “How do you want to create this product?”  
* Subtitle: “Start from whatever you have — our AI will normalize it into your product schema.”

Cards:

1. **JUST DROP IT (Recommended)**  
   * Description: “Paste anything: AliExpress page, CSV snippet, screenshots, product notes. We’ll parse and structure it.”  
   * Inputs: multi-drop zone for text, URLs, files.  
2. **Image \+ Text (Visual AI)**  
   * Description: “Upload 1–10 images with optional notes. We’ll infer materials, style, and details.”  
   * Inputs: image uploader \+ small text box.  
3. **JSON Import (Power users)**  
   * Description: “Upload a pre-structured JSON that matches your schema.”  
   * Inputs: file input or textarea.  
4. **Manual Build**  
   * Description: “Start from a blank template and fill it step by step.”  
   * Starts the stepper UI directly.

Also add a small line under the title:

“All paths end in the same editor and Medusa-ready JSON.”

So your whole backend just needs **one canonical product schema**; every path is about how you hydrate it.

---

## **2\. JUST DROP IT – Detailed agent spec**

### **2.1. Inputs**

Single endpoint: `POST /api/products/ingest`

Payload can contain any combination of:

{  
  "orgId": "org\_123",  
  "brandId": "default",  
  "targetLanguages": \["en", "fr"\],  
  "textBlocks": \[  
    "AliExpress description or product notes...",  
    "Extra copy pasted from supplier..."  
  \],  
  "urls": \[  
    "https://www.aliexpress.com/item/123.html"  
  \],  
  "files": \[  
    {  
      "id": "file\_1",  
      "type": "image",        // image | csv | json | pdf | other  
      "mime": "image/png",  
      "signedUrl": "https://r2.../temp/file\_1.png"  
    }  
  \]  
}

On the **frontend**, user can:

* paste raw text  
* paste a URL  
* drag & drop screenshots, CSV, JSON, etc.  
  You just normalize it to this payload before sending.

---

### **2.2. Step 1 – Input classification**

Server-side pipeline:

1. **URL detection & tagging**  
   * If URL contains `aliexpress.com`, `amazon`, etc. → mark as `source: "aliexpress" | "amazon" | "generic"`.  
   * Optionally fetch HTML (with strong SSRF \+ domain allowlist — you already have SSRF protections for media ).  
2. **File type routing**  
   * `image/*` → send to Vision model (GPT-4o-mini Vision, consistent with your stack).  
   * `text/csv` → parse into table \+ header map.  
   * `application/json` → parse & validate structure.  
   * Others → attempt OCR / text extraction if possible (screenshots, PDFs).  
3. **Text block analysis**  
   * Use a cheap text model to classify segments:  
     * Title candidates  
     * Bullet points / features  
     * Long description  
     * Specs/logistics (sizes, materials, weights, etc.)  
     * Pricing/currency indicators  
     * Detected languages

**Output example:**

{  
  "evidence": {  
    "titles": \[...\],  
    "descriptions": \[...\],  
    "features": \[...\],  
    "specs": \[...\],  
    "seoKeywords": \[...\],  
    "images": \[...\],  
    "supplierMeta": {...}  
  },  
  "detectedLanguages": \["en", "fr"\]  
}

---

### **2.3. Step 2 – Canonical “Product Blueprint” generation**

Now feed the structured **evidence** \+ org settings \+ brand voice into a higher-quality LLM call.

Define an internal schema like:

{  
  "product": {  
    "identity": {  
      "title": "Urban Chain Bracelet",  
      "subtitle": "Bold Style. Modern Edge.",  
      "handle": "urban-chain-bracelet",  
      "brand": "THE UNCUT BRAND",  
      "source": "JUST\_DROP\_IT"  
    },  
    "descriptions": {  
      "en": {  
        "short": "...",  
        "long": "...",  
        "features": \[  
          "Feature bullet 1",  
          "Feature bullet 2"  
        \],  
        "benefits": \[  
          "Benefit bullet 1"  
        \],  
        "seo": {  
          "title": "...",  
          "description": "...",  
          "keywords": \["men's bracelet", "stainless steel chain"\]  
        }  
      },  
      "fr": {  
        "short": "...",  
        "long": "...",  
        "features": \[...\],  
        "benefits": \[...\],  
        "seo": {...}  
      }  
    },  
    "taxonomy": {  
      "collectionId": "col\_...",  
      "typeId": "type\_chain",  
      "categoryIds": \["cat\_the\_wrist"\],  
      "tags": \["stainless steel", "cuban chain", "mens jewelry"\]  
    },  
    "logistics": {  
      "weight": 50,  
      "dimensions": {  
        "length": 220,  
        "width": 5,  
        "height": 3  
      },  
      "hsCode": null,  
      "originCountry": "CN"  
    },  
    "variants": \[  
      {  
        "title": "8 in / 20 cm",  
        "options": {  
          "Size": "20 cm"  
        },  
        "sku": "UNCUT-CHAIN-20",  
        "prices": {  
          "cad": 49,  
          "usd": 39  
        },  
        "inventory": {  
          "stockLocationId": "sl\_default",  
          "quantity": 25  
        }  
      }  
    \],  
    "media": {  
      "images": \[  
        {  
          "sourceUrl": "https://ae...",  
          "syncedUrl": "https://cdn.uncutbrand.com/products/...",  
          "alt": "Stainless steel cuban chain bracelet on wrist"  
        }  
      \]  
    }  
  },  
  "aiMeta": {  
    "fieldsFilledByAI": \[  
      "descriptions.fr.long",  
      "seo.en.title"  
    \],  
    "fieldsFromSource": \[  
      "logistics.weight",  
      "logistics.originCountry"  
    \]  
  }  
}

---

### **2.4. Language handling logic**

Your requirement:

If agent detects the user also added the other languages needed then agent will use it and not use ai translation.

So in the LLM instructions:

* `targetLanguages` \= org active languages.  
* For each language:  
  * If **fully present** in evidence (title \+ short \+ long) → **copy, only lightly clean**.  
  * If **partially present** → preserve existing sentences, ask AI to *expand* instead of re-writing.  
  * If **missing** → AI can translate from primary (EN) using brand voice.

Also, store:

"aiMeta": {  
  "languageSource": {  
    "en": "original",  
    "fr": "mixed",   // part original, part AI  
    "de": "translated"  
  }  
}

Then in the UI you can show a badge:

* “Original text”  
* “Partially AI-augmented”  
* “AI-translated”

---

### **2.5. Step 3 – Review UI**

After JUST DROP IT succeeds, **never create silently**.

Show a **“Review Product Blueprint”** page:

* Left: multi-step editor (Identity → Descriptions → Variants → Media → SEO)  
* Right: live JSON preview (read-only) \+ language toggle.

Highlight AI vs source:

* Use subtle coloring or badges for AI-generated vs from supplier.  
* Let user toggle: “Regenerate description” or “Improve SEO only” per language.

Primary CTAs:

* **Save as Draft** (only in your `products` table)  
* **Save & Sync to Medusa** (if org connected)  
* Optional: “Save as Template” for re-use.

---

## **3\. Optimization ideas (UX \+ LLM)**

### **3.1. LLM cost & latency**

* **Tiered models:**  
  * Cheap classifier / router model for input detection, language detection, and chunking.  
  * Mid-tier for copy writing & localization.  
* **Chunked processing:**  
  * Parse supplier HTML / CSV → internal evidence using *no* or *minimal* LLM.  
  * Only use LLM where creativity or language is needed (titles, descriptions, SEO).  
* **Caching:**  
  * Cache parsed AliExpress/Amazon HTML → `supplier_product_hash`.  
  * If user drops same URL again, reuse evidence and regenerate only the copy if they changed brand voice.

---

### **3.2. UX enhancements**

* **Empty state dashboard** for brand new org:  
  * Big card: “Start by dropping your first product” with the JUST DROP IT area right there.  
* **Inline help / templates** in JUST DROP IT:  
  * Examples under textarea:  
    * “Paste an AliExpress product page URL”  
    * “Paste supplier CSV rows”  
    * “Drop screenshots \+ product notes”  
* **Import history**  
  * Per product: show “created from JUST DROP IT at 2025-12-27” \+ number of evidence items used (2 URLs, 3 files, 1 text block).
