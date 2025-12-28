/**
 * Generic LLM logging wrapper.
 * 
 * CRITICAL: This is a platform capability with NO feature-specific dependencies.
 * Any AI feature (current or future) can use this with no changes.
 * 
 * All LLM calls should go through this wrapper to ensure:
 * - Token usage tracking
 * - Cost estimation
 * - Secure logging (redaction + minimization)
 * - Non-blocking error handling
 */

import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { createClient } from '@/utils/supabase/server';
import { minimizeContent } from './redaction';
import { estimateCost } from './cost-calculator';

export interface LLMCallParams {
  sessionId: string;
  step: string; // e.g., 'classification', 'blueprint_generation'
  model: string; // e.g., 'gpt-4o-mini'
  messages: ChatCompletionMessageParam[];
  openai: OpenAI;
  responseFormat?: 'json_object' | 'text';
  temperature?: number;
  maxTokens?: number;
}

export interface LLMCallResult {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/**
 * Executes an LLM call with automatic logging.
 * 
 * This is the ONLY function that should be used for LLM calls in the codebase.
 * Never call OpenAI directly - always use this wrapper.
 */
export async function callLLMWithLogging(
  params: LLMCallParams
): Promise<LLMCallResult> {
  const { sessionId, step, model, messages, openai, responseFormat, temperature, maxTokens } = params;
  
  // Execute the LLM call
  let response;
  try {
    response = await openai.chat.completions.create({
      model,
      messages,
      response_format: responseFormat ? { type: responseFormat } : undefined,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens,
    });
  } catch (error) {
    // Log the error but rethrow - this is a real failure, not a logging failure
    await logLLMCallError(sessionId, step, model, messages, error);
    throw error;
  }
  
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content returned from LLM');
  }
  
  const usage = {
    prompt_tokens: response.usage?.prompt_tokens ?? 0,
    completion_tokens: response.usage?.completion_tokens ?? 0,
  };
  
  // Log the call (non-blocking)
  await logLLMCall(sessionId, step, model, messages, content, usage).catch(err => {
    // Logging failures must NOT break the pipeline
    console.error('Failed to log LLM call (non-fatal):', err);
  });
  
  // Update session totals (non-blocking)
  await updateSessionTotals(sessionId, usage.prompt_tokens, usage.completion_tokens, model).catch(err => {
    console.error('Failed to update session totals (non-fatal):', err);
  });
  
  return { content, usage };
}

/**
 * Logs an LLM call to the database.
 * Internal function - called by callLLMWithLogging.
 */
async function logLLMCall(
  sessionId: string,
  step: string,
  model: string,
  messages: ChatCompletionMessageParam[],
  response: string,
  usage: { prompt_tokens: number; completion_tokens: number }
): Promise<void> {
  try {
    const supabase = await createClient();
    
    // Serialize messages for storage (redacted and minimized)
    const messagesStr = JSON.stringify(messages);
    const promptPreview = minimizeContent(messagesStr, 2048); // 2KB preview
    const promptFull = minimizeContent(messagesStr, 10240); // 10KB full (if needed)
    
    // Minimize response
    const responsePreview = minimizeContent(response, 2048); // 2KB preview
    
    await supabase
      .from('llm_calls')
      .insert({
        session_id: sessionId,
        step,
        model,
        prompt_preview: promptPreview,
        prompt_full: promptFull.length > promptPreview.length ? promptFull : null,
        response_preview: responsePreview,
        tokens_prompt: usage.prompt_tokens,
        tokens_completion: usage.completion_tokens,
        created_at: new Date().toISOString(),
      });
    
  } catch (error) {
    // Don't throw - logging failures are non-fatal
    console.error('Error logging LLM call:', error);
  }
}

/**
 * Logs an LLM call error.
 */
async function logLLMCallError(
  sessionId: string,
  step: string,
  model: string,
  messages: ChatCompletionMessageParam[],
  error: unknown
): Promise<void> {
  try {
    const supabase = await createClient();
    
    const messagesStr = JSON.stringify(messages);
    const promptPreview = minimizeContent(messagesStr, 2048);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorPreview = minimizeContent(errorMessage, 500);
    
    await supabase
      .from('llm_calls')
      .insert({
        session_id: sessionId,
        step,
        model,
        prompt_preview: promptPreview,
        response_preview: `ERROR: ${errorPreview}`,
        tokens_prompt: 0,
        tokens_completion: 0,
        created_at: new Date().toISOString(),
      });
    
  } catch (logError) {
    console.error('Failed to log LLM error:', logError);
  }
}

/**
 * Updates session totals with new token usage.
 */
async function updateSessionTotals(
  sessionId: string,
  tokensPrompt: number,
  tokensCompletion: number,
  model: string
): Promise<void> {
  try {
    const supabase = await createClient();
    
    // Get current totals
    const { data: session } = await supabase
      .from('llm_sessions')
      .select('total_tokens_prompt, total_tokens_completion')
      .eq('id', sessionId)
      .single();
    
    if (!session) return;
    
    const newPromptTotal = (session.total_tokens_prompt ?? 0) + tokensPrompt;
    const newCompletionTotal = (session.total_tokens_completion ?? 0) + tokensCompletion;
    
    // Calculate cost
    const cost = estimateCost(model, tokensPrompt, tokensCompletion);
    const { data: currentSession } = await supabase
      .from('llm_sessions')
      .select('total_cost_estimate')
      .eq('id', sessionId)
      .single();
    
    const newCostTotal = (currentSession?.total_cost_estimate ?? 0) + cost;
    
    // Update session
    await supabase
      .from('llm_sessions')
      .update({
        total_tokens_prompt: newPromptTotal,
        total_tokens_completion: newCompletionTotal,
        total_cost_estimate: newCostTotal,
      })
      .eq('id', sessionId);
    
  } catch (error) {
    console.error('Error updating session totals:', error);
    // Don't throw - non-fatal
  }
}

