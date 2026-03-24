/**
 * Comprehensive payload validation for Medusa API requests.
 *
 * Validates payloads against Medusa's expected schema before sending to API.
 */

import { z } from 'zod';
import type { MedusaProductPayload, MedusaProductVariant, MedusaProductOption } from './types';
import { type UnknownRecord, isRecord, asString, asNumber } from '@/lib/medusa/utils';

/**
 * Payload validation error with details about what failed.
 * (Different from MedusaValidationError in error-handler.ts which is for API responses)
 */
export class MedusaPayloadValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super(message);
    this.name = 'MedusaPayloadValidationError';
  }
}

/**
 * Validate that a variant has required fields and valid structure.
 */
export function validateVariant(variant: unknown, index: number): void {
  if (!isRecord(variant)) {
    throw new MedusaPayloadValidationError(
      `Variant at index ${index} must be an object`,
      `variants[${index}]`,
      variant
    );
  }

  const v = variant as Partial<MedusaProductVariant>;

  // Validate title
  if (!v.title || typeof v.title !== 'string' || v.title.trim().length === 0) {
    throw new MedusaPayloadValidationError(
      `Variant at index ${index} must have a non-empty title`,
      `variants[${index}].title`,
      v.title
    );
  }

  // Validate prices
  if (!Array.isArray(v.prices) || v.prices.length === 0) {
    throw new MedusaPayloadValidationError(
      `Variant at index ${index} must have at least one price`,
      `variants[${index}].prices`,
      v.prices
    );
  }

  v.prices.forEach((price, priceIndex) => {
    if (!isRecord(price)) {
      throw new MedusaPayloadValidationError(
        `Price at variant[${index}].prices[${priceIndex}] must be an object`,
        `variants[${index}].prices[${priceIndex}]`,
        price
      );
    }

    const p = price as { amount?: unknown; currency_code?: unknown };

    if (typeof p.amount !== 'number' || !Number.isFinite(p.amount)) {
      throw new MedusaPayloadValidationError(
        `Price at variant[${index}].prices[${priceIndex}] must have a valid amount (number)`,
        `variants[${index}].prices[${priceIndex}].amount`,
        p.amount
      );
    }

    if (typeof p.currency_code !== 'string' || p.currency_code.trim().length === 0) {
      throw new MedusaPayloadValidationError(
        `Price at variant[${index}].prices[${priceIndex}] must have a non-empty currency_code`,
        `variants[${index}].prices[${priceIndex}].currency_code`,
        p.currency_code
      );
    }
  });

  // Validate variant options format (must be object: { "option_id": "value" })
  if (v.options !== undefined) {
    if (!isRecord(v.options)) {
      throw new MedusaPayloadValidationError(
        `Variant at index ${index} options must be an object (format: { "option_id": "value" })`,
        `variants[${index}].options`,
        v.options
      );
    }

    // Validate that all values in options object are strings
    for (const [optionId, value] of Object.entries(v.options)) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new MedusaPayloadValidationError(
          `Variant at index ${index} option value for ${optionId} must be a non-empty string`,
          `variants[${index}].options[${optionId}]`,
          value
        );
      }
    }
  }

  // Ensure inventory field is NOT present (Medusa v2 doesn't accept it)
  if ('inventory' in v) {
    throw new MedusaPayloadValidationError(
      `Variant at index ${index} contains 'inventory' field which is not allowed in Medusa v2 product payloads`,
      `variants[${index}].inventory`,
      v.inventory
    );
  }
}

/**
 * Validate that an option has required fields and valid structure.
 */
export function validateOption(option: unknown, index: number): void {
  if (!isRecord(option)) {
    throw new MedusaPayloadValidationError(
      `Option at index ${index} must be an object`,
      `options[${index}]`,
      option
    );
  }

  const opt = option as Partial<MedusaProductOption>;

  // Validate title
  if (!opt.title || typeof opt.title !== 'string' || opt.title.trim().length === 0) {
    throw new MedusaPayloadValidationError(
      `Option at index ${index} must have a non-empty title`,
      `options[${index}].title`,
      opt.title
    );
  }

  // Validate values
  if (!Array.isArray(opt.values) || opt.values.length === 0) {
    throw new MedusaPayloadValidationError(
      `Option at index ${index} must have at least one value`,
      `options[${index}].values`,
      opt.values
    );
  }

  opt.values.forEach((value, valueIndex) => {
    if (typeof value === 'string') {
      if (value.trim().length === 0) {
        throw new MedusaPayloadValidationError(
          `Option at index ${index} value at index ${valueIndex} must be a non-empty string`,
          `options[${index}].values[${valueIndex}]`,
          value
        );
      }
    } else if (isRecord(value)) {
      const val = value as { value?: unknown };
      if (typeof val.value !== 'string' || val.value.trim().length === 0) {
        throw new MedusaPayloadValidationError(
          `Option at index ${index} value at index ${valueIndex} must have a non-empty value string`,
          `options[${index}].values[${valueIndex}].value`,
          val.value
        );
      }
    } else {
      throw new MedusaPayloadValidationError(
        `Option at index ${index} value at index ${valueIndex} must be a string or object with value property`,
        `options[${index}].values[${valueIndex}]`,
        value
      );
    }
  });
}

/**
 * Validate that option values in variants match the product-level options.
 */
export function validateVariantOptionValues(
  variants: unknown[],
  options: MedusaProductOption[]
): void {
  // Build a map of option IDs to their valid values
  const optionValueMap = new Map<string, Set<string>>();
  for (const opt of options) {
    const optId = opt.id;
    if (!optId) continue;

    const validValues = new Set<string>();
    if (Array.isArray(opt.values)) {
      for (const val of opt.values) {
        if (typeof val === 'string') {
          validValues.add(val);
        } else if (isRecord(val) && typeof val.value === 'string') {
          validValues.add(val.value);
        }
      }
    }
    optionValueMap.set(optId, validValues);
  }

  // Validate each variant's options
  variants.forEach((variant, variantIndex) => {
    if (!isRecord(variant)) return;

    const v = variant as { options?: Record<string, string> };
    if (!v.options || !isRecord(v.options)) return;

    for (const [optionId, value] of Object.entries(v.options)) {
      const validValues = optionValueMap.get(optionId);
      if (!validValues) {
        // Option ID not found in product options - might be a create scenario
        // Skip validation in this case
        continue;
      }

      // Check exact match first
      if (!validValues.has(value)) {
        // Try case-insensitive match
        const caseInsensitiveMatch = Array.from(validValues).find(
          (v) => v.toLowerCase() === value.toLowerCase()
        );

        if (!caseInsensitiveMatch) {
          throw new MedusaPayloadValidationError(
            `Variant at index ${variantIndex} has option value "${value}" for option ${optionId} that does not exist in product options. Valid values: ${Array.from(validValues).join(', ')}`,
            `variants[${variantIndex}].options[${optionId}]`,
            value
          );
        }
      }
    }
  });
}

/**
 * Validate a complete Medusa product payload.
 */
export function validateMedusaProductPayload(payload: unknown): void {
  if (!isRecord(payload)) {
    throw new MedusaPayloadValidationError('Payload must be an object', 'payload', payload);
  }

  const p = payload as Partial<MedusaProductPayload>;

  // Validate title
  if (!p.title || typeof p.title !== 'string' || p.title.trim().length === 0) {
    throw new MedusaPayloadValidationError('Product must have a non-empty title', 'title', p.title);
  }

  // Validate variants
  if (!Array.isArray(p.variants) || p.variants.length === 0) {
    throw new MedusaPayloadValidationError(
      'Product must have at least one variant',
      'variants',
      p.variants
    );
  }

  p.variants.forEach((variant, index) => {
    validateVariant(variant, index);
  });

  // Validate options (if present)
  if (p.options !== undefined) {
    if (!Array.isArray(p.options)) {
      throw new MedusaPayloadValidationError('Product options must be an array', 'options', p.options);
    }

    p.options.forEach((option, index) => {
      validateOption(option, index);
    });

    // Validate that variant option values match product-level options
    validateVariantOptionValues(p.variants, p.options);
  }

  // Validate shipping_profile_id (if present, must be string, not null)
  if (p.shipping_profile_id !== undefined && p.shipping_profile_id !== null) {
    if (typeof p.shipping_profile_id !== 'string' || p.shipping_profile_id.trim().length === 0) {
      throw new MedusaPayloadValidationError(
        'shipping_profile_id must be a non-empty string or omitted entirely',
        'shipping_profile_id',
        p.shipping_profile_id
      );
    }
  }
}

/**
 * Medusa option structure (from API response)
 */
interface MedusaOption {
  id: string;
  title: string;
  values: Array<{ id?: string; value: string } | string>;
}

/**
 * Medusa variant structure (from API response)
 */
interface MedusaVariant {
  id: string;
  sku?: string;
  options?: Array<{ option_id: string; value: string }>;
}

/**
 * Validate that option IDs in update payload exist in Medusa
 */
export function validateOptionIds(
  options: MedusaProductOption[],
  medusaOptions: MedusaOption[]
): void {
  const medusaOptionIds = new Set(medusaOptions.map((o) => o.id));

  options.forEach((option, index) => {
    if (option.id) {
      if (!medusaOptionIds.has(option.id)) {
        throw new MedusaPayloadValidationError(
          `Option at index ${index} has ID "${option.id}" that does not exist in Medusa. Omit ID for new options.`,
          `options[${index}].id`,
          option.id
        );
      }
    }
  });
}

/**
 * Validate that variant IDs in update payload exist in Medusa
 */
export function validateVariantIds(
  variants: MedusaProductVariant[],
  medusaVariants: MedusaVariant[]
): void {
  const medusaVariantIds = new Set(medusaVariants.map((v) => v.id));

  variants.forEach((variant, index) => {
    if (variant.id) {
      if (!medusaVariantIds.has(variant.id)) {
        throw new MedusaPayloadValidationError(
          `Variant at index ${index} has ID "${variant.id}" that does not exist in Medusa. Omit ID for new variants.`,
          `variants[${index}].id`,
          variant.id
        );
      }
    }
  });
}

/**
 * Validate that variant options reference valid option IDs
 */
export function validateVariantOptions(
  variant: MedusaProductVariant,
  variantIndex: number,
  medusaOptions: MedusaOption[]
): void {
  if (!variant.options || typeof variant.options !== 'object') {
    return; // No options to validate
  }

  const medusaOptionIds = new Set(medusaOptions.map((o) => o.id));
  const medusaOptionValuesMap = new Map<string, Set<string>>();

  // Build map of option ID -> valid values
  medusaOptions.forEach((opt) => {
    const values = new Set<string>();
    if (Array.isArray(opt.values)) {
      opt.values.forEach((v) => {
        if (typeof v === 'string') {
          values.add(v);
        } else if (isRecord(v) && typeof v.value === 'string') {
          values.add(v.value);
        }
      });
    }
    medusaOptionValuesMap.set(opt.id, values);
  });

  // Validate each variant option
  for (const [optionId, value] of Object.entries(variant.options)) {
    if (typeof value !== 'string') {
      throw new MedusaPayloadValidationError(
        `Variant at index ${variantIndex} has invalid option value for option ${optionId}. Value must be a string.`,
        `variants[${variantIndex}].options[${optionId}]`,
        value
      );
    }

    // Check if option ID exists
    if (!medusaOptionIds.has(optionId)) {
      throw new MedusaPayloadValidationError(
        `Variant at index ${variantIndex} references option ID "${optionId}" that does not exist in Medusa.`,
        `variants[${variantIndex}].options[${optionId}]`,
        optionId
      );
    }

    // Check if value exists for this option
    const validValues = medusaOptionValuesMap.get(optionId);
    if (validValues && !validValues.has(value)) {
      // Try case-insensitive match
      const caseInsensitiveMatch = Array.from(validValues).find(
        (v) => v.toLowerCase() === value.toLowerCase()
      );
      if (!caseInsensitiveMatch) {
        // Try partial match for compound values (e.g., "Silver/Black" might match "Silver" or "Black")
        const partialMatch = Array.from(validValues).find((v) => {
          const valueLower = value.toLowerCase();
          const vLower = v.toLowerCase();
          // Check if value contains the valid value or vice versa
          return valueLower.includes(vLower) || vLower.includes(valueLower);
        });
        
        if (!partialMatch) {
          // Provide helpful error message with suggestion
          const option = medusaOptions.find((o) => o.id === optionId);
          const optionTitle = option?.title || optionId;
          throw new MedusaPayloadValidationError(
            `Option value "${value}" does not exist for option "${optionTitle}" (${optionId}). ` +
            `Valid values: ${Array.from(validValues).join(', ')}. ` +
            `Please add "${value}" to the option values in Medusa first, or use one of the existing values.`,
            `variants[${variantIndex}].options[${optionId}]`,
            value
          );
        }
      }
    }
  }
}

/**
 * Validate update payload against current Medusa state
 *
 * This performs additional validation specific to updates:
 * - Option IDs must exist in Medusa (or be omitted for new options)
 * - Variant IDs must exist in Medusa (or be omitted for new variants)
 * - Variant options must reference valid option IDs
 * - Variant option values must match existing option values
 */
export function validateUpdatePayload(
  payload: unknown,
  medusaState: { options?: MedusaOption[]; variants?: MedusaVariant[] }
): void {
  // First, run standard validation
  validateMedusaProductPayload(payload);

  if (!isRecord(payload)) {
    return; // Already validated above
  }

  const p = payload as Partial<MedusaProductPayload>;
  const medusaOptions = medusaState.options || [];
  const medusaVariants = medusaState.variants || [];

  // Validate option IDs
  if (p.options && Array.isArray(p.options)) {
    validateOptionIds(p.options, medusaOptions);
  }

  // Validate variant IDs
  if (p.variants && Array.isArray(p.variants)) {
    validateVariantIds(p.variants, medusaVariants);

    // Validate variant options
    p.variants.forEach((variant, index) => {
      validateVariantOptions(variant, index, medusaOptions);
    });
  }
}
