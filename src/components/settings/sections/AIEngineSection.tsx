'use client';

import React from 'react';
import { Eye, EyeOff, BrainCircuit } from 'lucide-react';
import type { SettingsDraftState, SettingsSummary } from '@/lib/settings-ui';

interface AIEngineSectionProps {
  localState: SettingsDraftState;
  setLocalState: React.Dispatch<React.SetStateAction<SettingsDraftState>>;
  settings: SettingsSummary;
}

export function AIEngineSection({
  localState,
  setLocalState,
  settings,
}: AIEngineSectionProps) {
  const [showOpenAI, setShowOpenAI] = React.useState(false);
  const [showOpenRouter, setShowOpenRouter] = React.useState(false);
  const [showFal, setShowFal] = React.useState(false);
  const [showGemini, setShowGemini] = React.useState(false);

  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-indigo-400" />
          AI Content Engine
        </h2>
        <p className="text-sm text-zinc-400">
          Configure the LLM providers that power product descriptions and translations.
        </p>
      </div>

      <div className="grid gap-6">
        {/* OpenAI */}
        <div className="space-y-4 p-6 rounded-2xl bg-zinc-900/30 border border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                <span className="text-emerald-400 font-bold text-[10px]">OA</span>
              </div>
              <label className="text-sm font-semibold text-white">OpenAI</label>
            </div>
            <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] uppercase font-bold tracking-wider">
              Primary Engine
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-500 font-medium">API Key</label>
            <div className="relative">
              <input
                type={showOpenAI ? "text" : "password"}
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-zinc-600"
                placeholder={settings.hasOpenaiApiKey ? "•••••••• (Saved)" : "sk-..."}
                value={localState.openaiApiKey}
                onChange={(e) => setLocalState((prev) => ({ ...prev, openaiApiKey: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setShowOpenAI(!showOpenAI)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showOpenAI ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {settings.hasOpenaiApiKey && !localState.openaiApiKey && (
              <p className="text-[10px] text-emerald-400/80 italic px-1">
                ✓ Securely stored. Leave blank to keep existing.
              </p>
            )}
          </div>
        </div>

        {/* OpenRouter */}
        <div className="space-y-4 p-6 rounded-2xl bg-zinc-900/30 border border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                <span className="text-purple-400 font-bold text-[10px]">OR</span>
              </div>
              <label className="text-sm font-semibold text-white">OpenRouter</label>
            </div>
            <div className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] uppercase font-bold tracking-wider">
              Fallback
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-500 font-medium">API Key</label>
            <div className="relative">
              <input
                type={showOpenRouter ? "text" : "password"}
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-zinc-600"
                placeholder={settings.hasOpenrouterApiKey ? "•••••••• (Saved)" : "sk-or-..."}
                value={localState.openrouterApiKey}
                onChange={(e) => setLocalState((prev) => ({ ...prev, openrouterApiKey: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setShowOpenRouter(!showOpenRouter)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showOpenRouter ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 italic px-1">
              Used as fallback when OpenAI is unavailable or fails
            </p>
            {settings.hasOpenrouterApiKey && !localState.openrouterApiKey && (
              <p className="text-[10px] text-emerald-400/80 italic px-1">
                ✓ Securely stored. Leave blank to keep existing.
              </p>
            )}
          </div>
        </div>

        {/* fal.ai */}
        <div className="space-y-4 p-6 rounded-2xl bg-zinc-900/30 border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
              <span className="text-orange-400 font-bold text-[10px]">FA</span>
            </div>
            <label className="text-sm font-semibold text-white">fal.ai</label>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-500 font-medium">API Key (FAL_KEY)</label>
            <div className="relative">
              <input
                type={showFal ? "text" : "password"}
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-zinc-600"
                placeholder={settings.hasFalApiKey ? "•••••••• (Saved)" : "FAL_KEY_ID:FAL_KEY_SECRET"}
                value={localState.falApiKey}
                onChange={(e) => setLocalState((prev) => ({ ...prev, falApiKey: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setShowFal(!showFal)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showFal ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {settings.hasFalApiKey && !localState.falApiKey && (
              <p className="text-[10px] text-emerald-400/80 italic px-1">
                ✓ Securely stored. Leave blank to keep existing.
              </p>
            )}
          </div>
        </div>

        {/* Gemini */}
        <div className="space-y-4 p-6 rounded-2xl bg-zinc-900/30 border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <span className="text-blue-400 font-bold text-[10px]">GE</span>
            </div>
            <label className="text-sm font-semibold text-white">Google Gemini</label>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-500 font-medium">API Key</label>
            <div className="relative">
              <input
                type={showGemini ? "text" : "password"}
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-zinc-600"
                placeholder={settings.hasGeminiApiKey ? "•••••••• (Saved)" : "AIza..."}
                value={localState.geminiApiKey}
                onChange={(e) => setLocalState((prev) => ({ ...prev, geminiApiKey: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setShowGemini(!showGemini)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showGemini ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {settings.hasGeminiApiKey && !localState.geminiApiKey && (
              <p className="text-[10px] text-emerald-400/80 italic px-1">
                ✓ Securely stored. Leave blank to keep existing.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
