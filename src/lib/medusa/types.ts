/**
 * TypeScript type definitions for Medusa Admin API.
 *
 * These types match the Medusa v2 Admin API schema for products, variants, and options.
 */

/**
 * Medusa Product Option Value
 */
export interface MedusaOptionValue {
  value: string;
  value_i18n?: Record<string, string>;
}

/**
 * Medusa Product Option
 */
export interface MedusaProductOption {
  id?: string;
  title: string;
  values: string[] | MedusaOptionValue[];
}

/**
 * Medusa Variant Option (in variant.options field)
 * Format: { "option_id": "value" }
 */
export interface MedusaVariantOptions {
  [optionId: string]: string;
}

/**
 * Medusa Variant Price
 */
export interface MedusaVariantPrice {
  amount: number;
  currency_code: string;
  region_id?: string;
}

/**
 * Medusa Product Variant
 */
export interface MedusaProductVariant {
  id?: string;
  title: string;
  sku?: string;
  options?: MedusaVariantOptions;
  prices: MedusaVariantPrice[];
  manage_inventory?: boolean;
  allow_backorder?: boolean;
  // Note: inventory field is NOT included in create/update payloads
}

/**
 * Medusa Product Image
 */
export interface MedusaProductImage {
  url: string;
  metadata?: Record<string, unknown> | null;
  rank?: number;
}

/**
 * Medusa Product Tag
 */
export interface MedusaProductTag {
  value: string;
}

/**
 * Medusa Product Category
 */
export interface MedusaProductCategory {
  id: string;
}

/**
 * Medusa Sales Channel
 */
export interface MedusaSalesChannel {
  id: string;
}

/**
 * Medusa Product Metadata (i18n)
 */
export interface MedusaProductMetadata {
  brand?: string;
  vault?: {
    video?: string | null;
    images?: string[];
  };
  title_i18n?: Record<string, string>;
  subtitle_i18n?: Record<string, string>;
  description_i18n?: Record<string, string>;
  features_i18n?: Record<string, string[]>;
  keywords_i18n?: Record<string, string[]>;
  seo_title_i18n?: Record<string, string>;
  seo_description_i18n?: Record<string, string>;
  options_i18n?: Array<{
    title_i18n: Record<string, string>;
    values: Array<{
      value: string;
      value_i18n: Record<string, string>;
    }>;
  }>;
}

/**
 * Medusa Product Create/Update Payload
 */
export interface MedusaProductPayload {
  title: string;
  subtitle?: string;
  status?: 'draft' | 'published';
  external_id?: string | null;
  description?: string;
  handle?: string;
  is_giftcard?: boolean;
  discountable?: boolean;
  thumbnail?: string;
  collection_id?: string | null;
  type_id?: string | null;
  weight?: number | null;
  length?: number | null;
  height?: number | null;
  width?: number | null;
  hs_code?: string | null;
  origin_country?: string | null;
  mid_code?: string | null;
  material?: string | null;
  metadata?: MedusaProductMetadata;
  options?: MedusaProductOption[];
  variants?: MedusaProductVariant[];
  tags?: MedusaProductTag[];
  images?: MedusaProductImage[];
  categories?: MedusaProductCategory[];
  sales_channels?: MedusaSalesChannel[];
  shipping_profile_id?: string;
}

/**
 * Medusa API Response - Product
 */
export interface MedusaProductResponse {
  product: {
    id: string;
    [key: string]: unknown;
  };
}

/**
 * Medusa API Response - Variant
 */
export interface MedusaVariantResponse {
  variant: {
    id: string;
    [key: string]: unknown;
  };
}

/**
 * Medusa API Response - Option
 */
export interface MedusaOptionResponse {
  option: {
    id: string;
    [key: string]: unknown;
  };
}

/**
 * Medusa API Error Response
 */
export interface MedusaErrorResponse {
  message?: string;
  error?: string;
  errors?: Array<string | { message?: string; error?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}
