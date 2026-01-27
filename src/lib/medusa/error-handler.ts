/**
 * Structured error handling for Medusa API operations.
 */

import type { MedusaErrorResponse } from './types';
import { extractMedusaErrorMessage, parseMedusaResponse } from './response-parser';

// Re-export parseMedusaResponse for convenience
export { parseMedusaResponse } from './response-parser';

/**
 * Base class for Medusa API errors.
 */
export class MedusaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'MedusaApiError';
  }
}

/**
 * Validation error from Medusa API (400 Bad Request).
 */
export class MedusaValidationError extends MedusaApiError {
  constructor(message: string, status: number, statusText: string, details?: unknown) {
    super(message, status, statusText, details);
    this.name = 'MedusaValidationError';
  }
}

/**
 * Not found error from Medusa API (404 Not Found).
 */
export class MedusaNotFoundError extends MedusaApiError {
  constructor(message: string, status: number, statusText: string, details?: unknown) {
    super(message, status, statusText, details);
    this.name = 'MedusaNotFoundError';
  }
}

/**
 * Authentication/authorization error from Medusa API (401/403).
 */
export class MedusaAuthError extends MedusaApiError {
  constructor(message: string, status: number, statusText: string, details?: unknown) {
    super(message, status, statusText, details);
    this.name = 'MedusaAuthError';
  }
}

/**
 * Server error from Medusa API (5xx).
 */
export class MedusaServerError extends MedusaApiError {
  constructor(message: string, status: number, statusText: string, details?: unknown) {
    super(message, status, statusText, details);
    this.name = 'MedusaServerError';
  }
}

/**
 * Network or connection error.
 */
export class MedusaNetworkError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'MedusaNetworkError';
  }
}

/**
 * Parse a Medusa API error response into a structured error.
 */
export function parseMedusaError(
  status: number,
  statusText: string,
  response: unknown
): MedusaApiError {
  const errorMessage = extractMedusaErrorMessage(response);

  if (status === 400) {
    return new MedusaValidationError(errorMessage, status, statusText, response);
  }

  if (status === 401 || status === 403) {
    return new MedusaAuthError(errorMessage, status, statusText, response);
  }

  if (status === 404) {
    return new MedusaNotFoundError(errorMessage, status, statusText, response);
  }

  if (status >= 500) {
    return new MedusaServerError(errorMessage, status, statusText, response);
  }

  return new MedusaApiError(errorMessage, status, statusText, response);
}

/**
 * Check if an error is retryable (should retry with exponential backoff).
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof MedusaNetworkError) {
    return true;
  }

  if (error instanceof MedusaServerError) {
    return true;
  }

  // Network errors (fetch failures, timeouts, etc.)
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    );
  }

  return false;
}

/**
 * Get user-friendly error message with recovery suggestions.
 */
export function getErrorMessageWithSuggestions(error: unknown): string {
  if (error instanceof MedusaValidationError) {
    return `${error.message}\n\nSuggestion: Check that all required fields are present and have valid values. Review the error details for specific field issues.`;
  }

  if (error instanceof MedusaAuthError) {
    return `${error.message}\n\nSuggestion: Verify your Medusa API key and URL are correct in Settings.`;
  }

  if (error instanceof MedusaNotFoundError) {
    return `${error.message}\n\nSuggestion: The resource may have been deleted or the ID may be incorrect.`;
  }

  if (error instanceof MedusaServerError) {
    return `${error.message}\n\nSuggestion: This appears to be a server-side issue. Please try again later or contact support if the problem persists.`;
  }

  if (error instanceof MedusaNetworkError) {
    return `${error.message}\n\nSuggestion: Check your internet connection and Medusa server availability.`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unknown error occurred';
}
