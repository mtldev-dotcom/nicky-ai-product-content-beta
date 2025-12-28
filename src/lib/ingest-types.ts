/**
 * Type definitions for JUST DROP IT ingestion pipeline.
 * 
 * These types define the Evidence extraction and ProductBlueprint structures
 * as specified in the PRD.
 */

/**
 * Evidence extracted from raw inputs.
 * This is the structured output from the extraction phase.
 */
export interface Evidence {
  titles: Array<{ text: string; lang: string; source: string }>;
  descriptions: Array<{ text: string; lang: string; source: string }>;
  features: Array<{ text: string; lang: string; source: string }>;
  benefits: Array<{ text: string; lang: string; source: string }>;
  specs: Record<string, { value: string; unit?: string; source: string }>;
  logistics: {
    weight?: { value: number; unit: string; source: string };
    dimensions?: {
      length?: number;
      width?: number;
      height?: number;
      unit: string;
      source: string;
    };
    originCountry?: { value: string; source: string };
  };
  variants: {
    raw: string[];
    parsed?: Array<{
      name: string;
      values: string[];
    }>;
  };
  seoKeywords: string[];
  languagesDetected: string[];
  media: {
    images: Array<{ url: string; source: string }>;
  };
  supplierMeta?: {
    url?: string;
    platform?: 'aliexpress' | 'amazon' | 'other';
  };
}

/**
 * AI metadata tracking which fields were AI-generated vs sourced.
 */
export interface AIMeta {
  fieldsFilledByAI: string[]; // e.g., ['descriptions.fr.long']
  fieldsFromSource: string[]; // e.g., ['logistics.weight']
  languageSource: Record<string, 'original' | 'mixed' | 'translated'>;
}

/**
 * Complete product blueprint generated from evidence.
 * This is the normalized, store-ready product structure.
 */
export interface ProductBlueprint {
  product: {
    identity: {
      title: string;
      subtitle: string;
      handle: string;
      brand: string;
      source: 'JUST_DROP_IT';
    };
    descriptions: Record<string, {
      title: string;
      short: string;
      long: string;
      features: string[];
      benefits: string[];
      seo: {
        title: string;
        description: string;
        keywords: string[];
      };
    }>;
    taxonomy: {
      collectionId?: string | null;
      typeId?: string | null;
      categoryIds: string[];
      tags: string[];
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
    variants: Array<{
      title: string;
      options: Record<string, string>; // e.g., { Size: '20 cm' }
      sku?: string;
      prices: Record<string, number>; // currency_code -> amount
      inventory?: {
        stockLocationId?: string;
        quantity?: number;
      };
    }>;
    media: {
      images: Array<{
        sourceUrl: string;
        syncedUrl?: string;
        alt: string;
      }>;
    };
  };
  aiMeta: AIMeta;
}

