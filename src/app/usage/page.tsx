'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Calendar, Filter, Search, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LLMSession {
  id: string;
  module: string;
  status: 'pending' | 'success' | 'error' | 'partial';
  started_at: string;
  completed_at: string | null;
  total_tokens_prompt: number;
  total_tokens_completion: number;
  total_cost_estimate: number | null;
  input_summary: string;
}

export default function UsagePage() {
  const [sessions, setSessions] = useState<LLMSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    module: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadSessions();
  }, [filters]);

  const loadSessions = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('llm_sessions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(100);

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

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

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
        <h1 className="text-4xl font-bold text-white">Usage & Logging</h1>
        <p className="text-zinc-400">
          View all AI feature usage, LLM calls, and pipeline events.
        </p>
      </header>

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

