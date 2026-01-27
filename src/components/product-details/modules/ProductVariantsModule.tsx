'use client';

import React, { useState, useEffect } from 'react';
import { useProductStore, ProductVariant } from '@/store/useProductStore';
import { ALL_LANGUAGES } from '@/lib/languages';
import {
    Layers,
    Plus,
    Trash2,
    Box,
    RefreshCw,
    Zap,
    Globe,
    Loader2,
    Check,
    AlertCircle,
    X,
    ChevronDown,
    BookmarkPlus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

import { useSettingsStore } from '@/store/useSettingsStore';


type MedusaStockLocation = { id: string; name: string };

interface ProductVariantsModuleProps {
    taxonomy?: {
        currencies: string[];
        stock_locations: MedusaStockLocation[];
    } | null;
}

export function ProductVariantsModule({ taxonomy }: ProductVariantsModuleProps) {
    const {
        options,
        variants,
        addOption,
        bulkUpdate,
        setVariants,
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

    // Filter available languages based on organization settings
    const availableLanguages = ALL_LANGUAGES.filter(lang =>
        (settings.activeLanguages || ['en']).includes(lang.code)
    );
    const [bulkActions, setBulkActions] = useState<{
        prices: Record<string, string>;
        stock: string;
        locationId: string;
        manageInventory: boolean | null;
    }>({
        prices: {},
        stock: '100',
        locationId: '',
        manageInventory: false
    });

    useEffect(() => {
        if (taxonomy?.stock_locations?.[0]) {
            setBulkActions(prev => ({ ...prev, locationId: taxonomy.stock_locations[0].id }));
        }
    }, [taxonomy]);

    const handleAddOption = () => {
        if (!newOptionName.trim()) return;
        addOption(newOptionName.trim());
        setNewOptionName('');
    };

    const [showPresetMenu, setShowPresetMenu] = useState(false);
    const [showSavePresetModal, setShowSavePresetModal] = useState(false);
    const [presetName, setPresetName] = useState('');

    // Default presets
    const defaultPresets = [
        {
            id: 'default-color',
            name: 'Color',
            options: [
                { name: 'Color', values: ['Black', 'White', 'Gold', 'Silver', 'Rose Gold'] }
            ]
        },
        {
            id: 'default-size',
            name: 'Size',
            options: [
                { name: 'Size', values: ['XS', 'S', 'M', 'L', 'XL'] }
            ]
        },
        {
            id: 'uncut-colors-en-fr',
            name: 'Uncut Colors (EN/FR)',
            options: [
                {
                    name: 'Color',
                    translations: { en: 'Color', fr: 'Couleur' },
                    values: [], // Fallback for simple mapper
                    valuesWithTranslations: [
                        { value: 'Purple', translations: { en: 'Purple', fr: 'Violet' } },
                        { value: 'Blue', translations: { en: 'Blue', fr: 'Bleu' } },
                        { value: 'Black', translations: { en: 'Black', fr: 'Noir' } },
                        { value: 'Green', translations: { en: 'Green', fr: 'Vert' } },
                        { value: 'Red', translations: { en: 'Red', fr: 'Rouge' } },
                        { value: 'Copper', translations: { en: 'Copper', fr: 'Cuivre' } },
                        { value: 'Gold', translations: { en: 'Gold', fr: 'Or' } },
                        { value: 'Silver', translations: { en: 'Silver', fr: 'Argent' } },

                        // Combinations - Silver Base
                        { value: 'Silver/Purple', translations: { en: 'Silver/Purple', fr: 'Argent/Violet' } },
                        { value: 'Silver/Blue', translations: { en: 'Silver/Blue', fr: 'Argent/Bleu' } },
                        { value: 'Silver/Black', translations: { en: 'Silver/Black', fr: 'Argent/Noir' } },
                        { value: 'Silver/Green', translations: { en: 'Silver/Green', fr: 'Argent/Vert' } },
                        { value: 'Silver/Red', translations: { en: 'Silver/Red', fr: 'Argent/Rouge' } },
                        { value: 'Silver/Copper', translations: { en: 'Silver/Copper', fr: 'Argent/Cuivre' } },
                        { value: 'Silver/Gold', translations: { en: 'Silver/Gold', fr: 'Argent/Or' } },

                        // Combinations - Black Base
                        { value: 'Black/Purple', translations: { en: 'Black/Purple', fr: 'Noir/Violet' } },
                        { value: 'Black/Blue', translations: { en: 'Black/Blue', fr: 'Noir/Bleu' } },
                        { value: 'Black/Black', translations: { en: 'Black/Black', fr: 'Noir/Noir' } },
                        { value: 'Black/Green', translations: { en: 'Black/Green', fr: 'Noir/Vert' } },
                        { value: 'Black/Red', translations: { en: 'Black/Red', fr: 'Noir/Rouge' } },
                        { value: 'Black/Copper', translations: { en: 'Black/Copper', fr: 'Noir/Cuivre' } },
                        { value: 'Black/Gold', translations: { en: 'Black/Gold', fr: 'Noir/Or' } },
                        { value: 'Black/Silver', translations: { en: 'Black/Silver', fr: 'Noir/Argent' } }
                    ]
                }
            ]
        }
    ];

    const presets = settings.variantOptionPresets && settings.variantOptionPresets.length > 0
        ? settings.variantOptionPresets
        : defaultPresets;

    const handleLoadPreset = (preset: typeof presets[0]) => {
        const newOptions = preset.options.map(opt => {
            // Check if we have extended values with translations
            // @ts-ignore - dynamic property check
            const extendedValues = opt.valuesWithTranslations as Array<{ value: string; translations: Record<string, string> }>;

            if (extendedValues && extendedValues.length > 0) {
                return {
                    id: crypto.randomUUID(),
                    // @ts-ignore
                    name: opt.name,
                    // @ts-ignore
                    translations: opt.translations || { en: opt.name },
                    values: extendedValues
                };
            }

            return {
                id: crypto.randomUUID(),
                name: opt.name,
                translations: { en: opt.name },
                values: opt.values.map(val => ({
                    value: val,
                    translations: { en: val }
                }))
            };
        });
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

        if (organizationId) {
            await settings.saveToDb(organizationId);
        }

        setPresetName('');
        setShowSavePresetModal(false);
        setShowPresetMenu(false);
    };

    const handleDeletePreset = async (presetId: string) => {
        if (!confirm('Are you sure you want to delete this preset?')) return;

        const updatedPresets = (settings.variantOptionPresets || []).filter(p => p.id !== presetId);
        settings.setStoreSettings({
            variantOptionPresets: updatedPresets.length > 0 ? updatedPresets : null
        });

        if (organizationId) {
            await settings.saveToDb(organizationId);
        }
        setShowPresetMenu(false);
    };

    const generateVariants = () => {
        setIsGenerating(true);
        const validOptions = options.filter(opt => opt.values.length > 0);

        if (validOptions.length === 0) {
            const variantTitle = `${productTitle || 'Draft Product'} - Default Variant`;
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
            setTimeout(() => setIsGenerating(false), 500);
            return;
        }

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

            const slugifiedOptions = variantValuesTitle.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '');
            const variantSku = handle
                ? `${handle}-${slugifiedOptions}`
                : `product-${slugifiedOptions}`;

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

    const getTranslationStatus = (langCode: string) => {
        if (langCode === 'en') return 'complete';
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

    const translateAllOptions = async () => {
        if (options.length === 0) {
            alert('No options to translate');
            return;
        }

        setIsTranslating(true);
        try {
            const activeLangs = (settings.activeLanguages || ['en']).filter(lang => lang !== 'en');

            if (activeLangs.length === 0) {
                alert('No active languages to translate to. Please activate languages in Settings.');
                setIsTranslating(false);
                return;
            }

            const translationPromises = activeLangs.map(async (langCode) => {
                const langInfo = ALL_LANGUAGES.find(l => l.code === langCode);
                if (!langInfo) return;

                try {
                    const optionsToTranslate = options.filter(opt =>
                        opt.name.toLowerCase() !== 'default' &&
                        !opt.values.some(v => v.value.toLowerCase() === 'default')
                    );

                    if (optionsToTranslate.length === 0) return;

                    const res = await fetch('/api/translate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            source: { title: '', description: '', subtitle: '', features: [], metadata_title: '', metadata_description: '', keywords: [] },
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
                        let translatedIdx = 0;
                        const updatedOptions = options.map((opt) => {
                            if (opt.name.toLowerCase() === 'default') return opt;

                            const translatedOpt = data.options[translatedIdx];
                            translatedIdx++;

                            if (!translatedOpt) return opt;

                            const optTranslation = translatedOpt.translations?.[langCode] || translatedOpt.name || opt.name;

                            let valueIdx = 0;
                            const translatedValues = opt.values.map((v) => {
                                if (v.value.toLowerCase() === 'default') return v;

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

            const results = await Promise.allSettled(translationPromises);

            let finalOptions = [...options];
            results.forEach((result) => {
                if (result.status === 'fulfilled' && result.value) {
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

            bulkUpdate({ options: finalOptions });
            const { organizationId: currentOrgId, saveToDb } = useProductStore.getState();
            if (currentOrgId) {
                await saveToDb();
            }

        } catch (err) {
            console.error('Translation error:', err);
            alert('Failed to translate options.');
        } finally {
            setIsTranslating(false);
        }
    };

    const hasVariants = variants.length > 0 && !variants[0].title.includes('Default Variant');

    return (
        <div className="space-y-6">
            <section className="glass rounded-2xl p-6 border border-white/10 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                        <Layers className="w-5 h-5 text-indigo-400" />
                        Variants & Options
                    </h2>

                    <div className="flex items-center gap-2">
                        {(() => {
                            const activeLangs = (settings.activeLanguages || ['en']).filter(l => l !== 'en');
                            const allComplete = activeLangs.every(l => getTranslationStatus(l) === 'complete');

                            return (
                                <button
                                    onClick={translateAllOptions}
                                    disabled={isTranslating || options.length === 0 || allComplete}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all border",
                                        isTranslating
                                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                            : allComplete
                                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 opacity-80"
                                                : "bg-white/5 hover:bg-white/10 text-zinc-400 border-white/10"
                                    )}
                                >
                                    {isTranslating ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : allComplete ? (
                                        <Check className="w-3 h-3" />
                                    ) : (
                                        <Globe className="w-3 h-3" />
                                    )}
                                    {isTranslating ? 'Translating...' : allComplete ? 'Synced' : 'Translate All'}
                                </button>
                            );
                        })()}
                        <button
                            onClick={generateVariants}
                            disabled={isGenerating || options.length === 0}
                            className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all"
                        >
                            {isGenerating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Box className="w-3 h-3" />}
                            Generate Variants
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Options Builder */}
                    <div className="lg:col-span-1 space-y-4">
                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <h3 className="text-sm font-semibold text-white mb-3">Add Option</h3>
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    placeholder="e.g. Size, Color..."
                                    className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                                    value={newOptionName}
                                    onChange={(e) => setNewOptionName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddOption()}
                                />
                                <button
                                    onClick={handleAddOption}
                                    disabled={!newOptionName.trim()}
                                    className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                                >
                                    Add Option
                                </button>

                                <div className="relative py-2">
                                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
                                    <div className="relative flex justify-center"><span className="bg-[#09090b] px-2 text-[10px] text-zinc-600 uppercase font-bold">OR LOAD PRESET</span></div>
                                </div>

                                <div className="relative">
                                    <button
                                        onClick={() => setShowPresetMenu(!showPresetMenu)}
                                        className="w-full bg-white/5 hover:bg-white/10 text-zinc-400 border border-white/10 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                                    >
                                        <Zap className="w-3 h-3" />
                                        Presets
                                        <ChevronDown className="w-3 h-3" />
                                    </button>
                                    {showPresetMenu && (
                                        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-black rounded-lg border border-white/10 shadow-xl overflow-hidden">
                                            <div className="max-h-48 overflow-y-auto">
                                                {presets.map(p => (
                                                    <div key={p.id} className="p-2 hover:bg-white/10 flex items-center justify-between cursor-pointer group" onClick={() => handleLoadPreset(p)}>
                                                        <div className="text-xs text-white font-medium">{p.name}</div>
                                                        {p.id !== 'default-color' && p.id !== 'default-size' && (
                                                            <button onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.id); }} className="text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100">
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="border-t border-white/5 p-2">
                                                <button
                                                    onClick={() => { setShowSavePresetModal(true); setShowPresetMenu(false); }}
                                                    disabled={options.length === 0}
                                                    className="w-full bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                                                >
                                                    <BookmarkPlus className="w-3 h-3 inline mr-1" /> Save Current
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Current Options List (Simplified View) */}
                        <div className="space-y-2">
                            {options.map((option, idx) => (
                                <div key={option.id} className="p-3 rounded-xl bg-white/5 border border-white/10">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-white">{option.name}</span>
                                        <button onClick={() => useProductStore.getState().removeOption(option.id)} className="text-zinc-500 hover:text-red-400 transition-colors">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {option.values.map((val, vIdx) => (
                                            <span key={`${vIdx}-${val.value}`} className="px-2 py-0.5 rounded bg-white/10 text-xs text-zinc-300 flex items-center gap-1 group">
                                                {val.value}
                                                <button onClick={() => useProductStore.getState().removeOptionValue(option.id, vIdx)} className="hover:text-white opacity-50 group-hover:opacity-100">
                                                    <X className="w-2 h-2" />
                                                </button>
                                            </span>
                                        ))}
                                        <input
                                            type="text"
                                            placeholder="+ Add Value"
                                            className="px-2 py-0.5 rounded bg-transparent border border-white/10 text-xs text-white outline-none focus:border-indigo-500 w-24"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    const val = e.currentTarget.value.trim();
                                                    if (val) {
                                                        useProductStore.getState().addOptionValue(option.id, val);
                                                        e.currentTarget.value = '';
                                                    }
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Variants Table Preview */}
                    <div className="lg:col-span-2">
                        {hasVariants ? (
                            <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-6">
                                {/* Bulk Actions */}
                                <div className="bg-black/40 rounded-xl p-4 border border-white/5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-indigo-400">
                                            <Zap className="w-4 h-4 fill-indigo-400" />
                                            <span className="text-xs font-bold uppercase tracking-wider">Bulk Actions</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newVariants = variants.map(v => {
                                                    const updatedPrices = [...v.prices];
                                                    // Update prices if set
                                                    if (bulkActions.prices) {
                                                        Object.entries(bulkActions.prices).forEach(([code, amount]) => {
                                                            if (amount !== '') {
                                                                const idx = updatedPrices.findIndex(p => p.currency_code === code);
                                                                if (idx >= 0) updatedPrices[idx] = { ...updatedPrices[idx], amount: Number(amount) };
                                                                else updatedPrices.push({ currency_code: code, amount: Number(amount) });
                                                            }
                                                        });
                                                    }

                                                    // Update inventory
                                                    const updatedInventory = [...(v.inventory || [])];
                                                    if (bulkActions.locationId) {
                                                        const idx = updatedInventory.findIndex(i => i.location_id === bulkActions.locationId);
                                                        if (idx >= 0) {
                                                            if (bulkActions.stock !== '') updatedInventory[idx] = { ...updatedInventory[idx], stocked_quantity: Number(bulkActions.stock) };
                                                        } else if (bulkActions.stock !== '') {
                                                            updatedInventory.push({ location_id: bulkActions.locationId, stocked_quantity: Number(bulkActions.stock) });
                                                        }
                                                    }

                                                    return {
                                                        ...v,
                                                        manage_inventory: bulkActions.manageInventory !== null ? bulkActions.manageInventory : v.manage_inventory,
                                                        prices: updatedPrices,
                                                        inventory: updatedInventory
                                                    };
                                                });
                                                setVariants(newVariants);
                                                // Clear keys to prevent accidental double apply? Optional. Keeping values for now so user can tweak.
                                            }}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            Apply to All {variants.length} Variants
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {(taxonomy?.currencies || ['usd']).map(curr => (
                                            <div key={curr} className="space-y-1">
                                                <label className="text-[10px] font-bold text-zinc-500 uppercase">Price ({String(curr || '').toUpperCase()})</label>
                                                <input
                                                    type="number"
                                                    placeholder="0.00"
                                                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-indigo-500 outline-none"
                                                    value={bulkActions.prices[curr] || ''}
                                                    onChange={(e) => setBulkActions(prev => ({
                                                        ...prev,
                                                        prices: { ...prev.prices, [curr]: e.target.value }
                                                    }))}
                                                />
                                            </div>
                                        ))}

                                        <div className="space-y-1 md:col-span-2">
                                            <div className="flex justify-between">
                                                <label className="text-[10px] font-bold text-zinc-500 uppercase">Location</label>
                                                <label className="text-[10px] font-bold text-zinc-500 uppercase w-24">Stock</label>
                                            </div>
                                            <div className="flex gap-2">
                                                <select
                                                    className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-indigo-500 outline-none min-w-0"
                                                    value={bulkActions.locationId}
                                                    onChange={(e) => setBulkActions(prev => ({ ...prev, locationId: e.target.value }))}
                                                >
                                                    {taxonomy?.stock_locations?.map(loc => (
                                                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                                                    ))}
                                                    {!taxonomy?.stock_locations?.length && <option value="">Default Location</option>}
                                                </select>
                                                <div className="w-24 flex-shrink-0">
                                                    <input
                                                        type="number"
                                                        placeholder="Stock"
                                                        className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-indigo-500 outline-none"
                                                        value={bulkActions.stock}
                                                        onChange={(e) => setBulkActions(prev => ({ ...prev, stock: e.target.value }))}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setBulkActions(prev => ({ ...prev, manageInventory: !prev.manageInventory }))}
                                            className={cn(
                                                "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                                                bulkActions.manageInventory ? "bg-indigo-500 border-indigo-500" : "border-zinc-700 bg-transparent"
                                            )}
                                        >
                                            {bulkActions.manageInventory && <Check className="w-3 h-3 text-white" />}
                                        </button>
                                        <span className="text-xs font-bold text-zinc-500 uppercase">Manage Inv.</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-white">Generated Variants ({variants.length})</h3>
                                    {settings.activeLanguages && settings.activeLanguages.length > 1 && (
                                        <div className="flex gap-1">
                                            {settings.activeLanguages.map(lang => (
                                                <button
                                                    key={lang}
                                                    onClick={() => setSelectedLang(lang)}
                                                    className={cn(
                                                        "px-2 py-1 rounded text-[10px] font-bold uppercase",
                                                        selectedLang === lang ? "bg-indigo-500 text-white" : "bg-white/10 text-zinc-400"
                                                    )}
                                                >
                                                    {lang}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                    {variants.map(variant => (
                                        <div key={variant.id} className="p-3 rounded-lg bg-zinc-900/50 border border-white/5 flex items-center justify-between">
                                            <div>
                                                <div className="text-sm font-medium text-white">{variant.title}</div>
                                                <div className="text-xs text-zinc-500 font-mono mt-0.5">{variant.sku}</div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <div className="text-sm text-white font-mono">
                                                        {variant.prices?.[0]?.amount} <span className="text-zinc-500 text-xs">{String(variant.prices?.[0]?.currency_code || '').toUpperCase()}</span>
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500">
                                                        Stock: {variant.inventory?.[0]?.stocked_quantity || 0}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-zinc-500 border border-dashed border-white/10 rounded-xl">
                                <Box className="w-10 h-10 mb-2 opacity-50" />
                                <p className="text-sm">Add options and click Generate Variants</p>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Save Preset Modal */}
            <AnimatePresence>
                {showSavePresetModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                            onClick={() => setShowSavePresetModal(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="relative bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
                        >
                            <h3 className="text-lg font-bold text-white mb-4">Save Preset</h3>
                            <input
                                type="text"
                                placeholder="Preset Name"
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none mb-4"
                                value={presetName}
                                onChange={(e) => setPresetName(e.target.value)}
                                autoFocus
                            />
                            <div className="flex gap-3">
                                <button
                                    onClick={handleSavePreset}
                                    className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl font-semibold"
                                >
                                    Save
                                </button>
                                <button
                                    onClick={() => setShowSavePresetModal(false)}
                                    className="px-4 bg-white/5 hover:bg-white/10 text-white py-2.5 rounded-xl font-semibold"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
