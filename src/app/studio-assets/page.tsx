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
  MoreVertical,
  Layers,
} from 'lucide-react';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/lib/mobile-utils';
import { PROMPT_LIBRARY_JSON } from '@/lib/ai/promptLibrary';

// ─── Types ────────────────────────────────────────────────────────────────────

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

type MasterReference = {
  id: string;
  jewelry_type: string;
  master_key: string;
  public_url: string;
  label: string | null;
  created_at: string;
};

type StudioAssetListResponse = {
  assets: StudioAsset[];
  total: number;
  limit: number;
  offset: number;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudioAssetsPage() {
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [masters, setMasters] = useState<MasterReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<'all' | 'model' | 'studio' | 'masters'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [mobileActionSheetAssetId, setMobileActionSheetAssetId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const isMobile = useIsMobile();

  const fetchMasters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/studio-masters');
      if (!res.ok) throw new Error('Failed to fetch masters');
      const data: { masters: MasterReference[] } = await res.json();
      setMasters(data.masters);
    } catch (error) {
      console.error('Failed to fetch masters:', error);
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (selectedType === 'masters') {
      fetchMasters();
    } else {
      fetchAssets();
    }
  }, [selectedType, fetchAssets, fetchMasters]);

  const handleDeleteAsset = async (id: string) => {
    if (!confirm('Are you sure you want to delete this asset?')) return;
    try {
      const res = await fetch(`/api/studio-assets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete asset');
      setAssets((prev) => prev.filter((a) => a.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to delete asset:', error);
      alert('Failed to delete asset. Please try again.');
    }
  };

  const handleDeleteMaster = async (id: string) => {
    if (!confirm('Are you sure you want to delete this master reference?')) return;
    try {
      const res = await fetch(`/api/studio-masters/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete master reference');
      setMasters((prev) => prev.filter((m) => m.id !== id));
    } catch (error) {
      console.error('Failed to delete master:', error);
      alert('Failed to delete master reference. Please try again.');
    }
  };

  const handleUploadSuccess = (uploadedType: 'model' | 'studio' | 'master') => {
    setIsUploadModalOpen(false);
    if (uploadedType === 'master') {
      setSelectedType('masters');
      fetchMasters();
    } else {
      fetchAssets();
    }
  };

  const filteredAssets = assets.filter((asset) => {
    if (selectedType !== 'all' && selectedType !== 'masters' && asset.type !== selectedType) return false;
    if (searchQuery && !asset.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Group masters by jewelry_type for display
  const mastersByType = masters.reduce<Record<string, MasterReference[]>>((acc, m) => {
    if (!acc[m.jewelry_type]) acc[m.jewelry_type] = [];
    acc[m.jewelry_type].push(m);
    return acc;
  }, {});
  const jewelryTypes = PROMPT_LIBRARY_JSON.jewelryTypes as readonly string[];

  return (
    <div className="space-y-6 md:space-y-10 pb-20 md:pb-20">
      <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />

      <header className="space-y-2 md:space-y-4">
        <h1 className={cn('font-bold text-white flex items-center gap-2 md:gap-3', isMobile ? 'text-2xl' : 'text-3xl')}>
          <UserCircle className={cn('text-indigo-400', isMobile ? 'w-6 h-6' : 'w-8 h-8')} />
          Studio Assets Library
        </h1>
        <p className={cn('text-zinc-400', isMobile ? 'text-sm' : 'text-base')}>
          Upload and manage model photos, studio environments, and master reference images for AI Studio Photo generation.
        </p>
      </header>

      {/* Controls */}
      <div className="flex flex-col gap-3 md:gap-4">
        {/* Filter Tabs */}
        <div className={cn('flex gap-2', isMobile && 'w-full flex-wrap')}>
          {(['all', 'model', 'studio', 'masters'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setSelectedType(tab);
                setOffset(0);
              }}
              className={cn(
                'touch-target rounded-xl font-medium transition-all capitalize',
                isMobile ? 'flex-1 px-3 py-3 text-sm' : 'px-4 py-2 text-sm',
                selectedType === tab
                  ? tab === 'masters'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                  : 'bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 border border-white/10'
              )}
            >
              {tab === 'masters' ? (
                <span className="flex items-center gap-1.5 justify-center">
                  <Layers className="w-3.5 h-3.5" />
                  Masters
                </span>
              ) : (
                tab === 'all' ? 'All' : tab === 'model' ? 'Models' : 'Studios'
              )}
            </button>
          ))}
        </div>

        {/* Search + Upload row — hide search on Masters tab */}
        <div className={cn('flex gap-3', isMobile ? 'flex-col' : 'items-center')}>
          {selectedType !== 'masters' && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search assets..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setOffset(0);
                }}
                className={cn(
                  'w-full pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30',
                  isMobile ? 'py-3 text-base' : 'py-2 text-sm'
                )}
              />
            </div>
          )}

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className={cn(
              'touch-target-large rounded-xl text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg',
              selectedType === 'masters'
                ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20 flex-1 md:flex-none'
                : 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/20',
              isMobile ? 'w-full px-6 py-4 text-base' : 'px-6 py-2 text-sm'
            )}
          >
            <Upload className={cn(isMobile ? 'w-5 h-5' : 'w-4 h-4')} />
            {selectedType === 'masters' ? 'Upload Master' : 'Upload'}
          </button>
        </div>
      </div>

      {/* ── Masters view ─────────────────────────────────────────────────────── */}
      {selectedType === 'masters' ? (
        loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          </div>
        ) : masters.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <Layers className="w-16 h-16 text-zinc-700 mx-auto" />
            <h3 className="text-xl font-semibold text-zinc-400">No master references yet</h3>
            <p className="text-zinc-500 max-w-md mx-auto">
              Master references are style-anchor images sent to Gemini alongside the product photo.
              Upload one per jewelry type / setup combination.
            </p>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="mt-4 px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium transition-all"
            >
              Upload Master Reference
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {jewelryTypes.map((jt) => {
              const group = mastersByType[jt];
              if (!group?.length) return null;
              return (
                <div key={jt} className="space-y-3">
                  <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider capitalize">
                    {jt}
                  </h2>
                  <div className={cn(
                    'grid gap-3 md:gap-4',
                    isMobile ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
                  )}>
                    {group.map((master) => (
                      <MasterCard
                        key={master.id}
                        master={master}
                        onPreview={(url) => setLightboxUrl(url)}
                        onDelete={() => handleDeleteMaster(master.id)}
                        isMobile={isMobile}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* ── Assets view ──────────────────────────────────────────────────── */
        loading ? (
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
          <div className={cn(
            'grid gap-3 md:gap-4',
            isMobile ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
          )}>
            <AnimatePresence mode="popLayout">
              {filteredAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onPreview={(url) => setLightboxUrl(url)}
                  onDelete={() => handleDeleteAsset(asset.id)}
                  onActionSheet={() => setMobileActionSheetAssetId(asset.id)}
                  isMobile={isMobile}
                />
              ))}
            </AnimatePresence>
          </div>
        )
      )}

      {/* Mobile Action Sheet (assets only) */}
      {isMobile && mobileActionSheetAssetId && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[90]"
            onClick={() => setMobileActionSheetAssetId(null)}
          />
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed inset-x-0 bottom-0 z-[100] glass-dark border-t border-white/10 rounded-t-2xl p-4 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-1 bg-white/20 rounded-full" />
            </div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  const asset = assets.find((a) => a.id === mobileActionSheetAssetId);
                  if (asset) {
                    setLightboxUrl(asset.image_url);
                    setMobileActionSheetAssetId(null);
                  }
                }}
                className="w-full touch-target-large flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all"
              >
                <ImageIcon className="w-5 h-5" />
                <span>View</span>
              </button>
              <button
                onClick={() => {
                  if (mobileActionSheetAssetId) {
                    handleDeleteAsset(mobileActionSheetAssetId);
                    setMobileActionSheetAssetId(null);
                  }
                }}
                className="w-full touch-target-large flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 transition-all"
              >
                <Trash2 className="w-5 h-5" />
                <span>Delete</span>
              </button>
              <button
                onClick={() => setMobileActionSheetAssetId(null)}
                className="w-full touch-target-large flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition-all mt-4"
              >
                <span>Cancel</span>
              </button>
            </div>
          </motion.div>
        </>
      )}

      {/* Pagination (assets only) */}
      {selectedType !== 'masters' && total > limit && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 rounded-xl bg-white/5 text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Previous
          </button>
          <span className="text-zinc-400 text-sm">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
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
          defaultType={selectedType === 'masters' ? 'master' : 'model'}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}

// ─── AssetCard ────────────────────────────────────────────────────────────────

function AssetCard({
  asset,
  onPreview,
  onDelete,
  onActionSheet,
  isMobile = false,
}: {
  asset: StudioAsset;
  onPreview: (url: string) => void;
  onDelete: () => void;
  onActionSheet?: () => void;
  isMobile?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      onMouseEnter={() => !isMobile && setIsHovered(true)}
      onMouseLeave={() => !isMobile && setIsHovered(false)}
      className={cn(
        'relative group rounded-xl overflow-hidden bg-zinc-900/40 border border-white/10',
        isMobile ? 'aspect-square' : 'aspect-square cursor-pointer'
      )}
    >
      <img
        src={asset.thumbnail_url || asset.image_url}
        alt={asset.name}
        className="w-full h-full object-cover"
        onClick={() => onPreview(asset.image_url)}
        loading="lazy"
        decoding="async"
      />

      {/* Mobile: Action button */}
      {isMobile && onActionSheet && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onActionSheet();
          }}
          className="absolute top-3 right-3 touch-target-large p-2 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-white z-30"
          aria-label="Asset actions"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      )}

      {/* Desktop: Overlay */}
      {!isMobile && (
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
      )}

      {/* Badge */}
      <div className="absolute top-2 left-2">
        <span
          className={cn(
            'px-2 py-1 rounded-lg text-xs font-medium',
            asset.type === 'model'
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
          )}
        >
          {asset.type}
        </span>
      </div>

      {/* Name */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
        <p className="text-white font-medium truncate text-sm">{asset.name}</p>
      </div>
    </motion.div>
  );
}

// ─── MasterCard ───────────────────────────────────────────────────────────────

function MasterCard({
  master,
  onPreview,
  onDelete,
  isMobile = false,
}: {
  master: MasterReference;
  onPreview: (url: string) => void;
  onDelete: () => void;
  isMobile?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      onMouseEnter={() => !isMobile && setIsHovered(true)}
      onMouseLeave={() => !isMobile && setIsHovered(false)}
      className="relative group rounded-xl overflow-hidden bg-zinc-900/40 border border-amber-500/20 aspect-square cursor-pointer"
    >
      <img
        src={master.public_url}
        alt={master.label ?? master.master_key}
        className="w-full h-full object-cover"
        onClick={() => onPreview(master.public_url)}
        loading="lazy"
        decoding="async"
      />

      {/* Desktop: Overlay */}
      {!isMobile && (
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
                  onPreview(master.public_url);
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
      )}

      {/* Mobile delete button */}
      {isMobile && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-3 right-3 touch-target-large p-2 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-white z-30"
          aria-label="Delete master"
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      )}

      {/* Badge */}
      <div className="absolute top-2 left-2">
        <span className="px-2 py-1 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
          master
        </span>
      </div>

      {/* Name */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
        <p className="text-white font-medium truncate text-sm">
          {master.label ?? master.master_key.replace(/_/g, ' ')}
        </p>
      </div>
    </motion.div>
  );
}

// ─── UploadModal ──────────────────────────────────────────────────────────────

function UploadModal({
  defaultType,
  onClose,
  onSuccess,
}: {
  defaultType: 'model' | 'studio' | 'master';
  onClose: () => void;
  onSuccess: (type: 'model' | 'studio' | 'master') => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [type, setType] = useState<'model' | 'studio' | 'master'>(defaultType);
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  // Master-specific fields
  const [masterJewelryType, setMasterJewelryType] = useState<string>(
    PROMPT_LIBRARY_JSON.jewelryTypes[0]
  );
  const [masterKey, setMasterKey] = useState<string>('');
  const [masterLabel, setMasterLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  // Derive available master keys for the selected jewelry type
  const availableMasterKeys = PROMPT_LIBRARY_JSON.setups
    .filter((s) => s.jewelryType === masterJewelryType)
    .map((s) => ({ key: (s as typeof s & { masterKey: string }).masterKey, title: s.title }));

  // Reset masterKey when jewelry type changes
  useEffect(() => {
    setMasterKey(availableMasterKeys[0]?.key ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterJewelryType]);

  // Initialise masterKey on first render
  useEffect(() => {
    if (!masterKey && availableMasterKeys.length > 0) {
      setMasterKey(availableMasterKeys[0].key);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/')) {
      setError('Only image files are supported');
      return;
    }

    const maxMB = type === 'master' ? 20 : 10;
    if (selectedFile.size > maxMB * 1024 * 1024) {
      setError(`File size must be less than ${maxMB}MB`);
      return;
    }

    setFile(selectedFile);
    setError(null);
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
    if (!name) setName(selectedFile.name.replace(/\.[^/.]+$/, ''));
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
    if (!file) { setError('Please select a file'); return; }

    if (type === 'master') {
      if (!masterJewelryType) { setError('Please select a jewelry type'); return; }
      if (!masterKey) { setError('Please select a setup / master key'); return; }
    } else {
      if (!name.trim()) { setError('Please enter a name'); return; }
    }

    setUploading(true);
    setError(null);

    try {
      if (type === 'master') {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('jewelry_type', masterJewelryType);
        formData.append('master_key', masterKey);
        if (masterLabel.trim()) formData.append('label', masterLabel.trim());

        const res = await fetch('/api/studio-masters/upload', { method: 'POST', body: formData });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload failed');
        }
      } else {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        formData.append('name', name.trim());
        if (tags.length > 0) formData.append('tags', JSON.stringify(tags));

        const res = await fetch('/api/studio-assets/upload', { method: 'POST', body: formData });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload failed');
        }
      }

      onSuccess(type);
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

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={isMobile ? { opacity: 0, y: '100%' } : { opacity: 0, scale: 0.95 }}
        animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, scale: 1 }}
        exit={isMobile ? { opacity: 0, y: '100%' } : { opacity: 0, scale: 0.95 }}
        transition={isMobile ? { type: 'spring', damping: 25, stiffness: 200 } : {}}
        className={cn(
          'w-full bg-zinc-900 rounded-2xl border border-white/10 space-y-4 md:space-y-6 overflow-y-auto',
          isMobile
            ? 'fixed inset-x-0 bottom-0 rounded-t-2xl p-4 pb-safe max-h-[90vh]'
            : 'max-w-2xl p-6 max-h-[90vh]'
        )}
      >
        <div className="flex items-center justify-between">
          <h2 className={cn('font-bold text-white', isMobile ? 'text-xl' : 'text-2xl')}>
            {type === 'master' ? 'Upload Master Reference' : 'Upload Studio Asset'}
          </h2>
          <button
            onClick={onClose}
            className={cn(
              'rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all touch-target',
              isMobile ? 'p-3' : 'p-2'
            )}
          >
            <X className={cn(isMobile ? 'w-6 h-6' : 'w-5 h-5')} />
          </button>
        </div>

        {/* File Upload Area */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className={cn(
            'border-2 border-dashed rounded-xl text-center transition-all cursor-pointer',
            type === 'master'
              ? 'border-amber-500/30 hover:border-amber-500/60'
              : 'border-white/20 hover:border-indigo-500/50',
            isMobile ? 'p-8 min-h-[200px] flex items-center justify-center' : 'p-12'
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
          {preview ? (
            <div className="space-y-4">
              <img src={preview} alt="Preview" className={cn('mx-auto rounded-lg', isMobile ? 'max-h-48' : 'max-h-64')} loading="eager" />
              <p className={cn('text-zinc-400', isMobile ? 'text-xs' : 'text-sm')}>{file?.name}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Upload className={cn('mx-auto', isMobile ? 'w-10 h-10' : 'w-12 h-12', type === 'master' ? 'text-amber-500/50' : 'text-zinc-500')} />
              <div>
                <p className={cn('text-white font-medium', isMobile ? 'text-sm' : 'text-base')}>
                  Drop an image here or click to browse
                </p>
                <p className={cn('text-zinc-500 mt-1', isMobile ? 'text-xs' : 'text-sm')}>
                  PNG, JPG, WebP up to {type === 'master' ? '20' : '10'}MB
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Type Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Type</label>
          <div className={cn('flex gap-3 md:gap-4', isMobile && 'flex-col')}>
            {(['model', 'studio', 'master'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  'flex-1 rounded-xl border transition-all touch-target-large capitalize',
                  isMobile ? 'px-4 py-4 text-base' : 'px-4 py-3 text-sm',
                  type === t
                    ? t === 'master'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Master-specific fields */}
        {type === 'master' ? (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Jewelry Type</label>
              <select
                value={masterJewelryType}
                onChange={(e) => setMasterJewelryType(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/30 text-sm"
              >
                {PROMPT_LIBRARY_JSON.jewelryTypes.map((jt) => (
                  <option key={jt} value={jt} className="bg-zinc-900 capitalize">
                    {jt.charAt(0).toUpperCase() + jt.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Setup (Shot Type)</label>
              <select
                value={masterKey}
                onChange={(e) => setMasterKey(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/30 text-sm"
              >
                {availableMasterKeys.map(({ key, title }) => (
                  <option key={key} value={key} className="bg-zinc-900">
                    {title}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500">
                This image will be used as the style anchor when generating with this setup.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Label (optional)</label>
              <input
                type="text"
                value={masterLabel}
                onChange={(e) => setMasterLabel(e.target.value)}
                placeholder="e.g. v2 — January 2026"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/30 text-sm"
              />
            </div>
          </>
        ) : (
          <>
            {/* Asset Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter asset name"
                className={cn(
                  'w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30 touch-target',
                  isMobile ? 'px-4 py-3 text-base' : 'px-4 py-3 text-sm'
                )}
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
                    <span key={tag} className="px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 text-sm flex items-center gap-2">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className={cn(
          'flex gap-3 md:gap-4',
          isMobile && 'sticky bottom-0 bg-zinc-900 pt-4 pb-safe -mx-4 px-4 border-t border-white/10'
        )}>
          <button
            onClick={onClose}
            className={cn(
              'flex-1 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all touch-target-large',
              isMobile ? 'px-6 py-4 text-base' : 'px-6 py-3 text-sm'
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading || (type !== 'master' && !name.trim())}
            className={cn(
              'flex-1 rounded-xl text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-target-large',
              isMobile ? 'px-6 py-4 text-base' : 'px-6 py-3 text-sm',
              type === 'master'
                ? 'bg-amber-500 hover:bg-amber-600'
                : 'bg-indigo-500 hover:bg-indigo-600'
            )}
          >
            {uploading ? (
              <>
                <Loader2 className={cn('animate-spin', isMobile ? 'w-5 h-5' : 'w-4 h-4')} />
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
