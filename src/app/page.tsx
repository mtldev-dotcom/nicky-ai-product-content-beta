'use client';

import React, { useState } from 'react';
import { Sparkles, ArrowRight, Zap, Globe, Package, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useProductStore } from '@/store/useProductStore';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { updateRoot, updateLocalization } = useProductStore();
  const router = useRouter();

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    setIsLoading(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        // Update both root and EN localization
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
        
        // Redirect to localizer to show results
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
          Enter a product concept below. Our AI will generate human-centric titles, SEO descriptions, and localizations in seconds.
        </p>
      </header>

      {/* Primary AI Prompt Bar */}
      <section className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-25 group-focus-within:opacity-50 transition duration-1000"></div>
        <div className="relative glass-dark rounded-2xl p-2 flex flex-col md:flex-row items-stretch md:items-center gap-2 border border-white/10 shadow-2xl">
          <input 
            type="text"
            placeholder="e.g., A minimalist recycled leather wallet with RFID protection..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-lg px-4 py-4 text-white placeholder:text-zinc-600 outline-none"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            disabled={isLoading}
          />
          <button 
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim()}
            className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-8 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 group/btn"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                Generate Content
                <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
              </>
            )}
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
