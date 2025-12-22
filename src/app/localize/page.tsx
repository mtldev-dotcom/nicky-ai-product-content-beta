'use client';

import React, { useState } from 'react';
import { useProductStore, Localization } from '@/store/useProductStore';
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
  ToggleRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
];

export default function LocalizePage() {
  const { 
    localization, 
    activeLanguages, 
    toggleLanguage, 
    updateLocalization 
  } = useProductStore();
  
  const [selectedLang, setSelectedLang] = useState('en');
  
  const currentLoc = localization[selectedLang] || {};
  const isActive = activeLanguages.includes(selectedLang);

  const handleUpdate = (field: keyof Localization, value: any) => {
    updateLocalization(selectedLang, { [field]: value });
  };

  return (
    <div className="space-y-8 pb-20 md:pb-0">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Globe className="text-indigo-400 w-8 h-8" />
            Multi-Language Localizer
          </h1>
          <p className="text-zinc-400">
            Manage translations and SEO metadata across global markets.
          </p>
        </div>
        
        <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/10 overflow-x-auto no-scrollbar">
          {LANGUAGES.map((lang) => (
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
              {activeLanguages.includes(lang.code) && (
                <Check className="w-3 h-3 text-indigo-200" />
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-8 space-y-6">
          <section className="glass rounded-2xl p-6 border border-white/10 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Type className="w-5 h-5 text-indigo-400" />
                Product Copy
              </h2>
              <button 
                onClick={() => toggleLanguage(selectedLang)}
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

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Title</label>
                <input 
                  type="text"
                  className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-lg"
                  value={currentLoc.title || ''}
                  onChange={(e) => handleUpdate('title', e.target.value)}
                  placeholder="Enter localized title..."
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
                <textarea 
                  rows={6}
                  className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all resize-none"
                  value={currentLoc.description || ''}
                  onChange={(e) => handleUpdate('description', e.target.value)}
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
        </div>
      </div>
    </div>
  );
}

