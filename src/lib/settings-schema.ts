import { z } from "zod";

/**
 * Settings data that is safe to return to the browser.
 * Secrets are never returned; instead we return "has*" booleans.
 *
 * Preconditions:
 * - Caller has already verified org membership (RLS or server-side checks).
 *
 * Postconditions:
 * - No plaintext credentials are present in this object.
 */
export const SettingsForClientSchema = z.object({
  // Secrets are always blank on the client
  openaiApiKey: z.literal(""),
  openrouterApiKey: z.literal(""),
  falApiKey: z.literal(""),
  geminiApiKey: z.literal(""),
  r2AccountId: z.literal(""),
  r2AccessKeyId: z.literal(""),
  r2SecretAccessKey: z.literal(""),
  medusaApiKey: z.literal(""),

  // Secret presence flags
  hasOpenaiApiKey: z.boolean(),
  hasOpenrouterApiKey: z.boolean(),
  hasFalApiKey: z.boolean(),
  hasGeminiApiKey: z.boolean(),
  hasR2AccountId: z.boolean(),
  hasR2AccessKeyId: z.boolean(),
  hasR2SecretAccessKey: z.boolean(),
  hasMedusaApiKey: z.boolean(),

  // Non-secret settings
  r2BucketName: z.string(),
  r2PublicUrl: z.string(),
  brandName: z.string(),
  brandVoice: z.string(),
  customInstructions: z.string(),
  storePlatform: z.string(),
  medusaUrl: z.string(),
  activeLanguages: z.array(z.string()),

  // AI image generation defaults (non-secrets)
  aiImageProvider: z.string(),
  aiImageModel: z.string(),

  // AI Studio Photo prompt customization (non-secrets)
  // Stored as JSON in `organization_settings` and used by both UI + server.
  aiStudioPromptLibrary: z.unknown().nullable(),
  aiStudioTogglePhrases: z
    .object({
      macro: z.string(),
      noFingerprints: z.string(),
      extraRimLight: z.string(),
    })
    .nullable(),

  // Preview page layout (non-secrets)
  previewLayout: z.unknown().nullable(),

  // Medusa defaults for new product drafts (non-secrets)
  defaultSalesChannelId: z.string().nullable(),
  defaultShippingProfileId: z.string().nullable(),
  defaultCollectionId: z.string().nullable(),
  defaultCategoryIds: z.array(z.string()),

  // Variant option presets (non-secrets)
  variantOptionPresets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      options: z.array(
        z.object({
          name: z.string(),
          values: z.array(z.string()),
        })
      ),
    })
  ).nullable(),
});

export type SettingsForClient = z.infer<typeof SettingsForClientSchema>;

/**
 * Settings payload accepted from the browser.
 *
 * Important semantics for secrets:
 * - Empty string ("") means "no change" (keep existing stored secret).
 * - Non-empty string means "replace with this new secret".
 * - Explicit clearing (null) is supported server-side, but UI may not expose it yet.
 */
export const SettingsUpdateSchema = z.object({
  // Secrets: update semantics
  openaiApiKey: z.union([z.string(), z.null()]).optional(),
  openrouterApiKey: z.union([z.string(), z.null()]).optional(),
  falApiKey: z.union([z.string(), z.null()]).optional(),
  geminiApiKey: z.union([z.string(), z.null()]).optional(),
  r2AccountId: z.union([z.string(), z.null()]).optional(),
  r2AccessKeyId: z.union([z.string(), z.null()]).optional(),
  r2SecretAccessKey: z.union([z.string(), z.null()]).optional(),
  medusaApiKey: z.union([z.string(), z.null()]).optional(),

  // Non-secrets: direct values
  r2BucketName: z.string().optional(),
  r2PublicUrl: z.string().optional(),
  brandName: z.string().optional(),
  brandVoice: z.string().optional(),
  customInstructions: z.string().optional(),
  storePlatform: z.string().optional(),
  medusaUrl: z.string().optional(),
  activeLanguages: z.array(z.string()).optional(),

  // AI image generation defaults (non-secrets)
  aiImageProvider: z.string().optional(),
  aiImageModel: z.string().optional(),

  // AI Studio Photo prompt customization (non-secrets)
  aiStudioPromptLibrary: z.unknown().nullable().optional(),
  aiStudioTogglePhrases: z
    .object({
      macro: z.string(),
      noFingerprints: z.string(),
      extraRimLight: z.string(),
    })
    .nullable()
    .optional(),

  // Preview page layout (non-secrets)
  previewLayout: z.unknown().nullable().optional(),

  // Medusa defaults (non-secrets)
  defaultSalesChannelId: z.string().nullable().optional(),
  defaultShippingProfileId: z.string().nullable().optional(),
  defaultCollectionId: z.string().nullable().optional(),
  defaultCategoryIds: z.array(z.string()).optional(),

  // Variant option presets (non-secrets)
  variantOptionPresets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      options: z.array(
        z.object({
          name: z.string(),
          values: z.array(z.string()),
        })
      ),
    })
  ).nullable().optional(),
});

export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;


