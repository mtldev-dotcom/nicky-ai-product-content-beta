/**
 * Change Detection for Medusa Product Updates
 *
 * Identifies what changed between local product state and current Medusa state.
 * Useful for debugging, user feedback, and potential payload optimization.
 */

import type { ReconciledProductState } from './reconcile-medusa-ids';

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/**
 * Change type for an option
 */
export interface OptionChange {
  type: 'added' | 'modified' | 'removed';
  localId?: string;
  medusaId?: string;
  title: string;
  valueChanges?: {
    added: string[];
    removed: string[];
    modified: string[];
  };
}

/**
 * Change type for a variant
 */
export interface VariantChange {
  type: 'added' | 'modified' | 'removed';
  localId?: string;
  medusaId?: string;
  sku?: string;
  fieldChanges?: {
    title?: { old?: string; new: string };
    sku?: { old?: string; new: string };
    prices?: { changed: boolean };
    options?: { changed: boolean };
  };
}

/**
 * Product change summary
 */
export interface ProductChanges {
  // Root-level changes
  rootFields: {
    title?: { old?: string; new: string };
    subtitle?: { old?: string; new: string };
    description?: { old?: string; new: string };
    handle?: { old?: string; new: string };
    status?: { old?: string; new: string };
    thumbnail?: { old?: string; new: string };
    [key: string]: { old?: unknown; new: unknown } | undefined;
  };

  // Option changes
  options: {
    added: OptionChange[];
    modified: OptionChange[];
    removed: OptionChange[];
  };

  // Variant changes
  variants: {
    added: VariantChange[];
    modified: VariantChange[];
    removed: VariantChange[];
  };

  // Summary
  hasChanges: boolean;
  changeCount: number;
}

/**
 * Extract option values as strings
 */
function extractOptionValues(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  
  return values
    .map((v) => {
      if (typeof v === 'string') return v.trim();
      if (isRecord(v)) {
        const value = v.value;
        if (typeof value === 'string') return value.trim();
      }
      return '';
    })
    .filter((v): v is string => v.length > 0)
    .sort(); // Sort for comparison
}

/**
 * Compare two option value arrays
 */
function compareOptionValues(
  oldValues: string[],
  newValues: string[]
): { added: string[]; removed: string[]; modified: string[] } {
  const oldSet = new Set(oldValues);
  const newSet = new Set(newValues);

  const added = newValues.filter((v) => !oldSet.has(v));
  const removed = oldValues.filter((v) => !newSet.has(v));
  const modified: string[] = []; // For now, treat as added/removed

  return { added, removed, modified };
}

/**
 * Detect option changes
 */
function detectOptionChanges(
  localOptions: UnknownRecord[],
  medusaOptions: UnknownRecord[],
  reconciled: ReconciledProductState
): {
  added: OptionChange[];
  modified: OptionChange[];
  removed: OptionChange[];
} {
  const added: OptionChange[] = [];
  const modified: OptionChange[] = [];
  const removed: OptionChange[] = [];

  // Find added and modified options
  for (const localOpt of localOptions) {
    const localId = asString(localOpt.id);
    const reconciledOpt = reconciled.options.find((r) => r.localId === localId);

    if (!reconciledOpt) continue;

    if (reconciledOpt.isNew) {
      // New option
      added.push({
        type: 'added',
        localId: reconciledOpt.localId,
        title: reconciledOpt.title,
      });
    } else {
      // Existing option - check for modifications
      const medusaOpt = medusaOptions.find(
        (m) => isRecord(m) && m.id === reconciledOpt.medusaId
      );

      if (medusaOpt && isRecord(medusaOpt)) {
        const medusaTitle = asString(medusaOpt.title);
        const medusaValues = extractOptionValues(medusaOpt.values);
        const localTitle = asString(localOpt.name || localOpt.title);
        const localValues = extractOptionValues(localOpt.values);

        const titleChanged = medusaTitle !== localTitle;
        const valueChanges = compareOptionValues(medusaValues, localValues);
        const hasValueChanges =
          valueChanges.added.length > 0 || valueChanges.removed.length > 0;

        if (titleChanged || hasValueChanges) {
          modified.push({
            type: 'modified',
            localId: reconciledOpt.localId,
            medusaId: reconciledOpt.medusaId,
            title: localTitle,
            valueChanges: hasValueChanges ? valueChanges : undefined,
          });
        }
      }
    }
  }

  // Find removed options (in Medusa but not in local)
  for (const medusaOpt of medusaOptions) {
    if (!isRecord(medusaOpt)) continue;
    const medusaId = asString(medusaOpt.id);
    const found = reconciled.options.find((r) => r.medusaId === medusaId);

    if (!found) {
      removed.push({
        type: 'removed',
        medusaId,
        title: asString(medusaOpt.title),
      });
    }
  }

  return { added, modified, removed };
}

/**
 * Detect variant changes
 */
function detectVariantChanges(
  localVariants: UnknownRecord[],
  medusaVariants: UnknownRecord[],
  reconciled: ReconciledProductState
): {
  added: VariantChange[];
  modified: VariantChange[];
  removed: VariantChange[];
} {
  const added: VariantChange[] = [];
  const modified: VariantChange[] = [];
  const removed: VariantChange[] = [];

  // Find added and modified variants
  for (const localVar of localVariants) {
    const localId = asString(localVar.id);
    const reconciledVar = reconciled.variants.find((r) => r.localId === localId);

    if (!reconciledVar) continue;

    if (reconciledVar.isNew) {
      // New variant
      added.push({
        type: 'added',
        localId: reconciledVar.localId,
        sku: reconciledVar.sku,
      });
    } else {
      // Existing variant - check for modifications
      const medusaVar = medusaVariants.find(
        (m) => isRecord(m) && m.id === reconciledVar.medusaId
      );

      if (medusaVar && isRecord(medusaVar)) {
        const fieldChanges: VariantChange['fieldChanges'] = {};

        // Check title
        const medusaTitle = asString(medusaVar.title);
        const localTitle = asString(localVar.title);
        if (medusaTitle !== localTitle) {
          fieldChanges.title = { old: medusaTitle, new: localTitle };
        }

        // Check SKU
        const medusaSku = asString(medusaVar.sku);
        const localSku = asString(localVar.sku);
        if (medusaSku !== localSku) {
          fieldChanges.sku = { old: medusaSku, new: localSku };
        }

        // Check prices (simplified - just check if array changed)
        const medusaPrices = Array.isArray(medusaVar.prices)
          ? medusaVar.prices
          : [];
        const localPrices = Array.isArray(localVar.prices) ? localVar.prices : [];
        if (JSON.stringify(medusaPrices) !== JSON.stringify(localPrices)) {
          fieldChanges.prices = { changed: true };
        }

        // Check options (simplified - just check if object changed)
        const medusaOptions = isRecord(medusaVar.options)
          ? medusaVar.options
          : {};
        const localOptions = isRecord(localVar.options) ? localVar.options : {};
        if (JSON.stringify(medusaOptions) !== JSON.stringify(localOptions)) {
          fieldChanges.options = { changed: true };
        }

        if (Object.keys(fieldChanges).length > 0) {
          modified.push({
            type: 'modified',
            localId: reconciledVar.localId,
            medusaId: reconciledVar.medusaId,
            sku: localSku || medusaSku,
            fieldChanges,
          });
        }
      }
    }
  }

  // Find removed variants (in Medusa but not in local)
  for (const medusaVar of medusaVariants) {
    if (!isRecord(medusaVar)) continue;
    const medusaId = asString(medusaVar.id);
    const found = reconciled.variants.find((r) => r.medusaId === medusaId);

    if (!found) {
      removed.push({
        type: 'removed',
        medusaId,
        sku: asString(medusaVar.sku),
      });
    }
  }

  return { added, modified, removed };
}

/**
 * Detect all product changes
 *
 * @param localState Local product state (from product store)
 * @param medusaState Current Medusa product state (from API)
 * @param reconciled Reconciled state (from reconcileProductIds)
 * @returns Summary of all changes
 */
export function detectProductChanges(
  localState: UnknownRecord,
  medusaState: UnknownRecord,
  reconciled: ReconciledProductState
): ProductChanges {
  const medusaProduct = isRecord(medusaState.product)
    ? medusaState.product
    : isRecord(medusaState)
    ? medusaState
    : {};

  // Root-level field changes
  const rootFields: ProductChanges['rootFields'] = {};

  const rootFieldNames = [
    'title',
    'subtitle',
    'description',
    'handle',
    'status',
    'thumbnail',
  ];

  for (const field of rootFieldNames) {
    const localValue = localState[field];
    const medusaValue = medusaProduct[field];

    if (localValue !== medusaValue) {
      rootFields[field] = {
        old: medusaValue,
        new: localValue,
      };
    }
  }

  // Option changes
  const localOptions = Array.isArray(localState.options)
    ? localState.options.filter((opt): opt is UnknownRecord => isRecord(opt))
    : [];

  const medusaOptions = Array.isArray(medusaProduct.options)
    ? medusaProduct.options.filter((opt): opt is UnknownRecord => isRecord(opt))
    : [];

  const optionChanges = detectOptionChanges(
    localOptions,
    medusaOptions,
    reconciled
  );

  // Variant changes
  const localVariants = Array.isArray(localState.variants)
    ? localState.variants.filter((v): v is UnknownRecord => isRecord(v))
    : [];

  const medusaVariants = Array.isArray(medusaProduct.variants)
    ? medusaProduct.variants.filter((v): v is UnknownRecord => isRecord(v))
    : [];

  const variantChanges = detectVariantChanges(
    localVariants,
    medusaVariants,
    reconciled
  );

  // Calculate summary
  const rootFieldChangeCount = Object.keys(rootFields).length;
  const optionChangeCount =
    optionChanges.added.length +
    optionChanges.modified.length +
    optionChanges.removed.length;
  const variantChangeCount =
    variantChanges.added.length +
    variantChanges.modified.length +
    variantChanges.removed.length;

  const totalChangeCount =
    rootFieldChangeCount + optionChangeCount + variantChangeCount;

  return {
    rootFields,
    options: optionChanges,
    variants: variantChanges,
    hasChanges: totalChangeCount > 0,
    changeCount: totalChangeCount,
  };
}

/**
 * Format changes for logging
 */
export function formatChangesForLog(changes: ProductChanges): string {
  const lines: string[] = [];

  if (changes.changeCount === 0) {
    return 'No changes detected';
  }

  lines.push(`Total changes: ${changes.changeCount}`);

  // Root fields
  const rootFieldNames = Object.keys(changes.rootFields);
  if (rootFieldNames.length > 0) {
    lines.push(`\nRoot fields (${rootFieldNames.length}):`);
    for (const field of rootFieldNames) {
      const change = changes.rootFields[field];
      if (change) {
        lines.push(
          `  - ${field}: "${change.old}" → "${change.new}"`
        );
      }
    }
  }

  // Options
  const optionCount =
    changes.options.added.length +
    changes.options.modified.length +
    changes.options.removed.length;
  if (optionCount > 0) {
    lines.push(`\nOptions (${optionCount}):`);
    for (const opt of changes.options.added) {
      lines.push(`  + Added: "${opt.title}"`);
    }
    for (const opt of changes.options.modified) {
      lines.push(`  ~ Modified: "${opt.title}"`);
      if (opt.valueChanges) {
        if (opt.valueChanges.added.length > 0) {
          lines.push(`    Added values: ${opt.valueChanges.added.join(', ')}`);
        }
        if (opt.valueChanges.removed.length > 0) {
          lines.push(`    Removed values: ${opt.valueChanges.removed.join(', ')}`);
        }
      }
    }
    for (const opt of changes.options.removed) {
      lines.push(`  - Removed: "${opt.title}"`);
    }
  }

  // Variants
  const variantCount =
    changes.variants.added.length +
    changes.variants.modified.length +
    changes.variants.removed.length;
  if (variantCount > 0) {
    lines.push(`\nVariants (${variantCount}):`);
    for (const v of changes.variants.added) {
      lines.push(`  + Added: ${v.sku || 'No SKU'}`);
    }
    for (const v of changes.variants.modified) {
      lines.push(`  ~ Modified: ${v.sku || 'No SKU'}`);
      if (v.fieldChanges) {
        const fieldNames = Object.keys(v.fieldChanges);
        lines.push(`    Changed fields: ${fieldNames.join(', ')}`);
      }
    }
    for (const v of changes.variants.removed) {
      lines.push(`  - Removed: ${v.sku || 'No SKU'}`);
    }
  }

  return lines.join('\n');
}
