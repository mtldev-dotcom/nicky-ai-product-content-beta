# AI Studio — Master Reference Photo Generation

**Feature:** Given a real product photo + a brand master reference image, Gemini generates a professional studio-quality product photo matching your brand's aesthetic.

**How it maps to your n8n flow:**
`product photo + jewelry_type + shot_type → fetch master from R2 → send both to Gemini → upload result → return URL`
The app now does all of this natively, with per-org master images stored in Supabase + R2.

---

## Prerequisites checklist

Before you can use this feature, complete these one-time setup steps in order.

---

### Step 1 — Apply the database migration

The feature requires a new table (`studio_master_references`) in Supabase.

**1a. Link the Supabase CLI to your project**

You need a personal access token from the Supabase dashboard.

1. Go to https://supabase.com/dashboard/account/tokens
2. Click **Generate new token** → give it a name → copy it
3. In this terminal, run:

```
! SUPABASE_ACCESS_TOKEN=<your-token> npx supabase link --project-ref hbvniwwzmjnfbakrfqzw
```

When prompted for **Database password**, find it at:
`Supabase dashboard → Settings → Database → Connection string` (the password segment between `:` and `@`)

**1b. Push the migration**

```
! npm run db:push
```

Expected output: `Applying migration 20260324000000_add_studio_master_references.sql`

**Verify:** Go to `Supabase dashboard → Table Editor` and confirm `studio_master_references` now exists.

---

### Step 2 — Confirm R2 public read is enabled

Gemini fetches master reference images directly by URL. The R2 URL must be publicly accessible (no auth).

1. Go to your Cloudflare R2 dashboard
2. Open the `ai-ecom` bucket
3. Confirm **Public access** is enabled (or at minimum that the domain `pub-933308a8961a4cde9368a092dfc1175b.r2.dev` is accessible)

> If you're unsure: upload a test image via the app and paste the `public_url` into a browser. If it loads, you're good.

---

### Step 3 — Upload master reference images

Master references are the style-anchor images. You need **one per setup (shot type)** that you want to use. You don't need all 10 upfront — start with the setups you use most.

**Setup → master key mapping (for reference):**

| Jewelry | Setup Title | master_key |
|---|---|---|
| Ring | Concrete Pedestal | `concrete_pedestal` |
| Ring | Matte Black Mannequin Hand | `mannequin_hand` |
| Bracelet | Concrete Wrist Form | `concrete_wrist_form` |
| Bracelet | Draped Metal Bar | `draped_metal_bar` |
| Chain | Vertical Drop Display | `vertical_drop` |
| Chain | Layered Concrete Surface | `layered_concrete_surface` |
| Pendant | Suspended Hero Shot | `suspended_hero` |
| Pendant | Resting on Concrete Block | `resting_on_block` |
| Earring | Vertical Pin Display | `vertical_pin_display` |
| Earring | Paired Flat Lay | `paired_flat_lay` |

**How to upload:**

1. Open the app and navigate to **Studio Assets** (sidebar)
2. Click the **Masters** tab
3. Click **Upload Master**
4. In the upload modal:
   - Select your master reference image file (JPG/PNG/WebP, up to 20MB)
   - Choose **Jewelry Type** from the dropdown
   - Choose **Setup (Shot Type)** — this maps to the `master_key` above
   - Optionally add a **Label** (e.g. "v1 — concrete pedestal dark")
   - Click **Upload**
5. The master appears in the grid under its jewelry type group
6. Repeat for each setup you want to enable

**Tips for good master images:**
- Use your best existing brand shot for that setup — ideally the photo that represents the ideal output
- High resolution (at least 1000px wide) produces better style transfer
- The image should clearly show the setup: background texture, lighting, prop arrangement
- No products in the master are fine — Gemini will place the product from the product photo

---

## Testing the feature

### Option A — Via API (immediate test, no UI changes needed)

The `useMasterReference` flag is already wired into the generation API. You can test with a direct API call while logged into the app.

Use the browser console on any page where you're authenticated, or use a tool like Postman/Insomnia with your session cookie.

**Minimal test payload:**

```json
POST /api/ai/studio-generate
Content-Type: application/json

{
  "productId": "<any-valid-product-uuid-from-your-org>",
  "inputImages": [
    { "id": "1", "url": "https://<your-r2-url>/path/to/product-photo.jpg" }
  ],
  "jewelryType": "ring",
  "setupId": "ring_setup_01_concrete_pedestal",
  "modelId": "none",
  "options": {
    "macro": true,
    "noFingerprints": true,
    "extraRimLight": false,
    "darkness": 70
  },
  "variants": 1,
  "provider": "gemini",
  "useMasterReference": true
}
```

**Expected success response:**
```json
{
  "generations": [
    {
      "id": "...",
      "outputImageUrl": "https://pub-933308a8961a4cde9368a092dfc1175b.r2.dev/...",
      "promptText": "You are a professional product photographer...",
      "createdAt": "..."
    }
  ]
}
```

**Expected error if master not uploaded:**
```json
{
  "error": "No master reference image found for ring / ring_setup_01_concrete_pedestal. Upload one in Studio Assets → Masters tab."
}
```

**Expected error if Gemini key not set:**
Check Settings → AI Image Provider is set to `gemini` and a Gemini API key is saved.

---

### Option B — Via existing Studio generation UI

The Studio generation UI already passes `setupId`, `jewelryType`, and other fields to the API. To test without a UI change, you can temporarily intercept the fetch call in the browser:

1. Open DevTools → Network
2. Trigger a generation from the Studio UI
3. Right-click the `/api/ai/studio-generate` request → Copy as fetch
4. Paste into console, add `"useMasterReference": true` to the body JSON, re-run

This lets you verify the full flow (including the result showing in the product's image gallery) without building a UI toggle first.

---

### What to verify end-to-end

| Check | Where to verify |
|---|---|
| Master image uploaded | Studio Assets → Masters tab |
| Migration applied | Supabase dashboard → Table Editor → `studio_master_references` |
| Generation succeeds | API response includes `outputImageUrl` |
| Output stored on product | Product editor → Images section (new image appears) |
| Generation in history | Product `data.aiStudio.generations` in Supabase |
| Prompt used | `promptText` in response starts with "You are a professional product photographer..." |

---

## How the two-image Gemini call works

When `useMasterReference: true`:

```
Request → route resolves master URL from studio_master_references table
       → buildStudioPrompt() returns style-transfer prompt (not template)
       → generateStudioImages() sends to Gemini:
           [text prompt]
           [Image 1: product photo]       ← from inputImages
           [Image 2: master reference]    ← from studioImageUrl slot
       → Gemini generates output
       → output uploaded to R2 at {userId}/ai-studio/{timestamp}-{uuid}.jpg
       → URL returned + stored in product.data.aiStudio.generations
```

The prompt explicitly labels the images so Gemini knows which is the product and which is the style anchor:

> *"Image 1 (PRODUCT PHOTO): The actual ring to be photographed. Image 2 (MASTER REFERENCE): A studio shot showing the exact setup, lighting, composition..."*

---

## Troubleshooting

**`No master reference image found`**
→ Upload a master for the exact jewelry_type + setup combination you're using.

**`R2/S3 not configured`**
→ Go to Settings → Storage and confirm R2 credentials are saved.

**`Gemini API error` or no output**
→ Check Settings → AI Image Generation → provider is `gemini`, Gemini API key is set.
→ The Gemini model `gemini-3-pro-image-preview` is required. If it's unavailable, check your API quota.

**`Migration not applied` (Supabase error)**
→ Run `npm run db:push` after linking the CLI.

**Generated image doesn't match the master style**
→ Try a higher-quality master image. The master should clearly show the setup, lighting, and background without a product in the shot (or with a very similar product). Iterate the prompt in `studioPrompt.ts` if needed.

---

## Adding the toggle to the Studio UI (next step)

The `useMasterReference` flag is API-ready but not yet exposed in the Studio generation UI. When you're ready to add it:

1. Find the Studio generation component (wherever it calls `/api/ai/studio-generate`)
2. Add a toggle checkbox: "Use master reference image"
3. Include `useMasterReference: toggleValue` in the POST body
4. Optionally show a warning if no master exists for the selected setup (call `GET /api/studio-masters` and check)

---

## 🇫🇷 Version TDAH — Guide rapide en français

> **C'est quoi cette feature ?**
> Tu donnes une photo de ton produit + une image de référence de ton style de marque → Gemini génère une photo studio professionnelle qui match ton esthétique.

---

### ✅ Setup une seule fois — dans l'ordre

**1. Appliquer la migration base de données**

```
! SUPABASE_ACCESS_TOKEN=<ton-token> npx supabase link --project-ref hbvniwwzmjnfbakrfqzw
! npm run db:push
```

- Token → https://supabase.com/dashboard/account/tokens → "Generate new token"
- Mot de passe DB → Supabase dashboard → Settings → Database → Connection string

**2. Vérifier que R2 est public**

- Ouvre `pub-933308a8961a4cde9368a092dfc1175b.r2.dev/n'importe-quelle-image` dans ton browser
- Si ça charge → ✅ OK

**3. Uploader tes images de référence**

1. Va dans **Studio Assets** (menu latéral)
2. Clique l'onglet **Masters**
3. Clique **Upload Master**
4. Choisis : type de bijou + setup (shot type) + ton image
5. Upload → répète pour chaque setup que tu utilises

---

### 🧪 Tester rapidement

Copie ça dans la console du browser (quand t'es connecté sur l'app) :

```js
fetch('/api/ai/studio-generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    productId: 'COLLE-UN-UUID-DE-PRODUIT-ICI',
    inputImages: [{ id: '1', url: 'URL-DE-TA-PHOTO-PRODUIT' }],
    jewelryType: 'ring',
    setupId: 'ring_setup_01_concrete_pedestal',
    modelId: 'none',
    options: { macro: true, noFingerprints: true, extraRimLight: false, darkness: 70 },
    variants: 1,
    provider: 'gemini',
    useMasterReference: true
  })
}).then(r => r.json()).then(console.log)
```

**Résultat attendu :** un objet `{ generations: [{ outputImageUrl: '...' }] }`

---

### ❌ Erreurs fréquentes

| Message d'erreur | Fix |
|---|---|
| `No master reference image found` | Upload une image master pour ce setup dans l'onglet Masters |
| `R2/S3 not configured` | Settings → Storage → entre les credentials R2 |
| `Unauthorized` | T'es pas connecté — recharge la page |
| Migration pas appliquée | Relance `npm run db:push` |

---

### 📍 Où trouver quoi

| Quoi | Où |
|---|---|
| Uploader/gérer les masters | Studio Assets → onglet Masters |
| Voir les images générées | Éditeur produit → section Images |
| Logs de génération | `/usage` dans l'app |
| Guide complet (anglais) | Ce document, sections du haut ☝️ |
