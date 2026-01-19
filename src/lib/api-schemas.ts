import { z } from "zod";

/**
 * Shared Zod schemas for API route handlers.
 * Keep these small and focused; route-specific schemas can build on these.
 */

export const UrlSchema = z.string().url().max(2048);

export const MediaSyncRequestSchema = z.object({
  url: UrlSchema,
});

export type MediaSyncRequest = z.infer<typeof MediaSyncRequestSchema>;

export const MediaPresignedRequestSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  // Optional: specify if this is for ingest (allows more file types)
  forIngest: z.boolean().optional().default(false),
});

export type MediaPresignedRequest = z.infer<typeof MediaPresignedRequestSchema>;

// --- AI endpoints ---

export const LanguageCodeSchema = z.enum(["en", "es", "fr", "de", "ja"]);

export const GenerateRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(10_000).optional(),
    // Can be a data URL from file input, or an https URL (future).
    image: z.string().trim().min(1).max(8_000_000).optional(),
  })
  .refine((v) => Boolean(v.prompt) || Boolean(v.image), {
    message: "Prompt or image is required",
    path: ["prompt"],
  });

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

// --- AI Studio Photo (image-to-image) ---

export const JewelryTypeSchema = z.enum(["ring", "bracelet", "chain", "pendant", "earring"]);

export const StudioGenerateRequestSchema = z.object({
  productId: z.string().uuid(),
  inputImages: z
    .array(
      z.object({
        id: z.string().min(1),
        url: UrlSchema,
      })
    )
    .min(1),
  jewelryType: JewelryTypeSchema,
  setupId: z.string().min(1).max(200),
  modelId: z.string().min(1).max(200),
  options: z.object({
    macro: z.boolean(),
    noFingerprints: z.boolean(),
    extraRimLight: z.boolean(),
    darkness: z.number().min(0).max(100),
  }),
  variants: z.number().int().min(1).max(4).default(1),

  // Provider override (optional; server can fall back to org defaults)
  provider: z.enum(["openai", "fal", "gemini"]).optional(),
  providerModel: z.string().trim().min(1).max(200).optional(),

  // Optional: uploaded model or studio image URLs (replaces text-based model prompt)
  modelImageUrl: UrlSchema.optional(),
  studioImageUrl: UrlSchema.optional(),
  
  // Optional: custom prompt instructions when asset is selected
  customPromptInstructions: z.string().trim().max(5000).optional(),
  // Optional: ID of selected asset (for tracking/logging)
  selectedAssetId: z.string().uuid().optional(),
});

export type StudioGenerateRequest = z.infer<typeof StudioGenerateRequestSchema>;

export const EnhanceRequestSchema = z.object({
  field: z.string().min(1).max(50),
  currentValue: z.string().max(50_000).optional(),
  fieldType: z.enum([
    "title",
    "subtitle",
    "description",
    "feature",
    "metadata_title",
    "metadata_description",
    "keywords",
  ]),
  language: LanguageCodeSchema.default("en"),
});

export type EnhanceRequest = z.infer<typeof EnhanceRequestSchema>;

// Minimal schema for translate endpoint (keeps current behavior but validates shape).
export const LocalizationSchema = z.object({
  title: z.string().optional().default(""),
  subtitle: z.string().optional().default(""),
  description: z.string().optional().default(""),
  features: z.array(z.string()).optional().default([]),
  metadata_title: z.string().optional().default(""),
  metadata_description: z.string().optional().default(""),
  keywords: z.array(z.string()).optional().default([]),
});

export const TranslateRequestSchema = z.object({
  source: LocalizationSchema,
  targetLang: z.string().min(1).max(50),
  selectedLang: LanguageCodeSchema,
  options: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        translations: z.record(z.string(), z.string()).optional().default({}),
        values: z
          .array(
            z.object({
              value: z.string(),
              translations: z.record(z.string(), z.string()).optional().default({}),
            })
          )
          .optional()
          .default([]),
      })
    )
    .optional()
    .default([]),
});

export type TranslateRequest = z.infer<typeof TranslateRequestSchema>;

// --- JUST DROP IT ingest endpoint ---

export const IngestFileSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['image', 'csv', 'json', 'pdf', 'other']),
  mime: z.string().min(1),
  url: z.string().url(), // Public URL or presigned URL
});

export const IngestRequestSchema = z.object({
  orgId: z.string().uuid().optional(), // Optional - will be derived from auth
  brandId: z.string().optional(),
  targetLanguages: z.array(LanguageCodeSchema).min(1),
  textBlocks: z.array(z.string().trim().min(1).max(50_000)).default([]),
  urls: z.array(UrlSchema).default([]),
  files: z.array(IngestFileSchema).default([]),
}).refine(
  (data) => data.textBlocks.length > 0 || data.urls.length > 0 || data.files.length > 0,
  {
    message: 'At least one input (textBlocks, urls, or files) is required',
    path: ['textBlocks'],
  }
);

export type IngestRequest = z.infer<typeof IngestRequestSchema>;
export type IngestFile = z.infer<typeof IngestFileSchema>;

export const IngestResponseSchema = z.object({
  sessionId: z.string().uuid(),
  blueprint: z.any(), // ProductBlueprint - complex type, validated separately
  evidence: z.any(), // Evidence - complex type, validated separately
});

export type IngestResponse = z.infer<typeof IngestResponseSchema>;

// --- Studio Assets (model/studio photo library) ---

export const StudioAssetUploadSchema = z.object({
  type: z.enum(['model', 'studio']),
  name: z.string().min(1).max(100),
  tags: z.array(z.string().max(50)).optional(),
  description: z.string().max(500).optional(),
});

export type StudioAssetUpload = z.infer<typeof StudioAssetUploadSchema>;

export const StudioAssetListQuerySchema = z.object({
  type: z.enum(['model', 'studio']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  search: z.string().max(200).optional(),
});

export type StudioAssetListQuery = z.infer<typeof StudioAssetListQuerySchema>;


