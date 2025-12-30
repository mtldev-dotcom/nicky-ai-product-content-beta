'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, FileText, Link as LinkIcon, Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useProductStore } from '@/store/useProductStore';
import { createClient } from '@/utils/supabase/client';

interface FileItem {
  id: string;
  file?: File; // Optional for URL-sourced images
  type: 'text' | 'url' | 'file';
  url?: string; // Source URL for image URLs
  publicUrl?: string;
  previewUrl?: string; // For image thumbnails
  name?: string; // Display name (from file.name or URL basename)
  mimeType?: string; // MIME type (from file.type or Content-Type header)
}

type PipelineEventRow = {
  event_type: string;
  payload_preview: string | null;
  created_at: string;
};

type PipelineSummary = {
  urlStarted: number;
  urlComplete: number;
  urlError: number;
  visionStarted: number;
  visionComplete: number;
  visionError: number;
  textStarted: number;
  textComplete: number;
  textError: number;
};

function summarizePipeline(events: PipelineEventRow[]): PipelineSummary {
  const count = (eventType: string) => events.filter((e) => e.event_type === eventType).length;
  return {
    urlStarted: count('EXTRACTION_URL_STARTED'),
    urlComplete: count('EXTRACTION_URL_COMPLETE'),
    urlError: count('EXTRACTION_URL_ERROR'),
    visionStarted: count('EXTRACTION_VISION_STARTED'),
    visionComplete: count('EXTRACTION_VISION_COMPLETE'),
    visionError: count('EXTRACTION_VISION_ERROR'),
    textStarted: count('EXTRACTION_TEXT_STARTED'),
    textComplete: count('EXTRACTION_TEXT_COMPLETE'),
    textError: count('EXTRACTION_TEXT_ERROR'),
  };
}

export default function DropItPage() {
  const router = useRouter();
  const activeLanguages = useSettingsStore(s => s.activeLanguages);
  const loadSettingsFromDb = useSettingsStore(s => s.loadFromDb);
  const settings = useSettingsStore();
  const { loadFromBlueprint, resetStore, saveToDb, applyMedusaDefaultsForNewProduct } = useProductStore();
  const supabase = createClient();
  
  const [textBlocks, setTextBlocks] = useState<string[]>(['']);
  const [urls, setUrls] = useState<string[]>(['']);
  const [imageUrls, setImageUrls] = useState<string[]>(['']);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<'idle' | 'classifying' | 'extracting' | 'generating' | 'finalizing'>('idle');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [pipelineEvents, setPipelineEvents] = useState<PipelineEventRow[]>([]);
  const [pipelineSummary, setPipelineSummary] = useState<PipelineSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const filesRef = useRef<FileItem[]>([]);
  const handleFileSelectRef = useRef<((selectedFiles: FileList | null) => Promise<void>) | null>(null);
  
  // Keep ref in sync with state
  React.useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Load settings to get active languages
  React.useEffect(() => {
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

  // Global paste handler for images (works anywhere on the page)
  React.useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      // Skip if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;
      
      const imageFiles: File[] = [];
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }
      
      if (imageFiles.length > 0 && handleFileSelectRef.current) {
        e.preventDefault();
        // Create a FileList-like object from the files
        const dataTransfer = new DataTransfer();
        imageFiles.forEach(file => dataTransfer.items.add(file));
        await handleFileSelectRef.current(dataTransfer.files);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, []);

  const handleTextBlockChange = (index: number, value: string) => {
    const newBlocks = [...textBlocks];
    newBlocks[index] = value;
    setTextBlocks(newBlocks);
  };

  const addTextBlock = () => {
    setTextBlocks([...textBlocks, '']);
  };

  const removeTextBlock = (index: number) => {
    setTextBlocks(textBlocks.filter((_, i) => i !== index));
  };

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const addUrl = () => {
    setUrls([...urls, '']);
  };

  const removeUrl = (index: number) => {
    setUrls(urls.filter((_, i) => i !== index));
  };

  const handleImageUrlChange = (index: number, value: string) => {
    const newImageUrls = [...imageUrls];
    newImageUrls[index] = value;
    setImageUrls(newImageUrls);
  };

  const addImageUrl = () => {
    setImageUrls([...imageUrls, '']);
  };

  const removeImageUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index));
  };

  // Handle image URL submission - syncs image from URL to bucket
  const handleImageUrlAdd = async (url: string, index: number) => {
    if (!url.trim()) return;
    
    setIsUploading(true);
    const errors: string[] = [];
    
    try {
      // Use the existing media sync endpoint (SSRF-protected)
      const res = await fetch('/api/media/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        errors.push(`Failed to add image from URL: ${data.error || 'Unknown error'}`);
        setUploadErrors([...uploadErrors, ...errors]);
        setIsUploading(false);
        return;
      }
      
      // Create a FileItem for the URL-sourced image
      const urlObj = new URL(url.trim());
      const filename = urlObj.pathname.split('/').pop() || 'image.jpg';
      
      const newFileItem: FileItem = {
        id: `url-${Date.now()}-${index}`,
        type: 'file',
        url: url.trim(),
        publicUrl: data.publicUrl,
        previewUrl: data.publicUrl, // Use publicUrl as preview for URL-sourced images
        name: filename,
        mimeType: 'image/jpeg', // Default, could be improved by checking Content-Type
      };
      
      setFiles([...files, newFileItem]);
      
      // Clear the input
      const newImageUrls = [...imageUrls];
      newImageUrls[index] = '';
      setImageUrls(newImageUrls);
    } catch (error) {
      console.error('Failed to sync image URL:', error);
      errors.push(`Failed to add image from URL: ${url}`);
      setUploadErrors([...uploadErrors, ...errors]);
    } finally {
      setIsUploading(false);
    }
  };


  const handleFileSelect = React.useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    
    setIsUploading(true);
    setUploadErrors([]);
    const newFiles: FileItem[] = [];
    const errors: string[] = [];
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      // Validate file type
      const allowedTypes = [
        'image/png', 'image/jpeg', 'image/jpg',
        'text/csv', 'application/json', 'text/plain',
      ];
      
      if (!allowedTypes.some(type => file.type.startsWith(type.split('/')[0]) || file.type === type)) {
        errors.push(`Unsupported file type: ${file.name}`);
        continue;
      }
      
      // Create preview URL for images
      let previewUrl: string | undefined;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }
      
      // Upload to get presigned URL
      try {
        const res = await fetch('/api/media/presigned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            forIngest: true,
          }),
        });
        
        const { presignedUrl, publicUrl } = await res.json();
        
        // Upload file to S3
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
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        errors.push(`Failed to upload: ${file.name}`);
        // Clean up preview URL if upload failed
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
      }
    }
    
    setFiles(prev => [...prev, ...newFiles]);
    setUploadErrors(errors);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Keep handleFileSelect ref in sync
  React.useEffect(() => {
    handleFileSelectRef.current = handleFileSelect;
  }, [handleFileSelect]);

  const removeFile = (id: string) => {
    const fileToRemove = files.find(f => f.id === id);
    // Clean up preview URL if it exists
    if (fileToRemove?.previewUrl) {
      URL.revokeObjectURL(fileToRemove.previewUrl);
    }
    setFiles(files.filter(f => f.id !== id));
  };
  
  // Cleanup preview URLs on unmount
  React.useEffect(() => {
    return () => {
      // Clean up all preview URLs when component unmounts
      filesRef.current.forEach(file => {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
      });
    };
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFileSelect(droppedFiles);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleGenerate = async () => {
    setPipelineSummary(null);
    setPipelineEvents([]);
    setLastSessionId(null);

    const activeTextBlocks = textBlocks.filter(b => b.trim().length > 0);
    const activeUrls = urls.filter(u => u.trim().length > 0);
    const activeFiles = files.map(f => {
      // Determine file type from mimeType or file.type
      const mime = f.mimeType || f.file?.type || 'application/octet-stream';
      const type = mime.startsWith('image/') ? 'image' as const :
                   mime === 'text/csv' ? 'csv' as const :
                   mime === 'application/json' ? 'json' as const :
                   'other' as const;
      
      return {
        id: f.id,
        type,
        mime,
        url: f.publicUrl || f.url || '',
      };
    });

    if (activeTextBlocks.length === 0 && activeUrls.length === 0 && activeFiles.length === 0 && imageUrls.filter(u => u.trim().length > 0).length === 0) {
      alert('Please add at least one input (text, URL, image URL, or file)');
      return;
    }

    setIsGenerating(true);
    setGenerationStep('classifying');

    try {
      const targetLanguages = activeLanguages.length > 0 
        ? activeLanguages 
        : ['en'];

      const res = await fetch('/api/products/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLanguages,
          textBlocks: activeTextBlocks,
          urls: activeUrls,
          files: activeFiles,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setGenerationStep('finalizing');
        setLastSessionId(data.sessionId || null);
        // Load blueprint into product store
        resetStore();
        loadFromBlueprint(data.blueprint);
        applyMedusaDefaultsForNewProduct({
          defaultSalesChannelId: settings.defaultSalesChannelId,
          defaultShippingProfileId: settings.defaultShippingProfileId,
          defaultCollectionId: settings.defaultCollectionId,
          defaultCategoryIds: settings.defaultCategoryIds,
        });
        
        // Save to DB immediately
        await saveToDb();

        // Fetch pipeline events for UX summary (best-effort; must not block).
        if (data.sessionId) {
          try {
            const { data: eventsData, error } = await supabase
              .from('pipeline_events')
              .select('event_type, payload_preview, created_at')
              .eq('session_id', data.sessionId)
              .order('created_at', { ascending: true });

            if (!error && eventsData) {
              setPipelineEvents(eventsData as PipelineEventRow[]);
              setPipelineSummary(summarizePipeline(eventsData as PipelineEventRow[]));
            }
          } catch (e) {
            console.error('Failed to load pipeline events (non-fatal):', e);
          }
        }

        // Stop spinner and let user review summary briefly before navigating.
        setIsGenerating(false);
        setGenerationStep('idle');
      } else {
        setGenerationStep('idle');
        alert(data.error || 'Generation failed');
      }
    } catch (error) {
      setGenerationStep('idle');
      console.error('Generation error:', error);
      alert('Network error during generation');
    } finally {
      // If we already stopped the spinner on success (to show summary), don't re-toggle unnecessarily.
      setIsGenerating(false);
    }
  };

  const getFileIcon = (fileItem: FileItem) => {
    const mime = fileItem.mimeType || fileItem.file?.type || '';
    if (mime.startsWith('image/')) return ImageIcon;
    return FileText;
  };

  return (
    <div className="space-y-8 pb-20 md:pb-0">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-white">JUST DROP IT</h1>
        <p className="text-zinc-400">
          Paste or drop any product content. We&apos;ll parse and structure it automatically.
        </p>
      </header>

      {/* Upload errors (partial success: some files may have failed upload) */}
      {uploadErrors.length > 0 && (
        <section className="glass rounded-2xl p-4 border border-yellow-500/20 bg-yellow-500/5">
          <p className="text-xs font-semibold text-yellow-300 mb-2">Some files were not added:</p>
          <ul className="list-disc pl-5 space-y-1 text-xs text-yellow-200/90">
            {uploadErrors.map((msg, idx) => (
              <li key={idx}>{msg}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Pipeline summary (partial success: some sources may have failed but blueprint still generated) */}
      {pipelineSummary && (
        <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Ingest Summary</h2>
              {lastSessionId && (
                <p className="text-xs text-zinc-500 font-mono mt-1">Session: {lastSessionId}</p>
              )}
            </div>
            <div className="flex gap-2">
              {lastSessionId && (
                <button
                  onClick={() => router.push(`/usage/${lastSessionId}`)}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-200 transition-colors"
                >
                  View Logs
                </button>
              )}
              <button
                onClick={() => router.push('/product-details')}
                className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-xs font-semibold text-white transition-colors"
              >
                Continue to Editor
              </button>
            </div>
          </div>

          {(pipelineSummary.urlError > 0 || pipelineSummary.visionError > 0 || pipelineSummary.textError > 0) && (
            <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-xs">
              Partial success: some sources failed but a blueprint was still generated.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <p className="text-zinc-400 mb-1">URLs</p>
              <p className="text-white font-semibold">
                {pipelineSummary.urlComplete}/{pipelineSummary.urlStarted} processed
                {pipelineSummary.urlError > 0 ? ` (${pipelineSummary.urlError} failed)` : ''}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <p className="text-zinc-400 mb-1">Images (Vision)</p>
              <p className="text-white font-semibold">
                {pipelineSummary.visionComplete}/{pipelineSummary.visionStarted} processed
                {pipelineSummary.visionError > 0 ? ` (${pipelineSummary.visionError} failed)` : ''}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <p className="text-zinc-400 mb-1">Text</p>
              <p className="text-white font-semibold">
                {pipelineSummary.textComplete}/{pipelineSummary.textStarted} processed
                {pipelineSummary.textError > 0 ? ` (${pipelineSummary.textError} failed)` : ''}
              </p>
            </div>
          </div>

          {pipelineEvents.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                Show pipeline events
              </summary>
              <div className="mt-3 space-y-2 max-h-64 overflow-auto custom-scrollbar">
                {pipelineEvents.map((e, idx) => (
                  <div key={`${e.created_at}-${idx}`} className="text-[11px] text-zinc-300 bg-zinc-900/50 border border-white/5 rounded-lg p-2">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-mono text-zinc-200">{e.event_type}</span>
                      <span className="text-zinc-500">{new Date(e.created_at).toLocaleTimeString()}</span>
                    </div>
                    {e.payload_preview && <div className="text-zinc-400 mt-1">{e.payload_preview}</div>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {/* Text Blocks */}
      <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-400" />
          Text Blocks
        </h2>
        <div className="space-y-3">
          {textBlocks.map((block, index) => (
            <div key={index} className="flex gap-2">
              <textarea
                value={block}
                onChange={(e) => handleTextBlockChange(index, e.target.value)}
                placeholder="Paste product description, notes, specs, etc."
                className="flex-1 bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-indigo-500/50 outline-none resize-none min-h-[100px]"
              />
              {textBlocks.length > 1 && (
                <button
                  onClick={() => removeTextBlock(index)}
                  className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addTextBlock}
            className="text-sm text-indigo-400 hover:text-indigo-300 font-medium"
          >
            + Add another text block
          </button>
        </div>
        <div className="text-xs text-zinc-500 italic mt-2">
          Examples: AliExpress description, supplier notes, product specifications
        </div>
      </section>

      {/* URLs */}
      <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-indigo-400" />
          URLs
        </h2>
        <div className="space-y-3">
          {urls.map((url, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => handleUrlChange(index, e.target.value)}
                placeholder="https://www.aliexpress.com/item/..."
                className="flex-1 bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-indigo-500/50 outline-none"
              />
              {urls.length > 1 && (
                <button
                  onClick={() => removeUrl(index)}
                  className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addUrl}
            className="text-sm text-indigo-400 hover:text-indigo-300 font-medium"
          >
            + Add another URL
          </button>
        </div>
        <div className="text-xs text-zinc-500 italic mt-2">
          Examples: AliExpress product page, Amazon listing, supplier website
        </div>
      </section>

      {/* Image URLs */}
      <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-indigo-400" />
          Image URLs
        </h2>
        <div className="space-y-3">
          {imageUrls.map((imageUrl, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => handleImageUrlChange(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && imageUrl.trim()) {
                    handleImageUrlAdd(imageUrl, index);
                  }
                }}
                placeholder="https://example.com/image.jpg"
                className="flex-1 bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-indigo-500/50 outline-none"
                disabled={isUploading}
              />
              {imageUrl.trim() && (
                <button
                  onClick={() => handleImageUrlAdd(imageUrl, index)}
                  disabled={isUploading}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  {isUploading ? 'Adding...' : 'Add'}
                </button>
              )}
              {imageUrls.length > 1 && (
                <button
                  onClick={() => removeImageUrl(index)}
                  disabled={isUploading}
                  className="p-2 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addImageUrl}
            disabled={isUploading}
            className="text-sm text-indigo-400 hover:text-indigo-300 font-medium disabled:opacity-50"
          >
            + Add another image URL
          </button>
        </div>
        <div className="text-xs text-zinc-500 italic mt-2">
          Paste an image URL to download and add it. Press Enter or click Add to submit.
        </div>
      </section>

      {/* File Upload */}
      <section className="glass rounded-2xl p-6 border border-white/10 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Upload className="w-5 h-5 text-indigo-400" />
          Files
        </h2>
        
        <div
          ref={dropZoneRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
            'border-white/10 hover:border-indigo-500/30',
            isUploading && 'border-indigo-500/50 bg-indigo-500/10'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.csv,.json,.png,.jpg,.jpeg"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />
          <Upload className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
          <p className="text-zinc-400 mb-2">
            Drag and drop files here,{' '}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              browse
            </button>
            , or paste an image (Ctrl+V / Cmd+V)
          </p>
          <p className="text-xs text-zinc-500">
            Supported: TXT, CSV, JSON, PNG, JPG, JPEG (PDF not supported yet)
          </p>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((fileItem) => {
              const Icon = getFileIcon(fileItem);
              const mime = fileItem.mimeType || fileItem.file?.type || '';
              const isImage = mime.startsWith('image/');
              const displayName = fileItem.name || fileItem.file?.name || 'Unknown file';
              const fileSize = fileItem.file?.size ? `${(fileItem.file.size / 1024).toFixed(1)} KB` : 'URL';
              
              return (
                <div
                  key={fileItem.id}
                  className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-lg border border-white/10"
                >
                  {isImage && fileItem.previewUrl ? (
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 bg-zinc-800">
                      <img
                        src={fileItem.previewUrl}
                        alt={displayName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Fallback to icon if image fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const icon = document.createElement('div');
                            icon.className = 'w-full h-full flex items-center justify-center';
                            icon.innerHTML = '<svg class="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';
                            parent.appendChild(icon);
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <Icon className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{displayName}</div>
                    <div className="text-xs text-zinc-500">
                      {fileItem.url && !fileItem.file ? 'From URL' : fileSize}
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(fileItem.id)}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Generate Button */}
      <div className="flex flex-col items-end gap-4">
        {isGenerating && (
          <div className="flex items-center gap-6 text-sm text-zinc-400 glass px-6 py-3 rounded-xl border border-white/5 animate-in fade-in slide-in-from-bottom-2">
            {[
              { id: 'classifying', label: 'Classifying Inputs' },
              { id: 'extracting', label: 'Extracting Evidence' },
              { id: 'generating', label: 'Building Blueprint' },
              { id: 'finalizing', label: 'Finalizing' }
            ].map((step, idx) => {
              const isActive = generationStep === step.id;
              const isPast = ['classifying', 'extracting', 'generating', 'finalizing'].indexOf(generationStep) > idx;
              
              return (
                <div key={step.id} className="flex items-center gap-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full transition-all duration-500",
                    isActive ? "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)] scale-125" : 
                    isPast ? "bg-green-500" : "bg-zinc-800"
                  )} />
                  <span className={cn(
                    "transition-colors duration-500",
                    isActive ? "text-indigo-400 font-medium" : 
                    isPast ? "text-zinc-500" : "text-zinc-700"
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
          disabled={isGenerating || isUploading}
          className={cn(
            'bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500',
            'text-white px-10 py-4 rounded-xl font-bold flex items-center justify-center gap-3',
            'transition-all shadow-xl shadow-indigo-500/20 active:scale-95'
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
            </>
          )}
        </button>
      </div>
    </div>
  );
}

