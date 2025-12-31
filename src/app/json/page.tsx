'use client';

import React, { useState, useMemo } from 'react';
import { useProductStore, type Localization } from '@/store/useProductStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { ALL_LANGUAGES } from '@/lib/languages';
import { buildMedusaAdminProductPayload } from '@/lib/medusa/build-admin-product-payload';
import { 
  Database, 
  Copy, 
  Download, 
  Check, 
  AlertTriangle,
  RefreshCw,
  Box,
  X,
  Globe,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function JsonPage() {
  const product = useProductStore();
  const settings = useSettingsStore();
  const [copied, setCopied] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ productId: string | null } | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [isJsonExpanded, setIsJsonExpanded] = useState(false);

  const medusaPayload = useMemo(() => {
    /**
     * Use the shared payload builder so all Medusa-facing features stay consistent.
     *
     * Preconditions:
     * - `product` is our in-memory editor state.
     *
     * Postconditions:
     * - Returns an object safe to send to Medusa Admin APIs.
     */
    return buildMedusaAdminProductPayload({
      title: product.title,
      subtitle: product.subtitle,
      description: product.description,
      handle: product.handle,
      status: product.status,
      thumbnail: product.thumbnail,
      price: product.price,
      sku: product.sku,
      collection_id: product.collection_id || null,
      type_id: product.type_id || null,
      tags: product.tags,
      categories: product.categories,
      sales_channels: product.sales_channels,
      shipping_profile_id: product.shipping_profile_id || null,
      shipping_weight: product.shipping_weight || null,
      shipping_dimensions: product.shipping_dimensions || null,
      images: product.images,
      vault: product.vault,
      activeLanguages: product.activeLanguages,
      localization: product.localization as unknown as Record<string, Localization>,
      options: product.options,
      variants: product.variants,
    });
  }, [product]);

  const fullJson = useMemo(() => JSON.stringify(medusaPayload, null, 4), [medusaPayload]);

  const handleCopy = () => {
    navigator.clipboard.writeText(fullJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([fullJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-${product.handle || 'blueprint'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePushToMedusa = async () => {
    setIsPushing(true);
    setPushError(null);
    setPushResult(null);

    try {
      const payload = JSON.parse(fullJson) as unknown;
      const res = await fetch('/api/medusa/push-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });

      const data = (await res.json()) as { productId?: string | null; error?: string; details?: unknown };

      if (!res.ok) {
        setPushError(data.error || 'Failed to push product to Medusa');
        return;
      }

      setPushResult({ productId: data.productId ?? null });
    } catch (e) {
      console.error('Push to Medusa failed:', e);
      setPushError('Failed to push product to Medusa (invalid JSON or network error)');
    } finally {
      setIsPushing(false);
    }
  };

  const checklist = useMemo(() => {
    const items: Array<{ 
      category: string; 
      items: Array<{ 
        label: string; 
        status: 'complete' | 'missing' | 'partial';
        details?: string;
      }> 
    }> = [];

    // Check if variants have prices
    const hasVariantPrices = () => {
      if (product.variants && product.variants.length > 0) {
        return product.variants.some(v => 
          v.prices && v.prices.length > 0 && v.prices.some(p => p.amount > 0)
        );
      }
      // Fallback: check root price
      return product.price > 0;
    };

    // Required Fields
    const requiredFields = {
      'Product Title': !!product.title,
      'Handle': !!(product.handle || product.title),
      'Description': !!product.description,
      'Price': hasVariantPrices(),
      'Thumbnail': !!product.thumbnail,
      'Images': product.images.length > 0,
    };

    items.push({
      category: 'Required Fields',
      items: Object.entries(requiredFields).map(([field, complete]) => ({
        label: field,
        status: complete ? 'complete' : 'missing',
      }))
    });

    // Optional but Recommended Fields
    const recommendedFields = {
      'Subtitle': !!(product.subtitle || product.localization.en?.subtitle),
      'Features': (product.localization.en?.features || []).length > 0,
      'SEO Title': !!(product.localization.en?.metadata_title),
      'SEO Description': !!(product.localization.en?.metadata_description),
      'Keywords': (product.localization.en?.keywords || []).length > 0,
      'Collection': !!product.collection_id,
      'Product Type': !!product.type_id,
      'Shipping Profile': !!product.shipping_profile_id,
      'Shipping Weight': product.shipping_weight > 0,
      'Shipping Dimensions': !!(product.shipping_dimensions?.length || product.shipping_dimensions?.width || product.shipping_dimensions?.height),
      'Tags': product.tags.length > 0,
      'Categories': product.categories.length > 0,
      'Sales Channels': product.sales_channels.length > 0,
    };

    items.push({
      category: 'Recommended Fields',
      items: Object.entries(recommendedFields).map(([field, complete]) => ({
        label: field,
        status: complete ? 'complete' : 'missing',
      }))
    });

    // Translation Status
    const activeLangs = settings.activeLanguages || product.activeLanguages || ['en'];
    const translationItems: Array<{ 
      label: string; 
      status: 'complete' | 'missing' | 'partial';
      details?: string;
    }> = [];

    activeLangs.forEach(langCode => {
      if (langCode === 'en') return; // Skip English
      
      const langInfo = ALL_LANGUAGES.find(l => l.code === langCode);
      const loc = product.localization[langCode];
      
      const hasTitle = !!loc?.title;
      const hasDescription = !!loc?.description;
      const hasSubtitle = !!loc?.subtitle;
      const hasFeatures = (loc?.features || []).length > 0;
      const hasMetadata = !!(loc?.metadata_title && loc?.metadata_description);
      
      const completedFields = [hasTitle, hasDescription, hasSubtitle, hasFeatures, hasMetadata].filter(Boolean).length;
      const totalFields = 5;
      
      let status: 'complete' | 'missing' | 'partial' = 'missing';
      if (completedFields === totalFields) status = 'complete';
      else if (completedFields > 0) status = 'partial';
      
      translationItems.push({
        label: `${langInfo?.flag || ''} ${langInfo?.name || langCode}`,
        status,
        details: `${completedFields}/${totalFields} fields`
      });
    });

    if (translationItems.length > 0) {
      items.push({
        category: 'Translations',
        items: translationItems
      });
    }

    // Options & Values Translation Status
    if (product.options.length > 0) {
      const optionsTranslationItems: Array<{ 
        label: string; 
        status: 'complete' | 'missing' | 'partial';
        details?: string;
      }> = [];

      activeLangs.forEach(langCode => {
        if (langCode === 'en') return;
        
        const langInfo = ALL_LANGUAGES.find(l => l.code === langCode);
        let allOptionsTranslated = true;
        let allValuesTranslated = true;
        let someOptionsTranslated = false;
        let someValuesTranslated = false;

        product.options.forEach(opt => {
          const hasOptionTranslation = !!opt.translations[langCode];
          if (hasOptionTranslation) someOptionsTranslated = true;
          else allOptionsTranslated = false;

          opt.values.forEach(val => {
            const hasValueTranslation = !!val.translations[langCode];
            if (hasValueTranslation) someValuesTranslated = true;
            else allValuesTranslated = false;
          });
        });

        let status: 'complete' | 'missing' | 'partial' = 'missing';
        if (allOptionsTranslated && allValuesTranslated) status = 'complete';
        else if (someOptionsTranslated || someValuesTranslated) status = 'partial';

        optionsTranslationItems.push({
          label: `${langInfo?.flag || ''} ${langInfo?.name || langCode} Options`,
          status,
          details: status === 'complete' 
            ? 'All translated' 
            : status === 'partial' 
            ? 'Partially translated' 
            : 'Not translated'
        });
      });

      if (optionsTranslationItems.length > 0) {
        items.push({
          category: 'Options & Values Translations',
          items: optionsTranslationItems
        });
      }
    }

    return items;
  }, [product, settings.activeLanguages]);

  const validationIssues = useMemo(() => {
    const issues = [];
    if (!product.title) issues.push('Missing Product Title');
    if (!product.handle && !product.title) issues.push('Missing Handle');
    if (product.images.length === 0) {
      issues.push('No images added');
    } else {
      const unsyncedCount = product.images.filter(url => {
        const isSynced = url.includes(process.env.NEXT_PUBLIC_S3_FILE_URL || 'r2.dev') || url.includes('cloudflarestorage.com');
        const isIgnored = product.ignoredUrls.includes(url);
        return !isSynced && !isIgnored;
      }).length;
      
      if (unsyncedCount > 0) {
        issues.push(`${unsyncedCount} images pending cloud sync or ignore`);
      }
    }
    return issues;
  }, [product]);

  return (
    <div className="space-y-6 pb-32 md:pb-8">
      <header className="space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Database className="text-indigo-400 w-6 h-6 md:w-8 md:h-8" />
            Product Blueprint (JSON)
          </h1>
          <p className="text-sm md:text-base text-zinc-400">
            Export exactly aligned to THE UNCUT BRAND schema.
          </p>
        </div>
        
        {/* Desktop Actions */}
        <div className="hidden md:flex gap-3">
          <button onClick={handleCopy} className="glass px-6 py-3 rounded-xl font-semibold text-white flex items-center gap-2 hover:bg-white/5 transition-all active:scale-95">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
          <button onClick={handleDownload} className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all active:scale-95">
            <Download className="w-4 h-4" />
            Download
          </button>
          <button
            onClick={handlePushToMedusa}
            disabled={isPushing}
            className={cn(
              "bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all active:scale-95",
            )}
          >
            <Box className="w-4 h-4" />
            {isPushing ? 'Pushing...' : 'Push to Medusa'}
          </button>
        </div>
      </header>

      {(pushError || pushResult) && (
        <section className="glass rounded-2xl p-4 border border-white/10">
          {pushError ? (
            <div className="text-sm text-red-300">
              <span className="font-semibold">Push failed:</span> {pushError}
            </div>
          ) : (
            <div className="text-sm text-emerald-300">
              <span className="font-semibold">Push succeeded.</span>{' '}
              {pushResult?.productId ? (
                <span>Medusa product id: <span className="font-mono">{pushResult.productId}</span></span>
              ) : (
                <span>Medusa returned success, but no product id was found in the response.</span>
              )}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        <div className="lg:col-span-4 space-y-6 order-2 lg:order-1">
          <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-indigo-400" />
              Blueprint Health
            </h2>
            <div className="space-y-3">
              {validationIssues.length > 0 ? (
                validationIssues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {issue}
                  </div>
                ))
              ) : (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                  <Check className="w-4 h-4 shrink-0" />
                  Schema is 1:1 Valid.
                </div>
              )}
            </div>
            
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] leading-relaxed">
              <p className="font-bold uppercase mb-1 flex items-center gap-1">
                <Box className="w-3 h-3" /> Medusa v2 Note
              </p>
              Inventory levels must be managed via the Inventory API after product creation. The &apos;inventory&apos; field is omitted from this export to prevent API errors.
            </div>
          </section>

          <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-indigo-400" />
              Completion Checklist
            </h2>
            <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar">
              {checklist.map((category, catIdx) => (
                <div key={catIdx} className="space-y-2">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    {category.category}
                  </h3>
                  <div className="space-y-1.5">
                    {category.items.map((item, itemIdx) => (
                      <div
                        key={itemIdx}
                        className={cn(
                          "flex items-center justify-between gap-2 p-2 rounded-lg text-xs transition-colors",
                          item.status === 'complete' && "bg-emerald-500/10 border border-emerald-500/20",
                          item.status === 'partial' && "bg-yellow-500/10 border border-yellow-500/20",
                          item.status === 'missing' && "bg-red-500/10 border border-red-500/20"
                        )}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {item.status === 'complete' ? (
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                          ) : item.status === 'partial' ? (
                            <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0" />
                          ) : (
                            <X className="w-3 h-3 text-red-400 shrink-0" />
                          )}
                          <span className={cn(
                            "truncate",
                            item.status === 'complete' && "text-emerald-300",
                            item.status === 'partial' && "text-yellow-300",
                            item.status === 'missing' && "text-red-300"
                          )}>
                            {item.label}
                          </span>
                        </div>
                        {item.details && (
                          <span className={cn(
                            "text-[10px] shrink-0",
                            item.status === 'complete' && "text-emerald-400/70",
                            item.status === 'partial' && "text-yellow-400/70",
                            item.status === 'missing' && "text-red-400/70"
                          )}>
                            {item.details}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
            <h2 className="text-lg font-semibold text-white">Medusa Summary</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-xl bg-white/5 space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase">Languages</p>
                <p className="text-xl font-bold text-white">{product.activeLanguages.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase">Variants</p>
                <p className="text-xl font-bold text-white">
                  {(medusaPayload as { variants?: unknown[] })?.variants?.length || 0}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase">Vault Rank</p>
                <p className="text-xl font-bold text-white">{product.vault.length}</p>
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-8 space-y-4 order-1 lg:order-2">
          {/* Mobile: Collapsible JSON */}
          <div className="md:hidden">
            <button
              onClick={() => setIsJsonExpanded(!isJsonExpanded)}
              className="w-full glass rounded-2xl p-4 border border-white/10 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-indigo-400" />
                <span className="text-sm font-semibold text-white">
                  {isJsonExpanded ? 'Hide JSON' : 'Show JSON'}
                </span>
                <span className="text-xs text-zinc-500">
                  ({(fullJson.length / 1024).toFixed(1)} KB)
                </span>
              </div>
              {isJsonExpanded ? (
                <ChevronUp className="w-5 h-5 text-zinc-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-zinc-400" />
              )}
            </button>
            
            <AnimatePresence>
              {isJsonExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mt-4"
                >
                  <div className="relative">
                    <pre className="w-full max-h-[400px] overflow-auto glass-dark border border-white/10 rounded-2xl p-4 font-mono text-[11px] leading-relaxed text-indigo-200/90 custom-scrollbar">
                      {fullJson}
                    </pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Desktop: Always visible JSON */}
          <div className="hidden md:block relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-purple-600/20 rounded-2xl blur opacity-50 group-hover:opacity-100 transition duration-1000"></div>
            <pre className="relative w-full h-[700px] overflow-auto glass-dark border border-white/10 rounded-2xl p-6 font-mono text-[13px] leading-relaxed text-indigo-200/90 custom-scrollbar">
              {fullJson}
            </pre>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden pb-safe z-40">
        <div className="glass-dark border-t border-white/10 p-4 space-y-2">
          <div className="flex gap-2">
            <button 
              onClick={handleCopy} 
              className="flex-1 glass px-4 py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 hover:bg-white/5 transition-all active:scale-95"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button 
              onClick={handleDownload} 
              className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
          <button
            onClick={handlePushToMedusa}
            disabled={isPushing}
            className={cn(
              "w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95",
            )}
          >
            <Box className="w-4 h-4" />
            {isPushing ? 'Pushing...' : 'Push to Medusa'}
          </button>
        </div>
      </div>
    </div>
  );
}
