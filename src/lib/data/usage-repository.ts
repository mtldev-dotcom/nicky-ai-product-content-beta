import { createClient } from '@/utils/supabase/server';
import { requireCurrentOrgContext } from '@/lib/auth/auth-context';

export interface UsageSessionRecord {
  id: string;
  org_id: string;
  user_id: string;
  module: string;
  status: 'pending' | 'success' | 'error' | 'partial';
  started_at: string;
  completed_at: string | null;
  input_summary: string;
  evidence_summary: string | null;
  blueprint_summary: string | null;
  total_tokens_prompt: number;
  total_tokens_completion: number;
  total_cost_estimate: number | null;
  error_message: string | null;
}

export interface UsagePipelineEventRecord {
  id: string;
  session_id: string;
  event_type: string;
  payload_preview: string | null;
  created_at: string;
}

export interface UsageCallRecord {
  id: string;
  session_id: string;
  step: string;
  model: string;
  prompt_preview: string;
  prompt_full: string | null;
  response_preview: string | null;
  tokens_prompt: number;
  tokens_completion: number;
  created_at: string;
}

export interface UsageSessionFilters {
  module?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export async function listUsageSessions(filters: UsageSessionFilters): Promise<UsageSessionRecord[]> {
  const { orgId } = await requireCurrentOrgContext();
  const supabase = await createClient();

  let query = supabase
    .from('llm_sessions')
    .select('*')
    .eq('org_id', orgId)
    .order('started_at', { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.module) {
    query = query.eq('module', filters.module);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.dateFrom) {
    query = query.gte('started_at', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('started_at', filters.dateTo);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as UsageSessionRecord[];
}

export async function getUsageSessionDetail(sessionId: string): Promise<{
  session: UsageSessionRecord | null;
  events: UsagePipelineEventRecord[];
  calls: UsageCallRecord[];
}> {
  const { orgId } = await requireCurrentOrgContext();
  const supabase = await createClient();

  const { data: session, error: sessionError } = await supabase
    .from('llm_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session) {
    return { session: null, events: [], calls: [] };
  }

  const [{ data: events, error: eventsError }, { data: calls, error: callsError }] = await Promise.all([
    supabase
      .from('pipeline_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
    supabase
      .from('llm_calls')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
  ]);

  if (eventsError) {
    throw new Error(eventsError.message);
  }
  if (callsError) {
    throw new Error(callsError.message);
  }

  return {
    session: session as UsageSessionRecord,
    events: (events ?? []) as UsagePipelineEventRecord[],
    calls: (calls ?? []) as UsageCallRecord[],
  };
}
