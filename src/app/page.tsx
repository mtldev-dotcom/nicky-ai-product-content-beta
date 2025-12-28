'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, ArrowRight, Zap, Globe, Package, Loader2, FileJson, UploadCloud, ImagePlus, X, FileDown, ExternalLink, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProductStore } from '@/store/useProductStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useRouter } from 'next/navigation';
import { mapExternalToProduct } from '@/lib/mapper';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { translateAllActiveLanguages } from '@/lib/translations';
import { getMedusaProducts } from './product-details/actions';

type SavedProductRow = {
  id: string;
  organization_id: string;
  title: string;
  handle: string;
  status: string;
  sku: string | null;
  price: number | null;
  created_at: string;
  data: unknown | null;
  is_template?: boolean | null;
};

type MedusaProductRow = {
  id: string;
  title: string;
  handle: string;
  status: string;
  created_at: string;
  thumbnail?: string | null;
  variants?: unknown[];
};

function getThumbnailFromProductData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const maybe = (data as Record<string, unknown>).thumbnail;
  return typeof maybe === 'string' && maybe.length > 0 ? maybe : null;
}

export default function Dashboard() {
  const [prompt, setPrompt] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [products, setProducts] = useState<SavedProductRow[]>([]);
  const [storeProducts, setStoreProducts] = useState<MedusaProductRow[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingStoreProducts, setIsLoadingStoreProducts] = useState(false);
  const [isStoreConfigured, setIsStoreConfigured] = useState(false);
  const {
    updateRoot,
    updateLocalization,
    bulkUpdate,
    resetStore,
    setOrganizationId,
    saveToDb,
    loadFromSavedProduct,
    applyMedusaDefaultsForNewProduct,
  } = useProductStore();
  const settings = useSettingsStore();
  const loadSettingsFromDb = useSettingsStore((s) => s.loadFromDb);
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
          const orgId = membership.organization_id;
          setOrganizationId(orgId);

          // Ensure org settings (including Medusa defaults) are loaded for auto-fill behaviors.
          await loadSettingsFromDb(orgId);
          
          // Fetch products for this org
          const { data: productsData, error } = await supabase
            .from('products')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });
          
          if (!error && productsData) {
            setProducts(productsData as unknown as SavedProductRow[]);
          }
          setIsLoadingProducts(false);

          // Check if store is configured and fetch products
          const { data: settingsData } = await supabase
            .from('organization_settings')
            .select('store_platform, medusa_url, medusa_api_key')
            .eq('organization_id', orgId)
            .single();
          
          if (settingsData?.store_platform === 'medusa' && settingsData.medusa_url && settingsData.medusa_api_key) {
            setIsStoreConfigured(true);
            setIsLoadingStoreProducts(true);
            const storeRes = await getMedusaProducts(orgId);
            if (storeRes.success) {
              setStoreProducts(storeRes.data as unknown as MedusaProductRow[]);
            }
            setIsLoadingStoreProducts(false);
          }
        }
      }
    };
    getOrg();
  }, [setOrganizationId, supabase, loadSettingsFromDb]);

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
    applyMedusaDefaultsForNewProduct({
      defaultSalesChannelId: settings.defaultSalesChannelId,
      defaultShippingProfileId: settings.defaultShippingProfileId,
      defaultCollectionId: settings.defaultCollectionId,
      defaultCategoryIds: settings.defaultCategoryIds,
    });
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
      console.error('Generation failed:', err);
      alert('Network error during generation');
    } finally {
      setIsLoading(false);
    }
  };

  const openSavedProduct = async (productId: string) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Product not found');

      loadFromSavedProduct(data);
      router.push('/product-details');
    } catch (err) {
      console.error('Failed to open product:', err);
      alert('Failed to open product. It may have been deleted or the data is corrupted.');
    }
  };

  const toggleTemplate = async (productId: string, nextValue: boolean) => {
    try {
      const res = await fetch('/api/products/set-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, isTemplate: nextValue }),
      });

      const data = (await res.json()) as { error?: string; is_template?: boolean };
      if (!res.ok) throw new Error(data.error || 'Failed to update template flag');

      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, is_template: nextValue } : p))
      );
    } catch (err) {
      console.error('Failed to toggle template:', err);
      alert('Failed to update template flag');
    }
  };

  const startFromTemplate = async (productId: string) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Template not found');

      loadFromSavedProduct(data);

      // Start a NEW product derived from the template (avoid overwriting the template row).
      // Note: we also adjust handle to reduce collision risk.
      const suffix = crypto.randomUUID().slice(0, 8);
      bulkUpdate({
        id: undefined,
        status: 'draft',
        handle: `${String(data.handle || 'template').replace(/[^\w-]/g, '')}-copy-${suffix}`,
      });

      router.push('/product-details');
    } catch (err) {
      console.error('Failed to use template:', err);
      alert('Failed to start from template');
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

        // Apply org defaults only when the import did not provide taxonomy values.
        // This keeps JSON imports deterministic while still auto-filling missing store fields.
        applyMedusaDefaultsForNewProduct({
          defaultSalesChannelId: settings.defaultSalesChannelId,
          defaultShippingProfileId: settings.defaultShippingProfileId,
          defaultCollectionId: settings.defaultCollectionId,
          defaultCategoryIds: settings.defaultCategoryIds,
        });

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
        console.error('Invalid JSON import:', err);
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

      {/* Products Table */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-400" />
            Recent Products
          </h2>
          <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            {products.length} Products Total
          </div>
        </div>

        {/* Templates */}
        {products.some((p) => p.is_template) && (
          <div className="glass rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-300">
                <Star className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-semibold">Templates</span>
              </div>
              <span className="text-[10px] text-zinc-500">
                {products.filter((p) => p.is_template).length} template(s)
              </span>
            </div>
            <div className="divide-y divide-white/5">
              {products
                .filter((p) => p.is_template)
                .slice(0, 5)
                .map((p) => (
                  <div key={p.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{p.title}</p>
                      <p className="text-[10px] text-zinc-500 font-mono truncate">{p.handle}</p>
                    </div>
                    <button
                      onClick={() => startFromTemplate(p.id)}
                      className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-xs font-semibold text-white transition-colors"
                    >
                      Use Template
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/5">
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Product</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">SKU</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Price</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Created</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoadingProducts ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                        <span className="text-sm">Loading catalog...</span>
                      </div>
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-2">
                          <Package className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-medium text-zinc-400">No products found</p>
                        <p className="text-xs">Create your first product using the AI bar above.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr 
                      key={product.id} 
                      className="group hover:bg-white/[0.02] transition-colors cursor-pointer"
                      onClick={() => {
                        openSavedProduct(product.id);
                      }}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/5 flex-shrink-0 overflow-hidden">
                            {getThumbnailFromProductData(product.data) ? (
                              <img src={getThumbnailFromProductData(product.data) ?? ''} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-4 h-4 text-zinc-700" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{product.title}</p>
                            <p className="text-[10px] text-zinc-500 font-mono truncate">{product.handle}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono text-zinc-400">{product.sku || '-'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-medium text-white">${product.price || '0.00'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                          product.status === 'published' 
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                            : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                        )}>
                          <div className={cn("w-1 h-1 rounded-full", product.status === 'published' ? "bg-emerald-400" : "bg-zinc-400")} />
                          {product.status}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[10px] text-zinc-500 uppercase">
                          {new Date(product.created_at).toLocaleDateString(undefined, { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleTemplate(product.id, !product.is_template);
                            }}
                            className={cn(
                              "p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all",
                              product.is_template ? "text-yellow-300 hover:text-yellow-200" : "text-zinc-400 hover:text-white"
                            )}
                            aria-label={product.is_template ? "Unmark as template" : "Mark as template"}
                            title={product.is_template ? "Unmark as template" : "Mark as template"}
                          >
                            <Star className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openSavedProduct(product.id);
                            }}
                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
                            aria-label="Open product"
                            title="Open product"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Store Products Table (MedusaJS) */}
      {isStoreConfigured && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Package className="w-6 h-6 text-emerald-400" />
              MedusaJS Catalog
            </h2>
            <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
              {storeProducts.length} External Products
            </div>
          </div>

          <div className="glass rounded-2xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/5">
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Product</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Variants</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Created</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isLoadingStoreProducts ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                          <span className="text-sm">Fetching from Medusa...</span>
                        </div>
                      </td>
                    </tr>
                  ) : storeProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-2">
                            <Package className="w-6 h-6" />
                          </div>
                          <p className="text-sm font-medium text-zinc-400">No products found in MedusaJS</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    storeProducts.map((product) => (
                      <tr 
                        key={product.id} 
                        className="group hover:bg-emerald-500/[0.02] transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/5 flex-shrink-0 overflow-hidden">
                              {product.thumbnail ? (
                                <img src={product.thumbnail} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package className="w-4 h-4 text-zinc-700" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{product.title}</p>
                              <p className="text-[10px] text-zinc-500 font-mono truncate">{product.handle}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-mono text-zinc-400">
                            {product.variants?.length || 0} variants
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                            product.status === 'published' 
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                              : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                          )}>
                            <div className={cn("w-1 h-1 rounded-full", product.status === 'published' ? "bg-emerald-400" : "bg-zinc-400")} />
                            {product.status}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] text-zinc-500 uppercase">
                            {new Date(product.created_at).toLocaleDateString(undefined, { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all">
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
