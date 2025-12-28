'use client';

import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { ALL_LANGUAGES } from '@/lib/languages';
import { getMedusaTaxonomy } from '@/app/product-details/actions';
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
  Sparkles,
  Store,
  Globe,
  Lock,
  Languages,
  Check
} from 'lucide-react';

export default function SettingsPage() {
  const settings = useSettingsStore();
  const loadSettingsFromDb = useSettingsStore(s => s.loadFromDb);
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
    storePlatform: 'medusa',
    medusaUrl: '',
    medusaApiKey: '',
    activeLanguages: [] as string[],

    // Medusa defaults for new product drafts
    defaultSalesChannelId: null as string | null,
    defaultShippingProfileId: null as string | null,
    defaultCollectionId: null as string | null,
    defaultCategoryIds: [] as string[],
  });

  const [showKey, setShowKey] = useState(false);
  const [showMedusaKey, setShowMedusaKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const supabase = createClient();

  type MedusaTaxonomy = {
    collections: Array<{ id: string; title: string }>;
    categories: Array<{ id: string; name: string }>;
    sales_channels: Array<{ id: string; name: string }>;
    shipping_profiles: Array<{ id: string; name: string }>;
  };

  const [taxonomy, setTaxonomy] = useState<MedusaTaxonomy | null>(null);
  const [isLoadingTaxonomy, setIsLoadingTaxonomy] = useState(false);
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null);

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
          await loadSettingsFromDb(membership.organization_id);
        }
      }
    };
    init();
  }, [loadSettingsFromDb, supabase]);

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
      storePlatform: settings.storePlatform,
      medusaUrl: settings.medusaUrl,
      medusaApiKey: settings.medusaApiKey,
      activeLanguages: settings.activeLanguages,

      defaultSalesChannelId: settings.defaultSalesChannelId,
      defaultShippingProfileId: settings.defaultShippingProfileId,
      defaultCollectionId: settings.defaultCollectionId,
      defaultCategoryIds: settings.defaultCategoryIds,
    });
  }, [
    settings.openaiApiKey,
    settings.r2AccountId,
    settings.r2AccessKeyId,
    settings.r2SecretAccessKey,
    settings.r2BucketName,
    settings.r2PublicUrl,
    settings.brandName,
    settings.brandVoice,
    settings.customInstructions,
    settings.storePlatform,
    settings.medusaUrl,
    settings.medusaApiKey,
    settings.activeLanguages,
    settings.defaultSalesChannelId,
    settings.defaultShippingProfileId,
    settings.defaultCollectionId,
    settings.defaultCategoryIds,
  ]);

  const syncTaxonomy = async () => {
    if (!orgId) return;
    setIsLoadingTaxonomy(true);
    setTaxonomyError(null);
    try {
      const res = await getMedusaTaxonomy(orgId);
      if (!res.success || !res.data) {
        setTaxonomyError(res.error || 'Failed to sync taxonomy');
        setTaxonomy(null);
        return;
      }

      setTaxonomy({
        collections: (res.data.collections || []) as MedusaTaxonomy['collections'],
        categories: (res.data.categories || []) as MedusaTaxonomy['categories'],
        sales_channels: (res.data.sales_channels || []) as MedusaTaxonomy['sales_channels'],
        shipping_profiles: (res.data.shipping_profiles || []) as MedusaTaxonomy['shipping_profiles'],
      });
    } catch (e) {
      console.error('Failed to sync taxonomy:', e);
      setTaxonomyError('Network error syncing taxonomy');
      setTaxonomy(null);
    } finally {
      setIsLoadingTaxonomy(false);
    }
  };

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
    settings.setStoreSettings({
      storePlatform: localState.storePlatform,
      medusaUrl: localState.medusaUrl,
      medusaApiKey: localState.medusaApiKey,
      activeLanguages: localState.activeLanguages,

      defaultSalesChannelId: localState.defaultSalesChannelId,
      defaultShippingProfileId: localState.defaultShippingProfileId,
      defaultCollectionId: localState.defaultCollectionId,
      defaultCategoryIds: localState.defaultCategoryIds,
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
          Configure your service credentials. Data is saved securely in your organization&apos;s workspace in the cloud.
        </p>
      </header>

      <div className="grid gap-8">
        {/* Store Integration */}
        <section className="glass rounded-2xl p-6 md:p-8 space-y-6 border border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Store className="w-5 h-5 text-indigo-400" />
              Store Integration
            </h2>
            <div className="flex gap-2">
              <select 
                className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500/50"
                value={localState.storePlatform}
                onChange={(e) => setLocalState({ ...localState, storePlatform: e.target.value })}
              >
                <option value="medusa">MedusaJS</option>
                <option value="shopify" disabled>Shopify (Coming Soon)</option>
                <option value="none">No Integration</option>
              </select>
            </div>
          </div>

          {localState.storePlatform === 'medusa' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-zinc-500" />
                  Medusa API URL
                </label>
                <input
                  type="url"
                  placeholder="https://your-medusa-server.com"
                  className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                  value={localState.medusaUrl}
                  onChange={(e) => setLocalState({ ...localState, medusaUrl: e.target.value })}
                />
                <p className="text-[10px] text-zinc-500 italic px-1">
                  The backend URL of your MedusaJS installation.
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
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                    value={localState.medusaApiKey}
                    onChange={(e) => setLocalState({ ...localState, medusaApiKey: e.target.value })}
                  />
                  <button
                    onClick={() => setShowMedusaKey(!showMedusaKey)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showMedusaKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {settings.hasMedusaApiKey && !localState.medusaApiKey && (
                  <p className="text-[10px] text-emerald-400 italic px-1">
                    A Medusa key is already saved. Leave blank to keep it, or type a new one to replace.
                  </p>
                )}
                <p className="text-[10px] text-zinc-500 italic px-1">
                  Used to sync products and media directly to your MedusaJS catalog.
                </p>
              </div>

              {/* Default Medusa selections for NEW products */}
              {orgId && (localState.medusaUrl && (settings.hasMedusaApiKey || localState.medusaApiKey)) && (
                <div className="md:col-span-2 space-y-4 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Default selections for new products</h3>
                      <p className="text-[10px] text-zinc-500">
                        These values will be auto-selected when you create a new product draft.
                      </p>
                    </div>
                    <button
                      onClick={syncTaxonomy}
                      disabled={isLoadingTaxonomy}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs font-semibold border transition-colors",
                        isLoadingTaxonomy
                          ? "bg-zinc-900/50 border-white/10 text-zinc-500"
                          : "bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10"
                      )}
                    >
                      {isLoadingTaxonomy ? 'Syncing...' : 'Sync Taxonomy'}
                    </button>
                  </div>

                  {taxonomyError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                      {taxonomyError}
                    </div>
                  )}

                  {!taxonomy && !taxonomyError && (
                    <div className="p-3 rounded-xl bg-zinc-900/50 border border-white/10 text-zinc-500 text-xs">
                      Click “Sync Taxonomy” to load your store’s collections, categories, sales channels, and shipping profiles.
                    </div>
                  )}

                  {taxonomy && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs text-zinc-500">Default Sales Channel</label>
                        <select
                          className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500/50"
                          value={localState.defaultSalesChannelId ?? ''}
                          onChange={(e) => setLocalState({ ...localState, defaultSalesChannelId: e.target.value || null })}
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
                        <label className="text-xs text-zinc-500">Default Shipping Profile</label>
                        <select
                          className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500/50"
                          value={localState.defaultShippingProfileId ?? ''}
                          onChange={(e) => setLocalState({ ...localState, defaultShippingProfileId: e.target.value || null })}
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
                        <label className="text-xs text-zinc-500">Default Collection</label>
                        <select
                          className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500/50"
                          value={localState.defaultCollectionId ?? ''}
                          onChange={(e) => setLocalState({ ...localState, defaultCollectionId: e.target.value || null })}
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
                          <label className="text-xs text-zinc-500">Default Categories</label>
                          <button
                            onClick={() => setLocalState({ ...localState, defaultCategoryIds: [] })}
                            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="max-h-48 overflow-auto custom-scrollbar rounded-xl border border-white/10 bg-zinc-900/30 p-3 space-y-2">
                          {taxonomy.categories.length === 0 ? (
                            <p className="text-xs text-zinc-500">No categories found.</p>
                          ) : (
                            taxonomy.categories.map((cat) => {
                              const checked = localState.defaultCategoryIds.includes(cat.id);
                              return (
                                <label key={cat.id} className="flex items-center gap-2 text-xs text-zinc-300">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const next = checked
                                        ? localState.defaultCategoryIds.filter((id) => id !== cat.id)
                                        : [...localState.defaultCategoryIds, cat.id];
                                      setLocalState({ ...localState, defaultCategoryIds: next });
                                    }}
                                  />
                                  <span>{cat.name}</span>
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
            <div className="bg-zinc-900/50 border border-dashed border-white/10 rounded-xl p-8 text-center">
              <p className="text-zinc-500 text-sm">
                No store integration selected. You can still generate content and download it manually.
              </p>
            </div>
          )}
        </section>

        {/* Localization & Markets */}
        <section className="glass rounded-2xl p-6 md:p-8 space-y-6 border border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Languages className="w-5 h-5 text-indigo-400" />
              Localization & Supported Markets
            </h2>
            <div className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase">
              Global reach
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Select the languages your organization supports. These will be available for AI content generation and translation in the Product Architect command center.
            </p>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {ALL_LANGUAGES.map((lang) => {
                const isActive = localState.activeLanguages.includes(lang.code);
                return (
                  <button
                    key={lang.code}
                    onClick={() => {
                      const newLangs = isActive
                        ? localState.activeLanguages.filter(c => c !== lang.code)
                        : [...localState.activeLanguages, lang.code];
                      
                      // Ensure at least one language is active
                      if (newLangs.length === 0) return;
                      
                      setLocalState({ ...localState, activeLanguages: newLangs });
                    }}
                    className={cn(
                      "flex flex-col items-center gap-3 p-4 rounded-xl border transition-all relative overflow-hidden group",
                      isActive 
                        ? "bg-indigo-500/10 border-indigo-500/50 text-white shadow-lg shadow-indigo-500/5" 
                        : "bg-zinc-900/50 border-white/5 text-zinc-500 hover:border-white/10"
                    )}
                  >
                    <span className="text-3xl filter group-hover:scale-110 transition-transform duration-300">
                      {lang.flag}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {lang.name}
                    </span>
                    {isActive && (
                      <div className="absolute top-2 right-2">
                        <Check className="w-3 h-3 text-indigo-400" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-zinc-500 italic px-1">
              Note: English (US) is the default base language for all AI generation.
            </p>
          </div>
        </section>

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
                placeholder={settings.hasOpenaiApiKey ? "•••••••• (saved)" : "sk-..."}
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
            {settings.hasOpenaiApiKey && !localState.openaiApiKey && (
              <p className="text-[10px] text-emerald-400 italic px-1">
                A key is already saved. Leave blank to keep it, or type a new one to replace.
              </p>
            )}
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
                These instructions are injected into the AI&apos;s core logic to ensure every product follows your brand&apos;s unique identity.
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
              {settings.hasR2AccountId && !localState.r2AccountId && (
                <p className="text-[10px] text-emerald-400 italic px-1">
                  An Account ID is already saved. Leave blank to keep it.
                </p>
              )}
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
              {settings.hasR2AccessKeyId && !localState.r2AccessKeyId && (
                <p className="text-[10px] text-emerald-400 italic px-1">
                  An Access Key ID is already saved. Leave blank to keep it.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Secret Access Key</label>
              <input
                type="password"
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                value={localState.r2SecretAccessKey}
                onChange={(e) => setLocalState({ ...localState, r2SecretAccessKey: e.target.value })}
              />
              {settings.hasR2SecretAccessKey && !localState.r2SecretAccessKey && (
                <p className="text-[10px] text-emerald-400 italic px-1">
                  A Secret Access Key is already saved. Leave blank to keep it.
                </p>
              )}
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

