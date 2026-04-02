'use client';

import React, { useEffect, useRef } from 'react';
import { ExternalLink, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IngestStreamEvent } from '@/lib/ingest/stream-types';

interface Props {
  events: IngestStreamEvent[];
  isRunning: boolean;
  sessionId: string | null;
}

// Maps pipeline event names to human-readable section labels
const SECTION_LABELS: Record<string, string> = {
  CLASSIFICATION_STARTED: 'Classifying inputs',
  EXTRACTION_STARTED: 'Extracting evidence',
  BLUEPRINT_STARTED: 'Generating blueprint',
};

const DONE_LABELS: Record<string, string> = {
  CLASSIFICATION_COMPLETE: 'Classification done',
  EXTRACTION_COMPLETE: 'Extraction done',
  BLUEPRINT_COMPLETE: 'Blueprint done',
};

const ERROR_LABELS: Record<string, boolean> = {
  CLASSIFICATION_ERROR: true,
  EXTRACTION_TEXT_ERROR: true,
  EXTRACTION_VISION_ERROR: true,
  EXTRACTION_URL_ERROR: true,
  BLUEPRINT_ERROR: true,
};

function formatTokens(prompt: number, completion: number): string {
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  return `${fmt(prompt)}↑ ${fmt(completion)}↓`;
}

function stepLabel(step: string): string {
  return step.replace(/_/g, '-');
}

export function GenerationLogPanel({ events, isRunning, sessionId }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as events arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  // Compute totals from complete event
  const completeEvent = events.find(e => e.type === 'complete');
  const llmCalls = events.filter(e => e.type === 'llm_call') as Extract<IngestStreamEvent, { type: 'llm_call' }>[];
  const totalTokens = llmCalls.reduce((sum, e) => sum + e.tokens.prompt + e.tokens.completion, 0);

  return (
    <div className="glass rounded-2xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-semibold text-zinc-400 tracking-wide uppercase">Generation Log</span>
        </div>
        {sessionId && (
          <a
            href={`/usage/${sessionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View session
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Log body */}
      <div
        ref={scrollRef}
        className="font-mono text-[11px] leading-5 p-4 space-y-0.5 max-h-72 overflow-y-auto scrollbar-thin"
      >
        {events.map((event, i) => (
          <LogLine key={i} event={event} />
        ))}

        {/* Blinking cursor while running */}
        {isRunning && (
          <div className="text-zinc-600 animate-pulse select-none pt-0.5">▋</div>
        )}

        {/* Summary footer */}
        {completeEvent && totalTokens > 0 && (
          <div className="pt-2 mt-2 border-t border-white/5 text-zinc-500">
            <span className="text-green-400 font-semibold">✓ Done</span>
            {' — '}
            {totalTokens.toLocaleString()} tokens total
          </div>
        )}
      </div>
    </div>
  );
}

function LogLine({ event }: { event: IngestStreamEvent }) {
  if (event.type === 'session_created') {
    return (
      <div className="text-zinc-600">
        <span className="text-indigo-500">◆</span> Session{' '}
        <span className="text-zinc-500">{event.sessionId.substring(0, 8)}…</span> started
      </div>
    );
  }

  if (event.type === 'pipeline_event') {
    const sectionLabel = SECTION_LABELS[event.event];
    if (sectionLabel) {
      return (
        <div className="mt-2 first:mt-0">
          <span className="text-indigo-400 font-semibold">▸ {sectionLabel.toUpperCase()}</span>
        </div>
      );
    }

    const doneLabel = DONE_LABELS[event.event];
    if (doneLabel) {
      return (
        <div className="text-green-600 pl-3">✓ {doneLabel}</div>
      );
    }

    if (ERROR_LABELS[event.event]) {
      return (
        <div className="text-red-400 pl-3">✗ {event.event.toLowerCase().replace(/_/g, ' ')}</div>
      );
    }

    // Other pipeline events (fine-grained sub-steps) — subtle
    if (event.event === 'INGEST_RECEIVED') return null;

    return (
      <div className="text-zinc-700 pl-3 italic">{event.event}</div>
    );
  }

  if (event.type === 'llm_call') {
    return (
      <div className={cn('pl-3 flex items-baseline gap-2 flex-wrap')}>
        <span className="text-zinc-600">⟳</span>
        <span className="text-violet-400">{event.model}</span>
        <span className="text-zinc-500">·</span>
        <span className="text-zinc-400">{stepLabel(event.step)}</span>
        <span className="text-zinc-500">·</span>
        <span className="text-zinc-600">{formatTokens(event.tokens.prompt, event.tokens.completion)}</span>
      </div>
    );
  }

  if (event.type === 'url_fetch') {
    if (event.status === 'started') {
      return (
        <div className="pl-3 text-zinc-500">
          <span className="text-zinc-600">→</span> Fetching{' '}
          <span className="text-zinc-400">{event.url}</span>
        </div>
      );
    }
    if (event.status === 'done') {
      return <div className="pl-3 text-green-700">✓ URL loaded</div>;
    }
    if (event.status === 'error') {
      return <div className="pl-3 text-red-500">✗ URL fetch failed</div>;
    }
  }

  if (event.type === 'complete') {
    return (
      <div className="mt-2 text-green-400 font-semibold">
        ✅ Blueprint ready
      </div>
    );
  }

  if (event.type === 'error') {
    return (
      <div className="mt-1 text-red-400">
        <span className="font-semibold">✗ Error:</span>{' '}
        <span className="text-red-300/80">{event.message}</span>
      </div>
    );
  }

  return null;
}
