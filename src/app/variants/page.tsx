'use client';

import React, { useState } from 'react';
import { useProductStore } from '@/store/useProductStore';
import { 
  Layers, 
  Plus, 
  Trash2, 
  Tag as TagIcon, 
  Settings2,
  X,
  AlertCircle,
  GripVertical
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function VariantsPage() {
  const { 
    options, 
    addOption, 
    updateOption, 
    removeOption, 
    addOptionValue, 
    removeOptionValue 
  } = useProductStore();
  const [newOptionName, setNewOptionName] = useState('');

  const handleAddOption = () => {
    if (!newOptionName.trim()) return;
    addOption(newOptionName.trim());
    setNewOptionName('');
  };

  return (
    <div className="space-y-10 pb-20">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Layers className="text-indigo-400 w-8 h-8" />
          Variant & Option Architect
        </h1>
        <p className="text-zinc-400">
          Define product attributes and values. These will map to variants in your final JSON schema.
        </p>
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
                className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                Add Option
              </button>
            </div>
          </section>

          <section className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertCircle className="w-5 h-5" />
              <h3 className="font-semibold text-sm uppercase tracking-wider">Note</h3>
            </div>
            <p className="text-xs text-amber-500/80 leading-relaxed">
              Define the options (e.g., "Size") and their possible values (e.g., "S, M, L"). 
              The final JSON will structure these for platform-specific variant generation.
            </p>
          </section>
        </div>

        {/* Options List */}
        <div className="lg:col-span-8 space-y-6">
          <AnimatePresence mode="popLayout">
            {options.map((option) => (
              <motion.div 
                key={option.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass rounded-2xl border border-white/10 overflow-hidden"
              >
                <div className="p-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GripVertical className="w-4 h-4 text-zinc-600" />
                    <span className="text-sm font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-indigo-400" />
                      {option.name}
                    </span>
                  </div>
                  <button 
                    onClick={() => removeOption(option.id)}
                    className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <AnimatePresence>
                      {option.values.map((val, vIdx) => (
                        <motion.span 
                          key={`${vIdx}-${val.value}`}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="pl-3 pr-1 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm flex items-center gap-2 group"
                        >
                          {val.translations?.en || val.value}
                          <button 
                            onClick={() => removeOptionValue(option.id, vIdx)}
                            className="p-1 hover:bg-indigo-500/20 rounded transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </motion.span>
                      ))}
                    </AnimatePresence>
                    
                    <input 
                      type="text"
                      placeholder="+ Add value..."
                      className="bg-transparent border-none text-sm text-white focus:ring-0 outline-none w-32"
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
                  
                  {option.values.length === 0 && (
                    <p className="text-xs text-zinc-500 italic">No values added yet. Press Enter to add.</p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {options.length === 0 && (
            <div className="py-20 border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-zinc-600 gap-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <TagIcon className="w-8 h-8" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-zinc-500">No attributes defined</p>
                <p className="text-sm">Add options like "Size" or "Color" to get started.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

