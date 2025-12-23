'use client';

import React, { useState, useRef } from 'react';
import { useProductStore } from '@/store/useProductStore';
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
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence, Reorder } from 'framer-motion';

export default function MediaPage() {
  const { images, reorderImages, setThumbnail, setImages, thumbnail, ignoredUrls, toggleIgnoreSync } = useProductStore();
  const [bulkUrls, setBulkUrls] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [syncingUrls, setSyncingUrls] = useState<string[]>([]);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold">
              <span className="flex items-center gap-1 text-emerald-500">
                <div className="w-2 h-2 rounded-full bg-emerald-500" /> Synced
              </span>
              <span className="flex items-center gap-1 text-amber-500">
                <div className="w-2 h-2 rounded-full bg-amber-500" /> Unsynced
              </span>
            </div>
          </div>

          <Reorder.Group 
            axis="y" 
            values={images} 
            onReorder={reorderImages}
            className="grid grid-cols-2 sm:grid-cols-3 gap-4"
          >
            <AnimatePresence>
              {images.map((url) => {
                const isSynced = url.includes(process.env.NEXT_PUBLIC_S3_FILE_URL || 'r2.dev') || url.includes('cloudflarestorage.com');
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
                      (isSynced || isIgnored) ? "border-emerald-500/30" : "border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
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
                          <div className={cn(
                            "w-full py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 backdrop-blur-md border",
                            isSynced ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-indigo-500/20 text-indigo-400 border-indigo-500/30"
                          )}>
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
    </div>
  );
}
