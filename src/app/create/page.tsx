'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  ImagePlus,
  FileText,
  Link as LinkIcon,
  Upload,
  FileJson,
  X,
  Loader2,
  ArrowRight,
  TestTube,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useProductStore } from '@/store/useProductStore';
import { createClient } from '@/utils/supabase/client';
import { mapExternalToProduct } from '@/lib/mapper';
import { translateAllActiveLanguages } from '@/lib/translations';
import { useToast } from '@/components/ui/ToastProvider';
import { GenerationLogPanel } from '@/components/create/GenerationLogPanel';
import type { IngestStreamEvent } from '@/lib/ingest/stream-types';

interface FileItem {
  id: string;
  file?: File;
  type: 'text' | 'url' | 'file';
  url?: string;
  publicUrl?: string;
  previewUrl?: string;
  name?: string;
  mimeType?: string;
}

export default function CreateProductPage() {
  const router = useRouter();
  const { resetStore, applyMedusaDefaultsForNewProduct, loadFromBlueprint, saveToDb, bulkUpdate } = useProductStore();
  const settings = useSettingsStore();
  const loadSettingsFromDb = useSettingsStore(s => s.loadFromDb);
  const supabase = createClient();
  const { toast } = useToast();
  const prefersReducedMotion = useReducedMotion();

  // Input state
  const [files, setFiles] = useState<FileItem[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [productDetailsText, setProductDetailsText] = useState('');
  const [supplierUrl, setSupplierUrl] = useState('');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<'idle' | 'classifying' | 'extracting' | 'generating' | 'finalizing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  // Stream log
  const [logEvents, setLogEvents] = useState<IngestStreamEvent[]>([]);
  const [logSessionId, setLogSessionId] = useState<string | null>(null);

  // Dev widget
  const [showDevWidget, setShowDevWidget] = useState(false);
  const isDev = process.env.NODE_ENV === 'development';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const canGenerate = (
    files.length > 0 ||
    productDetailsText.trim().length > 0 ||
    supplierUrl.trim().length > 0
  ) && !isUploading;

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: membership } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .single();

        if (membership?.organization_id) {
          await loadSettingsFromDb(membership.organization_id);
        }
      }
    };
    loadSettings();
  }, [supabase, loadSettingsFromDb]);

  // Global paste handler — pipes images through R2 upload
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        const dt = new DataTransfer();
        imageFiles.forEach(f => dt.items.add(f));
        await handleFileSelect(dt.files);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      files.forEach(f => {
        if (f.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, [files]);

  const handleFileSelect = useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    setIsUploading(true);
    setUploadErrors([]);
    const newFiles: FileItem[] = [];
    const errors: string[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];

      const allowedTypes = [
        'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
        'text/csv', 'application/json', 'text/plain',
      ];

      if (!allowedTypes.some(type => file.type === type || file.type.startsWith(type.split('/')[0] + '/'))) {
        errors.push(`Unsupported file type: ${file.name}`);
        continue;
      }

      let previewUrl: string | undefined;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }

      try {
        const res = await fetch('/api/media/presigned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, contentType: file.type, forIngest: true }),
        });

        const { presignedUrl, publicUrl } = await res.json();

        await fetch(presignedUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });

        newFiles.push({
          id: `${Date.now()}-${i}`,
          file,
          type: 'file',
          publicUrl,
          previewUrl,
          name: file.name,
          mimeType: file.type,
        });
      } catch {
        errors.push(`Failed to upload: ${file.name}`);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      }
    }

    setFiles(prev => [...prev, ...newFiles]);
    setUploadErrors(errors);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleImageUrlAdd = async () => {
    const url = imageUrlInput.trim();
    if (!url) return;

    setIsUploading(true);

    try {
      const res = await fetch('/api/media/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        setUploadErrors(prev => [...prev, `Failed to add image from URL: ${data.error || 'Unknown error'}`]);
        setIsUploading(false);
        return;
      }

      const urlObj = new URL(url);
      const filename = urlObj.pathname.split('/').pop() || 'image.jpg';

      setFiles(prev => [...prev, {
        id: `url-${Date.now()}`,
        type: 'file',
        url,
        publicUrl: data.publicUrl,
        previewUrl: data.publicUrl,
        name: filename,
        mimeType: 'image/jpeg',
      }]);

      setImageUrlInput('');
    } catch {
      setUploadErrors(prev => [...prev, `Failed to add image from URL: ${url}`]);
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (id: string) => {
    const f = files.find(f => f.id === id);
    if (f?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(f.previewUrl);
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const mappedData = mapExternalToProduct(json);
        resetStore();
        bulkUpdate(mappedData);

        applyMedusaDefaultsForNewProduct({
          defaultSalesChannelId: settings.defaultSalesChannelId,
          defaultShippingProfileId: settings.defaultShippingProfileId,
          defaultCollectionId: settings.defaultCollectionId,
          defaultCategoryIds: settings.defaultCategoryIds,
        });

        await saveToDb();

        const orgId = useProductStore.getState().organizationId;
        if (orgId) await settings.loadFromDb(orgId);

        translateAllActiveLanguages().catch(err => {
          console.error('Background translation error:', err);
        });

        toast({ title: 'JSON imported', description: 'Product loaded from JSON file.', type: 'success' });
        router.push('/product-details');
      } catch {
        setError('Invalid JSON file — must match product-demo.json format');
        toast({ title: 'Import failed', description: 'JSON does not match the expected format.', type: 'error' });
      }
    };
    reader.readAsText(file);
    if (jsonInputRef.current) jsonInputRef.current.value = '';
  };

  const handleGenerate = async () => {
    setError(null);

    const textBlocks = productDetailsText.trim() ? [productDetailsText.trim()] : [];
    const supplierUrls = supplierUrl.trim() ? [supplierUrl.trim()] : [];
    const activeFiles = files.map(f => {
      const mime = f.mimeType || f.file?.type || 'application/octet-stream';
      const type = mime.startsWith('image/') ? 'image' as const
        : mime === 'text/csv' ? 'csv' as const
        : mime === 'application/json' ? 'json' as const
        : 'other' as const;
      return { id: f.id, type, mime, url: f.publicUrl || f.url || '' };
    });

    if (!textBlocks.length && !supplierUrls.length && !activeFiles.length) {
      setError('Add at least one source: image, text, or supplier URL');
      return;
    }

    setIsGenerating(true);
    setGenerationStep('classifying');
    setLogEvents([]);
    setLogSessionId(null);

    resetStore();
    applyMedusaDefaultsForNewProduct({
      defaultSalesChannelId: settings.defaultSalesChannelId,
      defaultShippingProfileId: settings.defaultShippingProfileId,
      defaultCollectionId: settings.defaultCollectionId,
      defaultCategoryIds: settings.defaultCategoryIds,
    });

    const activeLanguages = settings.activeLanguages.length > 0 ? settings.activeLanguages : ['en'];

    try {
      const res = await fetch('/api/products/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLanguages: activeLanguages,
          textBlocks,
          urls: supplierUrls,
          files: activeFiles,
        }),
      });

      // Auth / validation errors arrive as plain JSON before the stream starts
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        const errMsg = (data as { error?: string }).error || 'Generation failed';
        setError(errMsg);
        toast({ title: 'Generation Failed', description: errMsg, type: 'error' });
        setIsGenerating(false);
        setGenerationStep('idle');
        return;
      }

      // Consume SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handleEvent = (event: IngestStreamEvent) => {
        setLogEvents(prev => [...prev, event]);

        if (event.type === 'session_created') {
          setLogSessionId(event.sessionId);
        }

        if (event.type === 'pipeline_event') {
          const { event: name } = event;
          if (name === 'CLASSIFICATION_STARTED') setGenerationStep('classifying');
          else if (name === 'EXTRACTION_STARTED') setGenerationStep('extracting');
          else if (name === 'BLUEPRINT_STARTED') setGenerationStep('generating');
          else if (name === 'BLUEPRINT_COMPLETE') setGenerationStep('finalizing');
        }

        if (event.type === 'complete') {
          setGenerationStep('finalizing');
          const { blueprint } = event as { blueprint: Parameters<typeof loadFromBlueprint>[0]; evidence: unknown };
          loadFromBlueprint(blueprint);
          saveToDb().then(() => {
            setIsGenerating(false);
            setGenerationStep('idle');
            toast({ title: 'Draft ready', description: 'Product content generated successfully.', type: 'success' });
            router.push('/product-details');
          }).catch(err => {
            const msg = err instanceof Error ? err.message : 'Failed to save';
            setError(msg);
            toast({ title: 'Save Failed', description: msg, type: 'error' });
            setIsGenerating(false);
            setGenerationStep('idle');
          });
        }

        if (event.type === 'error') {
          setError(event.message);
          toast({ title: 'Generation Failed', description: event.message, type: 'error' });
          setIsGenerating(false);
          setGenerationStep('idle');
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            handleEvent(JSON.parse(jsonStr) as IngestStreamEvent);
          } catch {
            // Ignore malformed lines
          }
        }
      }

      // Flush any remaining partial line
      if (buffer.startsWith('data: ')) {
        try {
          handleEvent(JSON.parse(buffer.slice(6)) as IngestStreamEvent);
        } catch { /* ignore */ }
      }

    } catch {
      setError('Network error during generation');
      toast({ title: 'Network Error', description: 'Failed to connect to the server.', type: 'error' });
      setIsGenerating(false);
      setGenerationStep('idle');
    }
  };

  // Load fake product for dev testing
  const loadFakeProduct = useCallback(async () => {
    try {
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const uniqueHandle = `dual-tone-bold-band-${timestamp}-${randomSuffix}`;

      const fakeProduct = {
        title: 'Dual-Tone Bold Band',
        subtitle: 'Elevate your style with bold sophistication.',
        status: 'draft',
        external_id: null,
        description: 'Where luxury meets attitude. This black and gold ring redefines modern elegance with its striking contrast and sleek design. Wear it unapologetically.',
        handle: uniqueHandle,
        is_giftcard: false,
        discountable: true,
        thumbnail: 'https://pub-90fab3dc48a942f684f3a82c0be3f78d.r2.dev/29256ed6-ca40-427a-b1fb-91cbbddc0b3b/ai-studio/1769473268610-87fe5250-de5f-4ebd-90b3-06b19f1fa596.jpg',
        collection_id: 'pcol_01KD1YXSM6QSKQHBVKH73WBKTJ',
        type_id: null,
        weight: null, length: 0, height: 0, width: 0,
        hs_code: null, origin_country: null, mid_code: null, material: null,
        metadata: {
          brand: 'THE UNCUT BRAND',
          vault: { video: null, images: [] },
          title_i18n: { en: 'Dual-Tone Bold Band', fr: 'Bague Audacieuse Bi-Ton' },
          subtitle_i18n: { en: 'Elevate your style with bold sophistication.', fr: 'Élevez votre style avec une sophistication audacieuse.' },
          description_i18n: { en: 'Where luxury meets attitude. This black and gold ring redefines modern elegance with its striking contrast and sleek design. Wear it unapologetically.', fr: 'Là où le luxe rencontre l\'attitude. Cette bague noire et dorée redéfinit l\'élégance moderne avec son contraste saisissant et son design épuré. Portez-la sans excuses.' },
          features_i18n: { en: ['Striking black and gold dual-tone design', 'Crafted for a confident, modern look', 'Perfect for any occasion, day or night', 'Durable finish for lasting wear', 'Unisex appeal—style knows no gender'], fr: ['Design bi-ton noir et doré saisissant', 'Conçue pour un look moderne et confiant', 'Parfaite pour toutes les occasions, jour ou nuit', 'Finition durable pour une longévité assurée', 'Attrait unisexe—le style n\'a pas de genre'] },
          keywords_i18n: { en: ['black and gold ring', 'modern men\'s jewelry', 'luxury ring', 'bold jewelry', 'unisex ring'], fr: ['bague noire et dorée', 'bijoux modernes pour hommes', 'bague de luxe', 'bijoux audacieux', 'bague unisexe'] },
          seo_title_i18n: { en: 'Luxury Black and Gold Ring | The Uncut Brand', fr: 'Bague Noire et Dorée de Luxe | The Uncut Brand' },
          seo_description_i18n: { en: 'Discover the bold elegance of our dual-tone black and gold ring. A modern statement piece for the confident individual.', fr: 'Découvrez l\'élégance audacieuse de notre bague bi-ton noire et dorée. Une pièce moderne pour l\'individu confiant.' },
          options_i18n: [{ title_i18n: { en: 'Color', fr: 'Couleur' }, values: [{ value: 'Black', value_i18n: { en: 'Black', fr: 'Noir' } }, { value: 'Gold', value_i18n: { en: 'Gold', fr: 'Or' } }] }],
        },
        options: [{ id: '8ae78caf-5f11-436f-92d8-261161afedeb', title: 'Color', values: ['Black', 'Gold'] }],
        variants: [
          { id: 'd73b5887-b45c-48db-879d-a86d4987d801', title: 'Dual-Tone Bold Band - Black', sku: `${uniqueHandle}-black`, options: [{ value: 'Black', option_id: '8ae78caf-5f11-436f-92d8-261161afedeb' }], prices: [{ amount: 20, currency_code: 'usd' }, { amount: 22, currency_code: 'cad' }], manage_inventory: false, allow_backorder: false },
          { id: '3a6e1ab8-612b-4c9f-aa06-55c64c1ebf7c', title: 'Dual-Tone Bold Band - Gold', sku: `${uniqueHandle}-gold`, options: [{ value: 'Gold', option_id: '8ae78caf-5f11-436f-92d8-261161afedeb' }], prices: [{ amount: 20, currency_code: 'usd' }, { amount: 22, currency_code: 'cad' }], manage_inventory: false, allow_backorder: false },
        ],
      };

      const mappedData = mapExternalToProduct(fakeProduct);
      resetStore();
      bulkUpdate(mappedData);
      applyMedusaDefaultsForNewProduct({
        defaultSalesChannelId: settings.defaultSalesChannelId,
        defaultShippingProfileId: settings.defaultShippingProfileId,
        defaultCollectionId: settings.defaultCollectionId,
        defaultCategoryIds: settings.defaultCategoryIds,
      });
      await saveToDb();
      toast({ title: 'Fake product loaded', description: 'Dual-Tone Bold Band ready for testing.', type: 'success' });
      router.push('/product-details');
    } catch (err) {
      toast({ title: 'Failed to load fake product', description: err instanceof Error ? err.message : 'Unknown error', type: 'error' });
    }
  }, [resetStore, bulkUpdate, applyMedusaDefaultsForNewProduct, settings, saveToDb, router, toast]);

  const imageFiles = files.filter(f => f.mimeType?.startsWith('image/'));
  const otherFiles = files.filter(f => !f.mimeType?.startsWith('image/'));

  return (
    <div className="space-y-4 pb-32 md:pb-8 max-w-2xl">
      <header className="space-y-1">
        <h1 className="text-3xl md:text-4xl font-bold text-white">Create Product</h1>
        <p className="text-zinc-400 text-sm">
          Drop in any combination of sources — we'll run the full AI pipeline to generate your product draft.
        </p>
        <p className="text-xs text-zinc-600 italic">
          Tip: Paste an image anywhere on this page (Ctrl+V / Cmd+V)
        </p>
      </header>

      {/* Dev Tools */}
      {isDev && (
        <section className="glass rounded-2xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
          <button
            onClick={() => setShowDevWidget(!showDevWidget)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <TestTube className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-white">Dev Tools</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">TEST</span>
            </div>
            {showDevWidget ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
          </button>
          <AnimatePresence>
            {showDevWidget && (
              <motion.div
                initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4">
                  <button
                    onClick={loadFakeProduct}
                    disabled={isGenerating}
                    className="w-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <TestTube className="w-4 h-4" />
                    Load Fake Product (Dual-Tone Bold Band)
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* Error */}
      {error && (
        <div className="glass rounded-xl p-4 border border-red-500/20 bg-red-500/5">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {uploadErrors.length > 0 && (
        <div className="glass rounded-xl p-4 border border-yellow-500/20 bg-yellow-500/5">
          <p className="text-xs font-semibold text-yellow-300 mb-1">Some files could not be added:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-xs text-yellow-200/80">
            {uploadErrors.map((msg, i) => <li key={i}>{msg}</li>)}
          </ul>
        </div>
      )}

      {/* Section 1: Images */}
      <section className="glass rounded-2xl p-4 md:p-6 border border-white/10 space-y-4">
        <div className="flex items-center gap-2">
          <ImagePlus className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-semibold text-white">Images</h2>
          <span className="text-xs text-zinc-500">— product photos, supplier screenshots, packaging</span>
        </div>

        {/* Upload zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFileSelect(e.dataTransfer.files);
          }}
          className={cn(
            'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
            'border-white/10 hover:border-indigo-500/40 hover:bg-indigo-500/5',
            isUploading && 'border-indigo-500/50 bg-indigo-500/10 pointer-events-none'
          )}
        >
          {isUploading ? (
            <div className="flex items-center justify-center gap-2 text-indigo-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Uploading...</span>
            </div>
          ) : (
            <>
              <Upload className="w-6 h-6 mx-auto mb-2 text-zinc-500" />
              <p className="text-sm text-zinc-400">Drag & drop images, or <span className="text-indigo-400 font-medium">click to upload</span></p>
              <p className="text-xs text-zinc-600 mt-1">PNG, JPG, WebP — multiple supported</p>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />

        {/* Image URL input */}
        <div className="flex gap-2">
          <input
            type="url"
            value={imageUrlInput}
            onChange={(e) => setImageUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && imageUrlInput.trim()) handleImageUrlAdd(); }}
            placeholder="https://example.com/product-image.jpg"
            className="flex-1 bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-indigo-500/50 outline-none"
            disabled={isUploading || isGenerating}
          />
          <button
            onClick={handleImageUrlAdd}
            disabled={!imageUrlInput.trim() || isUploading || isGenerating}
            className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
          </button>
        </div>

        {/* Image thumbnails */}
        {imageFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {imageFiles.map(f => (
              <div key={f.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                <img src={f.previewUrl} alt={f.name} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeFile(f.id)}
                  className="absolute top-0 right-0 p-0.5 bg-black/60 text-white rounded-bl-lg hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Non-image files */}
        {otherFiles.length > 0 && (
          <div className="space-y-1">
            {otherFiles.map(f => (
              <div key={f.id} className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg text-sm text-zinc-300">
                <span className="truncate">{f.name}</span>
                <button onClick={() => removeFile(f.id)} className="ml-2 text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Product Details */}
      <section className="glass rounded-2xl p-4 md:p-6 border border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-semibold text-white">Product Details</h2>
          <span className="text-xs text-zinc-500">— raw notes, copy, specs, variants</span>
        </div>
        <textarea
          value={productDetailsText}
          onChange={(e) => setProductDetailsText(e.target.value)}
          placeholder={"Source title, description, notes, keywords, options/variants...\n\nExample:\nVertical Bar Steel Necklace\nColors: Silver / Black\nMaterial: 316L Stainless Steel, waterproof, hypoallergenic\nChain length: 50cm / 60cm\nPerfect for layering. Minimalist aesthetic."}
          className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-indigo-500/50 outline-none resize-none min-h-[140px]"
          disabled={isGenerating}
        />
      </section>

      {/* Section 3: Supplier URL */}
      <section className="glass rounded-2xl p-4 md:p-6 border border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-semibold text-white">Supplier URL</h2>
          <span className="text-xs text-zinc-500">— optional, fetched by the agent</span>
        </div>
        <input
          type="url"
          value={supplierUrl}
          onChange={(e) => setSupplierUrl(e.target.value)}
          placeholder="https://www.aliexpress.com/item/..."
          className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-indigo-500/50 outline-none"
          disabled={isGenerating}
        />
      </section>

      {/* Section 4: JSON Import */}
      <section className="glass rounded-2xl p-4 md:p-6 border border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <FileJson className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-semibold text-white">JSON Import</h2>
          <span className="text-xs text-zinc-500">— bypasses AI, loads directly</span>
        </div>
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleJsonImport}
        />
        <button
          onClick={() => jsonInputRef.current?.click()}
          disabled={isGenerating}
          className="w-full p-4 border-2 border-dashed border-white/10 rounded-xl hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-colors text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileJson className="w-5 h-5 mx-auto mb-1.5" />
          <p className="text-sm font-medium">Import JSON file</p>
          <p className="text-xs text-zinc-500 mt-0.5">Must match <code className="text-zinc-400">product-demo.json</code> format</p>
        </button>
      </section>

      {/* Generation log — visible while running or when events exist */}
      {logEvents.length > 0 && (
        <GenerationLogPanel
          events={logEvents}
          isRunning={isGenerating}
          sessionId={logSessionId}
        />
      )}

      {/* Sticky Bottom CTA */}
      <div className="fixed bottom-[80px] md:bottom-auto left-0 right-0 md:relative md:left-auto md:right-auto z-[60] md:z-auto pb-safe md:pb-0">
        <div className="glass-dark border-t border-white/10 md:border-t-0 md:border border-white/10 rounded-t-2xl md:rounded-2xl p-4 md:p-6 space-y-3 shadow-2xl md:shadow-none">
          {isGenerating && (
            <div className="flex items-center gap-4 text-sm text-zinc-400">
              {([
                { id: 'classifying', label: 'Classifying' },
                { id: 'extracting', label: 'Extracting' },
                { id: 'generating', label: 'Generating' },
                { id: 'finalizing', label: 'Finalizing' },
              ] as const).map((step, idx) => {
                const steps = ['classifying', 'extracting', 'generating', 'finalizing'];
                const isActive = generationStep === step.id;
                const isPast = steps.indexOf(generationStep) > idx;
                return (
                  <div key={step.id} className="flex items-center gap-2">
                    <div className={cn(
                      'w-2 h-2 rounded-full transition-all duration-500',
                      isActive ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)] scale-125'
                        : isPast ? 'bg-green-500' : 'bg-zinc-800'
                    )} />
                    <span className={cn(
                      'transition-colors duration-500 hidden md:inline text-xs',
                      isActive ? 'text-indigo-400 font-medium' : isPast ? 'text-zinc-500' : 'text-zinc-700'
                    )}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            className={cn(
              'w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500',
              'text-white px-6 py-4 rounded-xl font-bold flex items-center justify-center gap-3',
              'transition-all shadow-xl shadow-indigo-500/20 active:scale-95',
              'min-h-[56px]'
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Product Draft
                <ArrowRight className="w-4 h-4 hidden md:inline" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
