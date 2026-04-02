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
import type { StreamEmit } from '@/lib/ingest/stream-types';

export interface LLMCallParams {
  sessionId: string;
  step: string; // e.g., 'classification', 'blueprint_generation'
  model: string; // e.g., 'gpt-4o-mini'
  messages: ChatCompletionMessageParam[];
  openai: OpenAI;
  responseFormat?: 'json_object' | 'text';
  temperature?: number;
  maxTokens?: number;
  /** Optional SSE emitter — when provided, emits an llm_call event after each successful call. */
  emit?: StreamEmit;
}

export interface LLMCallResult {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/**
 * Logs a non-chat "AI call" into the same LLM call tables.
 *
 * Use this for providers that are not OpenAI chat completions (e.g. image generation),
 * so the Usage page can still show the prompt + outputs in a consistent place.
 *
 * Notes:
 * - Token counts may be unknown; pass 0 if unavailable.
 * - This must never throw (logging is best-effort).
 */
export async function logCallPreview(params: {
  sessionId: string;
  step: string;
  model: string;
  promptText: string;
  responseText?: string | null;
  tokensPrompt?: number;
  tokensCompletion?: number;
}): Promise<void> {
  try {
    const supabase = await createClient();

    const promptPreview = minimizeContent(params.promptText || '', 2048);
    const promptFull = minimizeContent(params.promptText || '', 4096);
    const responsePreview = params.responseText ? minimizeContent(params.responseText, 2048) : null;

    await supabase.from('llm_calls').insert({
      session_id: params.sessionId,
      step: params.step,
      model: params.model,
      prompt_preview: promptPreview,
      prompt_full: promptFull.length > promptPreview.length ? promptFull : null,
      response_preview: responsePreview,
      tokens_prompt: params.tokensPrompt ?? 0,
      tokens_completion: params.tokensCompletion ?? 0,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error logging call preview (non-fatal):', error);
  }
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
  const { sessionId, step, model, messages, openai, responseFormat, temperature, maxTokens, emit } = params;
  
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
  
  // Emit to SSE stream (non-blocking, best-effort)
  if (emit) {
    try {
      const lastUser = [...messages].reverse().find(m => m.role === 'user');
      const rawPrompt = typeof lastUser?.content === 'string'
        ? lastUser.content
        : Array.isArray(lastUser?.content)
          ? (lastUser.content as Array<{ type: string; text?: string }>).find(p => p.type === 'text')?.text ?? `[${step}]`
          : `[${step}]`;
      emit({
        type: 'llm_call',
        step,
        model,
        promptPreview: rawPrompt.replace(/\s+/g, ' ').substring(0, 200),
        responsePreview: content.replace(/\s+/g, ' ').substring(0, 200),
        tokens: { prompt: usage.prompt_tokens, completion: usage.completion_tokens },
        ts: Date.now(),
      });
    } catch {
      // Emit failures are non-fatal
    }
  }

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
    const promptFull = minimizeContent(messagesStr, 4096); // 4KB full (if needed)
    
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

