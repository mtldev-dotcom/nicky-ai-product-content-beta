'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useProductStore } from '@/store/useProductStore';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { AiStudioPhotoModalBody } from './AiStudioPhotoModal';
import {
    ImageIcon,
    Upload,
    Link as LinkIcon,
    Cloud,
    Trash2,
    Check,
    Loader2,
    ArrowDownToLine,
    Star,
    GripVertical,
    AlertTriangle,
    Sparkles,
    Square,
    CheckSquare2,
    Expand,
    X,
    ChevronUp,
    ChevronDown,
    MoreVertical
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useIsMobile } from '@/lib/mobile-utils';

export function ProductMediaModule() {
    const { images, reorderImages, setThumbnail, setImages, thumbnail, ignoredUrls, toggleIgnoreSync, id: productId } = useProductStore();
    const [bulkUrls, setBulkUrls] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [syncingUrls, setSyncingUrls] = useState<string[]>([]);
    const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [mobileActionSheetUrl, setMobileActionSheetUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isMobile = useIsMobile();

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
    const [isStudioModalOpen, setIsStudioModalOpen] = useState(false);
    
    // Track image records with their database IDs for deletion
    const [imageRecords, setImageRecords] = useState<Record<string, { id: string; url: string }>>({});

    const selectedCount = selectedUrls.size;
    const selectedImageUrls = [...selectedUrls];

    // Fetch image records when product loads
    useEffect(() => {
        if (!productId) {
            setImageRecords({});
            return;
        }

        const fetchImageRecords = async () => {
            try {
                const res = await fetch(`/api/products/images?productId=${productId}`);
                if (res.ok) {
                    const { images: records } = await res.json();
                    const recordsMap: Record<string, { id: string; url: string }> = {};
                    for (const record of records) {
                        recordsMap[record.public_url] = { id: record.id, url: record.public_url };
                    }
                    setImageRecords(recordsMap);
                }
            } catch (err) {
                console.error('Failed to fetch image records:', err);
            }
        };

        fetchImageRecords();
    }, [productId]);

    useEffect(() => {
        setSelectedUrls((prev) => {
            if (prev.size === 0) return prev;
            const next = new Set<string>();
            for (const url of images) {
                if (prev.has(url)) next.add(url);
            }
            return next;
        });
    }, [images]);

    const toggleSelected = (url: string, next: boolean) => {
        setSelectedUrls((prev) => {
            const s = new Set(prev);
            if (next) s.add(url);
            else s.delete(url);
            return s;
        });
    };

    const clearSelection = () => setSelectedUrls(new Set());

    const handleBulkImport = () => {
        const urls = bulkUrls
            .split('\n')
            .map(url => url.trim())
            .filter(url => url && url.startsWith('http'));

        setImages([...new Set([...images, ...urls])]);
        setBulkUrls('');
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsUploading(true);
        const newImages = [...images];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const res = await fetch('/api/media/presigned', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: file.name, contentType: file.type }),
                });

                if (!res.ok) {
                    continue;
                }

                const { presignedUrl, publicUrl, fileKey } = await res.json();

                await fetch(presignedUrl, {
                    method: 'PUT',
                    body: file,
                    headers: { 'Content-Type': file.type },
                });

                newImages.push(publicUrl);

                // Register the image in product_images table if we have a product ID
                if (useProductStore.getState().id) {
                    try {
                        await fetch('/api/products/images/register', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                productId: useProductStore.getState().id,
                                fileKey,
                                publicUrl,
                                sizeBytes: file.size,
                                contentType: file.type,
                            }),
                        });
                    } catch (regErr) {
                        console.error('Failed to register image:', regErr);
                        // Continue even if registration fails
                    }
                }
            } catch (err) {
                console.error('Upload failed:', err);
            }
        }

        setImages(newImages);
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSyncToBucket = async (url: string) => {
        if (syncingUrls.includes(url)) return;

        setSyncingUrls(prev => [...prev, url]);
        try {
            const res = await fetch('/api/media/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });

            const { publicUrl, fileKey } = await res.json();

            if (res.ok) {
                setImages(images.map(img => img === url ? publicUrl : img));

                // Register the synced image
                if (useProductStore.getState().id && fileKey) {
                    try {
                        await fetch('/api/products/images/register', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                productId: useProductStore.getState().id,
                                fileKey,
                                publicUrl,
                            }),
                        });
                    } catch (regErr) {
                        console.error('Failed to register synced image:', regErr);
                    }
                }
            }
        } catch (err) {
            console.error('Sync failed:', err);
        } finally {
            setSyncingUrls(prev => prev.filter(u => u !== url));
        }
    };

    const removeImage = async (url: string, imageId?: string) => {
        // If we have an imageId (from product_images table), delete from R2
        if (imageId) {
            try {
                await fetch(`/api/products/images/${imageId}`, {
                    method: 'DELETE',
                });
            } catch (err) {
                console.error('Failed to delete image from R2:', err);
            }
        }

        // Remove from local state
        setImages(images.filter(img => img !== url));
        setMobileActionSheetUrl(null);
    };

    // Mobile reorder helpers
    const moveImageUp = (url: string) => {
        const index = images.indexOf(url);
        if (index > 0) {
            const newImages = [...images];
            [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
            reorderImages(newImages);
        }
    };

    const moveImageDown = (url: string) => {
        const index = images.indexOf(url);
        if (index < images.length - 1) {
            const newImages = [...images];
            [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
            reorderImages(newImages);
        }
    };

    return (
        <div className="space-y-6">
            <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />

            <section className="glass rounded-2xl p-6 border border-white/10 space-y-6">
                <h2 className="text-xl font-semibold text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-indigo-400" />
                        Media Gallery
                    </div>
                    <div className="text-xs font-medium text-zinc-500 bg-white/5 px-2 py-1 rounded-full">
                        {images.length} assets
                    </div>
                </h2>

                {/* Import Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <input
                                className="flex-1 bg-zinc-900/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                                placeholder="Paste image URL..."
                                value={bulkUrls}
                                onChange={(e) => setBulkUrls(e.target.value)}
                            />
                            <button
                                onClick={handleBulkImport}
                                disabled={!bulkUrls.trim()}
                                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition-all border border-white/10"
                            >
                                <ArrowDownToLine className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-white/10 hover:border-indigo-500/50 rounded-xl px-4 py-3 cursor-pointer group flex items-center justify-center gap-3 transition-colors bg-white/[0.02]"
                    >
                        <input
                            type="file"
                            multiple
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept="image/*"
                        />
                        {isUploading ? (
                            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                        ) : (
                            <Upload className="w-5 h-5 text-zinc-500 group-hover:text-indigo-400 transition-colors" />
                        )}
                        <span className="text-sm font-medium text-zinc-400 group-hover:text-white transition-colors">
                            {isUploading ? 'Uploading...' : 'Upload Images'}
                        </span>
                    </div>
                </div>

                {/* Gallery Grid */}
                <div className="space-y-4">
                    {/* Selection Toolbar */}
                    {images.length > 0 && (
                        <div className="flex items-center justify-between gap-2 p-2 bg-white/5 rounded-xl border border-white/10 flex-wrap">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectionMode(!selectionMode)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all border",
                                        selectionMode
                                            ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                                            : "bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10"
                                    )}
                                >
                                    {selectionMode ? <CheckSquare2 className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                                    Select
                                </button>
                                {selectionMode && (
                                    <span className="text-[10px] text-zinc-500 font-medium">
                                        {selectedCount} selected
                                    </span>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setIsStudioModalOpen(true)}
                                    disabled={selectedCount === 0}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all border",
                                        selectedCount === 0
                                            ? "bg-white/5 text-zinc-600 border-white/10 cursor-not-allowed"
                                            : "bg-indigo-500 text-white border-indigo-500/30 hover:bg-indigo-600"
                                    )}
                                >
                                    <Sparkles className="w-3 h-3" />
                                    AI Studio
                                </button>
                            </div>

                            {selectedCount > 0 && (
                                <button
                                    type="button"
                                    onClick={clearSelection}
                                    className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Grid */}
                    <div className={cn(
                        "grid gap-3",
                        isMobile ? "grid-cols-2" : "grid-cols-3 lg:grid-cols-4"
                    )}>
                        <AnimatePresence mode="popLayout">
                            {images.map((url, index) => {
                                const isSynced = url.includes(process.env.NEXT_PUBLIC_S3_FILE_URL || 'r2.dev') || url.includes('cloudflarestorage.com');
                                const isIgnored = ignoredUrls.includes(url);
                                const isSyncing = syncingUrls.includes(url);
                                const isThumbnail = url === thumbnail;
                                const isSelected = selectedUrls.has(url);

                                return (
                                    <motion.div
                                        key={url}
                                        layout
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        className={cn(
                                            "relative aspect-square rounded-xl overflow-hidden glass border transition-all group",
                                            isSelected && "ring-2 ring-indigo-500",
                                            (isSynced || isIgnored) ? "border-emerald-500/20" : "border-amber-500/30"
                                        )}
                                        onClick={() => selectionMode && toggleSelected(url, !isSelected)}
                                    >
                                        <img
                                            src={url}
                                            alt=""
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />

                                        {/* Selection Checkbox */}
                                        {selectionMode && (
                                            <div className="absolute top-2 right-2 z-20">
                                                <div className={cn(
                                                    "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                                                    isSelected ? "bg-indigo-500 border-indigo-500" : "bg-black/40 border-white/30"
                                                )}>
                                                    {isSelected && <Check className="w-3 h-3 text-white" />}
                                                </div>
                                            </div>
                                        )}

                                        {/* Status Badge */}
                                        {!isSynced && !isIgnored && !selectionMode && (
                                            <div className="absolute top-2 left-2 p-1 rounded bg-amber-500 text-white shadow-lg z-10">
                                                <AlertTriangle className="w-3 h-3" />
                                            </div>
                                        )}

                                        {isThumbnail && !selectionMode && (
                                            <div className="absolute top-2 right-2 p-1 rounded bg-indigo-500 text-white shadow-lg z-10">
                                                <Star className="w-3 h-3 fill-white" />
                                            </div>
                                        )}

                                        {/* Actions Overlay */}
                                        {!selectionMode && (
                                            <div className={cn(
                                                "absolute inset-0 flex flex-col justify-end p-2 gap-2 transition-opacity",
                                                isMobile ? "opacity-100 bg-gradient-to-t from-black/90 via-black/40 to-transparent" : "bg-black/60 opacity-0 group-hover:opacity-100"
                                            )}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setLightboxUrl(url);
                                                        }}
                                                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                                                    >
                                                        <Expand className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setThumbnail(url);
                                                        }}
                                                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                                                    >
                                                        <Star className={cn("w-3 h-3", isThumbnail && "fill-white")} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const imageRecord = imageRecords[url];
                                                            removeImage(url, imageRecord?.id);
                                                        }}
                                                        className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-200 transition-colors"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </div>

                                                {!isSynced && !isIgnored && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleSyncToBucket(url);
                                                        }}
                                                        disabled={isSyncing}
                                                        className="w-full py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-colors"
                                                    >
                                                        {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cloud className="w-3 h-3" />}
                                                        Sync
                                                    </button>
                                                )}

                                                {/* Mobile Reorder */}
                                                {isMobile && (
                                                    <div className="absolute top-1/2 left-2 -translate-y-1/2 flex flex-col gap-1 pointer-events-auto z-20">
                                                        {index > 0 && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); moveImageUp(url); }}
                                                                className="p-1 bg-black/60 rounded text-white"
                                                            >
                                                                <ChevronUp className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                        {index < images.length - 1 && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); moveImageDown(url); }}
                                                                className="p-1 bg-black/60 rounded text-white"
                                                            >
                                                                <ChevronDown className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            </section>

            {/* AI Studio Modal */}
            <AnimatePresence>
                {isStudioModalOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm"
                            onClick={() => setIsStudioModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none"
                        >
                            <div
                                className="bg-[#09090b] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto pointer-events-auto shadow-2xl p-6"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <AiStudioPhotoModalBody
                                    selectedImageUrls={selectedImageUrls}
                                    onRemoveSelected={(url) => toggleSelected(url, false)}
                                    onClose={() => setIsStudioModalOpen(false)}
                                    onAddOutputs={(urls) => {
                                        if (urls.length > 0) {
                                            setImages([...new Set([...images, ...urls])]);
                                        }
                                    }}
                                    isMobile={isMobile}
                                />
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
