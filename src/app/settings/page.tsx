'use client';

import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { createClient } from '@/utils/supabase/client';
import {
  Shield,
  Key,
  Cloud,
  Save,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  UserCircle,
  MessageSquare,
  Sparkles
} from 'lucide-react';

export default function SettingsPage() {
  const settings = useSettingsStore();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [localState, setLocalState] = useState({
    openaiApiKey: '',
    r2AccountId: '',
    r2AccessKeyId: '',
    r2SecretAccessKey: '',
    r2BucketName: '',
    r2PublicUrl: '',
    brandName: '',
    brandVoice: '',
    customInstructions: '',
  });

  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: membership } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .single();

        if (membership) {
          setOrgId(membership.organization_id);
          await settings.loadFromDb(membership.organization_id);
        }
      }
    };
    init();
  }, [settings.loadFromDb, supabase]);

  useEffect(() => {
    setLocalState({
      openaiApiKey: settings.openaiApiKey,
      r2AccountId: settings.r2AccountId,
      r2AccessKeyId: settings.r2AccessKeyId,
      r2SecretAccessKey: settings.r2SecretAccessKey,
      r2BucketName: settings.r2BucketName,
      r2PublicUrl: settings.r2PublicUrl,
      brandName: settings.brandName,
      brandVoice: settings.brandVoice,
      customInstructions: settings.customInstructions,
    });
  }, [settings.openaiApiKey, settings.r2AccountId, settings.r2AccessKeyId, settings.r2SecretAccessKey, settings.r2BucketName, settings.r2PublicUrl, settings.brandName, settings.brandVoice, settings.customInstructions]);

  const handleSave = async () => {
    if (!orgId) return;

    settings.setOpenaiApiKey(localState.openaiApiKey);
    settings.setR2Settings({
      r2AccountId: localState.r2AccountId,
      r2AccessKeyId: localState.r2AccessKeyId,
      r2SecretAccessKey: localState.r2SecretAccessKey,
      r2BucketName: localState.r2BucketName,
      r2PublicUrl: localState.r2PublicUrl,
    });
    settings.setBrandSettings({
      brandName: localState.brandName,
      brandVoice: localState.brandVoice,
      customInstructions: localState.customInstructions,
    });

    await settings.saveToDb(orgId);

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-4xl space-y-12">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Shield className="text-indigo-400 w-8 h-8" />
          Command Center Settings
        </h1>
        <p className="text-zinc-400">
          Configure your service credentials. Data is saved securely in your organization's workspace in the cloud.
        </p>
      </header>

      <div className="grid gap-8">
        {/* AI Configuration */}
        <section className="glass rounded-2xl p-6 md:p-8 space-y-6 border border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-indigo-400" />
              AI Content Engine
            </h2>
            <div className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase">
              OpenAI
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">OpenAI API Key</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                placeholder="sk-..."
                value={localState.openaiApiKey}
                onChange={(e) => setLocalState({ ...localState, openaiApiKey: e.target.value })}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </section>

        {/* AI Agent Personality */}
        <section className="glass rounded-2xl p-6 md:p-8 space-y-6 border border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              AI Agent Personality
            </h2>
            <div className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase">
              Brand Alignment
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <UserCircle className="w-4 h-4 text-zinc-500" />
                Brand Name
              </label>
              <input
                type="text"
                placeholder="e.g., The Uncut Brand"
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                value={localState.brandName}
                onChange={(e) => setLocalState({ ...localState, brandName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-zinc-500" />
                Brand Voice & Tone
              </label>
              <input
                type="text"
                placeholder="e.g., Minimalist, Luxury, Professional, Playful"
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                value={localState.brandVoice}
                onChange={(e) => setLocalState({ ...localState, brandVoice: e.target.value })}
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-zinc-500" />
                Custom AI Instructions (Style, Theme, etc.)
              </label>
              <textarea
                placeholder="e.g., Focus on sustainability. Use short, punchy sentences. Always mention the artisanal process. Avoid technical jargon."
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all min-h-[120px] resize-y"
                value={localState.customInstructions}
                onChange={(e) => setLocalState({ ...localState, customInstructions: e.target.value })}
              />
              <p className="text-[10px] text-zinc-500 italic px-1">
                These instructions are injected into the AI's core logic to ensure every product follows your brand's unique identity.
              </p>
            </div>
          </div>
        </section>

        {/* Storage Configuration */}
        <section className="glass rounded-2xl p-6 md:p-8 space-y-6 border border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Cloud className="w-5 h-5 text-indigo-400" />
              Cloudflare R2 Storage
            </h2>
            <a href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
              Cloudflare Dashboard
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Account ID</label>
              <input
                type="text"
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                value={localState.r2AccountId}
                onChange={(e) => setLocalState({ ...localState, r2AccountId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Bucket Name</label>
              <input
                type="text"
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                value={localState.r2BucketName}
                onChange={(e) => setLocalState({ ...localState, r2BucketName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Access Key ID</label>
              <input
                type="text"
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                value={localState.r2AccessKeyId}
                onChange={(e) => setLocalState({ ...localState, r2AccessKeyId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Secret Access Key</label>
              <input
                type="password"
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                value={localState.r2SecretAccessKey}
                onChange={(e) => setLocalState({ ...localState, r2SecretAccessKey: e.target.value })}
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-medium text-zinc-300">Public Bucket URL (Custom Domain)</label>
              <input
                type="url"
                placeholder="https://pub-xyz.r2.dev or https://assets.yourdomain.com"
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                value={localState.r2PublicUrl}
                onChange={(e) => setLocalState({ ...localState, r2PublicUrl: e.target.value })}
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-4 pb-20 md:pb-0">
          <button
            onClick={handleSave}
            disabled={saved}
            className="group relative bg-indigo-500 hover:bg-indigo-600 disabled:bg-emerald-500 text-white px-10 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-indigo-500/20 active:scale-95 overflow-hidden"
          >
            {saved ? (
              <>
                <CheckCircle2 className="w-5 h-5 animate-in zoom-in" />
                Configuration Saved
              </>
            ) : (
              <>
                <Save className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                Save All Credentials
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

