'use client';

import React, { useState, useRef } from 'react';
import { Sparkles, ArrowRight, Zap, Globe, Package, Loader2, FileJson, UploadCloud } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProductStore } from '@/store/useProductStore';
import { useRouter } from 'next/navigation';
import { mapExternalToProduct } from '@/lib/mapper';

export default function Dashboard() {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const { updateRoot, updateLocalization, bulkUpdate, resetStore } = useProductStore();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    setIsLoading(true);
    resetStore(); // Start fresh
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        updateRoot({
          title: data.title,
          description: data.description,
        });
        
        updateLocalization('en', {
          title: data.title,
          description: data.description,
          subtitle: data.subtitle,
          features: data.features,
          metadata_title: data.metadata_title,
          metadata_description: data.metadata_description,
          keywords: data.keywords,
        });
        
        router.push('/localize');
      } else {
        alert(data.error || 'Generation failed');
      }
    } catch (err) {
      alert('Network error during generation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const mappedData = mapExternalToProduct(json);
        resetStore();
        bulkUpdate(mappedData);
        router.push('/localize');
      } catch (err) {
        alert('Invalid JSON file');
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-12">
      {/* Header Section */}
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium uppercase tracking-wider">
          <Sparkles className="w-3 h-3" />
          Powered by AI
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-[1.1]">
          Architect your <br />
          <span className="text-zinc-500">product catalog.</span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl">
          Enter a product concept or import an existing JSON to begin the high-fidelity orchestration flow.
        </p>
      </header>

      {/* Primary Actions */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* AI Prompt Bar */}
        <div className="lg:col-span-8 relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-25 group-focus-within:opacity-50 transition duration-1000"></div>
          <div className="relative glass-dark rounded-2xl p-2 flex flex-col md:flex-row items-stretch md:items-center gap-2 border border-white/10 shadow-2xl h-full">
            <input 
              type="text"
              placeholder="e.g., A minimalist recycled leather wallet..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-lg px-4 py-4 text-white placeholder:text-zinc-600 outline-none"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              disabled={isLoading || isImporting}
            />
            <button 
              onClick={handleGenerate}
              disabled={isLoading || isImporting || !prompt.trim()}
              className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-8 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 group/btn"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              {isLoading ? 'Generating...' : 'Create'}
            </button>
          </div>
        </div>

        {/* Import Button */}
        <div className="lg:col-span-4">
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isImporting}
            className="w-full h-full glass rounded-2xl p-4 border border-white/10 hover:border-indigo-500/30 transition-all flex items-center justify-center gap-4 group active:scale-[0.98]"
          >
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef} 
              accept=".json"
              onChange={handleFileImport}
            />
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-all">
              {isImporting ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileJson className="w-6 h-6" />}
            </div>
            <div className="text-left">
              <p className="text-white font-semibold flex items-center gap-2">
                Import JSON
                <UploadCloud className="w-3 h-3 text-zinc-500" />
              </p>
              <p className="text-xs text-zinc-500">Shopify, Medusa, or custom</p>
            </div>
          </button>
        </div>
      </section>

      {/* Quick Stats / Features Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: Zap, title: 'Rapid Generation', desc: 'From idea to JSON in under 60 seconds.' },
          { icon: Globe, title: 'Multi-Lingual', desc: 'Automated localization for global markets.' },
          { icon: Package, title: 'Schema Ready', desc: 'Valid output for headless platforms.' },
        ].map((feature, i) => (
          <motion.div 
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + (i * 0.1) }}
            className="p-6 rounded-2xl glass border border-white/5 space-y-3"
          >
            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-indigo-400">
              <feature.icon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">{feature.desc}</p>
          </motion.div>
        ))}
      </section>
    </div>
  );
}
