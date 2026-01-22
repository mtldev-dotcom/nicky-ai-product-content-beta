'use client';

import React, { useState, useEffect } from 'react';
import { useProductStore, ProductVariant } from '@/store/useProductStore';
import { ALL_LANGUAGES } from '@/lib/languages';
import {
  Layers,
  Plus,
  Trash2,
  Tag as TagIcon,
  Settings2,
  X,
  AlertCircle,
  GripVertical,
  RefreshCw,
  Box,
  DollarSign,
  MapPin,
  Save,
  ChevronDown,
  ChevronUp,
  Zap,
  Globe,
  Loader2,
  Check,
  Bookmark,
  BookmarkPlus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { getMedusaTaxonomy } from '../product-details/actions';
import { useSettingsStore } from '@/store/useSettingsStore';

function formatCurrencyCode(code: unknown): string {
  // Handle historical/invalid shapes safely (e.g., { code: "usd" })
  if (typeof code === 'string') return code.toUpperCase();
  if (code && typeof code === 'object' && 'code' in code) {
    const inner = (code as { code?: unknown }).code;
    if (typeof inner === 'string') return inner.toUpperCase();
  }
  // Default when missing/invalid
  return 'USD';
}

function currencyCodeKey(code: unknown): string {
  // Stable key material (avoid "[object Object]" collisions)
  if (typeof code === 'string') return code.toLowerCase();
  if (code && typeof code === 'object' && 'code' in code) {
    const inner = (code as { code?: unknown }).code;
    if (typeof inner === 'string') return inner.toLowerCase();
  }
  // Default when missing/invalid
  return 'usd';
}

function normalizeCurrencyCode(code: unknown): string {
  if (typeof code === 'string' && code.trim()) return code.trim().toLowerCase();
  if (code && typeof code === 'object' && 'code' in code) {
    const inner = (code as { code?: unknown }).code;
    if (typeof inner === 'string' && inner.trim()) return inner.trim().toLowerCase();
  }
  return 'usd';
}

export default function VariantsPage() {
  const {
    options,
    variants,
    addOption,
    updateOption,
    removeOption,
    addOptionValue,
    removeOptionValue,
    setVariants,
    updateVariant,
    bulkUpdate,
    organizationId,
    title: productTitle,
    handle,
    price
  } = useProductStore();

  const [newOptionName, setNewOptionName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [selectedLang, setSelectedLang] = useState('en');
  const settings = useSettingsStore();

  // Load settings on mount
  useEffect(() => {
    if (organizationId) {
      settings.loadFromDb(organizationId);
    }
  }, [organizationId, settings]);

  type MedusaStockLocation = { id: string; name: string };
  const [taxonomy, setTaxonomy] = useState<{
    currencies: string[]; // currency codes from Medusa (e.g., "usd", "cad")
    stock_locations: MedusaStockLocation[];
  } | null>(null);

  // Filter available languages based on organization settings
  const availableLanguages = ALL_LANGUAGES.filter(lang => 
    (settings.activeLanguages || ['en']).includes(lang.code)
  );

  // Check translation status for each language
  const getTranslationStatus = (langCode: string) => {
    if (langCode === 'en') return 'complete'; // English is always complete
    
    let allOptionsTranslated = true;
    let allValuesTranslated = true;
    let someOptionsTranslated = false;
    let someValuesTranslated = false;

    options.forEach(opt => {
      const hasOptionTranslation = !!opt.translations[langCode];
      if (hasOptionTranslation) someOptionsTranslated = true;
      else allOptionsTranslated = false;

      opt.values.forEach(val => {
        const hasValueTranslation = !!val.translations[langCode];
        if (hasValueTranslation) someValuesTranslated = true;
        else allValuesTranslated = false;
      });
    });

    if (allOptionsTranslated && allValuesTranslated && options.length > 0) return 'complete';
    if (someOptionsTranslated || someValuesTranslated) return 'partial';
    return 'missing';
  };
  const [expandedVariant, setExpandedVariant] = useState<string | null>(null);
  const [bulkSettings, setBulkSettings] = useState({
    prices: [] as { amount: number; currency_code: string }[],
    manage_inventory: true,
    location_id: '',
    stocked_quantity: 0
  });

  useEffect(() => {
    if (taxonomy?.currencies?.length) {
      setBulkSettings(prev => ({
        ...prev,
        prices: taxonomy.currencies.map((currencyCode) => ({
          amount: prev.prices.find((p) => p.currency_code === currencyCode)?.amount || 0,
          currency_code: currencyCode
        })),
        location_id: prev.location_id || taxonomy.stock_locations[0]?.id || ''
      }));
    }
  }, [taxonomy]);

  const applyBulkSettings = () => {
    const updatedVariants = variants.map(v => ({
      ...v,
      manage_inventory: bulkSettings.manage_inventory,
      prices: [...bulkSettings.prices],
      inventory: [{ location_id: bulkSettings.location_id, stocked_quantity: bulkSettings.stocked_quantity }]
    }));
    setVariants(updatedVariants);
  };

  useEffect(() => {
    if (organizationId) {
      getMedusaTaxonomy(organizationId).then(res => {
        if (res.success && res.data) {
          setTaxonomy({
            currencies: res.data.currencies,
            stock_locations: res.data.stock_locations
          });
        }
      });
    }
  }, [organizationId]);

  // No auto-add useEffect needed anymore as we handle it in generateVariants

  const handleAddOption = () => {
    if (!newOptionName.trim()) return;
    addOption(newOptionName.trim());
    setNewOptionName('');
  };

  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Close preset menu when clicking outside
  useEffect(() => {
    if (!showPresetMenu) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-preset-menu]')) {
        setShowPresetMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPresetMenu]);

  // Default presets (used if no custom presets exist)
  const defaultPresets = [
    {
      id: 'default-color',
      name: 'Color',
      options: [
        {
          name: 'Color',
          values: ['Black', 'White', 'Gold', 'Silver', 'Rose Gold']
        }
      ]
    },
    {
      id: 'default-size',
      name: 'Size',
      options: [
        {
          name: 'Size',
          values: ['XS', 'S', 'M', 'L', 'XL']
        }
      ]
    }
  ];

  // Get presets from settings, with defaults if none exist
  const presets = settings.variantOptionPresets && settings.variantOptionPresets.length > 0
    ? settings.variantOptionPresets
    : defaultPresets;

  const handleLoadPreset = (preset: typeof presets[0]) => {
    const newOptions = preset.options.map(opt => ({
      id: crypto.randomUUID(),
      name: opt.name,
      translations: { en: opt.name },
      values: opt.values.map(val => ({
        value: val,
        translations: { en: val }
      }))
    }));
    bulkUpdate({ options: [...options, ...newOptions] });
    setShowPresetMenu(false);
  };

  const handleSavePreset = async () => {
    if (!presetName.trim() || options.length === 0) return;

    const preset = {
      id: crypto.randomUUID(),
      name: presetName.trim(),
      options: options.map(opt => ({
        name: opt.name,
        values: opt.values.map(v => v.value)
      }))
    };

    const updatedPresets = [...(settings.variantOptionPresets || []), preset];
    settings.setStoreSettings({ 
      variantOptionPresets: updatedPresets
    });

    // Save to database
    const { organizationId } = useProductStore.getState();
    if (organizationId) {
      await settings.saveToDb(organizationId);
    }

    setPresetName('');
    setShowSavePresetModal(false);
    setShowPresetMenu(false);
  };

  const handleDeletePreset = async (presetId: string) => {
    if (!confirm('Are you sure you want to delete this preset?')) {
      return;
    }

    const updatedPresets = (settings.variantOptionPresets || []).filter(p => p.id !== presetId);
    settings.setStoreSettings({ 
      variantOptionPresets: updatedPresets.length > 0 ? updatedPresets : null
    });

    // Save to database
    const { organizationId } = useProductStore.getState();
    if (organizationId) {
      await settings.saveToDb(organizationId);
    }

    // Close menu to refresh the list
    setShowPresetMenu(false);
  };

  const generateVariants = () => {
    setIsGenerating(true);

    // Check if we have any valid options with values
    const validOptions = options.filter(opt => opt.values.length > 0);

    if (validOptions.length === 0) {
      const variantTitle = `${productTitle || 'Draft Product'} - Default Variant`;
      // Use just the product handle for default variant (no options)
      const variantSku = handle || 'product';

      const existing = variants.find(v => v.title === variantTitle || v.sku === variantSku);

      const defaultVariant: ProductVariant = {
        id: existing?.id || crypto.randomUUID(),
        title: variantTitle,
        sku: existing?.sku || variantSku,
        manage_inventory: existing?.manage_inventory ?? true,
        allow_backorder: existing?.allow_backorder ?? false,
        prices: existing?.prices || (taxonomy?.currencies || []).map(c => ({
          amount: price,
          currency_code: c
        })).slice(0, 1) || [{ amount: price, currency_code: 'usd' }],
        options: {},
        inventory: existing?.inventory || (taxonomy?.stock_locations?.[0] ? [
          { location_id: taxonomy.stock_locations[0].id, stocked_quantity: 0 }
        ] : [])
      };

      setVariants([defaultVariant]);
      // Also clear options if they are just empty shells (added but no values)
      if (options.length > 0 && options.every(o => o.values.length === 0)) {
        bulkUpdate({ options: [] });
      }
      setTimeout(() => setIsGenerating(false), 500);
      return;
    }

    // Helper for Cartesian product
    const cartesian = <T,>(sets: T[][]): T[][] => {
      return sets.reduce<T[][]>((acc, set) => {
        return acc.flatMap((x) => set.map((y) => [...x, y]));
      }, [[]]);
    };

    type OptionChoice = { optionName: string; value: string };
    const optionSets: OptionChoice[][] = validOptions.map((opt) =>
      opt.values.map((val) => ({
        optionName: opt.name,
        value: val.value,
      }))
    );

    const combinations = cartesian(optionSets);

    const newVariants: ProductVariant[] = combinations.map((combo: OptionChoice[]) => {
      const variantValuesTitle = combo.map(c => c.value).join(' / ');
      const variantTitle = `${productTitle || 'Draft Product'} - ${variantValuesTitle}`;

      const variantOptions = combo.reduce<Record<string, string>>((acc, curr) => {
        acc[curr.optionName] = curr.value;
        return acc;
      }, {});

      // Format: product-name-option-value-option-value
      const slugifiedOptions = variantValuesTitle.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '');
      const variantSku = handle 
        ? `${handle}-${slugifiedOptions}` 
        : `product-${slugifiedOptions}`;

      // Try to find existing variant to preserve data if possible (check title or SKU)
      const existing = variants.find(v => v.title === variantTitle || v.sku === variantSku);

      return {
        id: existing?.id || crypto.randomUUID(),
        title: variantTitle,
        sku: existing?.sku || variantSku,
        manage_inventory: existing?.manage_inventory ?? true,
        allow_backorder: existing?.allow_backorder ?? false,
        prices: existing?.prices || (taxonomy?.currencies || []).map(c => ({
          amount: price,
          currency_code: c
        })).slice(0, 1) || [{ amount: price, currency_code: 'usd' }],
        options: variantOptions,
        inventory: existing?.inventory || (taxonomy?.stock_locations?.[0] ? [
          { location_id: taxonomy.stock_locations[0].id, stocked_quantity: 0 }
        ] : [])
      };
    });

    setVariants(newVariants);
    setTimeout(() => setIsGenerating(false), 500);
  };

  const translateAllOptions = async () => {
    if (options.length === 0) {
      alert('No options to translate');
      return;
    }

    setIsTranslating(true);
    try {
      // Get organizationId from store state
      const currentOrgId = useProductStore.getState().organizationId;
      
      // Load settings if not already loaded
      if (currentOrgId && (!settings.activeLanguages || settings.activeLanguages.length === 0)) {
        await settings.loadFromDb(currentOrgId);
      }

      // Get active languages from settings (excluding English)
      const activeLangs = (settings.activeLanguages || ['en']).filter(lang => lang !== 'en');
      
      if (activeLangs.length === 0) {
        alert('No active languages to translate to. Please activate languages in Settings.');
        setIsTranslating(false);
        return;
      }

      // Translate to all active languages in parallel
      const translationPromises = activeLangs.map(async (langCode) => {
        const langInfo = ALL_LANGUAGES.find(l => l.code === langCode);
        if (!langInfo) return;

        try {
          // Filter out "Default" options - they should not be translated
          const optionsToTranslate = options.filter(opt => 
            opt.name.toLowerCase() !== 'default' && 
            !opt.values.some(v => v.value.toLowerCase() === 'default')
          );

          // If all options are "Default", skip translation for this language
          if (optionsToTranslate.length === 0) {
            // Set "Default" for all languages without translating
            const defaultOptions = options.map(opt => ({
              ...opt,
              translations: { ...opt.translations, [langCode]: 'Default' },
              values: opt.values.map(v => ({
                ...v,
                translations: { ...v.translations, [langCode]: v.value.toLowerCase() === 'default' ? 'Default' : v.value }
              }))
            }));
            return defaultOptions;
          }

          const res = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: { title: '', description: '', subtitle: '', features: [], metadata_title: '', metadata_description: '', keywords: [] }, // Empty source since we only need options
              targetLang: langInfo.name,
              selectedLang: langCode,
              options: optionsToTranslate.map(o => ({
                name: o.name,
                translations: o.translations,
                values: o.values.filter(v => v.value.toLowerCase() !== 'default')
              }))
            }),
          });

          const data = await res.json();
          
          if (res.ok && data.options) {
            // Update options with translations, preserving "Default" options
            let translatedIdx = 0;
            const updatedOptions = options.map((opt) => {
              // If this is a "Default" option, keep it as "Default" in all languages
              if (opt.name.toLowerCase() === 'default') {
                return {
                  ...opt,
                  translations: { ...opt.translations, [langCode]: 'Default' },
                  values: opt.values.map(v => ({
                    ...v,
                    translations: { 
                      ...v.translations, 
                      [langCode]: v.value.toLowerCase() === 'default' ? 'Default' : v.value 
                    }
                  }))
                };
              }

              // Get the translated option (skip "Default" options in the response)
              const translatedOpt = data.options[translatedIdx];
              translatedIdx++;

              if (!translatedOpt) return opt;

              const optTranslation = translatedOpt.translations?.[langCode] || translatedOpt.name || opt.name;

              // Map values, preserving "Default" values
              let valueIdx = 0;
              const translatedValues = opt.values.map((v) => {
                // If this is a "Default" value, keep it as "Default"
                if (v.value.toLowerCase() === 'default') {
                  return {
                    ...v,
                    translations: { ...v.translations, [langCode]: 'Default' }
                  };
                }

                // Get translated value
                const translatedVal = translatedOpt.values?.[valueIdx];
                valueIdx++;
                const valTranslation = translatedVal?.translations?.[langCode] || translatedVal?.value || v.value;
                
                return {
                  ...v,
                  translations: { ...v.translations, [langCode]: valTranslation }
                };
              });

              return {
                ...opt,
                translations: { ...opt.translations, [langCode]: optTranslation },
                values: translatedValues
              };
            });

            return updatedOptions;
          }
        } catch (err) {
          console.error(`Translation failed for ${langCode}:`, err);
        }
        return null;
      });

      // Wait for all translations to complete
      const results = await Promise.allSettled(translationPromises);
      
      // Merge all translation results
      let finalOptions = [...options];
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          // Merge translations from this result
          finalOptions = finalOptions.map((opt, idx) => {
            const translatedOpt = result.value?.[idx];
            if (!translatedOpt) return opt;

            return {
              ...opt,
              translations: { ...opt.translations, ...translatedOpt.translations },
              values: opt.values.map((v, vIdx) => {
                const translatedVal = translatedOpt.values?.[vIdx];
                if (!translatedVal) return v;

                return {
                  ...v,
                  translations: { ...v.translations, ...translatedVal.translations }
                };
              })
            };
          });
        }
      });

      // Update all options with merged translations
      bulkUpdate({ options: finalOptions });
      
      // Save to DB
      const { organizationId, saveToDb } = useProductStore.getState();
      if (organizationId) {
        await saveToDb();
      }

    } catch (err) {
      console.error('Translation error:', err);
      alert('Failed to translate options. Please try again.');
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="space-y-10 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Layers className="text-indigo-400 w-8 h-8" />
            Variant & Option Architect
          </h1>
          <p className="text-zinc-400">
            Define attributes and generate unique product variants for MedusaJS.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={translateAllOptions}
            disabled={isTranslating || options.length === 0}
            className={cn(
              "border px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50",
              isTranslating 
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : (() => {
                    const allTranslated = availableLanguages
                      .filter(l => l.code !== 'en')
                      .every(lang => getTranslationStatus(lang.code) === 'complete');
                    return allTranslated && options.length > 0
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20";
                  })()
            )}
          >
            {isTranslating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Globe className="w-4 h-4" />
            )}
            {isTranslating ? 'Translating...' : 'Translate Options'}
            {!isTranslating && options.length > 0 && availableLanguages
              .filter(l => l.code !== 'en')
              .every(lang => getTranslationStatus(lang.code) === 'complete') && (
              <Check className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={generateVariants}
            disabled={isGenerating || options.length === 0}
            className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
          >
            {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Box className="w-4 h-4" />}
            Generate Variants
          </button>
        </div>
      </header>

      {/* Language Tabs */}
      {availableLanguages.length > 1 && (
        <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/10 overflow-x-auto no-scrollbar">
          {availableLanguages.map((lang) => {
            const status = getTranslationStatus(lang.code);
            return (
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
                {status === 'complete' && (
                  <Check className="w-3 h-3 text-emerald-300" />
                )}
                {status === 'partial' && (
                  <AlertCircle className="w-3 h-3 text-yellow-400" />
                )}
                {status === 'missing' && lang.code !== 'en' && (
                  <X className="w-3 h-3 text-red-400" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Attribute Builder Control */}
        <div className="lg:col-span-4 space-y-6">
          <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" />
              Add Attribute
            </h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="e.g., Size, Color, Material..."
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                value={newOptionName}
                onChange={(e) => setNewOptionName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddOption()}
              />
              <button
                onClick={handleAddOption}
                disabled={!newOptionName.trim()}
                className="w-full bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 border border-white/10"
              >
                Add Option
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-white/5"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-[#09090b] px-2 text-[10px] text-zinc-600 uppercase tracking-widest font-bold">OR</span>
                </div>
              </div>

              <div className="relative" data-preset-menu>
                <button
                  onClick={() => setShowPresetMenu(!showPresetMenu)}
                  className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 border border-indigo-500/20 group"
                >
                  <Zap className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  Quick Add Preset
                  <ChevronDown className={cn("w-4 h-4 transition-transform", showPresetMenu && "rotate-180")} />
                </button>

                {showPresetMenu && (
                  <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-zinc-950 rounded-xl border border-white/10 overflow-hidden shadow-2xl">
                    <div className="max-h-64 overflow-y-auto">
                        {presets.map((preset) => (
                          <div
                            key={preset.id}
                            className="p-3 hover:bg-white/5 border-b border-white/5 last:border-b-0 flex items-center justify-between group"
                          >
                            <button
                              onClick={() => handleLoadPreset(preset)}
                              className="flex-1 text-left"
                            >
                              <div className="font-semibold text-white text-sm">{preset.name}</div>
                              <div className="text-xs text-zinc-400 mt-0.5">
                                {preset.options.map(o => o.name).join(', ')}
                              </div>
                            </button>
                            {preset.id !== 'default-color' && preset.id !== 'default-size' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePreset(preset.id);
                                }}
                                className="p-1.5 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-white/5 p-2">
                        <button
                          onClick={() => {
                            setShowSavePresetModal(true);
                            setShowPresetMenu(false);
                          }}
                          disabled={options.length === 0}
                          className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <BookmarkPlus className="w-4 h-4" />
                          Save Current as Preset
                        </button>
                      </div>
                    </div>
                )}
              </div>

              {/* Save Preset Modal */}
              <AnimatePresence>
                {showSavePresetModal && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-30 bg-black/70"
                      onClick={() => setShowSavePresetModal(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 glass-dark rounded-2xl p-6 border border-white/10 w-full max-w-md"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h3 className="text-lg font-bold text-white mb-4">Save Preset</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2 block">
                            Preset Name
                          </label>
                          <input
                            type="text"
                            placeholder="e.g., Jewelry Sizes, Common Colors..."
                            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                            value={presetName}
                            onChange={(e) => setPresetName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSavePreset();
                              if (e.key === 'Escape') setShowSavePresetModal(false);
                            }}
                            autoFocus
                          />
                        </div>
                        <div className="text-xs text-zinc-500">
                          This will save {options.length} option{options.length !== 1 ? 's' : ''} with all their values as a reusable preset.
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={handleSavePreset}
                            disabled={!presetName.trim()}
                            className="flex-1 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold transition-all"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setShowSavePresetModal(false);
                              setPresetName('');
                            }}
                            className="px-4 bg-white/5 hover:bg-white/10 text-white py-2.5 rounded-xl font-semibold transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* Options List */}
          <section className="space-y-4">
            <AnimatePresence mode="popLayout">
              {options.map((option) => (
                <motion.div
                  key={option.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass rounded-2xl border border-white/10 overflow-hidden"
                >
                  <div className="p-3 bg-white/5 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-3 h-3 text-zinc-600" />
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        {selectedLang === 'en' 
                          ? option.name 
                          : (option.translations[selectedLang] || option.name)}
                      </span>
                      {selectedLang !== 'en' && !option.translations[selectedLang] && (
                        <span className="text-[8px] text-zinc-600 italic">({option.name})</span>
                      )}
                    </div>
                    <button
                      onClick={() => removeOption(option.id)}
                      className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {option.values.map((val, vIdx) => {
                        const displayValue = selectedLang === 'en' 
                          ? val.value 
                          : (val.translations[selectedLang] || val.value);
                        const showFallback = selectedLang !== 'en' && !val.translations[selectedLang];
                        
                        return (
                          <span
                            key={`${vIdx}-${val.value}`}
                            className={cn(
                              "pl-2 pr-1 py-0.5 rounded-md border text-[11px] flex items-center gap-1.5",
                              selectedLang === 'en' || val.translations[selectedLang]
                                ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-300"
                                : "bg-yellow-500/10 border-yellow-500/20 text-yellow-300"
                            )}
                          >
                            {displayValue}
                            {showFallback && (
                              <span className="text-[8px] text-zinc-600 italic">({val.value})</span>
                            )}
                            <button
                              onClick={() => removeOptionValue(option.id, vIdx)}
                              className="p-0.5 hover:bg-indigo-500/20 rounded transition-colors"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        );
                      })}
                      <input
                        type="text"
                        placeholder="Add value..."
                        className="bg-transparent border-none text-[11px] text-white focus:ring-0 outline-none w-20"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = e.currentTarget.value.trim();
                            if (val && !option.values.some(v => v.value === val)) {
                              addOptionValue(option.id, val);
                              e.currentTarget.value = '';
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </section>
        </div>

        {/* Variants Management Area */}
        <div className="lg:col-span-8 space-y-6">
          {variants.length > 0 && (
            <section className="glass rounded-2xl border border-white/10 overflow-hidden bg-indigo-500/5">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                  <Zap className="w-3 h-3" />
                  Bulk Actions
                </h3>
                <button
                  onClick={applyBulkSettings}
                  className="px-4 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-bold transition-all active:scale-95"
                >
                  Apply to All {variants.length} Variants
                </button>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                {bulkSettings.prices.map((p, idx) => (
                  <div key={`${currencyCodeKey(p.currency_code)}-${idx}`} className="space-y-1">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase">
                      Price ({formatCurrencyCode(p.currency_code)})
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full bg-black/40 border border-white/5 rounded-md px-2 py-1 text-[10px] text-white outline-none focus:border-indigo-500/50"
                      value={p.amount}
                      onChange={(e) => {
                        const newPrices = [...bulkSettings.prices];
                        newPrices[idx] = { ...newPrices[idx], amount: parseFloat(e.target.value) || 0 };
                        setBulkSettings({ ...bulkSettings, prices: newPrices });
                      }}
                    />
                  </div>
                ))}
                <div className="space-y-1">
                  <span className="text-[9px] text-zinc-500 font-bold uppercase">Location</span>
                  <select
                    className="w-full bg-black/40 border border-white/5 rounded-md px-2 py-1 text-[10px] text-white outline-none focus:border-indigo-500/50"
                    value={bulkSettings.location_id}
                    onChange={(e) => setBulkSettings({ ...bulkSettings, location_id: e.target.value })}
                  >
                    {taxonomy?.stock_locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-zinc-500 font-bold uppercase">Stock</span>
                  <input
                    type="number"
                    className="w-full bg-black/40 border border-white/5 rounded-md px-2 py-1 text-[10px] text-white outline-none focus:border-indigo-500/50"
                    value={bulkSettings.stocked_quantity}
                    onChange={(e) => setBulkSettings({ ...bulkSettings, stocked_quantity: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-2 cursor-pointer group/inv">
                    <input
                      type="checkbox"
                      checked={bulkSettings.manage_inventory}
                      onChange={(e) => setBulkSettings({ ...bulkSettings, manage_inventory: e.target.checked })}
                      className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/50"
                    />
                    <span className="text-[9px] text-zinc-500 font-bold uppercase group-hover/inv:text-zinc-400 transition-colors">Manage Inv.</span>
                  </label>
                </div>
              </div>
            </section>
          )}

          <section className="glass rounded-2xl border border-white/10 overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Box className="w-5 h-5 text-indigo-400" />
                Generated Variants
                <span className="ml-2 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-medium">
                  {variants.length}
                </span>
              </h2>
            </div>

            <div className="divide-y divide-white/5">
              {variants.length > 0 ? (
                variants.map((variant) => (
                  <div key={variant.id} className="group">
                    <div
                      onClick={() => setExpandedVariant(expandedVariant === variant.id ? null : variant.id)}
                      className="p-4 flex items-center justify-between hover:bg-white/5 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                          <TagIcon className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{variant.title}</p>
                          <p className="text-[10px] text-zinc-500 font-mono">{variant.sku}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs font-medium text-zinc-300">
                            {variant.prices[0]?.amount}{' '}
                            {formatCurrencyCode(variant.prices[0]?.currency_code)}
                          </p>
                          <p className="text-[10px] text-zinc-500">
                            {variant.inventory[0]?.stocked_quantity || 0} in stock
                          </p>
                        </div>
                        {expandedVariant === variant.id ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                      </div>
                    </div>

                    <AnimatePresence>
                      {expandedVariant === variant.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden bg-zinc-900/40"
                        >
                          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-white/5">
                            {/* Left: General Info */}
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Variant SKU</label>
                                <input
                                  type="text"
                                  className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500/50"
                                  value={variant.sku}
                                  onChange={(e) => updateVariant(variant.id, { sku: e.target.value })}
                                />
                              </div>

                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                    <DollarSign className="w-3 h-3" /> Pricing
                                  </label>
                                  <select
                                    className="bg-indigo-500/10 border border-indigo-500/20 rounded-md px-2 py-1 text-[10px] text-indigo-400 outline-none focus:border-indigo-500/50 uppercase font-bold cursor-pointer"
                                    value=""
                                    onChange={(e) => {
                                      if (!e.target.value) return;
                                      const newPrices = [...variant.prices, { amount: price, currency_code: e.target.value }];
                                      updateVariant(variant.id, { prices: newPrices });
                                    }}
                                  >
                                    <option value="">+ Add Currency</option>
                                    {(taxonomy?.currencies || [])
                                      .map((c) => normalizeCurrencyCode(c))
                                      // Hide currencies already present on the variant (support legacy shapes)
                                      .filter((c) => !variant.prices.some((p) => currencyCodeKey(p.currency_code) === c))
                                      .map((c) => (
                                        <option key={c} value={c}>
                                          {formatCurrencyCode(c)}
                                        </option>
                                      ))}
                                  </select>
                                </div>

                                <div className="space-y-2">
                                  {variant.prices.map((p, pIdx) => (
                                    <div key={`${currencyCodeKey(p.currency_code)}-${pIdx}`} className="flex gap-2 group/price">
                                      <div className="flex-1 flex gap-2">
                                        <div className="bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-[10px] text-zinc-400 font-bold uppercase min-w-[60px] flex items-center justify-center">
                                          {formatCurrencyCode(p.currency_code)}
                                        </div>
                                        <input
                                          type="number"
                                          step="0.01"
                                          className="flex-1 bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500/50"
                                          value={p.amount}
                                          onChange={(e) => {
                                            const newPrices = [...variant.prices];
                                            newPrices[pIdx] = { ...newPrices[pIdx], amount: parseFloat(e.target.value) || 0 };
                                            updateVariant(variant.id, { prices: newPrices });
                                          }}
                                        />
                                      </div>
                                      <button
                                        onClick={() => {
                                          const newPrices = variant.prices.filter((_, i) => i !== pIdx);
                                          updateVariant(variant.id, { prices: newPrices });
                                        }}
                                        className="p-2 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover/price:opacity-100"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                  {variant.prices.length === 0 && (
                                    <p className="text-[10px] text-zinc-600 italic">No prices added yet.</p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: Inventory */}
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                  <MapPin className="w-3 h-3" /> Inventory
                                </label>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-zinc-500">Manage Stock</span>
                                  <input
                                    type="checkbox"
                                    checked={variant.manage_inventory}
                                    onChange={(e) => updateVariant(variant.id, { manage_inventory: e.target.checked })}
                                    className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/50"
                                  />
                                </div>
                              </div>

                              <div className="space-y-3">
                                {variant.inventory.map((inv, idx) => (
                                  <div key={idx} className="flex gap-2 items-end">
                                    <div className="flex-1 space-y-1">
                                      <span className="text-[9px] text-zinc-600">Location</span>
                                      <select
                                        className="w-full bg-black/40 border border-white/5 rounded-lg px-2 py-1.5 text-[10px] text-white outline-none"
                                        value={inv.location_id}
                                        onChange={(e) => {
                                          const newInv = [...variant.inventory];
                                          newInv[idx] = { ...newInv[idx], location_id: e.target.value };
                                          updateVariant(variant.id, { inventory: newInv });
                                        }}
                                      >
                                        {taxonomy?.stock_locations.map(loc => (
                                          <option key={loc.id} value={loc.id}>{loc.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="w-24 space-y-1">
                                      <span className="text-[9px] text-zinc-600">Stock</span>
                                      <input
                                        type="number"
                                        className="w-full bg-black/40 border border-white/5 rounded-lg px-2 py-1.5 text-[10px] text-white outline-none"
                                        value={inv.stocked_quantity}
                                        onChange={(e) => {
                                          const newInv = [...variant.inventory];
                                          newInv[idx] = { ...newInv[idx], stocked_quantity: parseInt(e.target.value) || 0 };
                                          updateVariant(variant.id, { inventory: newInv });
                                        }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-zinc-600 gap-4">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                    <Box className="w-8 h-8" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-medium text-zinc-500">No variants generated</p>
                    <p className="text-sm">Click &quot;Generate Variants&quot; to create combinations from your attributes.</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

