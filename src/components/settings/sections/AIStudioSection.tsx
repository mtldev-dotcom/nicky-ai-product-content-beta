'use client';

import React, { useEffect } from 'react';
import { Sparkles, ExternalLink, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { providerLabel, topImageModelsForProvider, coerceAiImageProviderId, type AiImageProviderId } from '@/lib/ai/topImageModels';
import type { SettingsDraftState } from '@/lib/settings-ui';

interface AIStudioSectionProps {
  localState: SettingsDraftState;
  setLocalState: React.Dispatch<React.SetStateAction<SettingsDraftState>>;
  availableImageProviders: AiImageProviderId[];
}

export function AIStudioSection({
  localState,
  setLocalState,
  availableImageProviders,
}: AIStudioSectionProps) {
  // Auto-reset model when provider changes to ensure it's valid for the new provider
  useEffect(() => {
    const currentProvider = coerceAiImageProviderId(localState.aiImageProvider);
    const availableModels = topImageModelsForProvider(currentProvider);
    const currentModel = localState.aiImageModel;

    // If current model is not in the available models for this provider, reset to first model
    if (availableModels.length > 0 && !availableModels.includes(currentModel)) {
      setLocalState((prev) => ({
        ...prev,
        aiImageModel: availableModels[0],
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localState.aiImageProvider]);

  const handleProviderChange = (newProvider: string) => {
    const provider = coerceAiImageProviderId(newProvider);
    const availableModels = topImageModelsForProvider(provider);
    const defaultModel = availableModels[0] || '';

    setLocalState((prev) => ({
      ...prev,
      aiImageProvider: provider,
      aiImageModel: defaultModel,
    }));
  };

  // Ensure model is always valid for current provider on mount
  useEffect(() => {
    const currentProvider = coerceAiImageProviderId(localState.aiImageProvider);
    const availableModels = topImageModelsForProvider(currentProvider);
    
    if (availableModels.length > 0 && !availableModels.includes(localState.aiImageModel)) {
      setLocalState((prev) => ({
        ...prev,
        aiImageModel: availableModels[0],
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          AI Studio Photo
        </h2>
        <p className="text-sm text-zinc-400">
          Set default behavior for the AI-powered product photography engine.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Default Provider</label>
          <select
            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all cursor-pointer"
            value={localState.aiImageProvider}
            onChange={(e) => handleProviderChange(e.target.value)}
            disabled={availableImageProviders.length === 0}
          >
            {availableImageProviders.length === 0 ? (
              <option value={localState.aiImageProvider}>Configure API keys in &apos;AI Engine&apos; first</option>
            ) : (
              availableImageProviders.map((p) => (
                <option key={p} value={p}>
                  {providerLabel(p)}
                </option>
              ))
            )}
          </select>
          <p className="text-[10px] text-zinc-500 italic px-1">
            Global default for new generations. Can be overridden per generation.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Default Model</label>
          <select
            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all font-mono text-sm cursor-pointer"
            value={localState.aiImageModel || topImageModelsForProvider(localState.aiImageProvider)[0] || ''}
            onChange={(e) => setLocalState((prev) => ({ ...prev, aiImageModel: e.target.value }))}
            disabled={availableImageProviders.length === 0}
          >
            {topImageModelsForProvider(localState.aiImageProvider).map((modelId) => (
              <option key={modelId} value={modelId}>
                {modelId}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-zinc-500 italic px-1">
            The recommended top-tier model for your selected provider.
          </p>
        </div>
      </div>

      <div className="p-6 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shrink-0">
            <ImageIcon className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-white">Advanced Prompt Customization</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Tailor the photography engine to your brand. Edit jewelry types, model setups, and modifier phrases used to generate prompts.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 pt-2">
          <Link
            href="/settings/ai-studio"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition-all text-sm font-semibold shadow-lg shadow-indigo-500/20"
          >
            Manage Prompt Library
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <p className="text-[10px] text-zinc-500 italic">
            Opens the advanced studio configuration page.
          </p>
        </div>
      </div>
    </div>
  );
}
