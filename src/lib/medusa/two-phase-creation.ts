/**
 * Two-phase product creation for Medusa.
 *
 * Phase 1: Create product with options only (get option IDs from response)
 * Phase 2: Add variants with proper option_id references
 *
 * This approach guarantees option IDs are available for variant options.
 */

import { getMedusaAuth } from './client';
import { extractProductId, parseMedusaResponse } from './response-parser';
import { parseMedusaError } from './error-handler';
import { withRetry } from './retry';
import { sanitizeMedusaProductPayload } from './normalize-product-payload';
import type { MedusaProductPayload } from './types';

import { type UnknownRecord, isRecord } from '@/lib/medusa/utils';

/**
 * Create a product using two-phase approach.
 *
 * @param payload - Full product payload (will be split into phases)
 * @returns Created product with all variants
 */
export async function createProductTwoPhase(payload: unknown): Promise<unknown> {
  if (!isRecord(payload)) {
    throw new Error('Payload must be an object');
  }

  const auth = await getMedusaAuth();
  if (!auth.ok) {
    throw new Error(`Medusa auth failed: ${auth.error}`);
  }

  // Phase 1: Create product with options only (no variants)
  const phase1Payload: Partial<MedusaProductPayload> = {
    ...payload,
    variants: [], // No variants in phase 1
  };

  const sanitizedPhase1 = sanitizeMedusaProductPayload(phase1Payload);

  const phase1Response = await withRetry(async () => {
    const res = await fetch(`${auth.baseUrl}/admin/products`, {
      method: 'POST',
      headers: auth.headers,
      cache: 'no-store',
      body: JSON.stringify(sanitizedPhase1),
    });

    const text = await res.text();
    const json = parseMedusaResponse(text);

    if (!res.ok) {
      // Check if error is "product already exists" by handle
      const error = parseMedusaError(res.status, res.statusText, json);
      if (res.status === 400 && typeof json === 'object' && json !== null) {
        const errorObj = json as Record<string, unknown>;
        const errorMessage = typeof errorObj.message === 'string' ? errorObj.message : '';
        if (errorMessage.includes('already exists') || errorMessage.includes('handle')) {
          throw new Error(
            `Product with handle "${isRecord(payload) && typeof payload.handle === 'string' ? payload.handle : 'unknown'}" already exists in Medusa. Please update the existing product instead of creating a new one.`
          );
        }
      }
      throw error;
    }

    return json;
  });

  const productId = extractProductId(phase1Response);
  if (!productId) {
    throw new Error('Failed to extract product ID from phase 1 response');
  }

  // Debug: Log phase 1 response structure for troubleshooting
  if (process.env.NODE_ENV === 'development') {
    console.log('[Two-Phase] Phase 1 response options:', JSON.stringify(
      isRecord(phase1Response) && isRecord(phase1Response.product) && Array.isArray(phase1Response.product.options)
        ? phase1Response.product.options
        : 'No options found',
      null,
      2
    ));
  }

  // Small delay to ensure option values are fully committed in Medusa
  // This helps avoid race conditions where option values aren't immediately available
  // Increased delay to ensure option values are fully indexed and available for variant creation
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Fetch the product again to get the exact option structure from Medusa
  // This ensures we have the most up-to-date option values
  const productResponse = await withRetry(async () => {
    const res = await fetch(`${auth.baseUrl}/admin/products/${encodeURIComponent(productId)}`, {
      method: 'GET',
      headers: auth.headers,
      cache: 'no-store',
    });

    const text = await res.text();
    const json = parseMedusaResponse(text);

    if (!res.ok) {
      throw parseMedusaError(res.status, res.statusText, json);
    }

    return json;
  });

  // Extract option IDs and values from Medusa's response
  // Maps: client option ID -> Medusa option ID
  const optionIdMap = new Map<string, string>();
  // Maps: client option ID -> Medusa option title (for variant creation)
  // CRITICAL: When creating variants via /admin/products/:id/variants, Medusa expects option TITLE as key, not option ID
  const optionTitleMap = new Map<string, string>(); // Key: clientOptId, Value: medusaOptionTitle
  // Maps: client option ID + client value -> Medusa value string
  // This ensures we use the exact values that Medusa stored
  const optionValueMap = new Map<string, string>(); // Key: `${clientOptId}:${clientValue}`, Value: medusaValue

  const productToUse = isRecord(productResponse) && isRecord(productResponse.product)
    ? productResponse.product
    : (isRecord(phase1Response) && isRecord(phase1Response.product) ? phase1Response.product : null);

  if (productToUse && Array.isArray(productToUse.options)) {
    const originalOptions = Array.isArray(payload.options) ? payload.options : [];
    
    productToUse.options.forEach((medusaOpt: unknown, index: number) => {
      if (!isRecord(medusaOpt) || typeof medusaOpt.id !== 'string') return;
      
      const originalOpt = originalOptions[index];
      if (!isRecord(originalOpt) || typeof originalOpt.id !== 'string') return;

      const clientOptId = originalOpt.id;
      const medusaOptId = medusaOpt.id;
      const medusaOptTitle = typeof medusaOpt.title === 'string' ? medusaOpt.title : '';
      
      // Map option ID
      optionIdMap.set(clientOptId, medusaOptId);
      // Map option title (CRITICAL: variant creation uses title as key, not ID)
      if (medusaOptTitle) {
        optionTitleMap.set(clientOptId, medusaOptTitle);
      }

      // Extract Medusa option values (can be strings or objects with 'value' field)
      // CRITICAL: We must use the exact value strings that Medusa stored
      const medusaValues: string[] = [];
      
      if (Array.isArray(medusaOpt.values)) {
        medusaOpt.values.forEach((v: unknown) => {
          let valueStr = '';
          
          if (typeof v === 'string') {
            valueStr = v.trim();
          } else if (isRecord(v)) {
            if (typeof v.value === 'string') {
              valueStr = v.value.trim();
            } else if (typeof v.label === 'string') {
              valueStr = v.label.trim();
            }
          }
          
          if (valueStr.length > 0) {
            medusaValues.push(valueStr);
          }
        });
      }

      // Extract client option values (normalize whitespace for matching)
      const clientValues: string[] = [];
      if (Array.isArray(originalOpt.values)) {
        clientValues.push(...originalOpt.values.map((v: unknown) => {
          if (typeof v === 'string') return v.trim();
          if (isRecord(v) && typeof v.value === 'string') return v.value.trim();
          return '';
        }).filter((v: string) => v.length > 0));
      }

      // Debug logging
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Two-Phase] Option mapping for "${medusaOpt.title || 'Unknown'}":`, {
          clientOptId,
          medusaOptId,
          medusaOptTitle,
          clientValues,
          medusaValues,
        });
      }

      // Map client values to Medusa values
      // Strategy: Try exact match first, then case-insensitive, then by index
      clientValues.forEach((clientValue, valueIndex) => {
        let matchedValue = '';
        
        // First, try exact match (case-sensitive)
        const exactMatch = medusaValues.find((mv) => mv === clientValue);
        if (exactMatch) {
          matchedValue = exactMatch;
        } else {
          // Second, try case-insensitive match
          const caseInsensitiveMatch = medusaValues.find(
            (mv) => mv.toLowerCase() === clientValue.toLowerCase()
          );
          if (caseInsensitiveMatch) {
            matchedValue = caseInsensitiveMatch;
          } else {
            // Third, try by index (as fallback)
            if (valueIndex < medusaValues.length) {
              matchedValue = medusaValues[valueIndex];
            } else {
              // If no match found, log warning and use client value
              console.warn(
                `[Two-Phase] No Medusa value match found for "${clientValue}" in option "${medusaOpt.title || clientOptId}". Available values: ${medusaValues.join(', ')}`
              );
              matchedValue = clientValue;
            }
          }
        }
        
        // Store value mapping
        if (matchedValue) {
          optionValueMap.set(`${clientOptId}:${clientValue}`, matchedValue);
        }
      });
    });
  }

  // Phase 2: Add variants with proper option IDs
  const originalVariants = Array.isArray(payload.variants) ? payload.variants : [];
  if (originalVariants.length === 0) {
    // No variants to add, return phase 1 response
    return phase1Response;
  }

  // Update variant options to use Medusa option TITLES (not IDs) and exact Medusa values
  // CRITICAL: When creating variants via /admin/products/:id/variants, Medusa expects:
  //   { "option_title": "option_value_string" }
  // NOT: { "option_id": "value" } or { "option_id": "value_id" }
  const phase2Variants = originalVariants.map((variant: unknown) => {
    if (!isRecord(variant)) return variant;

    const v = { ...variant };
    if (isRecord(v.options)) {
      const updatedOptions: Record<string, string> = {};
      for (const [clientOptId, clientValue] of Object.entries(v.options)) {
        if (typeof clientValue !== 'string') continue;

        // Get Medusa option title (used as key in variant options)
        const medusaOptTitle = optionTitleMap.get(clientOptId);
        if (!medusaOptTitle) {
          // Mapping not found - log warning but keep original
          console.warn(`[Two-Phase] No Medusa option title mapping found for client option ID: ${clientOptId}`);
          updatedOptions[clientOptId] = clientValue;
          continue;
        }

        // Get the exact Medusa value string (used as value in variant options)
        const medusaValue = optionValueMap.get(`${clientOptId}:${clientValue}`);
        if (medusaValue) {
          // Use option title as key and value string as value
          // Format: { "Color": "Black" } not { "opt_123": "Black" }
          updatedOptions[medusaOptTitle] = medusaValue;
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Two-Phase] Using option title for variant: "${medusaOptTitle}" -> "${medusaValue}"`);
          }
        } else {
          // Fallback: use client value (might cause error, but log it)
          console.warn(
            `[Two-Phase] No Medusa value mapping found for option ${clientOptId} value "${clientValue}". Using client value as-is.`
          );
          updatedOptions[medusaOptTitle] = clientValue;
        }
      }
      v.options = updatedOptions;
    }
    return v;
  });

  // Add variants one by one (or could batch if Medusa supports it)
  const createdVariants: unknown[] = [];
  for (const variant of phase2Variants) {
    const sanitizedVariant = sanitizeMedusaProductPayload(variant);

    // Debug: Log the exact payload being sent
    if (process.env.NODE_ENV === 'development') {
      console.log('[Two-Phase] Creating variant with payload:', JSON.stringify(sanitizedVariant, null, 2));
    }

    const variantResponse = await withRetry(async () => {
      const res = await fetch(`${auth.baseUrl}/admin/products/${encodeURIComponent(productId)}/variants`, {
        method: 'POST',
        headers: auth.headers,
        cache: 'no-store',
        body: JSON.stringify(sanitizedVariant),
      });

      const text = await res.text();
      const json = parseMedusaResponse(text);

      if (!res.ok) {
        // Enhanced error logging
        console.error('[Two-Phase] Variant creation failed:', {
          status: res.status,
          statusText: res.statusText,
          productId,
          variantPayload: sanitizedVariant,
          errorResponse: json,
          optionIdMap: Array.from(optionIdMap.entries()),
          optionValueMap: Array.from(optionValueMap.entries()),
        });
        throw parseMedusaError(res.status, res.statusText, json);
      }

      return json;
    });

    createdVariants.push(variantResponse);
  }

  // Return the final product with all variants
  // Fetch the complete product to return
  const finalResponse = await withRetry(async () => {
    const res = await fetch(`${auth.baseUrl}/admin/products/${encodeURIComponent(productId)}`, {
      method: 'GET',
      headers: auth.headers,
      cache: 'no-store',
    });

    const text = await res.text();
    const json = parseMedusaResponse(text);

    if (!res.ok) {
      throw parseMedusaError(res.status, res.statusText, json);
    }

    return json;
  });

  return finalResponse;
}

/**
 * Check if two-phase creation should be used.
 *
 * Currently, we use two-phase if:
 * - Product has options AND variants
 * - This ensures option IDs are available for variant options
 */
export function shouldUseTwoPhase(payload: unknown): boolean {
  if (!isRecord(payload)) return false;

  const hasOptions = Array.isArray(payload.options) && payload.options.length > 0;
  const hasVariants = Array.isArray(payload.variants) && payload.variants.length > 0;

  // Use two-phase if we have both options and variants
  // This ensures option IDs are available when creating variants
  return hasOptions && hasVariants;
}
