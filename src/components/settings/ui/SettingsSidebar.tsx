'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { 
  Fingerprint, 
  Store, 
  BrainCircuit, 
  Sparkles, 
  Cloud, 
  Languages,
  ChevronRight
} from 'lucide-react';

export type SettingsTab = 'general' | 'store' | 'ai-engine' | 'ai-studio' | 'storage' | 'localization';

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  setActiveTab: (tab: SettingsTab) => void;
}

const TABS = [
  { id: 'general', label: 'Brand Identity', icon: Fingerprint, color: 'text-blue-400' },
  { id: 'store', label: 'Store Integration', icon: Store, color: 'text-emerald-400' },
  { id: 'ai-engine', label: 'AI Content Engine', icon: BrainCircuit, color: 'text-purple-400' },
  { id: 'ai-studio', label: 'AI Studio Photo', icon: Sparkles, color: 'text-amber-400' },
  { id: 'storage', label: 'R2 Cloud Storage', icon: Cloud, color: 'text-indigo-400' },
  { id: 'localization', label: 'Localization', icon: Languages, color: 'text-rose-400' },
] as const;

export function SettingsSidebar({ activeTab, setActiveTab }: SettingsSidebarProps) {
  return (
    <nav className="flex flex-col gap-1 w-full md:w-64 lg:w-72 shrink-0">
      <div className="px-3 mb-4 hidden md:block">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
          Configuration
        </h3>
      </div>
      
      <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 scrollbar-none">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all group relative whitespace-nowrap",
                isActive 
                  ? "bg-white/10 text-white" 
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              )}
            >
              <Icon className={cn("w-5 h-5 transition-colors", isActive ? tab.color : "group-hover:text-zinc-400")} />
              <span className="text-sm font-medium flex-1 text-left hidden md:block">
                {tab.label}
              </span>
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-500 rounded-r-full hidden md:block" />
              )}
              <ChevronRight className={cn(
                "w-4 h-4 text-zinc-600 transition-transform hidden md:block",
                isActive ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
              )} />
              
              {/* Active Indicator for Mobile */}
              {isActive && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-indigo-500 rounded-t-full md:hidden" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
