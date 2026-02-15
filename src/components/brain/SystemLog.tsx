import React from 'react';
import { Terminal } from 'lucide-react';

export function SystemLog() {
  const logs = [
    { time: '02:14:01', type: 'info', msg: 'System initialized. Welcome back, Nicky.' },
    { time: '02:14:05', type: 'success', msg: 'Connected to Supabase active node.' },
    { time: '02:15:22', type: 'warning', msg: 'Kiki Core: Idle. Waiting for instructions.' },
  ];

  return (
    <div className="h-full flex flex-col glass rounded-2xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-black/20">
        <div className="flex items-center gap-2 text-zinc-400">
          <Terminal className="w-4 h-4" />
          <span className="text-xs font-mono font-medium uppercase tracking-wider">System Log</span>
        </div>
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-zinc-700" />
          <div className="w-2 h-2 rounded-full bg-zinc-700" />
        </div>
      </div>

      {/* Terminal Output */}
      <div className="flex-1 p-4 font-mono text-xs space-y-2 overflow-y-auto">
        {logs.map((log, i) => (
          <div key={i} className="flex gap-3">
            <span className="text-zinc-600">[{log.time}]</span>
            <span className={
              log.type === 'error' ? 'text-red-400' :
              log.type === 'success' ? 'text-emerald-400' :
              log.type === 'warning' ? 'text-amber-400' :
              'text-zinc-300'
            }>
              {log.msg}
            </span>
          </div>
        ))}
        <div className="flex gap-2 animate-pulse">
          <span className="text-zinc-600">[{new Date().toLocaleTimeString('en-US', { hour12: false })}]</span>
          <span className="text-indigo-400">_</span>
        </div>
      </div>
    </div>
  );
}
