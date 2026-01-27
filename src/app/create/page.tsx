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
  Zap,
  Layers,
  ChevronDown,
  ChevronUp,
  TestTube
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useProductStore } from '@/store/useProductStore';
import { createClient } from '@/utils/supabase/client';
import { mapExternalToProduct } from '@/lib/mapper';
import { translateAllActiveLanguages } from '@/lib/translations';
import { useToast } from '@/components/ui/ToastProvider';

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

type GenerationMode = 'fast' | 'ingest' | null;

/**
 * Determines which API to use based on inputs.
 * Fast path: prompt + 0-1 image only
 * Ingest path: URLs, multiple images, files, or mixed sources
 */
function determineGenerationMode(
  prompt: string,
  images: FileItem[],
  urls: string[],
  textBlocks: string[],
  files: FileItem[]
): GenerationMode {
  const hasPrompt = prompt.trim().length > 0;
  const hasImages = images.length > 0;
  const hasUrls = urls.some(u => u.trim().length > 0);
  const hasTextBlocks = textBlocks.some(b => b.trim().length > 0);
  const hasFiles = files.length > 0;

  // Fast path: prompt + 0-1 image only
  if (hasPrompt && !hasUrls && !hasTextBlocks && !hasFiles && images.length <= 1) {
    return 'fast';
  }

  // Ingest path: any mixed sources, URLs, multiple images, or files
  if (hasUrls || hasTextBlocks || hasFiles || images.length > 1) {
    return 'ingest';
  }

  // Edge case: only prompt (no image) -> fast path
  if (hasPrompt && !hasImages) {
    return 'fast';
  }

  // Edge case: only 1 image (no prompt) -> fast path
  if (hasImages && images.length === 1 && !hasPrompt) {
    return 'fast';
  }

  return null;
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
  const [prompt, setPrompt] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>(['']);
  const [textBlocks, setTextBlocks] = useState<string[]>(['']);
  const [urls, setUrls] = useState<string[]>(['']);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['prompt']));

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<'idle' | 'classifying' | 'extracting' | 'generating' | 'finalizing'>('idle');
  const [generationMode, setGenerationMode] = useState<GenerationMode>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

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

  // Global paste handler for images (works anywhere on the page)
  useEffect(() => {
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

      if (imageFiles.length > 0) {
        e.preventDefault();
        // Use the first image (for quick start, we only support one image)
        const file = imageFiles[0];
        if (file.size > 4.5 * 1024 * 1024) {
          setError('Pasted image is too large. Please use an image under 4MB.');
          return;
        }
        setImageFile(file);
        const previewUrl = URL.createObjectURL(file);
        setSelectedImage(previewUrl);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, []);

  // Update generation mode as inputs change
  useEffect(() => {
    const mode = determineGenerationMode(prompt, files.filter(f => f.mimeType?.startsWith('image/')), urls, textBlocks, files);
    setGenerationMode(mode);
  }, [prompt, files, urls, textBlocks]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4.5 * 1024 * 1024) {
      setError('Image is too large. Please select an image under 4MB.');
      return;
    }

    setImageFile(file);

    // Optimize: Create preview URL for display (lighter than base64)
    const previewUrl = URL.createObjectURL(file);
    setSelectedImage(previewUrl);

    // For API, we'll convert to base64 only when generating (not stored in state)
  };

  const handleFileSelect = useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    setIsUploading(true);
    setUploadErrors([]);
    const newFiles: FileItem[] = [];
    const errors: string[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];

      const allowedTypes = [
        'image/png', 'image/jpeg', 'image/jpg',
        'text/csv', 'application/json', 'text/plain',
      ];

      if (!allowedTypes.some(type => file.type.startsWith(type.split('/')[0]) || file.type === type)) {
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
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            forIngest: true,
          }),
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
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        errors.push(`Failed to upload: ${file.name}`);
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
        if (orgId) {
          await settings.loadFromDb(orgId);
        }

        translateAllActiveLanguages().catch(err => {
          console.error('Background translation error:', err);
        });

        router.push('/product-details');
      } catch (err) {
        console.error('Invalid JSON import:', err);
        setError('Invalid JSON file');
      }
    };
    reader.readAsText(file);
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

  const removeFile = (id: string) => {
    const fileToRemove = files.find(f => f.id === id);
    if (fileToRemove?.previewUrl) {
      URL.revokeObjectURL(fileToRemove.previewUrl);
    }
    setFiles(files.filter(f => f.id !== id));
  };

  const handleGenerate = async () => {
    setError(null);
    const mode = determineGenerationMode(prompt, files.filter(f => f.mimeType?.startsWith('image/')), urls, textBlocks, files);

    if (!mode) {
      setError('Please add at least one input (text, image, URL, or file)');
      return;
    }

    setIsGenerating(true);
    setGenerationStep('classifying');

    try {
      resetStore();
      applyMedusaDefaultsForNewProduct({
        defaultSalesChannelId: settings.defaultSalesChannelId,
        defaultShippingProfileId: settings.defaultShippingProfileId,
        defaultCollectionId: settings.defaultCollectionId,
        defaultCategoryIds: settings.defaultCategoryIds,
      });

      if (mode === 'fast') {
        // Fast path: use /api/generate
        setGenerationStep('generating');

        const body: { prompt?: string; image?: string } = {};
        const trimmedPrompt = prompt.trim();
        if (trimmedPrompt) body.prompt = trimmedPrompt;

        // Convert image file to base64 only when needed (not stored in state)
        if (imageFile) {
          const reader = new FileReader();
          const imageDataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
          });
          body.image = imageDataUrl;
        } else if (selectedImage && selectedImage.startsWith('data:')) {
          // Fallback: if already base64, use it
          body.image = selectedImage;
        }

        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        if (res.ok) {
          const { updateRoot, updateLocalization } = useProductStore.getState();
          updateRoot({
            title: data.title,
            description: data.description,
          });

          updateLocalization('en', {
            title: data.title,
            description: data.description,
            subtitle: data.subtitle,
            features: data.features,
            metadata_title: data.metadata_title,
            metadata_description: data.metadata_description,
            keywords: data.keywords,
          });

          await saveToDb();

          const orgId = useProductStore.getState().organizationId;
          if (orgId) {
            await settings.loadFromDb(orgId);
          }

          translateAllActiveLanguages().catch(err => {
            console.error('Background translation error:', err);
          });

          setGenerationStep('finalizing');
          setIsGenerating(false);

          toast({
            title: 'Draft ready',
            description: 'Product content generated successfully.',
            type: 'success'
          });

          // Navigate to product details
          router.push('/product-details');
        } else {
          const errMsg = data.error || 'Generation failed';
          setError(errMsg);
          toast({
            title: 'Generation Failed',
            description: errMsg,
            type: 'error'
          });
          setIsGenerating(false);
          setGenerationStep('idle');
        }
      } else {
        // Ingest path: use /api/products/ingest
        const activeTextBlocks = textBlocks.filter(b => b.trim().length > 0);
        const activeUrls = urls.filter(u => u.trim().length > 0);
        const activeFiles = files.map(f => {
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

        const activeLanguages = settings.activeLanguages.length > 0
          ? settings.activeLanguages
          : ['en'];

        const res = await fetch('/api/products/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetLanguages: activeLanguages,
            textBlocks: activeTextBlocks,
            urls: activeUrls,
            files: activeFiles,
          }),
        });

        const data = await res.json();

        if (res.ok) {
          setGenerationStep('finalizing');
          loadFromBlueprint(data.blueprint);
          await saveToDb();
          setIsGenerating(false);
          setGenerationStep('idle');

          toast({
            title: 'Ingestion complete',
            description: 'Product draft created from sources.',
            type: 'success'
          });

          router.push('/product-details');
        } else {
          const errMsg = data.error || 'Generation failed';
          setError(errMsg);
          toast({
            title: 'Ingestion Failed',
            description: errMsg,
            type: 'error'
          });
          setIsGenerating(false);
          setGenerationStep('idle');
        }
      }
    } catch (error) {
      console.error('Generation error:', error);
      setError('Network error during generation');
      toast({
        title: 'Network Error',
        description: 'Failed to connect to the server.',
        type: 'error'
      });
      setIsGenerating(false);
      setGenerationStep('idle');
    }
  };

  const canGenerate = generationMode !== null && !isUploading;

  // Dev widget state
  const [showDevWidget, setShowDevWidget] = useState(false);
  const isDev = process.env.NODE_ENV === 'development';

  // Load fake product for testing
  const loadFakeProduct = useCallback(() => {
    // Generate unique handle to avoid "already exists" errors when testing
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const uniqueHandle = `dual-tone-bold-band-${timestamp}-${randomSuffix}`;
    
    const fakeProduct = {
      "title": "Dual-Tone Bold Band",
      "subtitle": "Elevate your style with bold sophistication.",
      "status": "draft",
      "external_id": null,
      "description": "Where luxury meets attitude. This black and gold ring redefines modern elegance with its striking contrast and sleek design. Wear it unapologetically.",
      "handle": uniqueHandle,
      "is_giftcard": false,
      "discountable": true,
      "thumbnail": "https://pub-90fab3dc48a942f684f3a82c0be3f78d.r2.dev/29256ed6-ca40-427a-b1fb-91cbbddc0b3b/ai-studio/1769473268610-87fe5250-de5f-4ebd-90b3-06b19f1fa596.jpg",
      "collection_id": "pcol_01KD1YXSM6QSKQHBVKH73WBKTJ",
      "type_id": null,
      "weight": null,
      "length": 0,
      "height": 0,
      "width": 0,
      "hs_code": null,
      "origin_country": null,
      "mid_code": null,
      "material": null,
      "metadata": {
        "brand": "THE UNCUT BRAND",
        "vault": {
          "video": null,
          "images": []
        },
        "title_i18n": {
          "en": "Dual-Tone Bold Band",
          "fr": "Bague Audacieuse Bi-Ton"
        },
        "subtitle_i18n": {
          "en": "Elevate your style with bold sophistication.",
          "fr": "Élevez votre style avec une sophistication audacieuse."
        },
        "description_i18n": {
          "en": "Where luxury meets attitude. This black and gold ring redefines modern elegance with its striking contrast and sleek design. Wear it unapologetically.",
          "fr": "Là où le luxe rencontre l'attitude. Cette bague noire et dorée redéfinit l'élégance moderne avec son contraste saisissant et son design épuré. Portez-la sans excuses."
        },
        "features_i18n": {
          "en": [
            "Striking black and gold dual-tone design",
            "Crafted for a confident, modern look",
            "Perfect for any occasion, day or night",
            "Durable finish for lasting wear",
            "Unisex appeal—style knows no gender"
          ],
          "fr": [
            "Design bi-ton noir et doré saisissant",
            "Conçue pour un look moderne et confiant",
            "Parfaite pour toutes les occasions, jour ou nuit",
            "Finition durable pour une longévité assurée",
            "Attrait unisexe—le style n'a pas de genre"
          ]
        },
        "keywords_i18n": {
          "en": [
            "black and gold ring",
            "modern men's jewelry",
            "luxury ring",
            "bold jewelry",
            "unisex ring"
          ],
          "fr": [
            "bague noire et dorée",
            "bijoux modernes pour hommes",
            "bague de luxe",
            "bijoux audacieux",
            "bague unisexe"
          ]
        },
        "seo_title_i18n": {
          "en": "Luxury Black and Gold Ring | The Uncut Brand",
          "fr": "Bague Noire et Dorée de Luxe | The Uncut Brand"
        },
        "seo_description_i18n": {
          "en": "Discover the bold elegance of our dual-tone black and gold ring. A modern statement piece for the confident individual.",
          "fr": "Découvrez l'élégance audacieuse de notre bague bi-ton noire et dorée. Une pièce moderne pour l'individu confiant."
        },
        "options_i18n": [
          {
            "title_i18n": {
              "en": "Color",
              "fr": "Couleur"
            },
            "values": [
              {
                "value": "Black",
                "value_i18n": {
                  "en": "Black",
                  "fr": "Noir"
                }
              },
              {
                "value": "Gold",
                "value_i18n": {
                  "en": "Gold",
                  "fr": "Or"
                }
              },
              {
                "value": "red",
                "value_i18n": {
                  "en": "red",
                  "fr": "Rouge"
                }
              }
            ]
          }
        ]
      },
      "options": [
        {
          "id": "8ae78caf-5f11-436f-92d8-261161afedeb",
          "title": "Color",
          "values": [
            "Black",
            "Gold",
            "red"
          ]
        }
      ],
      "variants": [
        {
          "id": "d73b5887-b45c-48db-879d-a86d4987d801",
          "title": "Dual-Tone Bold Band - Black",
          "sku": `${uniqueHandle}-black`,
          "options": [
            {
              "value": "Black",
              "option_id": "8ae78caf-5f11-436f-92d8-261161afedeb"
            }
          ],
          "prices": [
            {
              "amount": 20,
              "currency_code": "usd"
            },
            {
              "amount": 22,
              "currency_code": "cad"
            }
          ],
          "manage_inventory": false,
          "allow_backorder": false
        },
        {
          "id": "3a6e1ab8-612b-4c9f-aa06-55c64c1ebf7c",
          "title": "Dual-Tone Bold Band - Gold",
          "sku": `${uniqueHandle}-gold`,
          "options": [
            {
              "value": "Gold",
              "option_id": "8ae78caf-5f11-436f-92d8-261161afedeb"
            }
          ],
          "prices": [
            {
              "amount": 20,
              "currency_code": "usd"
            },
            {
              "amount": 22,
              "currency_code": "cad"
            }
          ],
          "manage_inventory": false,
          "allow_backorder": false
        },
        {
          "id": "5402bf4b-b850-45e9-96aa-5931c07a68e8",
          "title": "Dual-Tone Bold Band - red",
          "sku": `${uniqueHandle}-red`,
          "options": [
            {
              "value": "red",
              "option_id": "8ae78caf-5f11-436f-92d8-261161afedeb"
            }
          ],
          "prices": [
            {
              "amount": 20,
              "currency_code": "usd"
            },
            {
              "amount": 22,
              "currency_code": "cad"
            }
          ],
          "manage_inventory": false,
          "allow_backorder": false
        }
      ],
      "tags": [],
      "images": [
        {
          "url": "https://pub-90fab3dc48a942f684f3a82c0be3f78d.r2.dev/29256ed6-ca40-427a-b1fb-91cbbddc0b3b/ai-studio/1769473268610-87fe5250-de5f-4ebd-90b3-06b19f1fa596.jpg",
          "metadata": null,
          "rank": 0
        },
        {
          "url": "https://pub-90fab3dc48a942f684f3a82c0be3f78d.r2.dev/29256ed6-ca40-427a-b1fb-91cbbddc0b3b/ai-studio/1769473327161-9a0418ff-4603-4c13-a6ba-dd94a390f5c8.jpg",
          "metadata": null,
          "rank": 1
        }
      ],
      "categories": [],
      "sales_channels": [
        {
          "id": "sc_01KCZATV7WR5QX2G5S5NGM32E0"
        }
      ],
      "shipping_profile_id": "sp_01KCZAPGHDP30PNK0DS7R3V706"
    };

    try {
      const mappedData = mapExternalToProduct(fakeProduct);
      resetStore();
      bulkUpdate(mappedData);

      applyMedusaDefaultsForNewProduct({
        defaultSalesChannelId: settings.defaultSalesChannelId,
        defaultShippingProfileId: settings.defaultShippingProfileId,
        defaultCollectionId: settings.defaultCollectionId,
        defaultCategoryIds: settings.defaultCategoryIds,
      });

      toast({
        title: 'Fake product loaded',
        description: 'Test product loaded successfully. Navigate to product details to continue.',
        type: 'success'
      });

      router.push('/product-details');
    } catch (error) {
      console.error('Failed to load fake product:', error);
      toast({
        title: 'Failed to load fake product',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error'
      });
    }
  }, [resetStore, bulkUpdate, applyMedusaDefaultsForNewProduct, settings, router, toast]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (selectedImage && selectedImage.startsWith('blob:')) {
        URL.revokeObjectURL(selectedImage);
      }
      files.forEach(f => {
        if (f.previewUrl && f.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(f.previewUrl);
        }
      });
    };
  }, [selectedImage, files]);

  return (
    <div className="space-y-6 pb-32 md:pb-8">
      <header className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold text-white">Create Product</h1>
        <p className="text-zinc-400 text-sm md:text-base">
          Add any combination of sources. We'll generate a complete product draft.
        </p>
        {generationMode && (
          <div className={cn(
            "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium",
            generationMode === 'fast'
              ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
              : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
          )}>
            {generationMode === 'fast' ? (
              <>
                <Zap className="w-3 h-3" />
                Fast Generation
              </>
            ) : (
              <>
                <Layers className="w-3 h-3" />
                Full Ingest Pipeline
              </>
            )}
          </div>
        )}
      </header>

      {/* Dev Widget - Only visible in development */}
      {isDev && (
        <section className="glass rounded-2xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
          <button
            onClick={() => setShowDevWidget(!showDevWidget)}
            className="w-full flex items-center justify-between p-4 md:p-6 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <TestTube className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-semibold text-white">Dev Tools</h2>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
                TEST
              </span>
            </div>
            {showDevWidget ? (
              <ChevronUp className="w-5 h-5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-zinc-400" />
            )}
          </button>

          <AnimatePresence>
            {showDevWidget && (
              <motion.div
                initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 md:p-6 pt-0 space-y-4">
                  <p className="text-xs text-zinc-400">
                    Load a fake product for testing without using AI tokens.
                  </p>
                  <button
                    onClick={loadFakeProduct}
                    disabled={isGenerating}
                    className={cn(
                      "w-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30",
                      "text-amber-300 px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2",
                      "transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
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

      {error && (
        <div className="glass rounded-xl p-4 border border-red-500/20 bg-red-500/5">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {uploadErrors.length > 0 && (
        <div className="glass rounded-xl p-4 border border-yellow-500/20 bg-yellow-500/5">
          <p className="text-xs font-semibold text-yellow-300 mb-2">Some files were not added:</p>
          <ul className="list-disc pl-5 space-y-1 text-xs text-yellow-200/90">
            {uploadErrors.map((msg, idx) => (
              <li key={idx}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Primary: Prompt + Image */}
      <section className="glass rounded-2xl p-4 md:p-6 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            Quick Start
          </h2>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="file"
              className="hidden"
              ref={imageInputRef}
              accept="image/*"
              onChange={handleImageSelect}
            />
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={isGenerating || isUploading}
              className={cn(
                "p-3 rounded-xl transition-all active:scale-90 flex-shrink-0",
                selectedImage
                  ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  : "bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
              )}
              title="Add reference image"
            >
              <ImagePlus className="w-5 h-5" />
            </button>

            <AnimatePresence>
              {selectedImage && (
                <motion.div
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.8 }}
                  className="relative w-12 h-12 rounded-lg overflow-hidden border border-white/10 flex-shrink-0"
                >
                  <img
                    src={selectedImage}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onLoad={() => {
                      // Clean up object URL after image loads (if it's an object URL)
                      if (selectedImage.startsWith('blob:')) {
                        // Keep it for now, clean up on unmount
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (selectedImage.startsWith('blob:')) {
                        URL.revokeObjectURL(selectedImage);
                      }
                      setSelectedImage(null);
                      setImageFile(null);
                    }}
                    className="absolute top-0 right-0 p-0.5 bg-black/60 text-white rounded-bl-lg hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <textarea
              placeholder="Describe your product concept..."
              className="flex-1 bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-indigo-500/50 outline-none resize-none min-h-[100px]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating || isUploading}
            />
          </div>
          <p className="text-xs text-zinc-500 italic">
            💡 Tip: Paste an image (Ctrl+V / Cmd+V) anywhere on this page to add it
          </p>
        </div>
      </section>

      {/* Advanced Sources (Progressive Disclosure) */}
      <div className="space-y-3">
        {/* URLs */}
        <section className="glass rounded-2xl border border-white/10 overflow-hidden">
          <button
            onClick={() => toggleSection('urls')}
            className="w-full flex items-center justify-between p-4 md:p-6 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <LinkIcon className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">URLs</h2>
              {urls.some(u => u.trim().length > 0) && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-medium">
                  {urls.filter(u => u.trim().length > 0).length}
                </span>
              )}
            </div>
            {expandedSections.has('urls') ? (
              <ChevronUp className="w-5 h-5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-zinc-400" />
            )}
          </button>

          <AnimatePresence>
            {expandedSections.has('urls') && (
              <motion.div
                initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 md:p-6 pt-0 space-y-3">
                  {urls.map((url, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => handleUrlChange(index, e.target.value)}
                        placeholder="https://www.aliexpress.com/item/..."
                        className="flex-1 bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-indigo-500/50 outline-none"
                        disabled={isGenerating || isUploading}
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
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Image URLs */}
        <section className="glass rounded-2xl border border-white/10 overflow-hidden">
          <button
            onClick={() => toggleSection('imageUrls')}
            className="w-full flex items-center justify-between p-4 md:p-6 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <ImagePlus className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">Image URLs</h2>
              {imageUrls.some(u => u.trim().length > 0) && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-medium">
                  {imageUrls.filter(u => u.trim().length > 0).length}
                </span>
              )}
            </div>
            {expandedSections.has('imageUrls') ? (
              <ChevronUp className="w-5 h-5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-zinc-400" />
            )}
          </button>

          <AnimatePresence>
            {expandedSections.has('imageUrls') && (
              <motion.div
                initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 md:p-6 pt-0 space-y-3">
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
                        disabled={isGenerating || isUploading}
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
                  <p className="text-xs text-zinc-500 italic">
                    Paste an image URL to download and add it. Press Enter or click Add to submit.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Text Blocks */}
        <section className="glass rounded-2xl border border-white/10 overflow-hidden">
          <button
            onClick={() => toggleSection('text')}
            className="w-full flex items-center justify-between p-4 md:p-6 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">Text Blocks</h2>
              {textBlocks.some(b => b.trim().length > 0) && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-medium">
                  {textBlocks.filter(b => b.trim().length > 0).length}
                </span>
              )}
            </div>
            {expandedSections.has('text') ? (
              <ChevronUp className="w-5 h-5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-zinc-400" />
            )}
          </button>

          <AnimatePresence>
            {expandedSections.has('text') && (
              <motion.div
                initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 md:p-6 pt-0 space-y-3">
                  {textBlocks.map((block, index) => (
                    <div key={index} className="flex gap-2">
                      <textarea
                        value={block}
                        onChange={(e) => handleTextBlockChange(index, e.target.value)}
                        placeholder="Paste product description, notes, specs, etc."
                        className="flex-1 bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-indigo-500/50 outline-none resize-none min-h-[100px]"
                        disabled={isGenerating || isUploading}
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
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Files */}
        <section className="glass rounded-2xl border border-white/10 overflow-hidden">
          <button
            onClick={() => toggleSection('files')}
            className="w-full flex items-center justify-between p-4 md:p-6 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Upload className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">Files</h2>
              {files.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-medium">
                  {files.length}
                </span>
              )}
            </div>
            {expandedSections.has('files') ? (
              <ChevronUp className="w-5 h-5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-zinc-400" />
            )}
          </button>

          <AnimatePresence>
            {expandedSections.has('files') && (
              <motion.div
                initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 md:p-6 pt-0 space-y-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer',
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
                    <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                    <p className="text-zinc-400 text-sm">
                      Drag and drop files or click to browse
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      TXT, CSV, JSON, PNG, JPG, JPEG
                    </p>
                  </div>

                  {files.length > 0 && (
                    <div className="space-y-2">
                      {files.map((fileItem) => (
                        <div
                          key={fileItem.id}
                          className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-lg border border-white/10"
                        >
                          {fileItem.previewUrl ? (
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                              <img src={fileItem.previewUrl} alt={fileItem.name} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <FileText className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">{fileItem.name}</div>
                            <div className="text-xs text-zinc-500">{fileItem.mimeType}</div>
                          </div>
                          <button
                            onClick={() => removeFile(fileItem.id)}
                            className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* JSON Import */}
        <section className="glass rounded-2xl border border-white/10 overflow-hidden">
          <button
            onClick={() => toggleSection('json')}
            className="w-full flex items-center justify-between p-4 md:p-6 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <FileJson className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">JSON Import</h2>
            </div>
            {expandedSections.has('json') ? (
              <ChevronUp className="w-5 h-5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-zinc-400" />
            )}
          </button>

          <AnimatePresence>
            {expandedSections.has('json') && (
              <motion.div
                initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 md:p-6 pt-0">
                  <input
                    ref={jsonInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleJsonImport}
                    className="hidden"
                  />
                  <button
                    onClick={() => jsonInputRef.current?.click()}
                    className="w-full p-4 border-2 border-dashed border-white/10 rounded-xl hover:border-indigo-500/30 transition-colors text-zinc-400 hover:text-white"
                  >
                    <FileJson className="w-6 h-6 mx-auto mb-2" />
                    <p className="text-sm">Import JSON file</p>
                    <p className="text-xs text-zinc-500 mt-1">Shopify, Medusa, or custom schema</p>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      {/* Sticky Bottom CTA (Mobile-First) */}
      <div className="fixed bottom-[80px] md:bottom-auto left-0 right-0 md:relative md:left-auto md:right-auto z-[60] md:z-auto pb-safe md:pb-0">
        <div className="glass-dark border-t border-white/10 md:border-t-0 md:border border-white/10 rounded-t-2xl md:rounded-2xl p-4 md:p-6 space-y-4 shadow-2xl md:shadow-none">
          {isGenerating && (
            <div className="flex items-center gap-4 text-sm text-zinc-400">
              {[
                { id: 'classifying', label: 'Classifying' },
                { id: 'extracting', label: 'Extracting' },
                { id: 'generating', label: 'Generating' },
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
                      "transition-colors duration-500 hidden md:inline",
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
            disabled={!canGenerate || isGenerating}
            className={cn(
              'w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500',
              'text-white px-6 py-4 rounded-xl font-bold flex items-center justify-center gap-3',
              'transition-all shadow-xl shadow-indigo-500/20 active:scale-95',
              'touch-target-large min-h-[56px]'
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="hidden md:inline">Generating...</span>
                <span className="md:hidden">Generating...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Generate Product Draft</span>
                <ArrowRight className="w-4 h-4 hidden md:inline" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
