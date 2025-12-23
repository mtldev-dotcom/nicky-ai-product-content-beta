'use client';

import React, { useState, useEffect } from 'react';
import { useProductStore, ProductVariant } from '@/store/useProductStore';
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
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { getMedusaTaxonomy } from '../product-details/actions';

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
  const [taxonomy, setTaxonomy] = useState<{
    currencies: any[];
    stock_locations: any[];
  } | null>(null);
  const [expandedVariant, setExpandedVariant] = useState<string | null>(null);

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

  const handleQuickAddDefault = () => {
    bulkUpdate({
      options: [...options, {
        id: crypto.randomUUID(),
        name: 'Default',
        translations: { en: 'Default' },
        values: [{
          value: 'Default',
          translations: { en: 'Default' }
        }]
      }]
    });
  };

  const generateVariants = () => {
    setIsGenerating(true);

    // Check if we have any valid options with values
    const validOptions = options.filter(opt => opt.values.length > 0);

    if (validOptions.length === 0) {
      const variantTitle = `${productTitle || 'Draft Product'} - Default Variant`;
      const variantSku = `${handle || 'product'}-default`;

      const existing = variants.find(v => v.title === variantTitle || v.sku === variantSku);

      const defaultVariant: ProductVariant = {
        id: existing?.id || crypto.randomUUID(),
        title: variantTitle,
        sku: existing?.sku || variantSku,
        manage_inventory: existing?.manage_inventory ?? true,
        allow_backorder: existing?.allow_backorder ?? false,
        prices: existing?.prices || (taxonomy?.currencies || []).map(c => ({
          amount: price,
          currency_code: c.code
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
    const cartesian = (sets: any[][]) => {
      return sets.reduce((acc, set) => {
        return acc.flatMap((x: any) => set.map((y: any) => [...x, y]));
      }, [[]]);
    };

    const optionSets = validOptions.map(opt =>
      opt.values.map(val => ({
        optionName: opt.name,
        value: val.value
      }))
    );

    const combinations = cartesian(optionSets);

    const newVariants: ProductVariant[] = combinations.map((combo: any[]) => {
      const variantValuesTitle = combo.map(c => c.value).join(' / ');
      const variantTitle = `${productTitle || 'Draft Product'} - ${variantValuesTitle}`;

      const variantOptions = combo.reduce((acc, curr) => {
        acc[curr.optionName] = curr.value;
        return acc;
      }, {} as Record<string, string>);

      const slugifiedOptions = variantValuesTitle.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '');
      const variantSku = `${handle || 'product'}-${slugifiedOptions}`;

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
          currency_code: c.code
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

        <button
          onClick={generateVariants}
          disabled={isGenerating || options.length === 0}
          className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
        >
          {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Box className="w-4 h-4" />}
          Generate Variants
        </button>
      </header>

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

              <button
                onClick={handleQuickAddDefault}
                className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 border border-indigo-500/20 group"
              >
                <Zap className="w-4 h-4 group-hover:scale-110 transition-transform" />
                Quick Add Default
              </button>
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
                        {option.name}
                      </span>
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
                      {option.values.map((val, vIdx) => (
                        <span
                          key={`${vIdx}-${val.value}`}
                          className="pl-2 pr-1 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] flex items-center gap-1.5"
                        >
                          {val.translations?.en || val.value}
                          <button
                            onClick={() => removeOptionValue(option.id, vIdx)}
                            className="p-0.5 hover:bg-indigo-500/20 rounded transition-colors"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
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
                            {variant.prices[0]?.amount} {variant.prices[0]?.currency_code?.toUpperCase()}
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
                                    {taxonomy?.currencies
                                      .filter(c => !variant.prices.some(p => p.currency_code === c.code))
                                      .map(c => (
                                        <option key={c.code} value={c.code}>{c.code.toUpperCase()}</option>
                                      ))
                                    }
                                  </select>
                                </div>

                                <div className="space-y-2">
                                  {variant.prices.map((p, pIdx) => (
                                    <div key={p.currency_code} className="flex gap-2 group/price">
                                      <div className="flex-1 flex gap-2">
                                        <div className="bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-[10px] text-zinc-400 font-bold uppercase min-w-[60px] flex items-center justify-center">
                                          {p.currency_code}
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
                    <p className="text-sm">Click "Generate Variants" to create combinations from your attributes.</p>
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

