'use client';

import React from 'react';
import { Languages, Check, Globe2 } from 'lucide-react';
import { ALL_LANGUAGES } from '@/lib/languages';
import { cn } from '@/lib/utils';

interface LocalizationSectionProps {
  localState: any;
  setLocalState: (state: any) => void;
}

export function LocalizationSection({
  localState,
  setLocalState,
}: LocalizationSectionProps) {
  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Languages className="w-5 h-5 text-indigo-400" />
            Localization & Markets
          </h2>
          <p className="text-sm text-zinc-400">
            Select the languages your organization supports for content generation.
          </p>
        </div>
        <div className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase font-bold tracking-wider">
          Global reach
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {ALL_LANGUAGES.map((lang) => {
            const isActive = localState.activeLanguages.includes(lang.code);
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  const newLangs = isActive
                    ? localState.activeLanguages.filter((c: string) => c !== lang.code)
                    : [...localState.activeLanguages, lang.code];
                  
                  // Ensure at least one language is active
                  if (newLangs.length === 0) return;
                  
                  setLocalState({ ...localState, activeLanguages: newLangs });
                }}
                className={cn(
                  "flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all relative overflow-hidden group",
                  isActive 
                    ? "bg-indigo-500/10 border-indigo-500/50 text-white shadow-xl shadow-indigo-500/5" 
                    : "bg-zinc-900/30 border-white/5 text-zinc-500 hover:border-white/10 hover:bg-zinc-900/50"
                )}
              >
                <span className="text-3xl filter group-hover:scale-110 transition-transform duration-300">
                  {lang.flag}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-center">
                  {lang.name}
                </span>
                {isActive && (
                  <div className="absolute top-2 right-2 bg-indigo-500 rounded-full p-0.5 shadow-sm">
                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={4} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
        
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-zinc-900/30 border border-white/5">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center border border-white/5">
            <Globe2 className="w-4 h-4 text-zinc-400" />
          </div>
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            <span className="text-zinc-300 font-medium">Note:</span> English (US) is the default base language for all AI generation. Additional languages enabled here will appear in the translation and variant generation modules.
          </p>
        </div>
      </div>
    </div>
  );
}
