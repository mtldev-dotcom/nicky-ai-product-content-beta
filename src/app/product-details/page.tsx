'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useProductStore, Localization } from '@/store/useProductStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { createClient } from '@/utils/supabase/client';
import { 
  Globe, 
  Check, 
  ChevronRight, 
  Type, 
  FileText, 
  Search, 
  Hash,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Loader2,
  AlertCircle,
  Layers,
  Tags,
  Truck,
  RefreshCw,
  Box,
  MapPin
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { getMedusaTaxonomy } from './actions';

const RichTextEditor = dynamic(() => import('@/components/ui/RichTextEditor').then(mod => mod.RichTextEditor), {
  ssr: false,
  loading: () => <div className="w-full h-[150px] bg-zinc-900/50 border border-white/10 rounded-2xl animate-pulse" />
});

const ALL_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
];

export default function ProductDetailsPage() {
  const settings = useSettingsStore();
  const { 
    organizationId,
    setOrganizationId,
    localization, 
    activeLanguages: productActiveLanguages, 
    toggleLanguage, 
    updateLocalization,
    options,
    bulkUpdate,
    collection_id,
    type_id,
    tags,
    categories,
    sales_channels,
    shipping_profile_id,
    shipping_weight,
    shipping_dimensions,
    updateRoot
  } = useProductStore();
  
  const [selectedLang, setSelectedLang] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSyncingTaxonomy, setIsSyncingTaxonomy] = useState(false);
  const [taxonomyOptions, setTaxonomyOptions] = useState<{
    collections: any[];
    categories: any[];
    sales_channels: any[];
    product_types: any[];
    shipping_profiles: any[];
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  const currentLoc = localization[selectedLang] || {};
  const isActive = productActiveLanguages.includes(selectedLang);
  const supabase = createClient();

  // Filter available languages based on organization settings
  const availableLanguages = ALL_LANGUAGES.filter(lang => 
    settings.activeLanguages.includes(lang.code)
  );

  const fetchTaxonomy = async (orgId: string) => {
    setIsSyncingTaxonomy(true);
    setSyncError(null);
    try {
      const res = await getMedusaTaxonomy(orgId);
      if (res.success && res.data) {
        setTaxonomyOptions(res.data);
      } else {
        setSyncError(res.error || 'Failed to sync taxonomy');
      }
    } catch (err) {
      console.error('Failed to sync taxonomy:', err);
      setSyncError('Network error connecting to store');
    } finally {
      setIsSyncingTaxonomy(false);
    }
  };

  const handleUpdate = (field: keyof Localization, value: any) => {
    updateLocalization(selectedLang, { [field]: value });
  };

  const translateCurrentLang = useCallback(async () => {
    if (selectedLang === 'en' || !localization.en.title) return;
    
    setIsTranslating(true);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: localization.en,
          targetLang: ALL_LANGUAGES.find(l => l.code === selectedLang)?.name,
          selectedLang: selectedLang,
          options: options.map(o => ({ 
            name: o.name, 
            translations: o.translations,
            values: o.values 
          }))
        }),
      });

      const data = await res.json();
      
      if (res.ok) {
        // Update Localization
        updateLocalization(selectedLang, data.localization);
        
        // Update Options translations
        const updatedOptions = options.map((opt, idx) => {
          const translatedOpt = data.options?.[idx];
          if (!translatedOpt) return opt;

          const langKey = selectedLang;
          const optTranslation = translatedOpt.translations?.[langKey] || translatedOpt.name || opt.name;

          return {
            ...opt,
            translations: { ...opt.translations, [langKey]: optTranslation },
            values: opt.values.map((v, vIdx) => {
              const translatedVal = translatedOpt.values?.[vIdx];
              const valTranslation = translatedVal?.translations?.[langKey] || translatedVal?.value || v.value;
              
              return {
                ...v,
                translations: { ...v.translations, [langKey]: valTranslation }
              };
            })
          };
        });
        
        bulkUpdate({ options: updatedOptions });
      }
    } catch (err) {
      console.error('Translation failed:', err);
    } finally {
      setIsTranslating(false);
    }
  }, [selectedLang, localization.en, options, updateLocalization, bulkUpdate]);

  useEffect(() => {
    const init = async () => {
      let currentOrgId = organizationId;

      if (!currentOrgId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: membership } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .single();

          if (membership) {
            currentOrgId = membership.organization_id;
            setOrganizationId(currentOrgId);
          }
        }
      }

      if (currentOrgId) {
        // Load settings to get active languages
        await settings.loadFromDb(currentOrgId);
        
        // Auto-activate languages from organization settings for this product session
        const orgLangs = useSettingsStore.getState().activeLanguages;
        const currentActive = useProductStore.getState().activeLanguages;
        const missing = orgLangs.filter(l => !currentActive.includes(l));
        if (missing.length > 0) {
          bulkUpdate({ activeLanguages: [...currentActive, ...missing] });
        }
        
        if (!taxonomyOptions) {
          fetchTaxonomy(currentOrgId);
        }
      }
    };

    init();
  }, [organizationId, taxonomyOptions]);

  // Trigger translation when switching to an active but empty language
  useEffect(() => {
    if (isActive && selectedLang !== 'en' && localization.en.title && !currentLoc.title && !isTranslating) {
      translateCurrentLang();
    }
  }, [selectedLang, isActive, localization.en.title, currentLoc.title, isTranslating, translateCurrentLang]);

  const handleToggleLanguage = async () => {
    const nextActive = !isActive;
    toggleLanguage(selectedLang);

    // Auto-translate if activating a non-English language and it's currently empty
    if (nextActive && selectedLang !== 'en' && localization.en.title && !currentLoc.title) {
      await translateCurrentLang();
    }
  };

  return (
    <div className="space-y-8 pb-20 md:pb-0">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Globe className="text-indigo-400 w-8 h-8" />
            Product Details
          </h1>
          <p className="text-zinc-400">
            Manage translations and SEO metadata across global markets.
          </p>
        </div>
        
        <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/10 overflow-x-auto no-scrollbar">
          {availableLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setSelectedLang(lang.code)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap",
                selectedLang === lang.code 
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" 
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
              )}
            >
              <span>{lang.flag}</span>
              {lang.name}
              {productActiveLanguages.includes(lang.code) && (
                <Check className="w-3 h-3 text-indigo-200" />
              )}
            </button>
          ))}
        </div>
      </header>

      {isTranslating && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-3 text-indigo-400"
        >
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">AI is generating product details for {ALL_LANGUAGES.find(l => l.code === selectedLang)?.name}...</span>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-8 space-y-6">
          <section className="glass rounded-2xl p-6 border border-white/10 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Type className="w-5 h-5 text-indigo-400" />
                Product Copy
              </h2>
              <div className="flex items-center gap-4">
                {selectedLang !== 'en' && isActive && (
                  <button
                    onClick={translateCurrentLang}
                    disabled={isTranslating || !localization.en.title}
                    className="flex items-center gap-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-3 h-3", isTranslating && "animate-spin")} />
                    Sync with AI
                  </button>
                )}
                <button 
                  onClick={handleToggleLanguage}
                  disabled={isTranslating}
                  className="flex items-center gap-2 text-sm font-medium transition-colors"
                >
                  <span className={isActive ? "text-indigo-400" : "text-zinc-500"}>
                    {isActive ? 'Active' : 'Inactive'}
                  </span>
                  {isActive ? (
                    <ToggleRight className="w-8 h-8 text-indigo-500" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-zinc-600" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Title</label>
                <input 
                  type="text"
                  className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-lg"
                  value={currentLoc.title || ''}
                  onChange={(e) => handleUpdate('title', e.target.value)}
                  placeholder="Enter product title..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Subtitle</label>
                <input 
                  type="text"
                  className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                  value={currentLoc.subtitle || ''}
                  onChange={(e) => handleUpdate('subtitle', e.target.value)}
                  placeholder="Catchy one-liner..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Description</label>
                <RichTextEditor 
                  value={currentLoc.description || ''}
                  onChange={(val) => handleUpdate('description', val)}
                  placeholder="Professional product description..."
                />
              </div>

            </div>
          </section>

          <section className="glass rounded-2xl p-6 border border-white/10 space-y-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              Features & Benefits
            </h2>
            <div className="space-y-3">
              {(currentLoc.features || []).map((feature, idx) => (
                <div key={idx} className="flex gap-2">
                  <input 
                    type="text"
                    className="flex-1 bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                    value={feature}
                    onChange={(e) => {
                      const newFeatures = [...(currentLoc.features || [])];
                      newFeatures[idx] = e.target.value;
                      handleUpdate('features', newFeatures);
                    }}
                  />
                  <button 
                    onClick={() => {
                      const newFeatures = (currentLoc.features || []).filter((_, i) => i !== idx);
                      handleUpdate('features', newFeatures);
                    }}
                    className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button 
                onClick={() => handleUpdate('features', [...(currentLoc.features || []), ''])}
                className="text-sm text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
              >
                + Add Feature
              </button>
            </div>
          </section>
        </div>

        {/* SEO Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <section className="glass rounded-2xl p-6 border border-white/10 space-y-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-400" />
              SEO Optimizer
            </h2>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400 text-xs uppercase tracking-wider">Meta Title</label>
                <input 
                  type="text"
                  className="w-full bg-zinc-900/30 border border-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                  value={currentLoc.metadata_title || ''}
                  onChange={(e) => handleUpdate('metadata_title', e.target.value)}
                />
                <div className="text-[10px] text-zinc-500 text-right">
                  {(currentLoc.metadata_title || '').length} / 60
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400 text-xs uppercase tracking-wider">Meta Description</label>
                <textarea 
                  rows={4}
                  className="w-full bg-zinc-900/30 border border-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 resize-none"
                  value={currentLoc.metadata_description || ''}
                  onChange={(e) => handleUpdate('metadata_description', e.target.value)}
                />
                <div className="text-[10px] text-zinc-500 text-right">
                  {(currentLoc.metadata_description || '').length} / 160
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400 text-xs uppercase tracking-wider">Keywords</label>
                <div className="flex flex-wrap gap-2">
                  {(currentLoc.keywords || []).map((tag, idx) => (
                    <span key={idx} className="px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] flex items-center gap-1">
                      {tag}
                      <button onClick={() => {
                        const newTags = (currentLoc.keywords || []).filter((_, i) => i !== idx);
                        handleUpdate('keywords', newTags);
                      }}>×</button>
                    </span>
                  ))}
                  <input 
                    type="text"
                    className="bg-transparent border-none text-[10px] text-white outline-none w-20"
                    placeholder="+ add tag"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim();
                        if (val) {
                          handleUpdate('keywords', [...(currentLoc.keywords || []), val]);
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Store Taxonomy */}
          <section className="glass rounded-2xl p-6 border border-white/10 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                Store Taxonomy
              </h2>
              <button 
                onClick={() => organizationId && fetchTaxonomy(organizationId)}
                disabled={isSyncingTaxonomy || !organizationId}
                className="p-2 text-zinc-500 hover:text-indigo-400 transition-colors disabled:opacity-50"
                title="Sync from MedusaJS"
              >
                <RefreshCw className={cn("w-4 h-4", isSyncingTaxonomy && "animate-spin")} />
              </button>
            </div>

            {syncError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">Sync Error</p>
                  <p className="opacity-80">{syncError}</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  Collection
                </label>
                <select 
                  className="w-full bg-zinc-900/30 border border-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 appearance-none cursor-pointer"
                  value={collection_id || ''}
                  onChange={(e) => updateRoot({ collection_id: e.target.value })}
                >
                  <option value="">None</option>
                  {taxonomyOptions?.collections.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  Product Type
                </label>
                <select 
                  className="w-full bg-zinc-900/30 border border-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 appearance-none cursor-pointer"
                  value={type_id || ''}
                  onChange={(e) => updateRoot({ type_id: e.target.value })}
                >
                  <option value="">None</option>
                  {taxonomyOptions?.product_types.map(t => (
                    <option key={t.id} value={t.id}>{t.value}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  Categories
                </label>
                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-2 no-scrollbar">
                  {taxonomyOptions?.categories.map(cat => (
                    <label key={cat.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/20 border border-white/5 cursor-pointer hover:bg-white/5 transition-colors">
                      <input 
                        type="checkbox"
                        className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/50"
                        checked={categories.includes(cat.id)}
                        onChange={(e) => {
                          const newCats = e.target.checked 
                            ? [...categories, cat.id]
                            : categories.filter(id => id !== cat.id);
                          updateRoot({ categories: newCats });
                        }}
                      />
                      <span className="text-xs text-zinc-300">{cat.name}</span>
                    </label>
                  ))}
                  {(!taxonomyOptions || taxonomyOptions.categories.length === 0) && (
                    <div className="text-[10px] text-zinc-600 italic">No categories found.</div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  Sales Channels
                </label>
                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-2 no-scrollbar">
                  {taxonomyOptions?.sales_channels.map(sc => (
                    <label key={sc.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/20 border border-white/5 cursor-pointer hover:bg-white/5 transition-colors">
                      <input 
                        type="checkbox"
                        className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/50"
                        checked={sales_channels.includes(sc.id)}
                        onChange={(e) => {
                          const newChannels = e.target.checked 
                            ? [...sales_channels, sc.id]
                            : sales_channels.filter(id => id !== sc.id);
                          updateRoot({ sales_channels: newChannels });
                        }}
                      />
                      <div className="flex flex-col">
                        <span className="text-xs text-zinc-300">{sc.name}</span>
                        {sc.description && <span className="text-[8px] text-zinc-600 truncate max-w-[150px]">{sc.description}</span>}
                      </div>
                    </label>
                  ))}
                  {(!taxonomyOptions || taxonomyOptions.sales_channels.length === 0) && (
                    <div className="text-[10px] text-zinc-600 italic">No sales channels found.</div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  Shipping Profile
                </label>
                <select 
                  className="w-full bg-zinc-900/30 border border-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 appearance-none cursor-pointer"
                  value={shipping_profile_id || ''}
                  onChange={(e) => updateRoot({ shipping_profile_id: e.target.value })}
                >
                  <option value="">None</option>
                  {taxonomyOptions?.shipping_profiles.map(sp => (
                    <option key={sp.id} value={sp.id}>{sp.name}</option>
                  ))}
                </select>
                {(!taxonomyOptions || taxonomyOptions.shipping_profiles.length === 0) && (
                  <div className="text-[10px] text-zinc-600 italic">No shipping profiles found.</div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  Product Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, idx) => (
                    <span key={idx} className="px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] flex items-center gap-1">
                      {tag}
                      <button onClick={() => {
                        updateRoot({ tags: tags.filter((_, i) => i !== idx) });
                      }}>×</button>
                    </span>
                  ))}
                  <input 
                    type="text"
                    className="bg-transparent border-none text-[10px] text-white outline-none w-20"
                    placeholder="+ add tag"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim();
                        if (val && !tags.includes(val)) {
                          updateRoot({ tags: [...tags, val] });
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Logistics */}
          <section className="glass rounded-2xl p-6 border border-white/10 space-y-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-indigo-400" />
              Logistics
            </h2>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Weight (grams)</label>
                <input 
                  type="number"
                  className="w-full bg-zinc-900/30 border border-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                  value={shipping_weight || 0}
                  onChange={(e) => updateRoot({ shipping_weight: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  Dimensions (cm)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-500 ml-1">L</span>
                    <input 
                      type="number"
                      className="w-full bg-zinc-900/30 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-indigo-500/50"
                      value={shipping_dimensions?.length || 0}
                      onChange={(e) => updateRoot({ 
                        shipping_dimensions: { ...shipping_dimensions, length: parseFloat(e.target.value) || 0 } 
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-500 ml-1">W</span>
                    <input 
                      type="number"
                      className="w-full bg-zinc-900/30 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-indigo-500/50"
                      value={shipping_dimensions?.width || 0}
                      onChange={(e) => updateRoot({ 
                        shipping_dimensions: { ...shipping_dimensions, width: parseFloat(e.target.value) || 0 } 
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-500 ml-1">H</span>
                    <input 
                      type="number"
                      className="w-full bg-zinc-900/30 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-indigo-500/50"
                      value={shipping_dimensions?.height || 0}
                      onChange={(e) => updateRoot({ 
                        shipping_dimensions: { ...shipping_dimensions, height: parseFloat(e.target.value) || 0 } 
                      })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Translation Status Info */}
          {!isActive && selectedLang !== 'en' && localization.en.title && (
            <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-2">
              <div className="flex items-center gap-2 text-indigo-400">
                <Sparkles className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase">Ready to Auto-Translate</h3>
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Activating this language will automatically translate your English content using AI.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
