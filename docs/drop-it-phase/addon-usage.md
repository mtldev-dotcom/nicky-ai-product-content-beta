## **🔎 ADD THIS TO THE PLAN — USAGE & LLM LOGGING**

Before (and while) building JUST DROP IT, add a full **usage \+ LLM logging system**.  
Everything must persist in **Supabase** and be visible in a **Usage page**.

---

### **🎯 Goals**

For every JUST DROP IT run:

We must store and later display:

* who ran it (org \+ user)  
* what happened (pipeline steps & events)  
* what the AI did  
* which models were used  
* prompts (safe / redacted if needed)  
* inputs summary  
* outputs summary  
* tokens in / tokens out  
* estimated cost (if possible)  
* errors if they happened

And show all of this in the UI.

---

## **1️⃣ Database (Supabase)**

Create tables (names can adapt to current conventions):

### **`llm_sessions`**

Represents ONE full run of JUST DROP IT.

Fields:

* id (uuid, pk)  
* org\_id  
* user\_id  
* module (text, e.g. `"JUST_DROP_IT"`)  
* status (`pending | success | error | partial`)  
* started\_at (timestamp)  
* completed\_at (timestamp, nullable)

Content fields:

* input\_summary (text) — short, safe  
* evidence\_summary (text, nullable)  
* blueprint\_summary (text, nullable)

Metrics:

* total\_tokens\_prompt (int)  
* total\_tokens\_completion (int)  
* total\_cost\_estimate (numeric, nullable)

Errors:

* error\_message (text, nullable)

---

### **`llm_calls`**

Represents ONE LLM call made inside the pipeline.

Fields:

* id (uuid, pk)  
* session\_id (fk → llm\_sessions.id)  
* step (text) — e.g. `"classification"`, `"blueprint_generation"`  
* model (text)  
* prompt\_preview (text) — truncated, redacted  
* prompt\_full (text, nullable, optional truncate)  
* response\_preview (text, nullable)  
* tokens\_prompt (int)  
* tokens\_completion (int)  
* created\_at (timestamp)

---

### **(Optional, but preferred) `pipeline_events`**

High-level pipeline breadcrumbs.

Fields:

* id (uuid, pk)  
* session\_id (fk)  
* event\_type (text)  
  examples: `"INGEST_RECEIVED"`, `"EVIDENCE_EXTRACTED"`, `"BLUEPRINT_BUILT"`, `"SYNC_SUCCESS"`  
* payload\_preview (text)  
* created\_at (timestamp)

Never store API keys or raw secrets. Truncate large payloads.

---

## **2️⃣ LLM Wrapper**

Create a small wrapper around ALL LLM calls.

Signature idea:

async function callLLMWithLogging({  
  sessionId,  
  step,  
  model,  
  messages  
}) { ... }

Responsibilities:

* run the model  
* capture usage tokens  
* insert into `llm_calls`  
* update running totals in `llm_sessions`  
* safely truncate prompts \+ outputs

**Every step in JUST DROP IT must call this wrapper — not the raw LLM client.**

Errors in logging must NOT break the pipeline.

---

## **3️⃣ Session Lifecycle**

When user clicks **Generate**:

1. create `llm_sessions` row → status `pending`  
2. store short `input_summary`  
3. run pipeline  
4. log events \+ LLM calls along the way  
5. on success:  
   * update status `success`  
   * set `completed_at`  
   * store summaries \+ totals  
6. on error:  
   * update status `error`  
   * store short `error_message`

---

## **4️⃣ Usage UI**

Add a **Usage page** (location consistent with app navigation).

### **Usage List**

Table of sessions:

* date  
* module  
* status  
* total tokens  
* cost (if available)  
* input summary

Filters:

* date range  
* module  
* status

Click row → details.

---

### **Session Detail**

Show:

**Header**

* org, user  
* status  
* totals  
* timestamps

**Input**

* input summary

**Pipeline timeline**  
(using pipeline\_events)

**LLM calls table**

* step  
* model  
* tokens in/out  
* expand row → prompt/response previews

**Result**

* blueprint summary

Make sure sensitive info is redacted.

---

## **5️⃣ Requirements (Important)**

* Logging must not slow the app noticeably.  
* Failed logs should NOT crash product generation.  
* Follow existing Supabase patterns.  
* Reuse auth \+ tenant permissions.  
* Make it easy to extend logging to other features later.
