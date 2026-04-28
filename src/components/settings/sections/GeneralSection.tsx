'use client';

import React from 'react';
import { UserCircle, MessageSquare, Sparkles, Fingerprint } from 'lucide-react';
import type { SettingsDraftState } from '@/lib/settings-ui';

interface GeneralSectionProps {
  localState: SettingsDraftState;
  setLocalState: React.Dispatch<React.SetStateAction<SettingsDraftState>>;
}

export function GeneralSection({
  localState,
  setLocalState,
}: GeneralSectionProps) {
  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Fingerprint className="w-5 h-5 text-indigo-400" />
          Brand Identity
        </h2>
        <p className="text-sm text-zinc-400">
          Define your brand&apos;s voice and unique personality for AI content generation.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <UserCircle className="w-4 h-4 text-zinc-500" />
            Public Brand Name
          </label>
          <input
            type="text"
            placeholder="e.g., The Uncut Brand"
             className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-zinc-600"
             value={localState.brandName}
             onChange={(e) => setLocalState((prev) => ({ ...prev, brandName: e.target.value }))}
           />
          <p className="text-[10px] text-zinc-500 italic px-1">
            The name used by the AI when referring to your store.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-zinc-500" />
            Voice & Tone
          </label>
          <input
            type="text"
            placeholder="e.g., Minimalist, Luxury, Professional"
             className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-zinc-600"
             value={localState.brandVoice}
             onChange={(e) => setLocalState((prev) => ({ ...prev, brandVoice: e.target.value }))}
           />
           <p className="text-[10px] text-zinc-500 italic px-1">
             Describe how your brand should sound, for example &quot;warm but technical&quot;.
           </p>
        </div>

        <div className="md:col-span-2 space-y-2">
          <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-zinc-500" />
            Custom AI Style Instructions
          </label>
          <textarea
            placeholder="e.g., Focus on sustainability. Use short, punchy sentences. Always mention the artisanal process. Avoid technical jargon."
             className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all min-h-[160px] resize-y placeholder:text-zinc-600 leading-relaxed"
             value={localState.customInstructions}
             onChange={(e) => setLocalState((prev) => ({ ...prev, customInstructions: e.target.value }))}
           />
           <p className="text-[10px] text-zinc-500 italic px-1">
             These directives are injected into the &quot;System Message&quot; for every AI content generation task.
           </p>
        </div>
      </div>
    </div>
  );
}
