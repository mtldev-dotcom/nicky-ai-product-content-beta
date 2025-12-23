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
    // Construct the 1:1 schema
    return JSON.stringify({
      title: product.title,
      description: product.description,
      thumbnail: product.thumbnail,
      sku: product.sku,
      price: product.price,
      options: product.options.map(o => ({
        title: o.name,
        values: o.values
      })),
      images: product.images,
      metadata: {
        localization: product.localization,
        active_languages: product.activeLanguages,
        vault: product.vault
      }
    }, null, 2);
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
    a.download = `product-${product.sku || 'architect'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const validationIssues = useMemo(() => {
    const issues = [];
    if (!product.title) issues.push('Missing Product Title');
    if (!product.sku) issues.push('Missing SKU/Handle');
    if (product.images.length === 0) issues.push('No images added');
    if (product.options.length > 0 && product.options.some(o => o.values.length === 0)) {
      issues.push('Some options have no values defined');
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
            Review and export your production-ready product schema.
          </p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={handleCopy}
            className="flex-1 md:flex-none glass px-6 py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 hover:bg-white/5 transition-all active:scale-95"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
          <button 
            onClick={handleDownload}
            className="flex-1 md:flex-none bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Validation & Stats */}
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
                  Product is production-ready.
                </div>
              )}
            </div>
          </section>

          <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
            <h2 className="text-lg font-semibold text-white">Quick Stats</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-xl bg-white/5 space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase">Languages</p>
                <p className="text-xl font-bold text-white">{product.activeLanguages.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase">Assets</p>
                <p className="text-xl font-bold text-white">{product.images.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase">Variants</p>
                <p className="text-xl font-bold text-white">
                  {product.options.reduce((acc, opt) => acc * (opt.values.length || 1), product.options.length > 0 ? 1 : 0)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase">Vault Size</p>
                <p className="text-xl font-bold text-white">{product.vault.length}</p>
              </div>
            </div>
          </section>

          <a 
            href="https://docs.medusajs.com/api/admin#product_post_products" 
            target="_blank" 
            rel="noreferrer"
            className="flex items-center justify-between p-4 rounded-2xl glass border border-white/10 text-xs text-zinc-400 hover:text-indigo-400 transition-colors group"
          >
            <span>MedusaJS Schema Docs</span>
            <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
        </div>

        {/* JSON Preview */}
        <div className="lg:col-span-8 space-y-4 order-1 lg:order-2">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <FileJson className="w-4 h-4" />
              product-blueprint.json
            </div>
          </div>
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-purple-600/20 rounded-2xl blur opacity-50 group-hover:opacity-100 transition duration-1000"></div>
            <pre className="relative w-full h-[600px] overflow-auto glass-dark border border-white/10 rounded-2xl p-6 font-mono text-sm leading-relaxed text-indigo-200/90 custom-scrollbar">
              {fullJson}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

