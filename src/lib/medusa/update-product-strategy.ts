/**
 * Update Product Strategy for Medusa
 *
 * Orchestrates the update flow with pre-flight validation, ID reconciliation,
 * change detection, and error handling.
 */

import { getMedusaAuth } from './client';
import { parseMedusaResponse, extractProductId } from './response-parser';
import { parseMedusaError } from './error-handler';
import { withRetry } from './retry';
import { sanitizeMedusaProductPayload } from './normalize-product-payload';
import {
  validateMedusaProductPayload,
  validateUpdatePayload,
} from './validate-payload';
import { buildMedusaAdminProductPayload } from './build-admin-product-payload';
import {
  reconcileProductIds,
  applyReconciledIds,
  type ReconciledProductState,
} from './reconcile-medusa-ids';
import {
  detectProductChanges,
  formatChangesForLog,
  type ProductChanges,
} from './detect-product-changes';

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Fetch current Medusa product state
 */
async function fetchCurrentMedusaProduct(
  productId: string
): Promise<UnknownRecord> {
  const auth = await getMedusaAuth();
  if (!auth.ok) {
    throw new Error(`Medusa auth failed: ${auth.error}`);
  }

  const response = await withRetry(async () => {
    const res = await fetch(
      `${auth.baseUrl}/admin/products/${encodeURIComponent(productId)}`,
      {
        method: 'GET',
        headers: auth.headers,
        cache: 'no-store',
      }
    );

    const text = await res.text();
    const json = parseMedusaResponse(text);

    if (!res.ok) {
      throw parseMedusaError(res.status, res.statusText, json);
    }

    return json;
  });

  return isRecord(response) ? response : {};
}

/**
 * Update product in Medusa with full reconciliation and validation
 *
 * @param productId Medusa product ID
 * @param localState Local product state (from product store)
 * @returns Updated product response from Medusa
 */
export async function updateProductInMedusa(
  productId: string,
  localState: unknown
): Promise<unknown> {
  if (!isRecord(localState)) {
    throw new Error('Local state must be an object');
  }

  // Development logging
  if (process.env.NODE_ENV === 'development') {
    console.log('[Update] Starting product update for:', productId);
  }

  // Step 1: Fetch current Medusa product state
  let currentMedusaState: UnknownRecord;
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Update] Fetching current Medusa product state...');
    }
    currentMedusaState = await fetchCurrentMedusaProduct(productId);
    
    if (process.env.NODE_ENV === 'development') {
      const product = isRecord(currentMedusaState.product)
        ? currentMedusaState.product
        : currentMedusaState;
      console.log('[Update] Current Medusa state:', {
        productId: product.id,
        title: product.title,
        optionsCount: Array.isArray(product.options) ? product.options.length : 0,
        variantsCount: Array.isArray(product.variants) ? product.variants.length : 0,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch current product';
    throw new Error(`Failed to fetch current Medusa product: ${message}`);
  }

  // Step 2: Reconcile IDs (map local IDs to Medusa IDs)
  let reconciled: ReconciledProductState;
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Update] Reconciling IDs...');
    }
    reconciled = reconcileProductIds(localState, currentMedusaState);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[Update] ID Reconciliation:', {
        options: {
          total: reconciled.options.length,
          withMedusaId: reconciled.options.filter((o) => o.medusaId).length,
          new: reconciled.options.filter((o) => o.isNew).length,
        },
        variants: {
          total: reconciled.variants.length,
          withMedusaId: reconciled.variants.filter((v) => v.medusaId).length,
          new: reconciled.variants.filter((v) => v.isNew).length,
        },
        optionIdMapSize: reconciled.optionIdMap.size,
        variantIdMapSize: reconciled.variantIdMap.size,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reconcile IDs';
    throw new Error(`ID reconciliation failed: ${message}`);
  }

  // Step 3: Detect changes (for logging and debugging)
  let changes: ProductChanges;
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Update] Detecting changes...');
    }
    changes = detectProductChanges(localState, currentMedusaState, reconciled);
    
    if (process.env.NODE_ENV === 'development') {
      if (changes.hasChanges) {
        console.log('[Update] Changes detected:\n' + formatChangesForLog(changes));
      } else {
        console.log('[Update] No changes detected');
      }
    }
  } catch (error) {
    // Change detection is non-critical, log but continue
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Update] Change detection failed:', error);
    }
    // Create empty changes object
    changes = {
      rootFields: {},
      options: { added: [], modified: [], removed: [] },
      variants: { added: [], modified: [], removed: [] },
      hasChanges: false,
      changeCount: 0,
    };
  }

  // Step 4: Apply reconciled IDs to local state
  const reconciledState = applyReconciledIds(localState, reconciled);

  // Step 5: Build update payload with reconciled IDs
  let payload: unknown;
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Update] Building update payload...');
    }
    payload = buildMedusaAdminProductPayload(reconciledState, true);
    
    if (process.env.NODE_ENV === 'development') {
      const payloadObj = isRecord(payload) ? payload : {};
      console.log('[Update] Payload preview:', {
        title: payloadObj.title,
        handle: payloadObj.handle,
        optionsCount: Array.isArray(payloadObj.options) ? payloadObj.options.length : 0,
        variantsCount: Array.isArray(payloadObj.variants) ? payloadObj.variants.length : 0,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build payload';
    throw new Error(`Payload building failed: ${message}`);
  }

  // Step 6: Ensure option values exist in Medusa (add missing ones)
  // This is similar to two-phase creation - we need option values to exist before using them in variants
  const medusaProduct = isRecord(currentMedusaState.product)
    ? currentMedusaState.product
    : currentMedusaState;
  
  // Extract Medusa options with their current values
  const medusaOptions: Array<{ id: string; title: string; values: Array<{ id?: string; value: string } | string> }> = 
    Array.isArray(medusaProduct.options)
      ? medusaProduct.options
          .filter((opt): opt is { id: string; title: string; values: unknown } => {
            if (!isRecord(opt)) return false;
            return typeof opt.id === 'string' && typeof opt.title === 'string';
          })
          .map((opt) => {
            const values: Array<{ id?: string; value: string } | string> = Array.isArray(opt.values)
              ? opt.values
                  .map((v) => {
                    if (typeof v === 'string') return v;
                    if (isRecord(v)) {
                      const value = v.value;
                      if (typeof value === 'string') {
                        const result: { id?: string; value: string } = { value };
                        if (typeof v.id === 'string') {
                          result.id = v.id;
                        }
                        return result;
                      }
                    }
                    return null;
                  })
                  .filter((v): v is { id?: string; value: string } | string => v !== null)
              : [];
            
            return {
              id: opt.id as string,
              title: opt.title as string,
              values,
            };
          })
      : [];
  
  // Check payload options and add missing values to Medusa options
  const payloadObj = isRecord(payload) ? payload : {};
  const payloadOptions = Array.isArray(payloadObj.options) ? payloadObj.options : [];
  
  for (const payloadOpt of payloadOptions) {
    if (!isRecord(payloadOpt)) continue;
    
    const optId = typeof payloadOpt.id === 'string' ? payloadOpt.id : '';
    const optTitle = typeof payloadOpt.title === 'string' ? payloadOpt.title : '';
    const payloadValues = Array.isArray(payloadOpt.values) 
      ? payloadOpt.values.map((v) => typeof v === 'string' ? v : '')
      : [];
    
    // Find matching Medusa option
    const medusaOpt = medusaOptions.find((m) => m.id === optId || m.title === optTitle);
    if (!medusaOpt) continue;
    
    // Extract existing Medusa values as strings
    const existingValues = new Set<string>();
    medusaOpt.values.forEach((v) => {
      const val = typeof v === 'string' ? v : (isRecord(v) && typeof v.value === 'string' ? v.value : '');
      if (val) {
        existingValues.add(val);
        // Also add case-insensitive version for matching
        existingValues.add(val.toLowerCase());
      }
    });
    
    // Find missing values (case-insensitive check)
    const missingValues: string[] = [];
    for (const payloadVal of payloadValues) {
      if (!payloadVal) continue;
      const payloadValLower = payloadVal.toLowerCase();
      const exists = Array.from(existingValues).some((ev) => ev.toLowerCase() === payloadValLower);
      if (!exists) {
        // Check if we can find a case-insensitive match
        const caseMatch = Array.from(medusaOpt.values).find((v) => {
          const val = typeof v === 'string' ? v : (isRecord(v) && typeof v.value === 'string' ? v.value : '');
          return val && val.toLowerCase() === payloadValLower;
        });
        if (!caseMatch) {
          missingValues.push(payloadVal);
        }
      }
    }
    
    // Add missing values to the option in Medusa
    if (missingValues.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Update] Adding missing option values to option "${medusaOpt.title}" (${medusaOpt.id}):`, missingValues);
      }
      
      // Get current values (preserve existing ones)
      const currentValues = medusaOpt.values.map((v) => {
        if (typeof v === 'string') return v;
        if (isRecord(v) && typeof v.value === 'string') return v.value;
        return '';
      }).filter(Boolean);
      
      // Combine existing and new values
      const allValues = [...new Set([...currentValues, ...missingValues])];
      
      // Update the option with all values
      const auth = await getMedusaAuth();
      if (!auth.ok) {
        throw new Error(`Medusa auth failed: ${auth.error}`);
      }
      
      try {
        const updateRes = await withRetry(async () => {
          const res = await fetch(
            `${auth.baseUrl}/admin/products/${encodeURIComponent(productId)}/options/${encodeURIComponent(medusaOpt.id)}`,
            {
              method: 'POST',
              headers: auth.headers,
              cache: 'no-store',
              body: JSON.stringify({
                title: medusaOpt.title,
                values: allValues,
              }),
            }
          );
          
          const text = await res.text();
          const json = parseMedusaResponse(text);
          
          if (!res.ok) {
            throw parseMedusaError(res.status, res.statusText, json);
          }
          
          return json;
        });
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Update] Successfully added option values:`, missingValues);
        }
        
        // Update medusaOptions with new values for subsequent validation
        const updatedOpt = medusaOptions.findIndex((m) => m.id === medusaOpt.id);
        if (updatedOpt >= 0) {
          medusaOptions[updatedOpt] = {
            ...medusaOptions[updatedOpt],
            values: allValues,
          };
        }
      } catch (optionUpdateError) {
        const message = optionUpdateError instanceof Error ? optionUpdateError.message : 'Failed to add option values';
        throw new Error(`Failed to add missing option values to option "${medusaOpt.title}": ${message}`);
      }
    }
  }
  
  // Step 7: Validate payload (after ensuring option values exist)
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Update] Validating payload...');
    }
    
    // First, standard validation
    validateMedusaProductPayload(payload);
    
    // Extract and properly type Medusa variants
    const medusaVariants: Array<{ id: string; sku?: string; options?: Array<{ option_id: string; value: string }> }> =
      Array.isArray(medusaProduct.variants)
        ? medusaProduct.variants
            .filter((v): v is { id: string; sku?: string; options?: unknown } => {
              if (!isRecord(v)) return false;
              return typeof v.id === 'string';
            })
            .map((v) => ({
              id: v.id as string,
              sku: typeof v.sku === 'string' ? v.sku : undefined,
              options: Array.isArray(v.options)
                ? v.options.filter((opt): opt is { option_id: string; value: string } => {
                    if (!isRecord(opt)) return false;
                    return (
                      typeof opt.option_id === 'string' && typeof opt.value === 'string'
                    );
                  })
                : undefined,
            }))
        : [];
    
    validateUpdatePayload(payload, {
      options: medusaOptions,
      variants: medusaVariants,
    });
  } catch (validationError) {
    const message =
      validationError instanceof Error
        ? validationError.message
        : 'Payload validation failed';
    throw new Error(`Payload validation failed: ${message}`);
  }

  // Step 8: Sanitize payload
  const sanitizedPayload = sanitizeMedusaProductPayload(payload);

  // Step 9: Send update to Medusa
  const auth = await getMedusaAuth();
  if (!auth.ok) {
    throw new Error(`Medusa auth failed: ${auth.error}`);
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[Update] Sending update request to Medusa...');
  }

  const response = await withRetry(async () => {
    const res = await fetch(
      `${auth.baseUrl}/admin/products/${encodeURIComponent(productId)}`,
      {
        method: 'POST',
        headers: auth.headers,
        cache: 'no-store',
        body: JSON.stringify(sanitizedPayload),
      }
    );

    const text = await res.text();
    const json = parseMedusaResponse(text);

    if (!res.ok) {
      // Enhanced error logging
      const payloadObj = isRecord(sanitizedPayload) ? sanitizedPayload : {};
      console.error('[Update] Medusa API error:', {
        status: res.status,
        statusText: res.statusText,
        productId,
        url: `${auth.baseUrl}/admin/products/${encodeURIComponent(productId)}`,
        response: json,
        payloadPreview: {
          title: payloadObj.title,
          handle: payloadObj.handle,
          optionsCount: Array.isArray(payloadObj.options)
            ? payloadObj.options.length
            : 0,
          variantsCount: Array.isArray(payloadObj.variants)
            ? payloadObj.variants.length
            : 0,
        },
        reconciliation: {
          optionIdMapSize: reconciled.optionIdMap.size,
          variantIdMapSize: reconciled.variantIdMap.size,
        },
        changes: changes.hasChanges ? formatChangesForLog(changes) : 'No changes',
      });

      throw parseMedusaError(res.status, res.statusText, json);
    }

    return json;
  });

  if (process.env.NODE_ENV === 'development') {
    const responseRecord = isRecord(response) ? response : {};
    const responseProduct = isRecord(responseRecord.product)
      ? responseRecord.product
      : responseRecord;
    console.log('[Update] Update successful:', {
      productId: responseProduct.id,
      title: responseProduct.title,
      optionsCount: Array.isArray(responseProduct.options)
        ? responseProduct.options.length
        : 0,
      variantsCount: Array.isArray(responseProduct.variants)
        ? responseProduct.variants.length
        : 0,
    });
  }

  return response;
}
