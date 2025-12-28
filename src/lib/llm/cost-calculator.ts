/**
 * Cost estimation for LLM API calls.
 * 
 * Generic utility - works with any OpenAI model.
 * Pricing based on current OpenAI rates (as of 2025-01).
 */

/**
 * Current OpenAI pricing per 1M tokens (input/output).
 * Prices in USD.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': {
    input: 0.15, // $0.15 per 1M input tokens
    output: 0.60, // $0.60 per 1M output tokens
  },
  'gpt-4o': {
    input: 2.50,
    output: 10.00,
  },
  'gpt-4-turbo': {
    input: 10.00,
    output: 30.00,
  },
  'gpt-3.5-turbo': {
    input: 0.50,
    output: 1.50,
  },
};

/**
 * Estimates cost for an LLM API call.
 * 
 * @param model - Model name (e.g., 'gpt-4o-mini')
 * @param tokensPrompt - Number of input tokens
 * @param tokensCompletion - Number of output tokens
 * @returns Estimated cost in USD
 */
export function estimateCost(
  model: string,
  tokensPrompt: number,
  tokensCompletion: number
): number {
  const pricing = PRICING[model];
  
  if (!pricing) {
    // Unknown model - return 0 or use a default
    // Could log a warning in production
    return 0;
  }
  
  const inputCost = (tokensPrompt / 1_000_000) * pricing.input;
  const outputCost = (tokensCompletion / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
}

/**
 * Gets pricing info for a model (for display purposes).
 */
export function getModelPricing(model: string): { input: number; output: number } | null {
  return PRICING[model] || null;
}

