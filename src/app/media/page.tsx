'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProductStore } from '@/store/useProductStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { PROMPT_LIBRARY_JSON } from '@/lib/ai/promptLibrary';
import { 
  ImageIcon, 
  Upload, 
  Link as LinkIcon, 
  Cloud, 
  Trash2, 
  Check, 
  Loader2,
  ImagePlus,
  ArrowDownToLine,
  Star,
  GripVertical,
  AlertTriangle,
  Sparkles,
  Square,
  CheckSquare2,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence, Reorder } from 'framer-motion';

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

export default function MediaPage() {
  const { images, reorderImages, setThumbnail, setImages, thumbnail, ignoredUrls, toggleIgnoreSync } = useProductStore();
  const [bulkUrls, setBulkUrls] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [syncingUrls, setSyncingUrls] = useState<string[]>([]);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Selection mode is a UI-only layer on top of `images`.
   *
   * Preconditions:
   * - `images` is the source of truth (URLs).
   *
   * Postconditions:
   * - When `images` changes (delete/sync/upload), we auto-prune selected URLs
   *   to avoid stale selection (\"auto sync\" requirement).
   */
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [isStudioModalOpen, setIsStudioModalOpen] = useState(false);

  const selectedCount = selectedUrls.size;

  const selectedImageUrls = useMemo(() => {
    // Keep ordering consistent with the grid
    return images.filter((u) => selectedUrls.has(u));
  }, [images, selectedUrls]);

  useEffect(() => {
    // Auto-prune removed URLs from selection when image list changes.
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
        
        const { presignedUrl, publicUrl } = await res.json();

        await fetch(presignedUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });

        newImages.push(publicUrl);
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
      
      const { publicUrl } = await res.json();
      
      if (res.ok) {
        setImages(images.map(img => img === url ? publicUrl : img));
      }
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncingUrls(prev => prev.filter(u => u !== url));
    }
  };

  const removeImage = (url: string) => {
    setImages(images.filter(img => img !== url));
  };

  return (
    <div className="space-y-10 pb-20">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <ImageIcon className="text-indigo-400 w-8 h-8" />
          Media Management Pipeline
        </h1>
        <p className="text-zinc-400">
          Sync external assets, upload local files, and architect your product gallery.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Import Controls */}
        <div className="lg:col-span-4 space-y-6">
          <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-indigo-400" />
              Bulk URL Import
            </h2>
            <textarea 
              className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all resize-none font-mono"
              rows={5}
              placeholder="Paste image URLs (one per line)..."
              value={bulkUrls}
              onChange={(e) => setBulkUrls(e.target.value)}
            />
            <button 
              onClick={handleBulkImport}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <ArrowDownToLine className="w-4 h-4" />
              Import URLs
            </button>
          </section>

          <section 
            onClick={() => fileInputRef.current?.click()}
            className="glass rounded-2xl p-8 border-2 border-dashed border-white/10 hover:border-indigo-500/50 transition-all cursor-pointer group flex flex-col items-center justify-center gap-4 text-center"
          >
            <input 
              type="file" 
              multiple 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload}
              accept="image/*"
            />
            <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              {isUploading ? <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" /> : <Upload className="w-8 h-8 text-indigo-400" />}
            </div>
            <div>
              <p className="text-white font-semibold">Device Upload</p>
              <p className="text-xs text-zinc-500">Push files directly to R2 bucket</p>
            </div>
          </section>
        </div>

        {/* Gallery Grid */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              Product Gallery
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-zinc-400">
                {images.length} assets
              </span>
            </h2>
            <div className="flex items-center gap-2">
              {/* Selection Toolbar */}
              <div className="flex items-center gap-2 glass px-3 py-2 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setSelectionMode((v) => {
                      const next = !v;
                      // When leaving selection mode, keep selection (user can re-open modal),
                      // but we do clear it if there are no images selected.
                      return next;
                    });
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all border",
                    selectionMode
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/25"
                      : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10"
                  )}
                  title="Toggle selection mode"
                >
                  {selectionMode ? <CheckSquare2 className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  Select
                </button>

                <div className="text-[10px] text-zinc-400 font-semibold whitespace-nowrap">
                  {selectedCount > 0 ? `${selectedCount} selected` : 'None selected'}
                </div>

                <button
                  type="button"
                  onClick={() => setIsStudioModalOpen(true)}
                  disabled={selectedCount === 0}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all border",
                    selectedCount === 0
                      ? "bg-zinc-900/40 text-zinc-600 border-white/5 cursor-not-allowed"
                      : "bg-indigo-500 text-white border-indigo-500/30 hover:bg-indigo-600"
                  )}
                  title={selectedCount === 0 ? "Select at least 1 image" : "Open AI Studio Photo Generator"}
                >
                  <Sparkles className="w-4 h-4" />
                  AI Studio Photo
                </button>

                {selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 transition-all"
                    aria-label="Clear selection"
                    title="Clear selection"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Status Legend */}
              <div className="hidden md:flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold">
                <span className="flex items-center gap-1 text-emerald-500">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" /> Synced
                </span>
                <span className="flex items-center gap-1 text-amber-500">
                  <div className="w-2 h-2 rounded-full bg-amber-500" /> Unsynced
                </span>
              </div>
            </div>
          </div>

          {/*
            When selection mode is enabled we disable drag-reorder to prevent UX conflicts
            between clicking-to-select and dragging items.
          */}
          {selectionMode ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <AnimatePresence>
                {images.map((url) => {
                  const isSynced =
                    url.includes(process.env.NEXT_PUBLIC_S3_FILE_URL || 'r2.dev') || url.includes('cloudflarestorage.com');
                  const isIgnored = ignoredUrls.includes(url);
                  const isSyncing = syncingUrls.includes(url);
                  const isThumbnail = url === thumbnail;
                  const isFullVisible = expandedUrl === url;
                  const isSelected = selectedUrls.has(url);

                  return (
                    <motion.div
                      key={url}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className={cn(
                        "relative aspect-square rounded-2xl overflow-hidden glass transition-all duration-300 group border-2 cursor-pointer",
                        (isSynced || isIgnored) ? "border-emerald-500/30" : "border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]",
                        isSelected && "ring-2 ring-indigo-500/60"
                      )}
                      onClick={() => toggleSelected(url, !isSelected)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleSelected(url, !isSelected);
                        }
                      }}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover pointer-events-none" />

                      {/* Selection checkbox overlay */}
                      <label
                        className="absolute top-2 right-2 z-30 p-2 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-2 cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-zinc-500 text-indigo-500 focus:ring-indigo-500 bg-transparent"
                          checked={isSelected}
                          onChange={(e) => toggleSelected(url, e.target.checked)}
                        />
                      </label>

                      {/* URL Display */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedUrl(isFullVisible ? null : url);
                        }}
                        className={cn(
                          "absolute bottom-0 left-0 right-0 p-2 bg-black/60 backdrop-blur-md text-[10px] text-zinc-300 font-mono transition-all cursor-pointer z-20",
                          isFullVisible ? "h-auto break-all whitespace-normal" : "truncate h-8 flex items-center"
                        )}
                      >
                        {url}
                      </div>

                      {/* Sync Status Badge */}
                      {!isSynced && !isIgnored && (
                        <div className="absolute top-2 left-2 p-1.5 rounded-lg bg-amber-500 text-white shadow-lg z-20">
                          <AlertTriangle className="w-3 h-3" />
                        </div>
                      )}

                      {/* Overlay Actions (kept for parity with non-selection mode) */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3 z-20 pointer-events-none">
                        <div className="flex justify-between items-start pointer-events-auto">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setThumbnail(url);
                            }}
                            className={cn(
                              "p-1.5 rounded-lg transition-all",
                              isThumbnail
                                ? "bg-amber-500 text-white shadow-lg scale-110"
                                : "bg-white/10 text-white/50 hover:text-white hover:bg-white/20"
                            )}
                          >
                            <Star className={cn("w-4 h-4", isThumbnail && "fill-white")} />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeImage(url);
                            }}
                            className="bg-red-500/80 hover:bg-red-500 text-white p-1.5 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex flex-col gap-2 mb-6 pointer-events-auto">
                          {!isSynced && (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5 backdrop-blur-md border border-white/10">
                                <input
                                  type="checkbox"
                                  checked={isIgnored}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleIgnoreSync(url);
                                  }}
                                  className="w-4 h-4 rounded border-zinc-500 text-indigo-500 focus:ring-indigo-500 bg-transparent"
                                />
                                <span className="text-[10px] font-bold text-zinc-300 uppercase">Ignore Sync</span>
                              </div>

                              {!isIgnored && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSyncToBucket(url);
                                  }}
                                  disabled={isSyncing}
                                  className="w-full bg-white/10 hover:bg-indigo-500 text-white py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 backdrop-blur-md transition-all border border-white/10"
                                >
                                  {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cloud className="w-3 h-3" />}
                                  {isSyncing ? 'Syncing...' : 'Push to R2'}
                                </button>
                              )}
                            </div>
                          )}

                          {(isSynced || isIgnored) && (
                            <div
                              className={cn(
                                "w-full py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 backdrop-blur-md border",
                                isSynced
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                  : "bg-indigo-500/20 text-indigo-400 border-indigo-500/30"
                              )}
                            >
                              <Check className="w-3 h-3" />
                              {isSynced ? 'Vaulted' : 'Pinned External'}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <Reorder.Group
              axis="y"
              values={images}
              onReorder={reorderImages}
              className="grid grid-cols-2 sm:grid-cols-3 gap-4"
            >
              <AnimatePresence>
                {images.map((url) => {
                  const isSynced =
                    url.includes(process.env.NEXT_PUBLIC_S3_FILE_URL || 'r2.dev') || url.includes('cloudflarestorage.com');
                  const isIgnored = ignoredUrls.includes(url);
                  const isSyncing = syncingUrls.includes(url);
                  const isThumbnail = url === thumbnail;
                  const isFullVisible = expandedUrl === url;

                  return (
                    <Reorder.Item
                      key={url}
                      value={url}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className={cn(
                        "relative aspect-square rounded-2xl overflow-hidden glass transition-all duration-300 group cursor-grab active:cursor-grabbing border-2",
                        (isSynced || isIgnored)
                          ? "border-emerald-500/30"
                          : "border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                      )}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover pointer-events-none" />

                      {/* URL Display */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedUrl(isFullVisible ? null : url);
                        }}
                        className={cn(
                          "absolute bottom-0 left-0 right-0 p-2 bg-black/60 backdrop-blur-md text-[10px] text-zinc-300 font-mono transition-all cursor-pointer z-10",
                          isFullVisible ? "h-auto break-all whitespace-normal" : "truncate h-8 flex items-center"
                        )}
                      >
                        {url}
                      </div>

                      {/* Reorder Handle */}
                      <div className="absolute top-2 left-2 p-1.5 rounded-lg bg-black/40 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity z-20">
                        <GripVertical className="w-4 h-4 text-white/70" />
                      </div>

                      {/* Sync Status Badge (Mobile visible, Desktop hover) */}
                      {!isSynced && !isIgnored && (
                        <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-amber-500 text-white shadow-lg md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20">
                          <AlertTriangle className="w-3 h-3" />
                        </div>
                      )}

                      {/* Overlay Actions */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3 z-30">
                        <div className="flex justify-between items-start">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setThumbnail(url);
                            }}
                            className={cn(
                              "p-1.5 rounded-lg transition-all",
                              isThumbnail
                                ? "bg-amber-500 text-white shadow-lg scale-110"
                                : "bg-white/10 text-white/50 hover:text-white hover:bg-white/20"
                            )}
                          >
                            <Star className={cn("w-4 h-4", isThumbnail && "fill-white")} />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeImage(url);
                            }}
                            className="bg-red-500/80 hover:bg-red-500 text-white p-1.5 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex flex-col gap-2 mb-6">
                          {!isSynced && (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5 backdrop-blur-md border border-white/10">
                                <input
                                  type="checkbox"
                                  checked={isIgnored}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleIgnoreSync(url);
                                  }}
                                  className="w-4 h-4 rounded border-zinc-500 text-indigo-500 focus:ring-indigo-500 bg-transparent"
                                />
                                <span className="text-[10px] font-bold text-zinc-300 uppercase">Ignore Sync</span>
                              </div>

                              {!isIgnored && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSyncToBucket(url);
                                  }}
                                  disabled={isSyncing}
                                  className="w-full bg-white/10 hover:bg-indigo-500 text-white py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 backdrop-blur-md transition-all border border-white/10"
                                >
                                  {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cloud className="w-3 h-3" />}
                                  {isSyncing ? 'Syncing...' : 'Push to R2'}
                                </button>
                              )}
                            </div>
                          )}

                          {(isSynced || isIgnored) && (
                            <div
                              className={cn(
                                "w-full py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 backdrop-blur-md border",
                                isSynced
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                  : "bg-indigo-500/20 text-indigo-400 border-indigo-500/30"
                              )}
                            >
                              <Check className="w-3 h-3" />
                              {isSynced ? 'Vaulted' : 'Pinned External'}
                            </div>
                          )}
                        </div>
                      </div>
                    </Reorder.Item>
                  );
                })}
              </AnimatePresence>
            </Reorder.Group>
          )}
            
          {images.length === 0 && (
            <div className="py-20 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center text-zinc-600 gap-2">
              <ImagePlus className="w-12 h-12" />
              <p>No images yet. Start by importing URLs.</p>
            </div>
          )}

          {/* Vault Indicator */}
          {images.length >= 3 && images.length <= 6 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Check className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">High-Performance Vault Active</p>
                <p className="text-xs text-zinc-400">Optimized frontend gallery delivery enabled (3-6 assets).</p>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* AI Studio Photo Modal */}
      <AnimatePresence>
        {isStudioModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70"
            onClick={() => setIsStudioModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              className="w-full max-w-5xl glass-dark bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 space-y-6"
              onClick={(e) => e.stopPropagation()}
            >
              <AiStudioPhotoModalBody
                selectedImageUrls={selectedImageUrls}
                onRemoveSelected={(url) => toggleSelected(url, false)}
                onClose={() => setIsStudioModalOpen(false)}
                onAddOutputs={(urls) => {
                  // Best-effort immediate UI update; backend will also persist/attach.
                  if (urls.length === 0) return;
                  setImages([...new Set([...images, ...urls])]);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AiStudioPhotoModalBody(props: {
  selectedImageUrls: string[];
  onRemoveSelected: (url: string) => void;
  onAddOutputs: (urls: string[]) => void;
  onClose: () => void;
}) {
  const { selectedImageUrls, onRemoveSelected, onAddOutputs, onClose } = props;
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

  // Provider overrides (defaults will be wired from Settings in a later todo).
  const [provider, setProvider] = useState<ProviderId>('openai');
  const [providerModel, setProviderModel] = useState<string>('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generations, setGenerations] = useState<StudioGeneration[]>([]);
  const [lastRequestFingerprint, setLastRequestFingerprint] = useState<string>('');

  // Canonical options (powered by PROMPT_LIBRARY_JSON as required).
  const setups = effectiveLibrary.setups;
  const models = effectiveLibrary.models;

  /**
   * Setup filtering rules:
   * - Always filter by jewelryType (per prompt library).
   * - If a human model is selected, prefer \"wearable\" setups when they exist for that jewelryType
   *   (e.g., ring mannequin-hand). If no wearable setups exist, keep all setups.
   * - If no model is selected, hide wearable setups when they exist (keeps product-only setups clean).
   *
   * This matches the UX requirement that \"setup differs\" between model vs no-model.
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
    const p = settings.aiImageProvider;
    if (p === 'openai' || p === 'fal' || p === 'gemini') {
      setProvider(p);
    }
    if (!providerModel && settings.aiImageModel) {
      setProviderModel(settings.aiImageModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.aiImageProvider, settings.aiImageModel]);

  // If selection becomes empty while modal is open, close it.
  useEffect(() => {
    if (selectedImageUrls.length === 0) onClose();
  }, [selectedImageUrls.length, onClose]);

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

  const canGenerate = selectedImageUrls.length > 0 && setupId.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            AI Studio Photo Generator
          </h3>
          <p className="text-xs text-zinc-500">
            {selectedImageUrls.length} input image{selectedImageUrls.length === 1 ? '' : 's'} selected
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: selected preview strip */}
        <div className="lg:col-span-4 space-y-3">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Selected images</div>
          <div className="max-h-[420px] overflow-auto pr-1 space-y-3">
            {selectedImageUrls.map((url) => (
              <div
                key={url}
                className="flex items-center gap-3 p-2 rounded-xl bg-zinc-900/40 border border-white/10"
              >
                <div className="w-14 h-14 rounded-lg overflow-hidden border border-white/10 bg-black/30 shrink-0">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] text-zinc-400 font-mono truncate">{url}</div>
                </div>
                <button
                  onClick={() => onRemoveSelected(url)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-red-500/10 text-zinc-400 hover:text-red-300 transition-all"
                  title="Remove from selection"
                  aria-label="Remove from selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: controls + actions + results */}
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Jewelry Type</span>
              <select
                className="w-full px-3 py-2 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                value={jewelryType}
                onChange={(e) => setJewelryType(e.target.value as JewelryType)}
              >
                {(effectiveLibrary.jewelryTypes as readonly string[]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Model</span>
              <select
                className="w-full px-3 py-2 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                value={modelId}
                onChange={(e) => setModelId(e.target.value as ModelId)}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Setup</span>
              <select
                className="w-full px-3 py-2 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                value={setupId}
                onChange={(e) => setSetupId(e.target.value)}
              >
                {filteredSetups.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Provider</span>
              <select
                className="w-full px-3 py-2 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                value={provider}
                onChange={(e) => setProvider(e.target.value as ProviderId)}
              >
                <option value="openai">openai</option>
                <option value="fal">fal</option>
                <option value="gemini">gemini</option>
              </select>
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Provider Model (optional override)</span>
              <input
                className="w-full px-3 py-2 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/30 font-mono"
                placeholder={
                  provider === 'gemini'
                    ? 'models/gemini-3-pro-image-preview'
                    : provider === 'fal'
                      ? 'fal-ai/flux/dev/image-to-image'
                      : 'gpt-image-1'
                }
                value={providerModel}
                onChange={(e) => setProviderModel(e.target.value)}
              />
            </label>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/40 border border-white/10">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-zinc-500 text-indigo-500 focus:ring-indigo-500 bg-transparent"
                  checked={macro}
                  onChange={(e) => setMacro(e.target.checked)}
                />
                <span className="text-xs text-zinc-300 font-semibold">Macro close-up</span>
              </label>
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/40 border border-white/10">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-zinc-500 text-indigo-500 focus:ring-indigo-500 bg-transparent"
                  checked={noFingerprints}
                  onChange={(e) => setNoFingerprints(e.target.checked)}
                />
                <span className="text-xs text-zinc-300 font-semibold">No fingerprints / dust</span>
              </label>
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/40 border border-white/10">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-zinc-500 text-indigo-500 focus:ring-indigo-500 bg-transparent"
                  checked={extraRimLight}
                  onChange={(e) => setExtraRimLight(e.target.checked)}
                />
                <span className="text-xs text-zinc-300 font-semibold">Extra rim light</span>
              </label>
            </div>

            <label className="md:col-span-2 space-y-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                Background darkness <span className="text-zinc-600">({darkness})</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={darkness}
                onChange={(e) => setDarkness(parseInt(e.target.value, 10) || 0)}
                className="w-full"
              />
              <p className="text-[10px] text-zinc-600">
                Subtle control only—keeps the industrial mood consistent.
              </p>
            </label>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={() => runGenerate(1)}
                disabled={!canGenerate || isGenerating}
                className="px-5 py-3 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition-all text-sm font-semibold flex items-center gap-2 disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generate
              </button>
              <button
                onClick={() => runGenerate(3)}
                disabled={!canGenerate || isGenerating}
                className="px-5 py-3 rounded-xl bg-white/5 text-white hover:bg-white/10 transition-all text-sm font-semibold border border-white/10 disabled:text-zinc-500"
              >
                Generate Variants
              </button>
            </div>
            <button
              onClick={onClose}
              className="px-5 py-3 rounded-xl bg-white/5 text-zinc-200 hover:bg-white/10 transition-all text-sm font-semibold border border-white/10"
            >
              Cancel
            </button>
          </div>

          {/* Results */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Results</div>
              <button
                onClick={() => {
                  // Regenerate with identical settings to last request (variants inferred from last fingerprint if present).
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
                      <div className="aspect-square bg-black/30">
                        <img src={g.outputImageUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                          Added to product media
                        </div>
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
      </div>
    </div>
  );
}
