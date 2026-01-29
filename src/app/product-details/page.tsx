'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useProductStore, type Localization, type ProductOption } from '@/store/useProductStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { createClient } from '@/utils/supabase/client';
import { ALL_LANGUAGES } from '@/lib/languages';
import {
  Globe,
  Check,
  Type,
  Search,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Loader2,
  AlertCircle,
  Layers,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { getMedusaTaxonomy } from './actions';
import { AISourceBadge } from '@/components/ui/AISourceBadge';
import { ProductMediaModule } from '@/components/product-details/modules/ProductMediaModule';
import { ProductVariantsModule } from '@/components/product-details/modules/ProductVariantsModule';
import { ProductJsonModule } from '@/components/product-details/modules/ProductJsonModule';

const RichTextEditor = dynamic(() => import('@/components/ui/RichTextEditor').then(mod => mod.RichTextEditor), {
  ssr: false,
  loading: () => <div className="w-full h-[150px] bg-zinc-900/50 border border-white/10 rounded-2xl animate-pulse" />
});

export default function ProductDetailsPage() {
  const settings = useSettingsStore();
  const loadSettingsFromDb = useSettingsStore(s => s.loadFromDb);
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
    categories,
    sales_channels,
    updateRoot,
    translatingLanguages,
    aiMeta,
    medusaProductId
  } = useProductStore();

  const getFieldSource = (path: string): 'ai' | 'source' | 'mixed' => {
    if (!aiMeta) return 'source'; // Default

    // Check if path is in filled by AI
    const isAI = aiMeta.fieldsFilledByAI?.some(p => p === path || p.startsWith(`${path}.`));
    const isSource = aiMeta.fieldsFromSource?.some(p => p === path || p.startsWith(`${path}.`));

    if (isAI && isSource) return 'mixed';
    if (isAI) return 'ai';
    return 'source';
  };

  const [selectedLang, setSelectedLang] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSyncingTaxonomy, setIsSyncingTaxonomy] = useState(false);
  const [enhancingField, setEnhancingField] = useState<string | null>(null);
  type MedusaCollection = { id: string; title: string };
  type MedusaProductCategory = { id: string; name: string };
  type MedusaSalesChannel = { id: string; name: string; description?: string | null };
  type MedusaProductType = { id: string; value: string };
  type MedusaShippingProfile = { id: string; name: string };

  type MedusaTaxonomy = {
    collections: MedusaCollection[];
    categories: MedusaProductCategory[];
    sales_channels: MedusaSalesChannel[];
    product_types: MedusaProductType[];
    shipping_profiles: MedusaShippingProfile[];
    currencies: string[];
    stock_locations: { id: string; name: string }[];
  };

  const [taxonomyOptions, setTaxonomyOptions] = useState<MedusaTaxonomy | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const currentLoc = localization[selectedLang] ?? localization.en;
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

  const handleUpdate = <K extends keyof Localization>(field: K, value: Localization[K]) => {
    updateLocalization(selectedLang, { [field]: value } as Partial<Localization>);
  };

  const enhanceField = async (field: keyof Localization, fieldType: string) => {
    const currentValue = currentLoc[field];
    setEnhancingField(`${field}-${selectedLang}`);

    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field,
          currentValue: Array.isArray(currentValue) ? currentValue.join(', ') : currentValue,
          fieldType,
          language: selectedLang
        }),
      });

      const data = await res.json();

      if (res.ok && data.enhanced) {
        // For features and keywords, handle array format
        if (field === 'features' || field === 'keywords') {
          const enhancedArray = Array.isArray(data.enhanced)
            ? data.enhanced
            : data.enhanced.split(',').map((item: string) => item.trim()).filter(Boolean);
          handleUpdate(field, enhancedArray as Localization[typeof field]);
        } else {
          handleUpdate(field, data.enhanced as Localization[typeof field]);
        }
      } else {
        alert(data.error || 'Failed to enhance content');
      }
    } catch (err) {
      console.error('Enhancement failed:', err);
      alert('Network error during enhancement');
    } finally {
      setEnhancingField(null);
    }
  };

  const enhanceFeature = async (index: number) => {
    const currentFeature = (currentLoc.features || [])[index];
    if (!currentFeature) return;

    setEnhancingField(`feature-${index}-${selectedLang}`);

    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: 'feature',
          currentValue: currentFeature,
          fieldType: 'feature',
          language: selectedLang
        }),
      });

      const data = await res.json();

      if (res.ok && data.enhanced) {
        const newFeatures = [...(currentLoc.features || [])];
        newFeatures[index] = data.enhanced;
        handleUpdate('features', newFeatures);
      } else {
        alert(data.error || 'Failed to enhance feature');
      }
    } catch (err) {
      console.error('Enhancement failed:', err);
      alert('Network error during enhancement');
    } finally {
      setEnhancingField(null);
    }
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

        bulkUpdate({ options: updatedOptions as ProductOption[] });
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

          if (membership?.organization_id) {
            currentOrgId = membership.organization_id as string;
            setOrganizationId(currentOrgId);
          }
        }
      }

      if (currentOrgId) {
        // Load settings to get active languages
        await loadSettingsFromDb(currentOrgId);

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

  const [isUpdatingMedusa, setIsUpdatingMedusa] = useState(false);

  const handleMedusaUpdate = async () => {
    const productState = useProductStore.getState();
    const { medusaProductId, id: localProductId } = productState;
    if (!medusaProductId) {
      alert('Product is not linked to Medusa. Please push to Medusa first.');
      return;
    }

    setIsUpdatingMedusa(true);
    try {
      // 1. Send update to Medusa FIRST (before saving locally)
      // This ensures we don't create duplicate local entries if Medusa update fails
      const res = await fetch(`/api/medusa/products/${medusaProductId}`, {
        method: 'POST',
        body: JSON.stringify({ payload: productState }),
        headers: { 'Content-Type': 'application/json' }
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to update Medusa product');
      }

      // 2. After successful Medusa update, ensure medusaProductId is set in local state
      // The Medusa response confirms the update was successful
      // We'll sync the local state on next save

      // 3. Save updated state to local DB (now with Medusa data synced)
      await productState.saveToDb();

      // 4. Ensure product is properly linked (idempotent)
      if (localProductId && medusaProductId) {
        try {
          await fetch('/api/products/link-medusa', {
            method: 'POST',
            body: JSON.stringify({
              productId: localProductId,
              medusaProductId: medusaProductId,
            }),
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (linkErr) {
          console.warn('Failed to link product (non-critical):', linkErr);
        }
      }

      alert('Successfully updated Medusa product and synced to local database!');
    } catch (err) {
      console.error('Update failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to update Medusa product');
    } finally {
      setIsUpdatingMedusa(false);
    }
  };

  return (
    <div className="space-y-8 pb-32 md:pb-8">
      {/* Header */}
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

        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Edit / Update Actions */}
          {useProductStore.getState().medusaProductId && (
            <button
              onClick={handleMedusaUpdate}
              disabled={isUpdatingMedusa}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/20"
            >
              {isUpdatingMedusa ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {isUpdatingMedusa ? 'Updating...' : 'Update Medusa'}
            </button>
          )}

          <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/10 overflow-x-auto no-scrollbar">
            {availableLanguages.map((lang) => {
              const isTranslatingLang = translatingLanguages.has(lang.code);
              return (
                <button
                  key={lang.code}
                  onClick={() => setSelectedLang(lang.code)}
                  disabled={isTranslatingLang}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap",
                    selectedLang === lang.code
                      ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5",
                    isTranslatingLang && "opacity-75 cursor-wait"
                  )}
                >
                  <span>{lang.flag}</span>
                  {lang.name}
                  {isTranslatingLang ? (
                    <Loader2 className="w-3 h-3 animate-spin text-indigo-300" />
                  ) : productActiveLanguages.includes(lang.code) ? (
                    <Check className="w-3 h-3 text-indigo-200" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {(isTranslating || translatingLanguages.size > 0) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-3 text-indigo-400"
        >
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">
            {isTranslating
              ? `AI is generating product details for ${ALL_LANGUAGES.find(l => l.code === selectedLang)?.name}...`
              : `Translating ${Array.from(translatingLanguages).map(l => ALL_LANGUAGES.find(lang => lang.code === l)?.name).filter(Boolean).join(', ')}...`
            }
          </span>
        </motion.div>
      )}

      {/* Main Grid: Content + Modules */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Product Copy, Features, Media, Variants */}
        <div className="lg:col-span-8 space-y-8">

          {/* Product Copy Module */}
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
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-zinc-400">Title</label>
                  <button
                    onClick={() => enhanceField('title', 'title')}
                    disabled={enhancingField === `title-${selectedLang}`}
                    className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors disabled:opacity-50"
                    title="Enhance with AI"
                  >
                    {enhancingField === `title-${selectedLang}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <input
                  type="text"
                  className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-lg"
                  value={currentLoc.title || ''}
                  onChange={(e) => handleUpdate('title', e.target.value)}
                  placeholder="Enter product title..."
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-zinc-400">Subtitle</label>
                  <button
                    onClick={() => enhanceField('subtitle', 'subtitle')}
                    disabled={enhancingField === `subtitle-${selectedLang}`}
                    className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors disabled:opacity-50"
                    title="Enhance with AI"
                  >
                    {enhancingField === `subtitle-${selectedLang}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <input
                  type="text"
                  className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                  value={currentLoc.subtitle || ''}
                  onChange={(e) => handleUpdate('subtitle', e.target.value)}
                  placeholder="Catchy one-liner..."
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-zinc-400">Description</label>
                    <AISourceBadge source={getFieldSource(`descriptions.${selectedLang}.long`)} />
                  </div>
                  <button
                    onClick={() => enhanceField('description', 'description')}
                    disabled={enhancingField === `description-${selectedLang}`}
                    className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors disabled:opacity-50"
                    title="Enhance with AI"
                  >
                    {enhancingField === `description-${selectedLang}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <RichTextEditor
                  value={currentLoc.description || ''}
                  onChange={(val) => handleUpdate('description', val)}
                  placeholder="Professional product description..."
                />
              </div>
            </div>
          </section>

          {/* Features Module */}
          <section className="glass rounded-2xl p-6 border border-white/10 space-y-6">
            <h2 className="text-xl font-semibold text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                Features & Benefits
              </div>
              <AISourceBadge source={getFieldSource(`descriptions.${selectedLang}.features`)} />
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
                    onClick={() => enhanceFeature(idx)}
                    disabled={enhancingField === `feature-${idx}-${selectedLang}`}
                    className="p-2 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors disabled:opacity-50"
                    title="Enhance with AI"
                  >
                    {enhancingField === `feature-${idx}-${selectedLang}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                  </button>
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

          {/* New Integrated Modules */}
          <ProductMediaModule />
          <ProductVariantsModule taxonomy={taxonomyOptions ? {
            currencies: taxonomyOptions.currencies,
            stock_locations: taxonomyOptions.stock_locations
          } : null} />
          <ProductJsonModule />
        </div>

        {/* Right Column: SEO, Taxonomy */}
        <div className="lg:col-span-4 space-y-6">
          <section className="glass rounded-2xl p-6 border border-white/10 space-y-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-400" />
              SEO Optimizer
            </h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-zinc-400 text-xs uppercase tracking-wider">Meta Title</label>
                    <AISourceBadge source={getFieldSource(`descriptions.${selectedLang}.seo.title`)} />
                  </div>
                  <button
                    onClick={() => enhanceField('metadata_title', 'metadata_title')}
                    disabled={enhancingField === `metadata_title-${selectedLang}`}
                    className="p-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors disabled:opacity-50"
                    title="Optimize with AI"
                  >
                    {enhancingField === `metadata_title-${selectedLang}` ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                  </button>
                </div>
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-zinc-400 text-xs uppercase tracking-wider">Meta Description</label>
                    <AISourceBadge source={getFieldSource(`descriptions.${selectedLang}.seo.description`)} />
                  </div>
                  <button
                    onClick={() => enhanceField('metadata_description', 'metadata_description')}
                    disabled={enhancingField === `metadata_description-${selectedLang}`}
                    className="p-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors disabled:opacity-50"
                    title="Optimize with AI"
                  >
                    {enhancingField === `metadata_description-${selectedLang}` ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                  </button>
                </div>
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-zinc-400 text-xs uppercase tracking-wider">Keywords</label>
                    <AISourceBadge source={getFieldSource(`descriptions.${selectedLang}.seo.keywords`)} />
                  </div>
                  <button
                    onClick={() => enhanceField('keywords', 'keywords')}
                    disabled={enhancingField === `keywords-${selectedLang}`}
                    className="p-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors disabled:opacity-50"
                    title="Generate keywords with AI"
                  >
                    {enhancingField === `keywords-${selectedLang}` ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                  </button>
                </div>
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
              <>
                {syncError === 'MedusaJS integration not configured' ? (
                  <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-3 text-indigo-300 text-xs">
                    <Layers className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="space-y-2 flex-1">
                      <p className="font-semibold">Connect a Store</p>
                      <p className="opacity-80">Link your MedusaJS store to sync products and taxonomy.</p>
                      <a
                        href="/settings"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 text-xs font-medium transition-colors mt-2"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Go to Settings
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400 text-xs">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-semibold">Sync Error</p>
                      <p className="opacity-80">{syncError}</p>
                    </div>
                  </div>
                )}
              </>
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
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
