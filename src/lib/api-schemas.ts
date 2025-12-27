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


