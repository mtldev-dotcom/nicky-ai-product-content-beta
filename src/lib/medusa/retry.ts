/**
 * Retry logic with exponential backoff for Medusa API requests.
 */

import { isRetryableError } from './error-handler';

/**
 * Options for retry configuration.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Custom function to determine if an error is retryable */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  shouldRetry: (error) => isRetryableError(error),
};

/**
 * Calculate delay for retry attempt using exponential backoff.
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const delay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  return Math.min(delay, options.maxDelayMs);
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff.
 *
 * @param fn - Function to execute (should return a Promise)
 * @param options - Retry configuration options
 * @returns Result of the function execution
 * @throws Last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if we've exhausted attempts
      if (attempt >= config.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!config.shouldRetry(error, attempt)) {
        break;
      }

      // Calculate delay and wait before retrying
      const delay = calculateDelay(attempt, config);
      console.warn(`Medusa API request failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms...`, error);
      await sleep(delay);
    }
  }

  // All retries exhausted, throw the last error
  throw lastError;
}
