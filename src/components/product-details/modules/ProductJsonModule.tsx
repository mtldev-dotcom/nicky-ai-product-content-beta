'use client';

import React, { useState, useMemo } from 'react';
import { useProductStore, type Localization } from '@/store/useProductStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { buildMedusaAdminProductPayload } from '@/lib/medusa/build-admin-product-payload';
import { pushProductToMedusa } from '@/app/product-details/actions';
import {
    Database,
    Copy,
    Download,
    Check,
    Box,
    Loader2,
    Save,
    Eye,
    X,
    AlertTriangle,
    RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function ProductJsonModule() {
    const product = useProductStore();
    const settings = useSettingsStore();
    const [copied, setCopied] = useState(false);
    const [isPushing, setIsPushing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [pushResult, setPushResult] = useState<{ productId: string | null } | null>(null);
    const [pushError, setPushError] = useState<string | null>(null);
    const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);

    const medusaPayload = useMemo(() => {
        // Determine if this is an update (has medusaProductId) or create
        const isUpdate = !!product.medusaProductId;
        
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
        }, isUpdate);
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

    const handleSaveLocal = async () => {
        setIsSaving(true);
        try {
            if (product.organizationId) {
                await product.saveToDb();
            }
        } catch (error) {
            console.error('Failed to save local:', error);
        } finally {
            setTimeout(() => setIsSaving(false), 500);
        }
    };

    const handlePushToMedusa = async () => {
        if (!settings.medusaUrl || !settings.hasMedusaApiKey) {
            setPushError('Medusa integration not configured in Settings.');
            return;
        }

        setIsPushing(true);
        setPushError(null);
        setPushResult(null);

        try {
            const result = await pushProductToMedusa(
                {
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
                },
                product.medusaProductId || null
            );

            if (!result.success) {
                setPushError(result.error);
                return;
            }

            const finalId = result.productId || product.medusaProductId;

            // If it was a create, update the store with the new Medusa ID
            if (!product.medusaProductId && finalId) {
                product.updateRoot({ medusaProductId: finalId });
            }

            setPushResult({ productId: finalId || null });
        } catch (e) {
            console.error('Push to Medusa failed:', e);
            setPushError('Failed to push product to Medusa');
        } finally {
            setIsPushing(false);
        }
    };

    const validationIssues = useMemo(() => {
        const issues = [];
        if (!product.title) issues.push('Missing Product Title');
        if (!product.handle && !product.title) issues.push('Missing Handle');
        if (product.images.length === 0) issues.push('No images added');
        return issues;
    }, [product]);

    return (
        <>
            <section className="glass rounded-2xl p-6 border border-white/10 space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                        <Database className="w-5 h-5 text-indigo-400" />
                        Actions & Export
                    </h2>
                    {validationIssues.length > 0 ? (
                        <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            <span className="text-xs font-medium text-amber-300">{validationIssues.length} Issues</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-xs font-medium text-emerald-300">Ready to Push</span>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <button
                        onClick={handleSaveLocal}
                        disabled={isSaving}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Local
                    </button>

                    <button
                        onClick={handleCopy}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copied' : 'Copy JSON'}
                    </button>

                    <button
                        onClick={handleDownload}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        <Download className="w-4 h-4" />
                        Download
                    </button>

                    <button
                        onClick={() => setIsJsonModalOpen(true)}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        <Eye className="w-4 h-4" />
                        View JSON
                    </button>

                    <button
                        onClick={handlePushToMedusa}
                        disabled={isPushing || !settings.medusaUrl || !settings.hasMedusaApiKey}
                        className={cn(
                            "bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                            (!settings.medusaUrl || !settings.hasMedusaApiKey) && "opacity-50 grayscale"
                        )}
                        title={(!settings.medusaUrl || !settings.hasMedusaApiKey) ? "Configure Medusa in Settings" : "Push to Medusa"}
                    >
                        {isPushing ? <Loader2 className="w-4 h-4 animate-spin" /> : product.medusaProductId ? <RefreshCw className="w-4 h-4" /> : <Box className="w-4 h-4" />}
                        {isPushing
                            ? (product.medusaProductId ? 'Updating...' : 'Pushing...')
                            : (product.medusaProductId ? 'Update Medusa' : 'Push to Medusa')
                        }
                    </button>
                </div>

                {/* Status Messages */}
                {(pushError || pushResult) && (
                    <div className={cn(
                        "p-4 rounded-xl text-sm flex items-start gap-3",
                        pushError ? "bg-red-500/10 border border-red-500/20 text-red-300" : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                    )}>
                        {pushError ? (
                            <>
                                <AlertTriangle className="w-5 h-5 shrink-0" />
                                <div>
                                    <span className="font-bold block mb-1">Push Failed</span>
                                    {pushError}
                                </div>
                            </>
                        ) : (
                            <>
                                <Check className="w-5 h-5 shrink-0" />
                                <div>
                                    <span className="font-bold block mb-1">Push Succeeded</span>
                                    Product ID: <span className="font-mono bg-black/20 px-1 rounded">{pushResult?.productId}</span>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </section>

            {/* JSON Viewer Modal */}
            <AnimatePresence>
                {isJsonModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                            onClick={() => setIsJsonModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative bg-[#09090b] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl"
                        >
                            <div className="flex items-center justify-between p-4 border-b border-white/10">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Database className="w-5 h-5 text-indigo-400" />
                                    Product JSON Value
                                </h3>
                                <button
                                    onClick={() => setIsJsonModalOpen(false)}
                                    className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-auto p-0 bg-zinc-950/50">
                                <pre className="p-6 font-mono text-xs leading-relaxed text-indigo-200/90">
                                    {fullJson}
                                </pre>
                            </div>

                            <div className="p-4 border-t border-white/10 flex justify-end gap-2 bg-zinc-900/50 rounded-b-2xl">
                                <button
                                    onClick={handleCopy}
                                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold uppercase tracking-wider border border-white/10 transition-all flex items-center gap-2"
                                >
                                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    {copied ? 'Copied' : 'Copy to Clipboard'}
                                </button>
                                <button
                                    onClick={() => setIsJsonModalOpen(false)}
                                    className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}
