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
  const createdOptionValues: Array<{ optionId: string; optionTitle: string; value: string }> = [];
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

  // If ONLY root fields changed (no options/variants changes), do NOT send options/variants in the update.
  // Medusa can validate variant option values even when unchanged; if the local draft carries a value casing
  // that doesn't exactly match Medusa, the update will fail even for a title-only change.
  // This keeps "quick edits" safe.
  const optionChangeCount =
    changes.options.added.length + changes.options.modified.length + changes.options.removed.length;
  const variantChangeCount =
    changes.variants.added.length + changes.variants.modified.length + changes.variants.removed.length;

  if (optionChangeCount === 0 && variantChangeCount === 0) {
    const p = isRecord(payload) ? (payload as Record<string, unknown>) : null;
    if (p) {
      delete p.options;
      delete p.variants;
      // Also strip metadata.options_i18n if present (it is derived from options)
      if (isRecord(p.metadata)) {
        const md = p.metadata as Record<string, unknown>;
        delete md.options_i18n;
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[Update] Root-only change detected; sending minimal payload (no options/variants).');
    }
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
  
  // Check payload options AND variant option usage, and add missing values to Medusa options.
  // Important: Some flows may update a variant's option value without updating the option.values list.
  // Medusa will reject the variant update unless the option value exists on the option.
  const payloadObj = isRecord(payload) ? payload : {};
  const payloadOptions = Array.isArray(payloadObj.options) ? payloadObj.options : [];

  // Build required option values from variant usage: { option_id -> Set(values) }
  const requiredFromVariants = new Map<string, Set<string>>();
  const payloadVariants = Array.isArray(payloadObj.variants) ? payloadObj.variants : [];
  for (const v of payloadVariants) {
    if (!isRecord(v)) continue;
    const opts = (v as UnknownRecord).options;
    // buildMedusaAdminProductPayload outputs object format: { "option_id": "value" }
    if (!isRecord(opts)) continue;
    for (const [k, val] of Object.entries(opts)) {
      if (typeof k !== 'string' || !k) continue;
      if (typeof val !== 'string' || !val.trim()) continue;
      const set = requiredFromVariants.get(k) ?? new Set<string>();
      set.add(val.trim());
      requiredFromVariants.set(k, set);
    }
  }

  for (const payloadOpt of payloadOptions) {
    if (!isRecord(payloadOpt)) continue;

    const optId = typeof payloadOpt.id === 'string' ? payloadOpt.id : '';
    const optTitle = typeof payloadOpt.title === 'string' ? payloadOpt.title : '';
    const payloadValues = Array.isArray(payloadOpt.values)
      ? payloadOpt.values.map((v) => (typeof v === 'string' ? v : '')).filter(Boolean)
      : [];

    // Also include values required by variants for this option
    const requiredVals = optId ? Array.from(requiredFromVariants.get(optId) ?? []) : [];
    const desiredValues = Array.from(new Set<string>([...payloadValues, ...requiredVals]));

    // Find matching Medusa option
    const medusaOpt = medusaOptions.find((m) => m.id === optId || m.title === optTitle);
    if (!medusaOpt) continue;

    // Extract existing Medusa values as strings
    const existingValues = new Set<string>();
    medusaOpt.values.forEach((vv) => {
      const val = typeof vv === 'string' ? vv : (isRecord(vv) && typeof vv.value === 'string' ? vv.value : '');
      if (val) {
        existingValues.add(val);
        existingValues.add(val.toLowerCase());
      }
    });

    // Find missing values (case-insensitive check)
    const missingValues: string[] = [];
    for (const desired of desiredValues) {
      if (!desired) continue;
      const desiredLower = desired.toLowerCase();
      const exists = Array.from(existingValues).some((ev) => ev.toLowerCase() === desiredLower);
      if (!exists) {
        missingValues.push(desired);
      }
    }
    
    // Add missing values to the option in Medusa
    if (missingValues.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Update] Creating missing option values for option "${medusaOpt.title}" (${medusaOpt.id}):`, missingValues);
      }

      const auth = await getMedusaAuth();
      if (!auth.ok) {
        throw new Error(`Medusa auth failed: ${auth.error}`);
      }

      try {
        // Create each missing value explicitly via the product-options values endpoint
        for (const val of missingValues) {
          // Some Medusa instances expect body { value: 'x' } and create a new option value
          await withRetry(async () => {
            const res = await fetch(
              `${auth.baseUrl}/admin/product-options/${encodeURIComponent(medusaOpt.id)}/values`,
              {
                method: 'POST',
                headers: {
                  ...auth.headers,
                  'Content-Type': 'application/json',
                },
                cache: 'no-store',
                body: JSON.stringify({ value: val }),
              }
            );

            const text = await res.text();
            const json = parseMedusaResponse(text);

            if (!res.ok) {
              // If creation fails because value already exists, ignore; otherwise throw
              const parsed = parseMedusaError(res.status, res.statusText, json);
              // Some Medusa instances return 400 if the value already exists; tolerate that
              const msg = parsed?.message || '';
              if (res.status === 400 && /already exists|duplicate|exists/i.test(msg)) {
                if (process.env.NODE_ENV === 'development') {
                  console.log(`[Update] Option value '${val}' already exists for option ${medusaOpt.id}`);
                }
                return json;
              }

              throw parsed;
            }

            // Record created value for UI feedback
            createdOptionValues.push({ optionId: medusaOpt.id, optionTitle: medusaOpt.title, value: val });

            return json;
          });
        }

        // Refresh medusaOptions values in memory for subsequent validation
        // Fetch the option back from Medusa (best-effort)
        try {
          const optRes = await withRetry(async () => {
            const res = await fetch(
              `${auth.baseUrl}/admin/products/${encodeURIComponent(productId)}/options/${encodeURIComponent(medusaOpt.id)}`,
              {
                method: 'GET',
                headers: auth.headers,
                cache: 'no-store',
              }
            );
            const text = await res.text();
            const json = parseMedusaResponse(text);
            if (!res.ok) throw parseMedusaError(res.status, res.statusText, json);
            return json;
          });

          if (isRecord(optRes) && Array.isArray(optRes.values)) {
            const newValues = optRes.values.map((v) => (typeof v === 'string' ? v : (isRecord(v) && typeof v.value === 'string' ? v.value : ''))).filter(Boolean);
            const updatedOptIndex = medusaOptions.findIndex((m) => m.id === medusaOpt.id);
            if (updatedOptIndex >= 0) {
              medusaOptions[updatedOptIndex] = { ...medusaOptions[updatedOptIndex], values: newValues };
            }
          }
        } catch (reFetchErr) {
          // Non-fatal: if we can't fetch the updated option, just merge optimistic values
          const updatedOptIndex = medusaOptions.findIndex((m) => m.id === medusaOpt.id);
          if (updatedOptIndex >= 0) {
            const existingVals = medusaOptions[updatedOptIndex].values.map((v) => typeof v === 'string' ? v : (isRecord(v) && typeof v.value === 'string' ? v.value : '')).filter(Boolean);
            medusaOptions[updatedOptIndex] = { ...medusaOptions[updatedOptIndex], values: [...new Set([...existingVals, ...missingValues])] };
          }
        }

        if (process.env.NODE_ENV === 'development') {
          console.log(`[Update] Created missing option values for option "${medusaOpt.title}"`);
        }
      } catch (optionUpdateError) {
        const message = optionUpdateError instanceof Error ? optionUpdateError.message : 'Failed to create option values';
        throw new Error(`Failed to create missing option values for option "${medusaOpt.title}": ${message}`);
      }
    }
  }
  
  // Step 7: Validate payload (after ensuring option values exist)
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Update] Validating payload...');
    }

    const payloadRec = isRecord(payload) ? (payload as Record<string, unknown>) : {};
    const hasVariants = Array.isArray(payloadRec.variants) && payloadRec.variants.length > 0;
    const hasOptions = Array.isArray(payloadRec.options) && payloadRec.options.length > 0;

    if (hasVariants) {
      // Full payload validation (create/update-style)
      validateMedusaProductPayload(payload);

      // Extract and properly type Medusa variants for update validation
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
                      return typeof opt.option_id === 'string' && typeof opt.value === 'string';
                    })
                  : undefined,
              }))
          : [];

      validateUpdatePayload(payload, {
        options: medusaOptions,
        variants: medusaVariants,
      });
    } else {
      // Partial update validation (Medusa supports partial POST updates).
      // We only sanity-check fields we are actually sending.
      if ('title' in payloadRec && typeof payloadRec.title !== 'string') {
        throw new Error('Invalid payload: title must be a string');
      }
      if ('handle' in payloadRec && typeof payloadRec.handle !== 'string') {
        throw new Error('Invalid payload: handle must be a string');
      }
      if (hasOptions) {
        // If someone sent options without variants, still validate options structure lightly.
        // (But don't require variants.)
        // We rely on Medusa API for deeper validation.
      }
    }
  } catch (validationError) {
    const message = validationError instanceof Error ? validationError.message : 'Payload validation failed';
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

  // Attach created option values for UI feedback (non-breaking)
  if (createdOptionValues.length > 0 && isRecord(response)) {
    return {
      ...(response as Record<string, unknown>),
      _clawd: {
        createdOptionValues,
      },
    };
  }

  return response;
}
