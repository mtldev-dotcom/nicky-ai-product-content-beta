/**
 * PROMPT_LIBRARY_JSON
 *
 * IMPORTANT:
 * - This object must match the user-specified JSON exactly (keys + strings).
 * - We export it as a module so UI + server can share the same source of truth.
 */
export const PROMPT_LIBRARY_JSON = {
  "brand": {
    "name": "THE UNCUT BRAND",
    "visualStyle": "Modern industrial brutalism, matte black and charcoal concrete, high contrast, luxury product photography, no CGI look",
    "globalBase": "Professional product photography studio. Dark industrial atmosphere. Matte black and charcoal concrete environment. Subtle texture, no reflections. Soft diffused key light from the left, low fill on the right, controlled rim light for edge definition. Deep shadows, high contrast, luxury mood. Shot on full-frame camera, 85mm lens, f/4, ultra-sharp focus, 8K detail, realistic materials, no CGI look. No text, no logos, no watermark."
  },
  "jewelryTypes": ["ring", "bracelet", "chain", "pendant", "earring"],
  "setups": [
    {
      "id": "ring_setup_01_concrete_pedestal",
      "jewelryType": "ring",
      "title": "Ring — Concrete Pedestal",
      "prompt": "A single men’s ring displayed upright on a raw rectangular concrete pedestal. The concrete has sharp edges, dark charcoal tone, subtle pores and imperfections. Ring centered, minimal composition, strong vertical presence. No branding visible, no text. Professional jewelry studio lighting, ultra-realistic metal texture."
    },
    {
      "id": "ring_setup_02_mannequin_hand",
      "jewelryType": "ring",
      "title": "Ring — Matte Black Mannequin Hand",
      "prompt": "A matte black mannequin hand posed naturally with slightly bent fingers, wearing a men’s ring. Hand resting on a flat concrete slab. Minimalist composition, modern luxury aesthetic. Ring is the hero, hand fades subtly into shadow. Professional studio lighting, hyper-realistic finish."
    },

    {
      "id": "bracelet_setup_01_concrete_wrist_form",
      "jewelryType": "bracelet",
      "title": "Bracelet — Concrete Wrist Form",
      "prompt": "Men’s bracelet wrapped around a cylindrical concrete wrist display. Dark charcoal concrete, smooth but imperfect texture. Bracelet slightly angled to catch light and show depth. Minimal background, industrial luxury mood. Ultra-sharp focus on metal links."
    },
    {
      "id": "bracelet_setup_02_draped_metal_bar",
      "jewelryType": "bracelet",
      "title": "Bracelet — Draped Metal Bar",
      "prompt": "Men’s bracelet gently draped over a thin matte black metal bar. Bar suspended above a concrete base, subtle shadow underneath. Bracelet forms a natural curve, relaxed tension. Clean studio composition, premium product photography."
    },

    {
      "id": "chain_setup_01_vertical_drop",
      "jewelryType": "chain",
      "title": "Chain — Vertical Drop Display",
      "prompt": "Men’s chain hanging vertically from a hidden matte black hook. Chain perfectly centered against a dark concrete background. Natural gravity flow, clean silhouette. Focus on link structure and metal finish. High-contrast studio lighting, luxury editorial look."
    },
    {
      "id": "chain_setup_02_layered_concrete_surface",
      "jewelryType": "chain",
      "title": "Chain — Layered Concrete Surface",
      "prompt": "Men’s chain laid in a soft curve on a large concrete slab. Concrete surface slightly angled toward the camera. Chain overlaps itself naturally, creating depth and highlights. Minimalist industrial studio aesthetic."
    },

    {
      "id": "pendant_setup_01_suspended_hero",
      "jewelryType": "pendant",
      "title": "Pendant — Suspended Hero Shot",
      "prompt": "Men’s pendant hanging from a thin chain, floating in front of a dark concrete wall. Pendant centered, perfectly still, strong shadow separation. Lighting emphasizes shape and engraved details. Premium jewelry studio photography."
    },
    {
      "id": "pendant_setup_02_resting_on_block",
      "jewelryType": "pendant",
      "title": "Pendant — Resting on Concrete Block",
      "prompt": "Men’s pendant resting flat on a rectangular concrete block. Chain partially visible, softly leading out of frame. Close-up composition, shallow depth of field. Industrial luxury mood, ultra-realistic texture."
    },

    {
      "id": "earring_setup_01_vertical_pin_display",
      "jewelryType": "earring",
      "title": "Earring — Vertical Pin Display",
      "prompt": "Single men’s earring mounted on a thin matte black vertical pin. Pin anchored into a small concrete base. Minimalist composition, strong negative space. Sharp focus on metal texture."
    },
    {
      "id": "earring_setup_02_paired_flat_lay",
      "jewelryType": "earring",
      "title": "Earring — Paired Flat Lay",
      "prompt": "Pair of men’s earrings placed symmetrically on a dark concrete slab. Slight angle to create natural highlights. Clean studio flat-lay composition. High-end editorial jewelry look."
    }
  ],
  "models": [
    {
      "id": "none",
      "title": "No Model (Product Only)",
      "prompt": "No human model. Product-only studio shot."
    },
    {
      "id": "model_01_minimalist",
      "title": "Model 01 — The Minimalist",
      "prompt": "Male fashion model, late 20s to early 30s. Short buzz cut or clean fade. Light stubble beard. Neutral facial expression, calm confidence. Lean athletic build. Wearing plain black or dark charcoal t-shirt. No visible logos. Modern masculine aesthetic."
    },
    {
      "id": "model_02_rugged",
      "title": "Model 02 — The Rugged",
      "prompt": "Male fashion model, early to mid 30s. Slightly longer textured hair. Well-groomed short beard. Strong jawline, intense but relaxed gaze. Visible neck, hand, or wrist tattoos (subtle). Wearing black denim or open collar shirt. Raw masculine presence."
    },
    {
      "id": "model_03_editorial",
      "title": "Model 03 — The Editorial",
      "prompt": "Male fashion model, late 20s. Sharp facial features, clean shave or light stubble. Medium-length hair styled naturally. High-fashion editorial posture. Wearing minimal black outfit, open neckline. Luxury fashion magazine vibe."
    }
  ],
  "optionalModifiers": [
    "macro close-up, extreme detail on metal grain",
    "slight motion blur on chain ends for realism",
    "moody cinematic shadows",
    "no reflections, no fingerprints",
    "no text, no logos, no watermark"
  ],
  "finalPromptTemplate": {
    "description": "Build the final prompt by combining global base + selected setup + selected model + toggles + preserve identity rules.",
    "template": "PRESERVE JEWELRY IDENTITY: Keep the exact jewelry design from the uploaded photo (shape, engravings, link patterns, gemstone proportions). Do not alter the jewelry design. Improve realism only (lighting, shadows, contact points). {GLOBAL_BASE} {SETUP_PROMPT} {MODEL_PROMPT} {TOGGLES_AND_MODIFIERS} Output: ultra-realistic professional studio product photograph, no text, no watermark."
  }
} as const;

export type PromptLibrary = typeof PROMPT_LIBRARY_JSON;


