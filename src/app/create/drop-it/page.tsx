'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, FileText, Link as LinkIcon, Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useProductStore } from '@/store/useProductStore';
import { createClient } from '@/utils/supabase/client';

interface FileItem {
  id: string;
  file: File;
  type: 'text' | 'url' | 'file';
  url?: string;
  publicUrl?: string;
  previewUrl?: string; // For image thumbnails
}

export default function DropItPage() {
  const router = useRouter();
  const activeLanguages = useSettingsStore(s => s.activeLanguages);
  const loadSettingsFromDb = useSettingsStore(s => s.loadFromDb);
  const { loadFromBlueprint, resetStore, saveToDb } = useProductStore();
  const supabase = createClient();
  
  const [textBlocks, setTextBlocks] = useState<string[]>(['']);
  const [urls, setUrls] = useState<string[]>(['']);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<'idle' | 'classifying' | 'extracting' | 'generating' | 'finalizing'>('idle');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const filesRef = useRef<FileItem[]>([]);
  
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

  const handleFileSelect = async (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    
    setIsUploading(true);
    const newFiles: FileItem[] = [];
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      // Validate file type
      const allowedTypes = [
        'image/png', 'image/jpeg', 'image/jpg',
        'text/csv', 'application/json', 'application/pdf', 'text/plain',
      ];
      
      if (!allowedTypes.some(type => file.type.startsWith(type.split('/')[0]) || file.type === type)) {
        alert(`File type not supported: ${file.name}`);
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
        });
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        alert(`Failed to upload ${file.name}`);
        // Clean up preview URL if upload failed
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
      }
    }
    
    setFiles([...files, ...newFiles]);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
    const activeTextBlocks = textBlocks.filter(b => b.trim().length > 0);
    const activeUrls = urls.filter(u => u.trim().length > 0);
    const activeFiles = files.map(f => ({
      id: f.id,
      type: f.file.type.startsWith('image/') ? 'image' as const :
            f.file.type === 'text/csv' ? 'csv' as const :
            f.file.type === 'application/json' ? 'json' as const :
            f.file.type === 'application/pdf' ? 'pdf' as const : 'other' as const,
      mime: f.file.type,
      url: f.publicUrl || '',
    }));

    if (activeTextBlocks.length === 0 && activeUrls.length === 0 && activeFiles.length === 0) {
      alert('Please add at least one input (text, URL, or file)');
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

      // Simple interval to simulate progress based on typical pipeline duration
      const progressInterval = setInterval(() => {
        setGenerationStep(prev => {
          if (prev === 'classifying') return 'extracting';
          if (prev === 'extracting') return 'generating';
          if (prev === 'generating') return 'finalizing';
          return prev;
        });
      }, 3000);

      const data = await res.json();
      clearInterval(progressInterval);

      if (res.ok) {
        setGenerationStep('finalizing');
        // Load blueprint into product store
        resetStore();
        loadFromBlueprint(data.blueprint);
        
        // Save to DB immediately
        await saveToDb();
        
        // Navigate to product details
        router.push('/product-details');
      } else {
        setGenerationStep('idle');
        alert(data.error || 'Generation failed');
      }
    } catch (error) {
      setGenerationStep('idle');
      console.error('Generation error:', error);
      alert('Network error during generation');
    } finally {
      setIsGenerating(false);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return ImageIcon;
    return FileText;
  };

  return (
    <div className="space-y-8 pb-20 md:pb-0">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-white">JUST DROP IT</h1>
        <p className="text-zinc-400">
          Paste or drop any product content. We'll parse and structure it automatically.
        </p>
      </header>

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
            accept=".txt,.csv,.json,.pdf,.png,.jpg,.jpeg"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />
          <Upload className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
          <p className="text-zinc-400 mb-2">
            Drag and drop files here, or{' '}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              browse
            </button>
          </p>
          <p className="text-xs text-zinc-500">
            Supported: TXT, CSV, JSON, PDF, PNG, JPG, JPEG
          </p>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((fileItem) => {
              const Icon = getFileIcon(fileItem.file);
              const isImage = fileItem.file.type.startsWith('image/');
              
              return (
                <div
                  key={fileItem.id}
                  className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-lg border border-white/10"
                >
                  {isImage && fileItem.previewUrl ? (
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 bg-zinc-800">
                      <img
                        src={fileItem.previewUrl}
                        alt={fileItem.file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <Icon className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{fileItem.file.name}</div>
                    <div className="text-xs text-zinc-500">
                      {(fileItem.file.size / 1024).toFixed(1)} KB
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

