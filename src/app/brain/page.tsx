'use client';

import React, { useState } from 'react';
import { KikiHUD } from '@/components/brain/KikiHUD';
import { SystemLog } from '@/components/brain/SystemLog';
import { ActiveProtocols } from '@/components/brain/ActiveProtocols';
import { Send, FileText, Database } from 'lucide-react';

export default function BrainPage() {
  const [status, setStatus] = useState<'idle' | 'thinking' | 'working'>('idle');
  const [input, setInput] = useState('');

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    setStatus('thinking');
    // Simulate processing
    setTimeout(() => {
      setStatus('working');
      setTimeout(() => {
        setStatus('idle');
        setInput('');
      }, 2000);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 p-6 md:p-8 font-sans selection:bg-indigo-500/30">
      
      {/* Top HUD Bar */}
      <header className="flex flex-col md:flex-row gap-6 mb-8 items-start md:items-center justify-between">
        <div>
          <KikiHUD status={status} />
        </div>

        {/* Neural Uplink (Input) */}
        <form onSubmit={handleCommand} className="flex-1 max-w-2xl w-full">
          <div className="relative group">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter command or raw thought..."
              className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-5 py-4 pl-6 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-xl shadow-black/50"
            />
            <button 
              type="submit"
              className="absolute right-2 top-2 p-2 rounded-lg bg-white/5 hover:bg-indigo-500 text-zinc-400 hover:text-white transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>

        <div className="hidden md:block text-right">
          <h1 className="text-xl font-bold text-white tracking-tight">PROJECT CORTEX</h1>
          <p className="text-xs text-zinc-500 font-mono">NEURAL INTERFACE V1.0</p>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100vh-180px)]">
        
        {/* Left Col: Active Protocols */}
        <div className="lg:col-span-1 h-[400px] lg:h-full">
          <ActiveProtocols />
        </div>

        {/* Center/Right Col: Workspace */}
        <div className="lg:col-span-2 flex flex-col gap-6 h-full">
          
          {/* Data Core (Docs) */}
          <div className="h-[300px] lg:flex-1 glass rounded-2xl border border-white/10 p-6 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" />
                Data Core
              </h3>
              <button className="text-xs text-zinc-500 hover:text-white transition-colors">
                View All
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="aspect-video rounded-xl bg-white/5 border border-white/5 hover:border-indigo-500/30 hover:bg-white/10 transition-all p-4 flex flex-col justify-between cursor-pointer group/card">
                  <FileText className="w-6 h-6 text-zinc-600 group-hover/card:text-indigo-400 transition-colors" />
                  <div>
                    <div className="text-xs text-white font-medium">Project_Specs_v{i}.md</div>
                    <div className="text-[10px] text-zinc-500">Updated 2h ago</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom: System Log */}
          <div className="h-[250px] lg:h-1/3">
            <SystemLog />
          </div>

        </div>
      </div>
    </div>
  );
}
