/**
 * ID Reconciliation for Medusa Product Updates
 *
 * Maps local product state IDs to Medusa-assigned IDs for options and variants.
 * This is critical for updates, as Medusa requires existing IDs to update entities.
 */

import crypto from 'node:crypto';
import { type UnknownRecord, isRecord, asString, extractOptionValues } from '@/lib/medusa/utils';

/**
 * Medusa Option structure (from API response)
 */
interface MedusaOption {
  id: string;
  title: string;
  values: Array<{ id?: string; value: string } | string>;
}

/**
 * Medusa Variant structure (from API response)
 */
interface MedusaVariant {
  id: string;
  sku?: string;
  options?: Array<{ option_id: string; value: string }>;
}

/**
 * Local Option structure (from product store)
 */
interface LocalOption {
  id?: string;
  medusaId?: string;
  name?: string;
  title?: string;
  values?: Array<{ value: string } | string>;
}

/**
 * Local Variant structure (from product store)
 */
interface LocalVariant {
  id?: string;
  medusaId?: string;
  sku?: string;
  options?: Record<string, string>; // { "Color": "Black" } format
}

/**
 * Reconciliation result for options
 */
export interface ReconciledOption {
  localId: string;
  medusaId?: string;
  isNew: boolean;
  title: string;
  values: string[];
}

/**
 * Reconciliation result for variants
 */
export interface ReconciledVariant {
  localId: string;
  medusaId?: string;
  isNew: boolean;
  sku?: string;
  options: Record<string, string>; // { "opt_123": "Black" } format (Medusa IDs)
}

/**
 * Reconciliation result
 */
export interface ReconciledProductState {
  options: ReconciledOption[];
  variants: ReconciledVariant[];
  optionIdMap: Map<string, string>; // local option ID -> Medusa option ID
  variantIdMap: Map<string, string>; // local variant ID -> Medusa variant ID
  optionNameToIdMap: Map<string, string>; // option name -> Medusa option ID
}

/**
 * Match options by various strategies
 */
function matchOption(
  localOpt: LocalOption,
  medusaOptions: MedusaOption[]
): MedusaOption | null {
  const localId = localOpt.medusaId || localOpt.id;
  const localName = localOpt.name || localOpt.title || '';
  const localValues = extractOptionValues(localOpt.values);

  // Strategy 1: Match by Medusa ID (if local state has it)
  if (localId) {
    const byId = medusaOptions.find((m) => m.id === localId);
    if (byId) return byId;
  }

  // Strategy 2: Match by title (case-insensitive)
  if (localName) {
    const byTitle = medusaOptions.find(
      (m) => m.title.toLowerCase() === localName.toLowerCase()
    );
    if (byTitle) return byTitle;
  }

  // Strategy 3: Match by values (exact set match)
  if (localValues.length > 0) {
    const byValues = medusaOptions.find((m) => {
      const medusaValues = extractOptionValues(m.values);
      if (medusaValues.length !== localValues.length) return false;
      
      // Check if all local values exist in Medusa values (case-insensitive)
      const medusaValuesLower = medusaValues.map((v) => v.toLowerCase());
      return localValues.every((lv) =>
        medusaValuesLower.includes(lv.toLowerCase())
      );
    });
    if (byValues) return byValues;
  }

  return null;
}

/**
 * Match variants by various strategies
 */
function matchVariant(
  localVar: LocalVariant,
  medusaVariants: MedusaVariant[],
  optionNameToIdMap: Map<string, string>
): MedusaVariant | null {
  const localId = localVar.medusaId || localVar.id;
  const localSku = localVar.sku || '';

  // Strategy 1: Match by Medusa ID (if local state has it)
  if (localId) {
    const byId = medusaVariants.find((m) => m.id === localId);
    if (byId) return byId;
  }

  // Strategy 2: Match by SKU (exact match)
  if (localSku) {
    const bySku = medusaVariants.find((m) => m.sku === localSku);
    if (bySku) return bySku;
  }

  // Strategy 3: Match by option combination
  if (localVar.options && Object.keys(localVar.options).length > 0) {
    // Convert local options { "Color": "Black" } to Medusa format
    const localOptionsMedusaFormat: Record<string, string> = {};
    for (const [optName, optValue] of Object.entries(localVar.options)) {
      const medusaOptId = optionNameToIdMap.get(optName);
      if (medusaOptId) {
        localOptionsMedusaFormat[medusaOptId] = optValue;
      }
    }

    // Find variant with matching options
    const byOptions = medusaVariants.find((m) => {
      if (!m.options || m.options.length === 0) return false;
      
      // Convert Medusa variant options to object format
      const medusaOptionsObj: Record<string, string> = {};
      m.options.forEach((opt) => {
        if (isRecord(opt) && typeof opt.option_id === 'string' && typeof opt.value === 'string') {
          medusaOptionsObj[opt.option_id] = opt.value;
        }
      });

      // Check if all local options match
      return Object.keys(localOptionsMedusaFormat).every(
        (optId) => medusaOptionsObj[optId] === localOptionsMedusaFormat[optId]
      );
    });
    if (byOptions) return byOptions;
  }

  return null;
}

/**
 * Reconcile option IDs
 */
function reconcileOptionIds(
  localOptions: LocalOption[],
  medusaOptions: MedusaOption[]
): ReconciledOption[] {
  const reconciled: ReconciledOption[] = [];

  for (const localOpt of localOptions) {
    const matched = matchOption(localOpt, medusaOptions);
    const localId = localOpt.id || crypto.randomUUID();
    const localName = localOpt.name || localOpt.title || 'Option';
    const values = extractOptionValues(localOpt.values);

    if (matched) {
      // Existing option - use Medusa ID
      reconciled.push({
        localId,
        medusaId: matched.id,
        isNew: false,
        title: matched.title,
        values: extractOptionValues(matched.values),
      });
    } else {
      // New option - no Medusa ID yet
      reconciled.push({
        localId,
        medusaId: undefined,
        isNew: true,
        title: localName,
        values,
      });
    }
  }

  return reconciled;
}

/**
 * Reconcile variant options: convert { "Color": "Black" } to { "opt_123": "Black" }
 */
function reconcileVariantOptions(
  localVariant: LocalVariant,
  optionNameToIdMap: Map<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};

  if (!localVariant.options) return result;

  for (const [optName, optValue] of Object.entries(localVariant.options)) {
    const medusaOptId = optionNameToIdMap.get(optName);
    if (medusaOptId && typeof optValue === 'string') {
      result[medusaOptId] = optValue;
    }
  }

  return result;
}

/**
 * Reconcile variant IDs
 */
function reconcileVariantIds(
  localVariants: LocalVariant[],
  medusaVariants: MedusaVariant[],
  optionNameToIdMap: Map<string, string>
): ReconciledVariant[] {
  const reconciled: ReconciledVariant[] = [];

  for (const localVar of localVariants) {
    const matched = matchVariant(localVar, medusaVariants, optionNameToIdMap);
    const localId = localVar.id || crypto.randomUUID();
    const options = reconcileVariantOptions(localVar, optionNameToIdMap);

    if (matched) {
      // Existing variant - use Medusa ID
      reconciled.push({
        localId,
        medusaId: matched.id,
        isNew: false,
        sku: localVar.sku || matched.sku,
        options,
      });
    } else {
      // New variant - no Medusa ID yet
      reconciled.push({
        localId,
        medusaId: undefined,
        isNew: true,
        sku: localVar.sku,
        options,
      });
    }
  }

  return reconciled;
}

/**
 * Main reconciliation function
 *
 * Maps local product state to Medusa IDs for options and variants.
 *
 * @param localState Local product state (from product store)
 * @param medusaState Current Medusa product state (from API)
 * @returns Reconciled state with Medusa IDs mapped
 */
export function reconcileProductIds(
  localState: UnknownRecord,
  medusaState: UnknownRecord
): ReconciledProductState {
  // Extract Medusa options and variants
  const medusaProduct = isRecord(medusaState.product)
    ? medusaState.product
    : isRecord(medusaState)
    ? medusaState
    : {};

  const medusaOptions: MedusaOption[] = Array.isArray(medusaProduct.options)
    ? medusaProduct.options
        .filter((opt): opt is MedusaOption => {
          if (!isRecord(opt)) return false;
          return typeof opt.id === 'string' && typeof opt.title === 'string';
        })
        .map((opt) => ({
          id: opt.id as string,
          title: opt.title as string,
          values: Array.isArray(opt.values) ? opt.values : [],
        }))
    : [];

  const medusaVariants: MedusaVariant[] = Array.isArray(medusaProduct.variants)
    ? medusaProduct.variants
        .filter((v): v is MedusaVariant => {
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

  // Extract local options and variants
  const localOptions: LocalOption[] = Array.isArray(localState.options)
    ? localState.options.filter((opt): opt is LocalOption => isRecord(opt))
    : [];

  const localVariants: LocalVariant[] = Array.isArray(localState.variants)
    ? localState.variants.filter((v): v is LocalVariant => isRecord(v))
    : [];

  // Reconcile options
  const reconciledOptions = reconcileOptionIds(localOptions, medusaOptions);

  // Build option name -> Medusa ID map
  const optionNameToIdMap = new Map<string, string>();
  const optionIdMap = new Map<string, string>();

  for (const opt of reconciledOptions) {
    if (opt.medusaId) {
      optionIdMap.set(opt.localId, opt.medusaId);
      optionNameToIdMap.set(opt.title, opt.medusaId);
    }
  }

  // Reconcile variants
  const reconciledVariants = reconcileVariantIds(
    localVariants,
    medusaVariants,
    optionNameToIdMap
  );

  // Build variant ID map
  const variantIdMap = new Map<string, string>();
  for (const v of reconciledVariants) {
    if (v.medusaId) {
      variantIdMap.set(v.localId, v.medusaId);
    }
  }

  return {
    options: reconciledOptions,
    variants: reconciledVariants,
    optionIdMap,
    variantIdMap,
    optionNameToIdMap,
  };
}

/**
 * Apply reconciled IDs to local state for payload building
 *
 * This creates a modified version of local state with Medusa IDs injected
 * where needed for the update payload.
 */
export function applyReconciledIds(
  localState: UnknownRecord,
  reconciled: ReconciledProductState
): UnknownRecord {
  const result = { ...localState };

  // Apply option IDs
  if (Array.isArray(result.options)) {
    result.options = result.options.map((opt: unknown) => {
      if (!isRecord(opt)) return opt;
      const localId = asString(opt.id);
      const reconciledOpt = reconciled.options.find((r) => r.localId === localId);
      
      if (reconciledOpt) {
        const updated: UnknownRecord = {
          ...opt,
        };
        
        // Use Medusa ID for update if it exists
        if (reconciledOpt.medusaId) {
          updated.id = reconciledOpt.medusaId;
          updated.medusaId = reconciledOpt.medusaId; // Preserve for future use
        }
        
        // Ensure name/title is set from reconciled state (critical for payload building)
        // Payload builder looks for 'name', but we should preserve it
        if (!updated.name && !updated.title) {
          updated.name = reconciledOpt.title;
        } else if (!updated.name && updated.title) {
          updated.name = updated.title;
        } else if (updated.name && !updated.title) {
          updated.title = updated.name;
        }
        
        // CRITICAL: Ensure values array is preserved and not empty
        // The payload builder expects opt.values to be an array of objects with 'value' field
        // If values are missing or empty, use the reconciled values
        if (!Array.isArray(updated.values) || updated.values.length === 0) {
          // Convert reconciled values (strings) to the format expected by payload builder
          // Payload builder expects: Array<{ value: string, translations?: Record<string, string> }>
          updated.values = reconciledOpt.values.map((val) => ({
            value: val,
            translations: { en: val },
          }));
        } else {
          // Ensure values are in the correct format (objects with 'value' field)
          updated.values = Array.isArray(updated.values)
            ? updated.values.map((v) => {
                if (typeof v === 'string') {
                  return { value: v, translations: { en: v } };
                }
                if (isRecord(v) && typeof v.value === 'string') {
                  return v; // Already in correct format
                }
                return null;
              }).filter((v): v is { value: string; translations?: Record<string, string> } => v !== null)
            : [];
        }
        
        return updated;
      }
      return opt;
    });
  }

  // Apply variant IDs and option mappings
  if (Array.isArray(result.variants)) {
    result.variants = result.variants.map((v: unknown) => {
      if (!isRecord(v)) return v;
      const localId = asString(v.id);
      const reconciledVar = reconciled.variants.find((r) => r.localId === localId);
      
      if (reconciledVar) {
        const updated: UnknownRecord = {
          ...v,
          medusaId: reconciledVar.medusaId, // Preserve for future use
        };

        // Include Medusa ID if it exists (for updates)
        if (reconciledVar.medusaId) {
          updated.id = reconciledVar.medusaId;
        }

        // Replace options with Medusa format (option IDs as keys)
        if (reconciledVar.options && Object.keys(reconciledVar.options).length > 0) {
          updated.options = reconciledVar.options;
        }

        return updated;
      }
      return v;
    });
  }

  return result;
}
