'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useProductStore } from '@/store/useProductStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { PROMPT_LIBRARY_JSON } from '@/lib/ai/promptLibrary';
import { providerLabel, topImageModelsForProvider, type AiImageProviderId } from '@/lib/ai/topImageModels';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import {
    Sparkles,
    Loader2,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type JewelryType = 'ring' | 'bracelet' | 'chain' | 'pendant' | 'earring';
type ModelId = 'none' | 'model_01_minimalist' | 'model_02_rugged' | 'model_03_editorial';
type ProviderId = 'openai' | 'fal' | 'gemini';

type StudioGeneration = {
    id: string;
    inputImageUrl: string;
    promptText: string;
    outputImageUrl: string;
    createdAt: string;
};

type StudioGenerateResponse = {
    generations: StudioGeneration[];
};

function safeDownloadUrl(url: string): string {
    // Basic guard: only allow http(s) URLs for download/open.
    if (url.startsWith('https://') || url.startsWith('http://')) return url;
    return '';
}

export function AiStudioPhotoModalBody(props: {
    selectedImageUrls: string[];
    onRemoveSelected: (url: string) => void;
    onAddOutputs: (urls: string[]) => void;
    onClose: () => void;
    isMobile?: boolean;
}) {
    const { selectedImageUrls, onRemoveSelected, onAddOutputs, onClose, isMobile = false } = props;
    const settings = useSettingsStore();
    const effectiveLibrary = useMemo(() => {
        // Org override if present, otherwise fall back to the embedded defaults.
        return (settings.aiStudioPromptLibrary && typeof settings.aiStudioPromptLibrary === 'object')
            ? (settings.aiStudioPromptLibrary as typeof PROMPT_LIBRARY_JSON)
            : PROMPT_LIBRARY_JSON;
    }, [settings.aiStudioPromptLibrary]);

    // Controls (UI-level state; prompt assembly happens server-side).
    const [jewelryType, setJewelryType] = useState<JewelryType>('ring');
    const [setupId, setSetupId] = useState<string>('ring_setup_01_concrete_pedestal');
    const [modelId, setModelId] = useState<ModelId>('none');
    const [macro, setMacro] = useState(false);
    const [noFingerprints, setNoFingerprints] = useState(true);
    const [extraRimLight, setExtraRimLight] = useState(false);
    const [darkness, setDarkness] = useState<number>(40);

    // Studio Assets: combined models/studios selection
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
    const [customPromptInstructions, setCustomPromptInstructions] = useState<string>('');
    const [availableAssets, setAvailableAssets] = useState<Array<{ id: string; type: 'model' | 'studio'; name: string; image_url: string; thumbnail_url?: string }>>([]);
    const [loadingAssets, setLoadingAssets] = useState(false);

    // Provider overrides (defaults are wired from Settings, but user can override).
    const [provider, setProvider] = useState<ProviderId>('openai');
    const [providerModel, setProviderModel] = useState<string>('');

    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [generations, setGenerations] = useState<StudioGeneration[]>([]);
    const [lastRequestFingerprint, setLastRequestFingerprint] = useState<string>('');
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    // Canonical options (powered by PROMPT_LIBRARY_JSON as required).
    const setups = effectiveLibrary.setups;
    const models = effectiveLibrary.models;

    /**
     * Only show providers that have valid keys saved in Settings.
     * (In this modal we only have access to `has*` flags, not typed-but-unsaved values.)
     */
    const availableProviders = useMemo(() => {
        const providers: ProviderId[] = [];
        if (settings.hasOpenaiApiKey) providers.push('openai');
        if (settings.hasFalApiKey) providers.push('fal');
        if (settings.hasGeminiApiKey) providers.push('gemini');
        return providers;
    }, [settings.hasOpenaiApiKey, settings.hasFalApiKey, settings.hasGeminiApiKey]);

    /**
     * Setup filtering rules:
     * - Always filter by jewelryType (per prompt library).
     * - If a human model is selected, prefer "wearable" setups when they exist for that jewelryType
     *   (e.g., ring mannequin-hand). If no wearable setups exist, keep all setups.
     * - If no model is selected, hide wearable setups when they exist (keeps product-only setups clean).
     */
    const filteredSetups = useMemo(() => {
        const byType = setups.filter((s) => s.jewelryType === jewelryType);

        const wearable = byType.filter((s) => {
            const id = s.id.toLowerCase();
            const title = s.title.toLowerCase();
            return id.includes('mannequin') || id.includes('hand') || title.includes('mannequin') || title.includes('hand');
        });

        if (wearable.length === 0) return byType;

        if (modelId === 'none') {
            return byType.filter((s) => !wearable.includes(s));
        }

        return wearable;
    }, [setups, jewelryType, modelId]);

    // Ensure setup stays valid when jewelry type changes.
    useEffect(() => {
        if (!filteredSetups.some((s) => s.id === setupId)) {
            setSetupId(filteredSetups[0]?.id || '');
        }
    }, [filteredSetups, setupId]);

    // Default provider/model from Settings, but don't clobber user edits once they start typing.
    useEffect(() => {
        const settingsProvider = (settings.aiImageProvider === 'openai' || settings.aiImageProvider === 'fal' || settings.aiImageProvider === 'gemini')
            ? (settings.aiImageProvider as ProviderId)
            : 'openai';

        const fallbackProvider: ProviderId =
            availableProviders.length > 0
                ? (availableProviders.includes(settingsProvider) ? settingsProvider : availableProviders[0])
                : 'openai';

        setProvider((prev) => (prev === fallbackProvider ? prev : fallbackProvider));

        const topModels = topImageModelsForProvider(fallbackProvider);
        const settingsModel = (settings.aiImageModel || '').trim();
        const preferredDefault =
            settingsProvider === fallbackProvider && topModels.includes(settingsModel)
                ? settingsModel
                : (topModels[0] || '');

        setProviderModel((prev) => {
            if (!prev) return preferredDefault;
            if (topModels.includes(prev)) return prev;
            return preferredDefault;
        });
    }, [settings.aiImageProvider, settings.aiImageModel, availableProviders, settings.hasOpenaiApiKey, settings.hasFalApiKey, settings.hasGeminiApiKey]);

    // When provider changes (user-driven), snap providerModel to a valid choice if needed.
    useEffect(() => {
        const topModels = topImageModelsForProvider(provider);
        setProviderModel((prev) => (topModels.includes(prev) ? prev : (topModels[0] || '')));
    }, [provider]);

    // If selection becomes empty while modal is open, close it.
    useEffect(() => {
        if (selectedImageUrls.length === 0) onClose();
    }, [selectedImageUrls.length, onClose]);

    // Fetch available studio assets on modal open
    useEffect(() => {
        setLoadingAssets(true);
        fetch('/api/studio-assets?limit=100')
            .then(res => res.json())
            .then(data => {
                setAvailableAssets(data.assets || []);
            })
            .catch(err => {
                console.error('Failed to fetch assets:', err);
            })
            .finally(() => {
                setLoadingAssets(false);
            });
    }, []);

    const buildFingerprint = (variants: number) =>
        JSON.stringify({
            selectedImageUrls,
            jewelryType,
            setupId,
            modelId,
            macro,
            noFingerprints,
            extraRimLight,
            darkness,
            provider,
            providerModel,
            variants,
            selectedAssetId,
            customPromptInstructions,
        });

    const runGenerate = async (variants: number) => {
        if (selectedImageUrls.length === 0) return;

        setIsGenerating(true);
        setError(null);

        try {
            // Auto-save the product first if needed so we always have a `productId`.
            const state = useProductStore.getState();
            if (!state.id) {
                await state.saveToDb();
            }
            const productId = useProductStore.getState().id;
            if (!productId) throw new Error('Failed to auto-save product (missing productId).');

            const reqFingerprint = buildFingerprint(variants);
            setLastRequestFingerprint(reqFingerprint);

            // Get selected asset if any
            const selectedAsset = selectedAssetId ? availableAssets.find(a => a.id === selectedAssetId) : null;

            const res = await fetch('/api/ai/studio-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId,
                    inputImages: selectedImageUrls.map((url) => ({ id: url, url })),
                    jewelryType,
                    setupId,
                    modelId,
                    options: {
                        macro,
                        noFingerprints,
                        extraRimLight,
                        darkness,
                    },
                    variants,
                    // Provider override (server will fall back to Settings defaults when absent)
                    provider,
                    providerModel: providerModel || undefined,
                    // Include uploaded asset URLs if selected
                    modelImageUrl: selectedAsset && selectedAsset.type === 'model' ? selectedAsset.image_url : undefined,
                    studioImageUrl: selectedAsset && selectedAsset.type === 'studio' ? selectedAsset.image_url : undefined,
                    // Custom prompt instructions and asset ID
                    customPromptInstructions: customPromptInstructions.trim() || undefined,
                    selectedAssetId: selectedAssetId || undefined,
                }),
            });

            const raw = await res.text();
            const json = (() => {
                try {
                    return JSON.parse(raw) as unknown;
                } catch {
                    return { error: raw };
                }
            })() as Partial<StudioGenerateResponse> & { error?: string };

            if (!res.ok) {
                throw new Error(json.error || `Generation failed (${res.status} ${res.statusText})`);
            }

            const next = Array.isArray(json.generations) ? (json.generations as StudioGeneration[]) : [];
            setGenerations(next);

            // Auto-add to product media by default (UI + backend both do best-effort attach).
            const urls = next.map((g) => g.outputImageUrl).filter((u) => typeof u === 'string' && u.length > 0);
            onAddOutputs(urls);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Generation failed');
        } finally {
            setIsGenerating(false);
        }
    };

    const canGenerate =
        selectedImageUrls.length > 0 &&
        (selectedAssetId ? true : setupId.length > 0) &&
        availableProviders.length > 0;

    return (
        <div className={cn("space-y-4 md:space-y-6", isMobile && "pb-4")}>
            <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h3 className={cn("font-semibold text-white flex items-center gap-2", isMobile ? "text-base" : "text-lg")}>
                        <Sparkles className={cn("text-indigo-400", isMobile ? "w-4 h-4" : "w-5 h-5")} />
                        AI Studio Photo Generator
                    </h3>
                    <p className="text-xs text-zinc-500">
                        {selectedImageUrls.length} input image{selectedImageUrls.length === 1 ? '' : 's'} selected
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className={cn("rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all touch-target", isMobile ? "p-3" : "p-2")}
                    aria-label="Close"
                >
                    <X className={cn(isMobile ? "w-5 h-5" : "w-4 h-4")} />
                </button>
            </div>

            {isMobile ? (
                <>
                    <div className="space-y-3">
                        <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Selected images</div>
                        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
                            {selectedImageUrls.map((url) => (
                                <div key={url} className="flex-shrink-0 w-24 space-y-2">
                                    <button
                                        type="button"
                                        className="w-24 h-24 rounded-lg overflow-hidden border border-white/10 bg-black/30 cursor-zoom-in"
                                        onClick={() => setLightboxUrl(url)}
                                    >
                                        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                    </button>
                                    <button
                                        onClick={() => onRemoveSelected(url)}
                                        className="w-full touch-target text-xs py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 transition-all"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Controls - Mobile */}
                    <div className="space-y-4 md:space-y-6 mt-4">
                        {/* ... Mobile Controls (Simplified for brevity as layout is shared) ... */}
                        {renderControls({
                            isMobile, jewelryType, setJewelryType, effectiveLibrary,
                            selectedAssetId, setSelectedAssetId, setCustomPromptInstructions,
                            loadingAssets, availableAssets, customPromptInstructions,
                            modelId, setModelId, models, setupId, setSetupId, filteredSetups,
                            provider, setProvider, availableProviders, providerModel, setProviderModel,
                            macro, setMacro, noFingerprints, setNoFingerprints, extraRimLight, setExtraRimLight,
                            darkness, setDarkness, error
                        })}
                    </div>
                </>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left: selected preview strip */}
                    <div className="lg:col-span-4 space-y-3">
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Selected images</div>
                        <div className="max-h-[420px] overflow-auto pr-1 space-y-3">
                            {selectedImageUrls.map((url) => (
                                <div key={url} className="flex items-center gap-3 p-2 rounded-xl bg-zinc-900/40 border border-white/10">
                                    <button
                                        type="button"
                                        className="w-14 h-14 rounded-lg overflow-hidden border border-white/10 bg-black/30 shrink-0 cursor-zoom-in"
                                        onClick={() => setLightboxUrl(url)}
                                    >
                                        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[10px] text-zinc-400 font-mono truncate">{url}</div>
                                    </div>
                                    <button
                                        onClick={() => onRemoveSelected(url)}
                                        className="p-2 rounded-lg bg-white/5 hover:bg-red-500/10 text-zinc-400 hover:text-red-300 transition-all"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Controls - Desktop */}
                    <div className="lg:col-span-8 space-y-4 md:space-y-6">
                        {renderControls({
                            isMobile, jewelryType, setJewelryType, effectiveLibrary,
                            selectedAssetId, setSelectedAssetId, setCustomPromptInstructions,
                            loadingAssets, availableAssets, customPromptInstructions,
                            modelId, setModelId, models, setupId, setSetupId, filteredSetups,
                            provider, setProvider, availableProviders, providerModel, setProviderModel,
                            macro, setMacro, noFingerprints, setNoFingerprints, extraRimLight, setExtraRimLight,
                            darkness, setDarkness, error
                        })}
                    </div>
                </div>
            )}

            {/* Action buttons */}
            <div className={cn("flex items-center gap-3", isMobile ? "flex-col pt-4 pb-safe" : "justify-between flex-wrap")}>
                <div className={cn("flex items-center gap-2", isMobile && "w-full flex-col")}>
                    <button
                        onClick={() => runGenerate(1)}
                        disabled={!canGenerate || isGenerating}
                        className={cn("touch-target-large rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition-all font-semibold flex items-center justify-center gap-2 disabled:bg-zinc-800 disabled:text-zinc-500", isMobile ? "w-full px-5 py-4 text-base" : "px-5 py-3 text-sm")}
                    >
                        {isGenerating ? <Loader2 className={cn("animate-spin", isMobile ? "w-5 h-5" : "w-4 h-4")} /> : <Sparkles className={isMobile ? "w-5 h-5" : "w-4 h-4"} />}
                        Generate
                    </button>
                    <button
                        onClick={() => runGenerate(3)}
                        disabled={!canGenerate || isGenerating}
                        className={cn("touch-target-large rounded-xl bg-white/5 text-white hover:bg-white/10 transition-all font-semibold border border-white/10 disabled:text-zinc-500", isMobile ? "w-full px-5 py-4 text-base" : "px-5 py-3 text-sm")}
                    >
                        Generate Variants
                    </button>
                </div>
                {!isMobile && (
                    <button onClick={onClose} className="px-5 py-3 rounded-xl bg-white/5 text-zinc-200 hover:bg-white/10 transition-all text-sm font-semibold border border-white/10">
                        Cancel
                    </button>
                )}
            </div>

            {/* Results */}
            <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Results</div>
                    <button
                        onClick={() => {
                            if (!lastRequestFingerprint) return;
                            try {
                                const parsed = JSON.parse(lastRequestFingerprint) as { variants?: number };
                                const v = typeof parsed.variants === 'number' ? parsed.variants : 1;
                                runGenerate(v);
                            } catch {
                                runGenerate(1);
                            }
                        }}
                        disabled={isGenerating || !lastRequestFingerprint}
                        className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 hover:text-indigo-300 disabled:text-zinc-600"
                    >
                        Regenerate with same settings
                    </button>
                </div>

                {generations.length === 0 ? (
                    <div className="p-6 rounded-2xl bg-zinc-900/30 border border-white/10 text-zinc-500 text-sm">
                        No outputs yet. Click Generate to create studio photos.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {generations.map((g) => {
                            const downloadable = safeDownloadUrl(g.outputImageUrl);
                            return (
                                <div key={g.id} className="rounded-2xl overflow-hidden border border-white/10 bg-zinc-900/30">
                                    <button
                                        type="button"
                                        className="aspect-square bg-black/30 w-full cursor-zoom-in"
                                        onClick={() => setLightboxUrl(g.outputImageUrl)}
                                    >
                                        <img src={g.outputImageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                                    </button>
                                    <div className="p-3 space-y-2">
                                        <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Added to product media</div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    if (!downloadable) return;
                                                    window.open(downloadable, '_blank', 'noopener,noreferrer');
                                                }}
                                                disabled={!downloadable}
                                                className="flex-1 px-3 py-2 rounded-xl bg-white/5 text-white hover:bg-white/10 transition-all text-xs font-semibold border border-white/10 disabled:text-zinc-600"
                                            >
                                                Download
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper to render shared controls to trim complexity
function renderControls({ isMobile, jewelryType, setJewelryType, effectiveLibrary,
    selectedAssetId, setSelectedAssetId, setCustomPromptInstructions,
    loadingAssets, availableAssets, customPromptInstructions,
    modelId, setModelId, models, setupId, setSetupId, filteredSetups,
    provider, setProvider, availableProviders, providerModel, setProviderModel,
    macro, setMacro, noFingerprints, setNoFingerprints, extraRimLight, setExtraRimLight,
    darkness, setDarkness, error }: any) {

    return (
        <div className={cn("grid gap-4", "grid-cols-1 md:grid-cols-2")}>
            <label className="space-y-1">
                <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Jewelry Type</span>
                <select
                    className={cn("w-full rounded-xl bg-zinc-900/50 border border-white/10 text-white outline-none focus:ring-2 focus:ring-indigo-500/30 touch-target", isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm")}
                    value={jewelryType}
                    onChange={(e) => setJewelryType(e.target.value as JewelryType)}
                >
                    {(effectiveLibrary.jewelryTypes as readonly string[]).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
            </label>

            <label className="space-y-1">
                <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Model / Studio</span>
                <select
                    className={cn("w-full rounded-xl bg-zinc-900/50 border border-white/10 text-white outline-none focus:ring-2 focus:ring-indigo-500/30 touch-target", isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm")}
                    value={selectedAssetId || 'none'}
                    onChange={(e) => {
                        const value = e.target.value;
                        if (value === 'none') {
                            setSelectedAssetId(null);
                            setCustomPromptInstructions('');
                        } else {
                            setSelectedAssetId(value);
                        }
                    }}
                >
                    <option value="none">None</option>
                    {loadingAssets ? <option disabled>Loading...</option> : (
                        <>
                            {availableAssets.filter((a: any) => a.type === 'model').length > 0 && (
                                <optgroup label="Models">
                                    {availableAssets.filter((a: any) => a.type === 'model').map((asset: any) => (
                                        <option key={asset.id} value={asset.id}>{asset.name}</option>
                                    ))}
                                </optgroup>
                            )}
                            {availableAssets.filter((a: any) => a.type === 'studio').length > 0 && (
                                <optgroup label="Studios">
                                    {availableAssets.filter((a: any) => a.type === 'studio').map((asset: any) => (
                                        <option key={asset.id} value={asset.id}>{asset.name}</option>
                                    ))}
                                </optgroup>
                            )}
                        </>
                    )}
                </select>
                {selectedAssetId && (
                    <div className="space-y-2">
                        <div className="relative w-full h-32 rounded-lg overflow-hidden border border-white/10">
                            <img src={availableAssets.find((a: any) => a.id === selectedAssetId)?.thumbnail_url || availableAssets.find((a: any) => a.id === selectedAssetId)?.image_url} alt="Selected asset" className="w-full h-full object-cover" loading="lazy" />
                        </div>
                        <label className="space-y-1">
                            <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Custom Prompt Instructions</span>
                            <textarea
                                className={cn("w-full rounded-xl bg-zinc-900/50 border border-white/10 text-white outline-none focus:ring-2 focus:ring-indigo-500/30 touch-target resize-none", isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm")}
                                rows={isMobile ? 4 : 3}
                                placeholder="Enter custom prompt instructions for this asset..."
                                value={customPromptInstructions}
                                onChange={(e) => setCustomPromptInstructions(e.target.value)}
                            />
                        </label>
                    </div>
                )}
                {(!selectedAssetId || selectedAssetId === 'none') && (
                    <select
                        className={cn("w-full rounded-xl bg-zinc-900/50 border border-white/10 text-white outline-none focus:ring-2 focus:ring-indigo-500/30 touch-target", isMobile ? "px-4 py-3 text-base mt-2" : "px-3 py-2 text-sm mt-2")}
                        value={modelId}
                        onChange={(e) => setModelId(e.target.value as ModelId)}
                    >
                        {models.map((m: any) => <option key={m.id} value={m.id}>{m.id}</option>)}
                    </select>
                )}
            </label>

            {(!selectedAssetId || selectedAssetId === 'none') && (
                <label className="space-y-1">
                    <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Setup</span>
                    <select
                        className={cn("w-full rounded-xl bg-zinc-900/50 border border-white/10 text-white outline-none focus:ring-2 focus:ring-indigo-500/30 touch-target", isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm")}
                        value={setupId}
                        onChange={(e) => setSetupId(e.target.value)}
                    >
                        {filteredSetups.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                </label>
            )}

            <label className="space-y-1">
                <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Provider</span>
                <select
                    className={cn("w-full rounded-xl bg-zinc-900/50 border border-white/10 text-white outline-none focus:ring-2 focus:ring-indigo-500/30 touch-target", isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm")}
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as ProviderId)}
                    disabled={availableProviders.length === 0}
                >
                    {availableProviders.length === 0 ? <option value={provider}>No providers configured</option> : availableProviders.map((p: any) => <option key={p} value={p}>{providerLabel(p as AiImageProviderId)}</option>)}
                </select>
            </label>

            <label className={cn("space-y-1", isMobile ? "" : "md:col-span-2")}>
                <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Provider Model</span>
                <select
                    className={cn("w-full rounded-xl bg-zinc-900/50 border border-white/10 text-white outline-none focus:ring-2 focus:ring-indigo-500/30 font-mono touch-target", isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm")}
                    value={providerModel}
                    onChange={(e) => setProviderModel(e.target.value)}
                    disabled={availableProviders.length === 0}
                >
                    {topImageModelsForProvider(provider).map((modelId) => <option key={modelId} value={modelId}>{modelId}</option>)}
                </select>
            </label>

            <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "md:col-span-2 grid-cols-1 md:grid-cols-3")}>
                <label className={cn("flex items-center gap-3 rounded-xl bg-zinc-900/40 border border-white/10 touch-target", isMobile ? "px-4 py-3" : "px-3 py-2")}>
                    <input type="checkbox" className={cn("rounded border-zinc-500 text-indigo-500 focus:ring-indigo-500 bg-transparent", isMobile ? "w-5 h-5" : "w-4 h-4")} checked={macro} onChange={(e) => setMacro(e.target.checked)} />
                    <span className={cn("text-zinc-300 font-semibold", isMobile ? "text-sm" : "text-xs")}>Macro close-up</span>
                </label>
                <label className={cn("flex items-center gap-3 rounded-xl bg-zinc-900/40 border border-white/10 touch-target", isMobile ? "px-4 py-3" : "px-3 py-2")}>
                    <input type="checkbox" className={cn("rounded border-zinc-500 text-indigo-500 focus:ring-indigo-500 bg-transparent", isMobile ? "w-5 h-5" : "w-4 h-4")} checked={noFingerprints} onChange={(e) => setNoFingerprints(e.target.checked)} />
                    <span className={cn("text-zinc-300 font-semibold", isMobile ? "text-sm" : "text-xs")}>No fingerprints / dust</span>
                </label>
                <label className={cn("flex items-center gap-3 rounded-xl bg-zinc-900/40 border border-white/10 touch-target", isMobile ? "px-4 py-3" : "px-3 py-2")}>
                    <input type="checkbox" className={cn("rounded border-zinc-500 text-indigo-500 focus:ring-indigo-500 bg-transparent", isMobile ? "w-5 h-5" : "w-4 h-4")} checked={extraRimLight} onChange={(e) => setExtraRimLight(e.target.checked)} />
                    <span className={cn("text-zinc-300 font-semibold", isMobile ? "text-sm" : "text-xs")}>Extra rim light</span>
                </label>
            </div>

            <label className={cn("space-y-1", isMobile ? "" : "md:col-span-2")}>
                <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>
                    Background darkness <span className="text-zinc-600">({darkness})</span>
                </span>
                <input type="range" min={0} max={100} value={darkness} onChange={(e) => setDarkness(parseInt(e.target.value, 10) || 0)} className={cn("w-full", isMobile && "h-2")} />
                <p className={cn("text-zinc-600", isMobile ? "text-xs" : "text-[10px]")}>Subtle control only—keeps the industrial mood consistent.</p>
            </label>

            {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">{error}</div>}
            {availableProviders.length === 0 && <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">No image providers are configured. Add an API key in Settings to enable generation.</div>}
        </div>
    );
}
