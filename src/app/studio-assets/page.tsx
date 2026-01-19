'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { 
  UserCircle, 
  Upload, 
  Search, 
  X, 
  Trash2,
  ImageIcon,
  Loader2,
  Filter
} from 'lucide-react';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

type StudioAsset = {
  id: string;
  type: 'model' | 'studio';
  name: string;
  image_url: string;
  thumbnail_url?: string;
  metadata?: {
    tags?: string[];
    description?: string;
  };
  created_at: string;
};

type StudioAssetListResponse = {
  assets: StudioAsset[];
  total: number;
  limit: number;
  offset: number;
};

export default function StudioAssetsPage() {
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState<'all' | 'model' | 'studio'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedType !== 'all') {
        params.set('type', selectedType);
      }
      if (searchQuery) {
        params.set('search', searchQuery);
      }
      params.set('limit', limit.toString());
      params.set('offset', offset.toString());

      const res = await fetch(`/api/studio-assets?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch assets');
      
      const data: StudioAssetListResponse = await res.json();
      setAssets(data.assets);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to fetch assets:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedType, searchQuery, offset]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this asset?')) return;
    
    try {
      const res = await fetch(`/api/studio-assets/${id}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) throw new Error('Failed to delete asset');
      
      // Remove from local state
      setAssets(prev => prev.filter(a => a.id !== id));
      setTotal(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to delete asset:', error);
      alert('Failed to delete asset. Please try again.');
    }
  };

  const handleUploadSuccess = () => {
    setIsUploadModalOpen(false);
    fetchAssets(); // Refresh list
  };

  const filteredAssets = assets.filter(asset => {
    if (selectedType !== 'all' && asset.type !== selectedType) return false;
    if (searchQuery && !asset.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-10 pb-20">
      <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      
      <header className="space-y-4">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <UserCircle className="text-indigo-400 w-8 h-8" />
          Studio Assets Library
        </h1>
        <p className="text-zinc-400">
          Upload and manage model photos and studio environments for AI Studio Photo generation.
        </p>
      </header>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        {/* Filter Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSelectedType('all');
              setOffset(0);
            }}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium transition-all",
              selectedType === 'all'
                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                : "bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 border border-white/10"
            )}
          >
            All
          </button>
          <button
            onClick={() => {
              setSelectedType('model');
              setOffset(0);
            }}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium transition-all",
              selectedType === 'model'
                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                : "bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 border border-white/10"
            )}
          >
            Models
          </button>
          <button
            onClick={() => {
              setSelectedType('studio');
              setOffset(0);
            }}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium transition-all",
              selectedType === 'studio'
                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                : "bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 border border-white/10"
            )}
          >
            Studios
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setOffset(0);
            }}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30"
          />
        </div>

        {/* Upload Button */}
        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="px-6 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
      </div>

      {/* Asset Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <ImageIcon className="w-16 h-16 text-zinc-700 mx-auto" />
          <h3 className="text-xl font-semibold text-zinc-400">No assets found</h3>
          <p className="text-zinc-500">
            {searchQuery || selectedType !== 'all'
              ? 'Try adjusting your filters or search query.'
              : 'Upload your first model or studio photo to get started.'}
          </p>
          {!searchQuery && selectedType === 'all' && (
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="mt-4 px-6 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-all"
            >
              Upload Asset
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onPreview={(url) => setLightboxUrl(url)}
                onDelete={() => handleDelete(asset.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 rounded-xl bg-white/5 text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Previous
          </button>
          <span className="text-zinc-400 text-sm">
            {offset + 1}-{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 rounded-xl bg-white/5 text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Next
          </button>
        </div>
      )}

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <UploadModal
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}

function AssetCard({
  asset,
  onPreview,
  onDelete,
}: {
  asset: StudioAsset;
  onPreview: (url: string) => void;
  onDelete: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative group aspect-square rounded-xl overflow-hidden bg-zinc-900/40 border border-white/10 cursor-pointer"
    >
      <img
        src={asset.thumbnail_url || asset.image_url}
        alt={asset.name}
        className="w-full h-full object-cover"
        onClick={() => onPreview(asset.image_url)}
      />
      
      {/* Overlay */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPreview(asset.image_url);
              }}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-all"
            >
              View
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isDeleting) {
                  setIsDeleting(true);
                  onDelete();
                }
              }}
              disabled={isDeleting}
              className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium transition-all disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Badge */}
      <div className="absolute top-2 left-2">
        <span className={cn(
          "px-2 py-1 rounded-lg text-xs font-medium",
          asset.type === 'model'
            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
            : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
        )}>
          {asset.type}
        </span>
      </div>

      {/* Name */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
        <p className="text-white text-sm font-medium truncate">{asset.name}</p>
      </div>
    </motion.div>
  );
}

function UploadModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [type, setType] = useState<'model' | 'studio'>('model');
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/')) {
      setError('Only image files are supported');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setFile(selectedFile);
    setError(null);
    
    // Generate preview
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
    
    // Auto-fill name if empty
    if (!name) {
      setName(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const fakeEvent = {
        target: { files: [droppedFile] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(fakeEvent);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    if (!name.trim()) {
      setError('Please enter a name');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      formData.append('name', name.trim());
      if (tags.length > 0) {
        formData.append('tags', JSON.stringify(tags));
      }

      const res = await fetch('/api/studio-assets/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl bg-zinc-900 rounded-2xl border border-white/10 p-6 space-y-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Upload Studio Asset</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File Upload Area */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-white/20 rounded-xl p-12 text-center hover:border-indigo-500/50 transition-all cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          {preview ? (
            <div className="space-y-4">
              <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-lg" />
              <p className="text-zinc-400 text-sm">{file?.name}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Upload className="w-12 h-12 text-zinc-500 mx-auto" />
              <div>
                <p className="text-white font-medium">Drop an image here or click to browse</p>
                <p className="text-zinc-500 text-sm mt-1">PNG, JPG, WebP up to 10MB</p>
              </div>
            </div>
          )}
        </div>

        {/* Type Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Type</label>
          <div className="flex gap-4">
            <button
              onClick={() => setType('model')}
              className={cn(
                "flex-1 px-4 py-3 rounded-xl border transition-all",
                type === 'model'
                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
              )}
            >
              Model
            </button>
            <button
              onClick={() => setType('studio')}
              className={cn(
                "flex-1 px-4 py-3 rounded-xl border transition-all",
                type === 'studio'
                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
              )}
            >
              Studio
            </button>
          </div>
        </div>

        {/* Name Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter asset name"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30"
          />
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Tags (optional)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              placeholder="Add a tag and press Enter"
              className="flex-1 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30"
            />
            <button
              onClick={addTag}
              className="px-4 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 transition-all"
            >
              Add
            </button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 text-sm flex items-center gap-2"
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || !name.trim() || uploading}
            className="flex-1 px-6 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              'Upload'
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
