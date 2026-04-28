'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Clock, DollarSign, Hash, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UsageCallRecord, UsagePipelineEventRecord, UsageSessionRecord } from '@/lib/data/usage-repository';

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  
  const [session, setSession] = useState<UsageSessionRecord | null>(null);
  const [events, setEvents] = useState<UsagePipelineEventRecord[]>([]);
  const [calls, setCalls] = useState<UsageCallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set());

  const loadSessionData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/usage/sessions/${sessionId}`, { cache: 'no-store' });
      const payload = (await res.json()) as {
        session?: UsageSessionRecord | null;
        events?: UsagePipelineEventRecord[];
        calls?: UsageCallRecord[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to load session detail');
      }
      setSession(payload.session ?? null);
      setEvents(payload.events ?? []);
      setCalls(payload.calls ?? []);
    } catch (error) {
      console.error('Failed to load session data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load session data');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) {
      void loadSessionData();
    }
  }, [sessionId, loadSessionData]);

  const toggleCallExpansion = (callId: string) => {
    const newExpanded = new Set(expandedCalls);
    if (newExpanded.has(callId)) {
      newExpanded.delete(callId);
    } else {
      newExpanded.add(callId);
    }
    setExpandedCalls(newExpanded);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getDuration = () => {
    if (!session?.started_at || !session?.completed_at) return '-';
    const start = new Date(session.started_at);
    const end = new Date(session.completed_at);
    const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-zinc-400">Loading session...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-zinc-400">{error || 'Session not found'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 md:pb-0">
      <header className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-white">Session Details</h1>
          <p className="text-zinc-400">Module: {session.module}</p>
        </div>
      </header>

      {error && (
        <section className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </section>
      )}

      {/* Header Section */}
      <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-zinc-500 mb-1">Status</div>
            <div className={cn(
              'px-2 py-1 rounded text-xs font-medium inline-block',
              session.status === 'success' && 'bg-green-500/10 text-green-400 border border-green-500/20',
              session.status === 'error' && 'bg-red-500/10 text-red-400 border border-red-500/20',
              session.status === 'pending' && 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
              session.status === 'partial' && 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
            )}>
              {session.status}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Duration
            </div>
            <div className="text-sm text-white">{getDuration()}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Total Tokens
            </div>
            <div className="text-sm text-white">
              {(session.total_tokens_prompt + session.total_tokens_completion).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              Cost
            </div>
            <div className="text-sm text-white">
              {session.total_cost_estimate ? `$${session.total_cost_estimate.toFixed(4)}` : '—'}
            </div>
          </div>
        </div>
        <div className="pt-4 border-t border-white/10">
          <div className="text-xs text-zinc-500 mb-1">Started</div>
          <div className="text-sm text-zinc-300">{formatDate(session.started_at)}</div>
          {session.completed_at && (
            <>
              <div className="text-xs text-zinc-500 mb-1 mt-2">Completed</div>
              <div className="text-sm text-zinc-300">{formatDate(session.completed_at)}</div>
            </>
          )}
        </div>
      </section>

      {/* Input Summary */}
      <section className="glass rounded-2xl p-6 border border-white/10">
        <h2 className="text-lg font-semibold text-white mb-4">Input Summary</h2>
        <p className="text-sm text-zinc-300 whitespace-pre-wrap">{session.input_summary || '—'}</p>
      </section>

      {/* Pipeline Timeline */}
      <section className="glass rounded-2xl p-6 border border-white/10">
        <h2 className="text-lg font-semibold text-white mb-4">Pipeline Timeline</h2>
        <div className="space-y-3">
          {events.length === 0 ? (
            <p className="text-sm text-zinc-500">No events recorded</p>
          ) : (
            events.map((event, idx) => (
              <div key={event.id} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1" />
                  {idx < events.length - 1 && <div className="w-px h-8 bg-white/10 mt-1" />}
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-sm font-medium text-white">{event.event_type}</div>
                  <div className="text-xs text-zinc-500 mt-1">{formatDate(event.created_at)}</div>
                  {event.payload_preview && (
                    <div className="text-xs text-zinc-400 mt-2 bg-zinc-900/50 p-2 rounded border border-white/5">
                      {event.payload_preview}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* LLM Calls Table */}
      <section className="glass rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">LLM Calls</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase">Step</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase">Model</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase">Tokens In</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase">Tokens Out</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase">Time</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {calls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                    No LLM calls recorded
                  </td>
                </tr>
              ) : (
                calls.map((call) => {
                  const isExpanded = expandedCalls.has(call.id);
                  return (
                    <React.Fragment key={call.id}>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 text-sm text-zinc-300">{call.step}</td>
                        <td className="px-6 py-4 text-sm text-zinc-300">{call.model}</td>
                        <td className="px-6 py-4 text-sm text-zinc-300">{call.tokens_prompt.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-zinc-300">{call.tokens_completion.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-zinc-300">{formatDate(call.created_at)}</td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => toggleCallExpansion(call.id)}
                            className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 text-sm"
                          >
                            {isExpanded ? (
                              <>
                                Hide
                                <ChevronUp className="w-4 h-4" />
                              </>
                            ) : (
                              <>
                                Show
                                <ChevronDown className="w-4 h-4" />
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="px-6 py-4 bg-zinc-900/30">
                            <div className="space-y-4">
                              <div>
                                <div className="text-xs text-zinc-500 mb-2">Prompt Preview (2KB max, redacted)</div>
                                <div className="text-xs text-zinc-300 bg-zinc-900/50 p-3 rounded border border-white/5 font-mono whitespace-pre-wrap break-words">
                                  {call.prompt_preview}
                                  {call.prompt_full && call.prompt_full.length > call.prompt_preview.length && (
                                    <div className="mt-2 text-zinc-500 italic">
                                      ... (truncated, {call.prompt_full.length} bytes total)
                                    </div>
                                  )}
                                </div>
                              </div>
                              {call.response_preview && (
                                <div>
                                  <div className="text-xs text-zinc-500 mb-2">Response Preview (2KB max, redacted)</div>
                                  <div className="text-xs text-zinc-300 bg-zinc-900/50 p-3 rounded border border-white/5 font-mono whitespace-pre-wrap break-words">
                                    {call.response_preview}
                                  </div>
                                </div>
                              )}
                              <div className="text-[10px] text-zinc-600 italic">
                                Note: Content is truncated and redacted for security. Secrets are masked.
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Result Summary */}
      {(session.evidence_summary || session.blueprint_summary) && (
        <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
          <h2 className="text-lg font-semibold text-white">Result Summary</h2>
          {session.evidence_summary && (
            <div>
              <div className="text-xs text-zinc-500 mb-2">Evidence Summary</div>
              <div className="text-sm text-zinc-300 bg-zinc-900/50 p-3 rounded border border-white/5">
                {session.evidence_summary}
              </div>
            </div>
          )}
          {session.blueprint_summary && (
            <div>
              <div className="text-xs text-zinc-500 mb-2">Blueprint Summary</div>
              <div className="text-sm text-zinc-300 bg-zinc-900/50 p-3 rounded border border-white/5">
                {session.blueprint_summary}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Error Message */}
      {session.error_message && (
        <section className="glass rounded-2xl p-6 border border-red-500/20 bg-red-500/10">
          <h2 className="text-lg font-semibold text-red-400 mb-2">Error</h2>
          <p className="text-sm text-red-300">{session.error_message}</p>
        </section>
      )}
    </div>
  );
}

