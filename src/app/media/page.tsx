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
  Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function MediaPage() {
  const { images, setImages, thumbnail } = useProductStore();
  const [bulkUrls, setBulkUrls] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [syncingUrls, setSyncingUrls] = useState<string[]>([]);
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
        // 1. Get presigned URL
        const res = await fetch('/api/media/presigned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, contentType: file.type }),
        });
        
        const { presignedUrl, publicUrl } = await res.json();

        // 2. Upload directly to R2
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
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <AnimatePresence>
              {images.map((url, idx) => {
                const isSynced = url.includes(process.env.NEXT_PUBLIC_S3_FILE_URL || 'r2.dev');
                const isSyncing = syncingUrls.includes(url);
                const isThumbnail = url === thumbnail;

                return (
                  <motion.div 
                    key={url}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="relative aspect-square rounded-2xl overflow-hidden glass border border-white/10 group"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    
                    {/* Overlay Actions */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
                      <div className="flex justify-between items-start">
                        {isThumbnail ? (
                          <div className="bg-amber-500 text-white p-1.5 rounded-lg shadow-lg">
                            <Star className="w-4 h-4 fill-white" />
                          </div>
                        ) : <div />}
                        <button 
                          onClick={() => removeImage(url)}
                          className="bg-red-500/80 hover:bg-red-500 text-white p-1.5 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex justify-center gap-2">
                        {!isSynced && (
                          <button 
                            onClick={() => handleSyncToBucket(url)}
                            disabled={isSyncing}
                            className="w-full bg-white/10 hover:bg-indigo-500 text-white py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-2 backdrop-blur-md transition-all border border-white/10"
                          >
                            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                            {isSyncing ? 'Syncing...' : 'Sync to R2'}
                          </button>
                        )}
                        {isSynced && (
                          <div className="w-full bg-emerald-500/20 text-emerald-400 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-2 backdrop-blur-md border border-emerald-500/30">
                            <Check className="w-4 h-4" />
                            Vaulted
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            
            {images.length === 0 && (
              <div className="col-span-full py-20 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center text-zinc-600 gap-2">
                <ImagePlus className="w-12 h-12" />
                <p>No images yet. Start by importing URLs.</p>
              </div>
            )}
          </div>

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

