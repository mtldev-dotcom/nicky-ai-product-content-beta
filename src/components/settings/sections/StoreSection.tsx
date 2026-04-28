'use client';

import React from 'react';
import { Store, Globe, Lock, Eye, EyeOff, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { testMedusaConnection } from '@/app/settings/actions';
import type { MedusaTaxonomyData, SettingsDraftState, SettingsSummary } from '@/lib/settings-ui';

interface StoreSectionProps {
  localState: SettingsDraftState;
  setLocalState: React.Dispatch<React.SetStateAction<SettingsDraftState>>;
  settings: SettingsSummary;
  taxonomy: MedusaTaxonomyData | null;
  isLoadingTaxonomy: boolean;
  taxonomyError: string | null;
  syncTaxonomy: () => Promise<void>;
  orgId: string | null;
}

export function StoreSection({
  localState,
  setLocalState,
  settings,
  taxonomy,
  isLoadingTaxonomy,
  taxonomyError,
  syncTaxonomy,
  orgId,
}: StoreSectionProps) {
  const [showMedusaKey, setShowMedusaKey] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ success: boolean; error?: string } | null>(null);

  const handleTestConnection = async () => {
    if (!orgId) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testMedusaConnection(
        orgId,
        localState.medusaUrl,
        localState.medusaApiKey
      );
      setTestResult(res);
    } catch (error) {
      setTestResult({ success: false, error: error instanceof Error ? error.message : 'Connection test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Store className="w-5 h-5 text-indigo-400" />
            Store Integration
          </h2>
          <p className="text-sm text-zinc-400">
            Connect your e-commerce platform to sync products and assets.
          </p>
        </div>
        <select 
          className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer"
          value={localState.storePlatform}
          onChange={(e) => setLocalState((prev) => ({ ...prev, storePlatform: e.target.value }))}
        >
          <option value="medusa">MedusaJS</option>
          <option value="shopify" disabled>Shopify (Coming Soon)</option>
          <option value="none">No Integration</option>
        </select>
      </div>

      {localState.storePlatform === 'medusa' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          <div className="md:col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Globe className="w-4 h-4 text-zinc-500" />
                Medusa API URL
              </label>
              
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !localState.medusaUrl}
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-all flex items-center gap-1.5",
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
            </div>
            
            <input
              type="url"
              placeholder="https://your-medusa-server.com"
              className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-zinc-600"
              value={localState.medusaUrl}
              onChange={(e) => {
                setLocalState((prev) => ({ ...prev, medusaUrl: e.target.value }));
                setTestResult(null);
              }}
            />
            {testResult?.error && (
              <p className="text-[10px] text-red-400 px-1 mt-1">
                Error: {testResult.error}
              </p>
            )}
            <p className="text-[10px] text-zinc-500 italic px-1">
              The backend URL of your MedusaJS installation (include https://).
            </p>
          </div>

          <div className="md:col-span-2 space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Lock className="w-4 h-4 text-zinc-500" />
              Medusa API Key (Admin)
            </label>
            <div className="relative">
              <input
                type={showMedusaKey ? "text" : "password"}
                placeholder="medusa_admin_..."
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-zinc-600"
                value={localState.medusaApiKey}
                onChange={(e) => {
                  setLocalState((prev) => ({ ...prev, medusaApiKey: e.target.value }));
                  setTestResult(null);
                }}
              />
              <button
                type="button"
                onClick={() => setShowMedusaKey(!showMedusaKey)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showMedusaKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {settings.hasMedusaApiKey && !localState.medusaApiKey && (
              <p className="text-[10px] text-emerald-400/80 italic px-1">
                ✓ A Medusa key is already saved. Leave blank to keep it.
              </p>
            )}
          </div>

          {/* Default Medusa selections for NEW products */}
          {orgId && (localState.medusaUrl && (settings.hasMedusaApiKey || localState.medusaApiKey)) && (
            <div className="md:col-span-2 space-y-4 pt-6 border-t border-white/5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Default Catalog Settings</h3>
                  <p className="text-[10px] text-zinc-500">
                    Auto-selected for new product drafts created via AI.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={syncTaxonomy}
                  disabled={isLoadingTaxonomy}
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all",
                    isLoadingTaxonomy
                      ? "bg-zinc-900/50 border-white/10 text-zinc-500 cursor-not-allowed"
                      : "bg-indigo-500/10 border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20"
                  )}
                >
                  <RefreshCw className={cn("w-3 h-3", isLoadingTaxonomy && "animate-spin")} />
                  {isLoadingTaxonomy ? 'Syncing...' : 'Sync Taxonomy'}
                </button>
              </div>

              {taxonomyError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                  {taxonomyError}
                </div>
              )}

              {!taxonomy && !taxonomyError && (
                <div className="p-4 rounded-xl bg-zinc-900/30 border border-dashed border-white/10 text-zinc-500 text-xs text-center">
                  Sync taxonomy to load collections, categories, and channels.
                </div>
              )}

              {taxonomy && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-300">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400">Default Sales Channel</label>
                    <select
                      className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                      value={localState.defaultSalesChannelId ?? ''}
                      onChange={(e) => setLocalState((prev) => ({ ...prev, defaultSalesChannelId: e.target.value || null }))}
                    >
                      <option value="">None</option>
                      {taxonomy.sales_channels.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400">Default Shipping Profile</label>
                    <select
                      className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                      value={localState.defaultShippingProfileId ?? ''}
                      onChange={(e) => setLocalState((prev) => ({ ...prev, defaultShippingProfileId: e.target.value || null }))}
                    >
                      <option value="">None</option>
                      {taxonomy.shipping_profiles.map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-medium text-zinc-400">Default Collection</label>
                    <select
                      className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                      value={localState.defaultCollectionId ?? ''}
                      onChange={(e) => setLocalState((prev) => ({ ...prev, defaultCollectionId: e.target.value || null }))}
                    >
                      <option value="">None</option>
                      {taxonomy.collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-400">Default Categories</label>
                      <button
                        type="button"
                        onClick={() => setLocalState((prev) => ({ ...prev, defaultCategoryIds: [] }))}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="max-h-48 overflow-auto custom-scrollbar rounded-xl border border-white/10 bg-zinc-900/30 p-3 space-y-2">
                      {taxonomy.categories.length === 0 ? (
                        <p className="text-xs text-zinc-500 italic">No categories found.</p>
                      ) : (
                        taxonomy.categories.map((cat) => {
                          const checked = localState.defaultCategoryIds.includes(cat.id);
                          return (
                            <label key={cat.id} className="flex items-center gap-3 py-1 group cursor-pointer">
                              <div className={cn(
                                "w-4 h-4 rounded border flex items-center justify-center transition-all",
                                checked ? "bg-indigo-500 border-indigo-500" : "bg-zinc-900 border-white/10 group-hover:border-white/20"
                              )}>
                                {checked && (
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? localState.defaultCategoryIds.filter((id) => id !== cat.id)
                                    : [...localState.defaultCategoryIds, cat.id];
                                  setLocalState((prev) => ({ ...prev, defaultCategoryIds: next }));
                                }}
                              />
                              <span className={cn("text-xs transition-colors", checked ? "text-white font-medium" : "text-zinc-400")}>
                                {cat.name}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {localState.storePlatform === 'none' && (
        <div className="bg-zinc-900/30 border border-dashed border-white/10 rounded-2xl p-12 text-center space-y-3">
          <div className="bg-zinc-900 w-12 h-12 rounded-xl flex items-center justify-center mx-auto border border-white/5">
            <Store className="w-6 h-6 text-zinc-600" />
          </div>
          <p className="text-zinc-500 text-sm max-w-xs mx-auto">
            No store integration selected. Content can still be generated and exported manually.
          </p>
        </div>
      )}
    </div>
  );
}
