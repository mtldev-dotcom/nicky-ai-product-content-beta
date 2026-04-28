'use client';

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ExternalLink, Filter, Sparkles, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UsageSessionRecord } from '@/lib/data/usage-repository';

export default function UsagePage() {
  const [sessions, setSessions] = useState<UsageSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    module: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });
  const router = useRouter();

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.module) params.set('module', filters.module);
      if (filters.status) params.set('status', filters.status);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      params.set('limit', '100');

      const res = await fetch(`/api/usage/sessions?${params.toString()}`, { cache: 'no-store' });
      const payload = (await res.json()) as { sessions?: UsageSessionRecord[]; error?: string };
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to load sessions');
      }
      setSessions(payload.sessions ?? []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      setError(error instanceof Error ? error.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const summary = useMemo(() => {
    const totalTokens = sessions.reduce(
      (sum, session) => sum + session.total_tokens_prompt + session.total_tokens_completion,
      0
    );
    const totalCost = sessions.reduce((sum, session) => sum + (session.total_cost_estimate ?? 0), 0);
    const successCount = sessions.filter((session) => session.status === 'success').length;
    return {
      totalSessions: sessions.length,
      totalTokens,
      totalCost,
      successRate: sessions.length ? Math.round((successCount / sessions.length) * 100) : 0,
    };
  }, [sessions]);

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      success: 'bg-green-500/10 text-green-400 border-green-500/20',
      error: 'bg-red-500/10 text-red-400 border-red-500/20',
      partial: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    };
    return (
      <span className={cn('px-2 py-1 rounded text-xs font-medium border', styles[status as keyof typeof styles] || styles.pending)}>
        {status}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatCost = (cost: number | null) => {
    if (cost === null) return '—';
    return `$${cost.toFixed(4)}`;
  };

  return (
    <div className="space-y-8 pb-20 md:pb-0">
      <header className="space-y-4">
        <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_24%),linear-gradient(180deg,rgba(24,24,27,0.94),rgba(9,9,11,0.96))] p-6 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                Observability
              </div>
              <h1 className="text-4xl font-bold text-white">Usage & Logging</h1>
              <p className="max-w-2xl text-zinc-300">
                Review pipeline runs, token spend, and the exact LLM call sequence without exposing raw credentials.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Sessions</div>
                <div className="mt-2 text-2xl font-bold text-white">{summary.totalSessions}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Tokens</div>
                <div className="mt-2 flex items-center gap-2 text-2xl font-bold text-white">
                  <Activity className="h-5 w-5 text-emerald-300" />
                  {summary.totalTokens.toLocaleString()}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Cost</div>
                <div className="mt-2 flex items-center gap-2 text-2xl font-bold text-white">
                  <Wallet className="h-5 w-5 text-emerald-300" />${summary.totalCost.toFixed(4)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <section className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </section>
      )}

      {/* Filters */}
      <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
        <div className="flex items-center gap-2 text-zinc-400">
          <Filter className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Filters</h2>
        </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Module</label>
            <select
              value={filters.module}
              onChange={(e) => setFilters({ ...filters, module: e.target.value })}
              className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
            >
              <option value="">All</option>
              <option value="JUST_DROP_IT">JUST DROP IT</option>
              <option value="GENERATE">Generate</option>
              <option value="ENHANCE">Enhance</option>
              <option value="TRANSLATE">Translate</option>
              <option value="AI_STUDIO_IMAGE">AI Studio Photo</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="partial">Partial</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">From Date</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">To Date</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
            />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4 text-xs text-zinc-500">
            <span>{summary.successRate}% success rate in current view</span>
            <button
              type="button"
              onClick={() => setFilters({ module: '', status: '', dateFrom: '', dateTo: '' })}
              className="rounded-full border border-white/10 px-3 py-1 text-zinc-300 transition hover:border-white/20 hover:text-white"
            >
              Clear filters
            </button>
          </div>
        </div>
      </section>

      {/* Sessions Table */}
      <section className="glass rounded-2xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Module</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Tokens</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Cost</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Input Summary</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">
                    Loading...
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">
                    No sessions found
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-sm text-zinc-300">
                      {formatDate(session.started_at)}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-300">
                      {session.module}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(session.status)}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-300">
                      {(session.total_tokens_prompt + session.total_tokens_completion).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-300">
                      {formatCost(session.total_cost_estimate)}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-300 max-w-xs truncate">
                      {session.input_summary || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => router.push(`/usage/${session.id}`)}
                        className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 text-sm"
                      >
                        View
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

