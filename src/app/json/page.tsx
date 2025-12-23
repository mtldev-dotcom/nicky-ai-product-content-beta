'use client';

import React, { useState, useMemo } from 'react';
import { useProductStore } from '@/store/useProductStore';
import { 
  Database, 
  Copy, 
  Download, 
  Check, 
  FileJson,
  AlertTriangle,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function JsonPage() {
  const product = useProductStore();
  const [copied, setCopied] = useState(false);

  const fullJson = useMemo(() => {
    const activeLangs = product.activeLanguages;

    // Helper to build i18n objects
    const buildI18n = (field: string) => {
      const obj: Record<string, any> = {};
      activeLangs.forEach(lang => {
        const val = (product.localization[lang] as any)[field];
        if (val) obj[lang] = val;
      });
      return obj;
    };

    // Construct exactly as per product-output-example.json
    const output = {
      title: product.title,
      subtitle: product.subtitle,
      status: product.status,
      external_id: null,
      description: product.description,
      handle: product.handle || product.title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, ''),
      is_giftcard: false,
      discountable: true,
      thumbnail: product.thumbnail,
      collection_id: product.collection_id || null,
      type_id: product.type_id || null,
      weight: product.shipping_weight || null,
      length: product.shipping_dimensions?.length || null,
      height: product.shipping_dimensions?.height || null,
      width: product.shipping_dimensions?.width || null,
      hs_code: null,
      origin_country: null,
      mid_code: null,
      material: null,
      metadata: {
        brand: "THE UNCUT BRAND",
        vault: {
          video: null,
          images: product.vault
        },
        title_i18n: buildI18n('title'),
        subtitle_i18n: buildI18n('subtitle'),
        description_i18n: buildI18n('description'),
        features_i18n: buildI18n('features'),
        keywords_i18n: buildI18n('keywords'),
        seo_title_i18n: buildI18n('metadata_title'),
        seo_description_i18n: buildI18n('metadata_description'),
        options_i18n: product.options.map(opt => ({
          title_i18n: opt.translations,
          values: opt.values.map(v => ({
            value: v.value,
            value_i18n: v.translations
          }))
        }))
      },
      options: product.options.map(opt => ({
        title: opt.name,
        values: opt.values.map(v => v.value)
      })),
      tags: product.tags.map(t => ({ value: t })),
      images: product.images.map((url, index) => ({
        url: url,
        metadata: null,
        rank: index
      })),
      categories: product.categories.map(c => ({ id: c })),
      sales_channels: product.sales_channels.map(sc => ({ id: sc })),
      shipping_profile_id: product.shipping_profile_id || null
    };

    return JSON.stringify(output, null, 4);
  }, [product]);

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

  const validationIssues = useMemo(() => {
    const issues = [];
    if (!product.title) issues.push('Missing Product Title');
    if (!product.handle && !product.title) issues.push('Missing Handle');
    if (product.images.length === 0) {
      issues.push('No images added');
    } else {
      const unsyncedCount = product.images.filter(url => {
        const isSynced = url.includes(process.env.NEXT_PUBLIC_S3_FILE_URL || 'r2.dev') || url.includes('cloudflarestorage.com');
        const isIgnored = (product as any).ignoredUrls?.includes(url);
        return !isSynced && !isIgnored;
      }).length;
      
      if (unsyncedCount > 0) {
        issues.push(`${unsyncedCount} images pending cloud sync or ignore`);
      }
    }
    return issues;
  }, [product]);

  return (
    <div className="space-y-8 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Database className="text-indigo-400 w-8 h-8" />
            Product Blueprint (JSON)
          </h1>
          <p className="text-zinc-400">
            Export exactly aligned to THE UNCUT BRAND schema.
          </p>
        </div>
        
        <div className="flex gap-3">
          <button onClick={handleCopy} className="glass px-6 py-3 rounded-xl font-semibold text-white flex items-center gap-2 hover:bg-white/5 transition-all active:scale-95">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
          <button onClick={handleDownload} className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all active:scale-95">
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
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
          </section>

          <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
            <h2 className="text-lg font-semibold text-white">Medusa Summary</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-xl bg-white/5 space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase">Languages</p>
                <p className="text-xl font-bold text-white">{product.activeLanguages.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase">Vault Rank</p>
                <p className="text-xl font-bold text-white">{product.vault.length}</p>
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-8 space-y-4 order-1 lg:order-2">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-purple-600/20 rounded-2xl blur opacity-50 group-hover:opacity-100 transition duration-1000"></div>
            <pre className="relative w-full h-[700px] overflow-auto glass-dark border border-white/10 rounded-2xl p-6 font-mono text-[13px] leading-relaxed text-indigo-200/90 custom-scrollbar">
              {fullJson}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
