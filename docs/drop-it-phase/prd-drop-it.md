# **PRD — JUST DROP IT Module**

**Status:** Draft  
**Owner:** Product Architect  
**Purpose:** Allow users to paste or drop *anything* about a product and automatically generate a fully structured, store-ready product object.

---

## **1️⃣ Problem Statement**

Users often have messy, fragmented product inputs:

* Supplier pages (AliExpress, Amazon, etc.)  
* CSV rows  
* Screenshots  
* Notes  
* Partial JSONs  
* Mixed-language content

Manually organizing these into a Medusa-ready, multilingual product is slow, repetitive, and error-prone.

**JUST DROP IT** provides a universal ingestion pipeline:

*“Anything in → Normalize → Generate → Review → Save/Sync.”*

---

## **2️⃣ Goals & Non-Goals**

### **Goals**

✔ Accept multiple mixed input formats in one flow  
✔ Auto-detect structure & extract relevant product info  
✔ Generate all missing fields using AI  
✔ Respect existing languages & avoid overwriting user content  
✔ Output normalized product blueprint  
✔ Provide clear review & editing interface before saving

### **Non-Goals (for now)**

✘ Full web scraping beyond allowed domains  
✘ Auto-publishing to storefront without review  
✘ Handling video assets  
✘ Price optimization logic

---

## **3️⃣ User Stories**

### **Primary**

As a user, I want to paste any product content so the system builds a complete product for me automatically.

### **Secondary**

As a user, I want to review and adjust AI-generated fields before saving.

As a user, I want the system to preserve original language text where available.

As a user, I want visibility on which fields AI created vs sourced.

---

## **4️⃣ Inputs Supported**

User may submit any combination of:

* **Text**  
  * Supplier descriptions  
  * Product notes  
  * Bullet specs  
* **URLs**  
  * AliExpress, Amazon, or generic pages  
* **Images**  
  * Photos  
  * Screenshots (OCR \+ Vision extraction)  
* **Files**  
  * CSV  
  * JSON  
  * PDF (if text extractable)

All inputs flow to a single endpoint.

---

## **5️⃣ System Flow (High Level)**

1️⃣ **User drops content**  
2️⃣ **Classifier routes content**

* detect languages  
* detect source  
* detect content categories

3️⃣ **Extract evidence**

* specs  
* features  
* variants  
* logistics  
* media  
* pricing if present

4️⃣ **Generate canonical product blueprint**

* fill missing fields using AI  
* honor brand voice  
* compute taxonomy suggestions  
* generate SEO  
* localize languages

5️⃣ **Review UI**

* highlight AI vs original  
* allow edits  
* preview JSON

6️⃣ **Save**

* Save Draft OR  
* Save & Sync to Medusa

---

## **6️⃣ Functional Requirements**

### **FR-1 — Input Interface**

* User can paste text  
* User can paste URLs  
* User can drag-and-drop multiple files  
* User can drop mixed inputs together

**Acceptance**

* Upload supports at least: TXT / CSV / JSON / PNG / JPG / PDF  
* Multiple items handled without reload  
* Invalid file types show clear error

---

### **FR-2 — Input Classification**

System must automatically detect:

* language(s)  
* file types  
* possible supplier source (AliExpress/Amazon/etc)  
* content segments (title, bullets, specs, description, logistics)

**Acceptance**

* System tags each asset internally with type  
* Misclassified assets can still fail gracefully without stopping full process

---

### **FR-3 — Evidence Extraction**

Extract structured signals where possible:

* product titles  
* features  
* materials  
* sizes  
* logistics (weight, dimensions)  
* supplier notes  
* variant values  
* potential tags & category hints

**Acceptance**

* Evidence object is created and logged with source mapping  
* Extraction failure does not block; missing items get AI-generated later

---

### **FR-4 — Blueprint Generation**

System builds normalized internal product object including:

* Identity  
* Descriptions per language  
* Variants  
* SEO  
* Taxonomy suggestions  
* Media references  
* Logistics

**Acceptance**

* Every mandatory field has either sourced or AI value  
* All AI-generated fields flagged under `aiMeta`

---

### **FR-5 — Language Handling**

Rule:

If text exists in target language → keep it.  
If missing → AI translates.

**Acceptance**

* Mixed language supported  
* Badge indicators for:  
  * Original  
  * AI-enhanced  
  * AI-translated

---

### **FR-6 — Review & Editing UI**

User must approve before saving.

Features:

* section-based editor  
* JSON preview (read-only)  
* regenerate buttons (per-field or per-section)  
* warnings for AI-filled logistics fields

**Acceptance**

* User cannot publish without review  
* Unsaved edits are detectable and warn on exit

---

### **FR-7 — Save & Sync**

Options:

* Save as Draft (local only)  
* Save & Sync to Medusa (if connected)

**Acceptance**

* Draft persists in DB  
* Sync logs errors clearly  
* Failed sync still keeps product as Draft

---

## **7️⃣ Non-Functional Requirements**

* **Performance:** First pass response target ≤ 10–15s  
* **Resilience:** One failing asset shouldn’t fail entire pipeline  
* **Traceability:** Evidence \+ AI fields traceable  
* **Security:**  
  * Domain allowlist for URL fetch  
  * Safe parsing for CSV/JSON  
  * File scanning for uploads

---

## **8️⃣ Edge Cases**

* Only screenshots provided → Vision \+ OCR still attempts  
* CSV missing headers → ask user to map columns  
* Multiple contradictory values → ask user to choose  
* Language mismatch (EN pasted, FR selected) → translate as fallback  
* Images only, no text → AI writes full copy

---

## **9️⃣ Success Metrics**

Measure adoption, quality, and trust:

* % of products started via JUST DROP IT  
* Average time from input → ready draft  
* Reduction in manual edits  
* Sync success rate  
* User satisfaction (inline thumbs up/down per generated field)

---

## **1️⃣0️⃣ Open Questions**

* Should pricing ever be auto-generated from supplier data?  
* Should duplicate detection auto-merge similar products?  
* Should we allow automated auto-publish rules later?

---
