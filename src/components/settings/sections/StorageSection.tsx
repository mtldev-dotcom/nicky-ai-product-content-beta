'use client';

import React from 'react';
import { Cloud, ExternalLink, Lock, Database, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { testR2Connection } from '@/app/settings/actions';
import type { SettingsDraftState, SettingsSummary } from '@/lib/settings-ui';

interface StorageSectionProps {
  localState: SettingsDraftState;
  setLocalState: React.Dispatch<React.SetStateAction<SettingsDraftState>>;
  settings: SettingsSummary;
  orgId: string | null;
}

export function StorageSection({
  localState,
  setLocalState,
  settings,
  orgId,
}: StorageSectionProps) {
  const [isTesting, setIsTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ success: boolean; error?: string; message?: string } | null>(null);

  const handleTestConnection = async () => {
    if (!orgId) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testR2Connection(
        orgId,
        localState.r2AccountId,
        localState.r2AccessKeyId,
        localState.r2SecretAccessKey,
        localState.r2BucketName
      );
      setTestResult(res);
    } catch (error) {
      setTestResult({ success: false, error: error instanceof Error ? error.message : 'Connection test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Cloud className="w-5 h-5 text-indigo-400" />
            Cloudflare R2 Storage
          </h2>
          <p className="text-sm text-zinc-400">
            Securely host your product media and AI-generated assets.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || !localState.r2AccountId || !localState.r2BucketName}
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5",
              testResult?.success 
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : testResult?.error
                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                : "bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10 hover:text-zinc-200"
            )}
          >
            {isTesting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : testResult?.success ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : testResult?.error ? (
              <AlertCircle className="w-3 h-3" />
            ) : null}
            {isTesting ? 'Testing...' : testResult?.success ? 'Connected' : testResult?.error ? 'Failed' : 'Test Connection'}
          </button>
          
          <a 
            href="https://dash.cloudflare.com/" 
            target="_blank" 
            rel="noreferrer" 
            className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors bg-white/5 px-3 py-1.5 rounded-lg border border-white/10"
          >
            Cloudflare Dash
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Database className="w-4 h-4 text-zinc-500" />
            Account ID
          </label>
          <input
            type="text"
            placeholder="Cloudflare Account ID"
            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-zinc-600"
            value={localState.r2AccountId}
            onChange={(e) => {
              setLocalState((prev) => ({ ...prev, r2AccountId: e.target.value }));
              setTestResult(null);
            }}
          />
          {settings.hasR2AccountId && !localState.r2AccountId && (
            <p className="text-[10px] text-emerald-400/80 italic px-1">
              ✓ Account ID is saved. Leave blank to keep.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Bucket Name</label>
          <input
            type="text"
            placeholder="my-product-assets"
            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-zinc-600"
            value={localState.r2BucketName}
            onChange={(e) => {
              setLocalState((prev) => ({ ...prev, r2BucketName: e.target.value }));
              setTestResult(null);
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Access Key ID</label>
          <input
            type="text"
            placeholder="Access Key"
            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-zinc-600"
            value={localState.r2AccessKeyId}
            onChange={(e) => setLocalState((prev) => ({ ...prev, r2AccessKeyId: e.target.value }))}
          />
          {settings.hasR2AccessKeyId && !localState.r2AccessKeyId && (
            <p className="text-[10px] text-emerald-400/80 italic px-1">
              ✓ Access Key is saved.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Lock className="w-4 h-4 text-zinc-500" />
            Secret Access Key
          </label>
          <input
            type="password"
            placeholder="Secret Key"
            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-zinc-600"
            value={localState.r2SecretAccessKey}
            onChange={(e) => setLocalState((prev) => ({ ...prev, r2SecretAccessKey: e.target.value }))}
          />
          {settings.hasR2SecretAccessKey && !localState.r2SecretAccessKey && (
            <p className="text-[10px] text-emerald-400/80 italic px-1">
              ✓ Secret Key is saved.
            </p>
          )}
        </div>

        <div className="md:col-span-2 space-y-2">
          <label className="text-sm font-medium text-zinc-300">Public Bucket URL (Custom Domain)</label>
          <input
            type="url"
            placeholder="https://pub-xyz.r2.dev or https://assets.yourdomain.com"
            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-zinc-600"
            value={localState.r2PublicUrl}
            onChange={(e) => setLocalState((prev) => ({ ...prev, r2PublicUrl: e.target.value }))}
          />
          <p className="text-[10px] text-zinc-500 italic px-1">
            Required for the media library to display assets correctly.
          </p>
        </div>
      </div>
    </div>
  );
}
