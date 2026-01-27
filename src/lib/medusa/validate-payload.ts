/**
 * Comprehensive payload validation for Medusa API requests.
 *
 * Validates payloads against Medusa's expected schema before sending to API.
 */

import { z } from 'zod';
import type { MedusaProductPayload, MedusaProductVariant, MedusaProductOption } from './types';

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

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
