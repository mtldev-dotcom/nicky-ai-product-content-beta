/**
 * Session management for LLM logging.
 * 
 * Generic platform capability - manages sessions for any AI feature.
 * Handles creation, updates, and pipeline event logging.
 */

import { createClient } from '@/utils/supabase/server';
import { minimizeContent } from './redaction';

export type SessionStatus = 'pending' | 'success' | 'error' | 'partial';

export interface CreateSessionParams {
  orgId: string;
  userId: string;
  module: string; // e.g., 'JUST_DROP_IT', 'GENERATE', etc.
  inputSummary: string; // Will be minimized to 500 chars
}

export interface UpdateSessionParams {
  sessionId: string;
  status: SessionStatus;
  evidenceSummary?: string; // Max 1KB
  blueprintSummary?: string; // Max 1KB
  totalTokensPrompt?: number;
  totalTokensCompletion?: number;
  totalCostEstimate?: number;
}

/**
 * Creates a new LLM session.
 * Returns sessionId for use in subsequent logging calls.
 */
export async function createSession(params: CreateSessionParams): Promise<string> {
  const supabase = await createClient();
  
  // Minimize and redact input summary (max 500 chars)
  const minimizedSummary = minimizeContent(params.inputSummary, 500);
  
  const { data, error } = await supabase
    .from('llm_sessions')
    .insert({
      org_id: params.orgId,
      user_id: params.userId,
      module: params.module,
      status: 'pending',
      started_at: new Date().toISOString(),
      input_summary: minimizedSummary,
      total_tokens_prompt: 0,
      total_tokens_completion: 0,
    })
    .select('id')
    .single();
  
  if (error) {
    // Log error but don't throw - logging failures shouldn't break features
    console.error('Failed to create LLM session:', error);
    throw new Error('Failed to create logging session');
  }
  
  if (!data?.id) {
    throw new Error('Session created but no ID returned');
  }
  
  return data.id;
}

/**
 * Logs a pipeline event (high-level breadcrumb).
 */
export async function logPipelineEvent(
  sessionId: string,
  eventType: string,
  payloadPreview?: string
): Promise<void> {
  try {
    const supabase = await createClient();
    
    // Minimize payload preview (max 2KB)
    const minimizedPayload = payloadPreview 
      ? minimizeContent(payloadPreview, 2048)
      : null;
    
    await supabase
      .from('pipeline_events')
      .insert({
        session_id: sessionId,
        event_type: eventType,
        payload_preview: minimizedPayload,
        created_at: new Date().toISOString(),
      });
    
    // Errors are silently caught - logging failures shouldn't break features
  } catch (error) {
    console.error('Failed to log pipeline event:', error);
    // Don't throw - continue execution
  }
}

/**
 * Updates session status and summaries on completion.
 */
export async function updateSessionStatus(params: UpdateSessionParams): Promise<void> {
  try {
    const supabase = await createClient();
    
    const updateData: Record<string, unknown> = {
      status: params.status,
      completed_at: new Date().toISOString(),
    };
    
    // Minimize summaries (max 1KB each)
    if (params.evidenceSummary !== undefined) {
      updateData.evidence_summary = minimizeContent(params.evidenceSummary, 1024);
    }
    
    if (params.blueprintSummary !== undefined) {
      updateData.blueprint_summary = minimizeContent(params.blueprintSummary, 1024);
    }
    
    if (params.totalTokensPrompt !== undefined) {
      updateData.total_tokens_prompt = params.totalTokensPrompt;
    }
    
    if (params.totalTokensCompletion !== undefined) {
      updateData.total_tokens_completion = params.totalTokensCompletion;
    }
    
    if (params.totalCostEstimate !== undefined) {
      updateData.total_cost_estimate = params.totalCostEstimate;
    }
    
    await supabase
      .from('llm_sessions')
      .update(updateData)
      .eq('id', params.sessionId);
    
  } catch (error) {
    console.error('Failed to update session status:', error);
    // Don't throw - continue execution
  }
}

/**
 * Updates session with error information.
 */
export async function updateSessionError(
  sessionId: string,
  errorMessage: string
): Promise<void> {
  try {
    const supabase = await createClient();
    
    // Redact error message (no secrets)
    const redactedError = minimizeContent(errorMessage, 500);
    
    await supabase
      .from('llm_sessions')
      .update({
        status: 'error',
        completed_at: new Date().toISOString(),
        error_message: redactedError,
      })
      .eq('id', sessionId);
    
  } catch (error) {
    console.error('Failed to update session error:', error);
    // Don't throw - continue execution
  }
}

