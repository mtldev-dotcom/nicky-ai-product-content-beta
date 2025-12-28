'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, ArrowRight, Zap, Globe, Package, Loader2, FileJson, UploadCloud, ImagePlus, X, FileDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProductStore } from '@/store/useProductStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useRouter } from 'next/navigation';
import { mapExternalToProduct } from '@/lib/mapper';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { translateAllActiveLanguages } from '@/lib/translations';

export default function Dashboard() {
  const [prompt, setPrompt] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const { updateRoot, updateLocalization, bulkUpdate, resetStore, setOrganizationId, saveToDb } = useProductStore();
  const settings = useSettingsStore();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    const getOrg = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: membership } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .single();
        
        if (membership) {
          setOrganizationId(membership.organization_id);
        }
      }
    };
    getOrg();
  }, [setOrganizationId, supabase]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic size check (approx 4MB)
    if (file.size > 4.5 * 1024 * 1024) {
      alert('Image is too large. Please select an image under 4MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!prompt.trim() && !selectedImage) return;
    
    setIsLoading(true);
    resetStore(); // Start fresh
    try {
      /**
       * IMPORTANT:
       * The API request schema (`GenerateRequestSchema`) treats `prompt` and `image`
       * as optional, BUT if the field is present it must be non-empty after `.trim()`.
       *
       * In production we were sometimes sending `prompt: ""` (or whitespace),
       * which causes a 400 validation error. So we only include fields when they
       * have a real value.
       */
      const body: { prompt?: string; image?: string } = {};
      const trimmedPrompt = prompt.trim();
      if (trimmedPrompt) body.prompt = trimmedPrompt;
      if (selectedImage) body.image = selectedImage;

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
        
        // Save to DB immediately after generation
        await saveToDb();
        
        // Load settings to get active languages before translating
        const orgId = useProductStore.getState().organizationId;
        if (orgId) {
          await settings.loadFromDb(orgId);
        }
        
        // Start background translations for all active languages
        translateAllActiveLanguages().catch(err => {
          console.error('Background translation error:', err);
        });
        
        router.push('/product-details');
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
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const mappedData = mapExternalToProduct(json);
        resetStore();
        bulkUpdate(mappedData);
        // Save to DB immediately after import
        await saveToDb();
        
        // Load settings to get active languages before translating
        const orgId = useProductStore.getState().organizationId;
        if (orgId) {
          await settings.loadFromDb(orgId);
        }
        
        // Start background translations for all active languages
        translateAllActiveLanguages().catch(err => {
          console.error('Background translation error:', err);
        });
        
        router.push('/product-details');
      } catch (err) {
        alert('Invalid JSON file');
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadDemo = () => {
    const demoProduct = {
      title: "Minimalist Recycled Leather Wallet",
      description: "Hand-crafted from 100% recycled premium leather, this slim wallet combines sustainability with timeless design. Featuring a precision-cut silhouette and reinforced stitching for ultimate longevity.",
      subtitle: "Sustainability meets sophisticated design.",
      sku: "WL-MIN-001",
      price: 45.00,
      images: [
        "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&q=80&w=800",
        "https://images.unsplash.com/photo-1550520920-27af500dae7a?auto=format&fit=crop&q=80&w=800"
      ],
      options: [
        {
          name: "Color",
          values: ["Obsidian Black", "Arctic White", "Saddle Brown"]
        },
        {
          name: "Size",
          values: ["Slim", "Executive"]
        }
      ],
      features: [
        "100% recycled leather",
        "Holds up to 8 cards",
        "RFID protection layer",
        "Hand-stitched durability"
      ],
      metadata_title: "Minimalist Wallet | Recycled Leather | The Uncut Brand",
      metadata_description: "Shop our handcrafted minimalist wallet made from recycled leather. Sustainable, slim, and built to last.",
      keywords: ["wallet", "leather", "minimalist", "sustainable", "recycled", "rfid protection"]
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(demoProduct, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "product-demo.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
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
            <div className="flex-1 flex items-center gap-2 px-2">
              <input 
                type="file" 
                className="hidden" 
                ref={imageInputRef} 
                accept="image/*"
                onChange={handleImageSelect}
              />
              <button 
                onClick={() => imageInputRef.current?.click()}
                disabled={isLoading || isImporting}
                className={cn(
                  "p-3 rounded-xl transition-all active:scale-90",
                  selectedImage 
                    ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" 
                    : "bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
                )}
                title="Add reference image"
              >
                <ImagePlus className="w-5 h-5" />
              </button>

              <AnimatePresence>
                {selectedImage && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="relative w-12 h-12 rounded-lg overflow-hidden border border-white/10 flex-shrink-0"
                  >
                    <img src={selectedImage} alt="Analysis Target" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => setSelectedImage(null)}
                      className="absolute top-0 right-0 p-0.5 bg-black/60 text-white rounded-bl-lg hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <input 
                type="text"
                placeholder={selectedImage ? "Describe what to focus on..." : "e.g., A minimalist recycled leather wallet..."}
                className="flex-1 bg-transparent border-none focus:ring-0 text-lg py-4 text-white placeholder:text-zinc-600 outline-none"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                disabled={isLoading || isImporting}
              />
            </div>
            <button 
              onClick={handleGenerate}
              disabled={isLoading || isImporting || (!prompt.trim() && !selectedImage)}
              className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-8 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 group/btn"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              {isLoading ? 'Analyzing...' : 'Create'}
            </button>
          </div>
        </div>

        {/* Import & Demo Actions */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <button 
            onClick={() => router.push('/create')}
            disabled={isLoading || isImporting}
            className="w-full flex-1 glass rounded-2xl p-4 border border-white/10 hover:border-indigo-500/30 transition-all flex items-center justify-center gap-4 group active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-all">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold flex items-center gap-2">
                Create Product
                <ArrowRight className="w-3 h-3 text-zinc-500" />
              </p>
              <p className="text-xs text-zinc-500">Choose your starting point</p>
            </div>
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isImporting}
            className="w-full flex-1 glass rounded-2xl p-4 border border-white/10 hover:border-indigo-500/30 transition-all flex items-center justify-center gap-4 group active:scale-[0.98]"
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

          <button 
            onClick={handleDownloadDemo}
            className="w-full glass rounded-2xl p-4 border border-white/10 hover:border-emerald-500/30 transition-all flex items-center justify-center gap-4 group active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-zinc-400 group-hover:text-emerald-400 group-hover:bg-emerald-500/10 transition-all">
              <FileDown className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold flex items-center gap-2">
                Download Demo
                <Sparkles className="w-3 h-3 text-zinc-500" />
              </p>
              <p className="text-xs text-zinc-500">Best outcome blueprint</p>
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
