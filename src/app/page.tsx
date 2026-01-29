'use client';

import React, { useState, useRef, useEffect, useMemo, Suspense } from 'react';
import { Sparkles, ArrowRight, Zap, Globe, Package, Loader2, FileJson, UploadCloud, X, FileDown, ExternalLink, Star, Search, Filter, Trash2, RefreshCw, Pencil, Eye, Save, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProductStore } from '@/store/useProductStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useRouter } from 'next/navigation';
import { mapExternalToProduct } from '@/lib/mapper';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { translateAllActiveLanguages } from '@/lib/translations';
import { getMedusaProducts } from './product-details/actions';
import { buildMedusaAdminProductPayloadFromSavedProduct } from '@/lib/medusa/build-admin-product-payload';
import { FirstTimeGuide } from '@/components/onboarding/FirstTimeGuide';
import { updateOnboardingState, markOnboardingComplete } from '@/lib/user-onboarding';
import { useToast } from '@/components/ui/ToastProvider';
import { useSearchParams } from 'next/navigation';

type SavedProductRow = {
  id: string;
  organization_id: string;
  title: string;
  handle: string;
  status: string;
  sku: string | null;
  price: number | null;
  created_at: string;
  data: unknown | null;
  is_template?: boolean | null;
  medusa_product_id?: string | null;
};

type MedusaProductRow = {
  id: string;
  title: string;
  handle: string;
  status: string;
  created_at: string;
  thumbnail?: string | null;
  variants?: unknown[];
};

type MedusaProductDetails = {
  id: string;
  title?: string;
  handle?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  thumbnail?: string | null;
  [k: string]: unknown;
};

function getThumbnailFromProductData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const maybe = (data as Record<string, unknown>).thumbnail;
  return typeof maybe === 'string' && maybe.length > 0 ? maybe : null;
}

function getMedusaIdFromProductData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const maybe = (data as Record<string, unknown>).medusa_product_id;
  return typeof maybe === 'string' && maybe.length > 0 ? maybe : null;
}

// Component that uses useSearchParams - must be wrapped in Suspense
function OnboardingCompletionHandler() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (searchParams?.get('onboarding') === 'complete') {
      markOnboardingComplete();
      // Show welcome toast after a brief delay
      setTimeout(() => {
        toast({
          type: 'success',
          title: 'Setup complete!',
          description: 'Welcome to Product Architect. Ready to create your first product?',
          duration: 6000,
          action: {
            label: 'Create Product',
            onClick: () => router.push('/create'),
          },
        });
      }, 500);
    }
  }, [searchParams, toast, router]);

  return null;
}

export default function Dashboard() {
  const [isImporting, setIsImporting] = useState(false);
  const [products, setProducts] = useState<SavedProductRow[]>([]);
  const [storeProducts, setStoreProducts] = useState<MedusaProductRow[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingStoreProducts, setIsLoadingStoreProducts] = useState(false);
  const [isStoreConfigured, setIsStoreConfigured] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'published' | 'template'>('all'); // Replaced by Tabs
  const [isMedusaModalOpen, setIsMedusaModalOpen] = useState(false);
  const [activeMedusaProductId, setActiveMedusaProductId] = useState<string | null>(null);
  const [activeMedusaProduct, setActiveMedusaProduct] = useState<MedusaProductDetails | null>(null);
  const [medusaEditTitle, setMedusaEditTitle] = useState('');
  const [medusaEditHandle, setMedusaEditHandle] = useState('');
  const [medusaEditStatus, setMedusaEditStatus] = useState<'draft' | 'published'>('draft');
  const [isMedusaSaving, setIsMedusaSaving] = useState(false);
  const [isMedusaDeleting, setIsMedusaDeleting] = useState(false);
  const [isMedusaRefreshing, setIsMedusaRefreshing] = useState(false);
  const [isMedusaExporting, setIsMedusaExporting] = useState(false);

  // Bulk selection state (Local + Medusa catalogs)
  const [selectedLocalIds, setSelectedLocalIds] = useState<Set<string>>(new Set());
  const [selectedMedusaIds, setSelectedMedusaIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<{
    kind:
    | 'local_delete'
    | 'local_publish'
    | 'medusa_export'
    | 'medusa_move'
    | 'medusa_delete'
    | null;
    running: boolean;
    total: number;
    done: number;
    failures: Array<{ id: string; error: string }>;
  }>({
    kind: null,
    running: false,
    total: 0,
    done: 0,
    failures: [],
  });
  const {
    updateRoot,
    updateLocalization,
    bulkUpdate,
    resetStore,
    setOrganizationId,
    saveToDb,
    loadFromSavedProduct,
    applyMedusaDefaultsForNewProduct,
  } = useProductStore();
  const settings = useSettingsStore();
  const loadSettingsFromDb = useSettingsStore((s) => s.loadFromDb);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const refreshLocalProducts = async (orgId: string) => {
    const { data: productsData, error } = await supabase
      .from('products')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const withMedusa = (productsData as unknown as SavedProductRow[]).map((p) => ({
      ...p,
      medusa_product_id: getMedusaIdFromProductData(p.data),
    }));
    setProducts(withMedusa);
  };

  const refreshMedusaProducts = async (orgId: string) => {
    setIsMedusaRefreshing(true);
    try {
      const res = await fetch('/api/medusa/products?limit=20', { cache: 'no-store' });
      const data = (await res.json()) as { products?: MedusaProductRow[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to refresh Medusa products');
      setStoreProducts(data.products || []);
    } catch (err) {
      console.error('Failed to refresh Medusa products:', err);
      alert('Failed to refresh Medusa products');
    } finally {
      setIsMedusaRefreshing(false);
    }
  };

  useEffect(() => {
    const getOrg = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: membership } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .single();

        if (membership) {
          const orgId = membership.organization_id;
          setOrganizationId(orgId);

          // Ensure org settings (including Medusa defaults) are loaded for auto-fill behaviors.
          await loadSettingsFromDb(orgId);

          // Fetch products for this org
          const { data: productsData, error } = await supabase
            .from('products')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });

          if (!error && productsData) {
            // Extract any persisted Medusa linkage from the JSON blob for display.
            const withMedusa = (productsData as unknown as SavedProductRow[]).map((p) => ({
              ...p,
              medusa_product_id: getMedusaIdFromProductData(p.data),
            }));
            setProducts(withMedusa);

            // Mark first product as created if products exist
            if (withMedusa.length > 0) {
              updateOnboardingState({ firstProductCreated: true });
            }
          }
          setIsLoadingProducts(false);

          // Check if store is configured and fetch products
          const { data: settingsData } = await supabase
            .from('organization_settings')
            .select('store_platform, medusa_url, medusa_api_key, openai_api_key')
            .eq('organization_id', orgId)
            .single();

          if (settingsData?.store_platform === 'medusa' && settingsData.medusa_url && settingsData.medusa_api_key) {
            setIsStoreConfigured(true);
            updateOnboardingState({ storeConfigured: true });
            setIsLoadingStoreProducts(true);
            // Prefer new proxy route (keeps Medusa creds server-side) but fall back to existing action.
            try {
              const res = await fetch('/api/medusa/products?limit=20', { cache: 'no-store' });
              const json = (await res.json()) as { products?: MedusaProductRow[]; error?: string };
              if (!res.ok) throw new Error(json.error || 'Failed to fetch Medusa products');
              setStoreProducts(json.products || []);
            } catch {
              const storeRes = await getMedusaProducts(orgId);
              if (storeRes.success) {
                setStoreProducts(storeRes.data as unknown as MedusaProductRow[]);
              }
            }
            setIsLoadingStoreProducts(false);
          }

          // Check if AI is configured (openai_api_key can be encrypted, so check if it exists)
          if (settingsData?.openai_api_key) {
            updateOnboardingState({ aiConfigured: true });
          }
        }
      }
    };
    getOrg();
  }, [setOrganizationId, supabase, loadSettingsFromDb]);

  const openSavedProduct = async (productId: string) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Product not found');

      loadFromSavedProduct(data);
      router.push('/product-details');
    } catch (err) {
      console.error('Failed to open product:', err);
      alert('Failed to open product. It may have been deleted or the data is corrupted.');
    }
  };

  const toggleTemplate = async (productId: string, nextValue: boolean) => {
    try {
      const res = await fetch('/api/products/set-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, isTemplate: nextValue }),
      });

      const data = (await res.json()) as { error?: string; is_template?: boolean };
      if (!res.ok) throw new Error(data.error || 'Failed to update template flag');

      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, is_template: nextValue } : p))
      );
    } catch (err) {
      console.error('Failed to toggle template:', err);
      alert('Failed to update template flag');
    }
  };

  const deleteSavedProduct = async (productId: string) => {
    const ok = window.confirm('Delete this local product? This cannot be undone.');
    if (!ok) return;

    try {
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to delete product');
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } catch (err) {
      console.error('Failed to delete product:', err);
      alert('Failed to delete local product');
    }
  };

  const publishSavedProductToMedusa = async (
    p: SavedProductRow,
    opts?: { confirm?: boolean; alertOnSuccess?: boolean; silent?: boolean; skipRefresh?: boolean }
  ) => {
    if (!isStoreConfigured) {
      alert('Medusa is not configured for this organization.');
      return;
    }

    const shouldConfirm = opts?.confirm ?? true;
    const silent = opts?.silent ?? false;
    const alertOnSuccess = opts?.alertOnSuccess ?? true;
    const skipRefresh = opts?.skipRefresh ?? false;
    if (shouldConfirm) {
      const ok = window.confirm('Create this product in Medusa? (Local draft remains unchanged)');
      if (!ok) return;
    }

    try {
      const payload = buildMedusaAdminProductPayloadFromSavedProduct({
        id: p.id,
        title: p.title,
        handle: p.handle,
        status: p.status,
        sku: p.sku ?? null,
        price: p.price ?? null,
        data: p.data ?? null,
      });

      /**
       * Preflight checks to avoid opaque 400s from Medusa for obvious missing data.
       * We keep this minimal and actionable (Medusa rules vary per instance).
       */
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid Medusa payload (not an object)');
      }
      const payloadObj = payload as Record<string, unknown>;
      const variants = payloadObj.variants;
      if (!Array.isArray(variants) || variants.length === 0) {
        throw new Error('Invalid Medusa payload: missing variants');
      }

      // Ensure shipping_profile_id is a string if the Medusa instance requires it.
      // Prefer per-product field; otherwise fall back to org default from Settings.
      if (payloadObj.shipping_profile_id == null) {
        const defaultShippingProfileId = settings.defaultShippingProfileId;
        if (defaultShippingProfileId && typeof defaultShippingProfileId === 'string') {
          payloadObj.shipping_profile_id = defaultShippingProfileId;
        } else {
          throw new Error(
            "Missing shipping_profile_id. Configure a default Shipping Profile in Settings → Medusa integration, or set it on the product before publishing."
          );
        }
      }

      const res = await fetch('/api/medusa/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });

      // Defensive: if server returns HTML (Next error page / auth redirect), avoid crashing on `res.json()`.
      const raw = await res.text();
      const json = (() => {
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          return { raw };
        }
      })() as {
        product?: { id?: string };
        error?: string;
        details?: unknown;
        raw?: string;
      };

      if (!res.ok) {
        // This route returns `{ error, details }` on upstream Medusa failures.
        // We surface `details` to make 400s debuggable (validation errors, missing fields, etc.).
        const detailsPreview =
          json.details !== undefined ? `\nDetails: ${JSON.stringify(json.details).slice(0, 2000)}` : '';
        const rawPreview =
          json.details === undefined && typeof json.raw === 'string'
            ? `\nNon-JSON response preview: ${json.raw.slice(0, 300)}`
            : '';
        throw new Error(
          (json.error || `Failed to create product in Medusa (${res.status} ${res.statusText})`) +
          detailsPreview +
          rawPreview
        );
      }

      const medusaId = json.product?.id || null;
      if (medusaId) {
        // Persist linkage on the local record (org-scoped server-side).
        await fetch('/api/products/link-medusa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: p.id, medusaProductId: medusaId }),
        });

        setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, medusa_product_id: medusaId } : x)));
      }

      if (alertOnSuccess && !silent) {
        alert(medusaId ? `Published to Medusa: ${medusaId}` : 'Published to Medusa (no id returned)');
      }

      // Refresh Medusa list so it shows immediately (skip in bulk).
      if (!skipRefresh) {
        await refreshMedusaProducts(p.organization_id);
      }
    } catch (err) {
      console.error('Publish to Medusa failed:', err, { localProductId: p.id });
      if (silent) throw err;
      alert(err instanceof Error ? err.message : 'Failed to publish product to Medusa');
    }
  };

  const openMedusaModal = async (id: string) => {
    setIsMedusaModalOpen(true);
    setActiveMedusaProductId(id);
    setActiveMedusaProduct(null);

    try {
      const res = await fetch(`/api/medusa/products/${id}`, { cache: 'no-store' });
      const json = (await res.json()) as { product?: MedusaProductDetails; error?: string };
      if (!res.ok) throw new Error(json.error || 'Failed to fetch Medusa product');

      const prod = json.product || (json as unknown as MedusaProductDetails);
      setActiveMedusaProduct(prod);
      setMedusaEditTitle(typeof prod.title === 'string' ? prod.title : '');
      setMedusaEditHandle(typeof prod.handle === 'string' ? prod.handle : '');
      setMedusaEditStatus((prod.status === 'published' ? 'published' : 'draft') as 'draft' | 'published');
    } catch (err) {
      console.error('Failed to open Medusa product:', err);
      alert('Failed to fetch Medusa product');
    }
  };

  const closeMedusaModal = () => {
    setIsMedusaModalOpen(false);
    setActiveMedusaProductId(null);
    setActiveMedusaProduct(null);
  };

  const saveMedusaEdits = async () => {
    if (!activeMedusaProductId) return;
    setIsMedusaSaving(true);
    try {
      const payload = {
        title: medusaEditTitle,
        handle: medusaEditHandle,
        status: medusaEditStatus,
      };

      const res = await fetch(`/api/medusa/products/${activeMedusaProductId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });
      const json = (await res.json()) as { product?: MedusaProductDetails; error?: string };
      if (!res.ok) throw new Error(json.error || 'Failed to update Medusa product');

      await refreshMedusaProducts(useProductStore.getState().organizationId || '');
      alert('Updated Medusa product');
      closeMedusaModal();
    } catch (err) {
      console.error('Failed to update Medusa product:', err);
      alert('Failed to update Medusa product');
    } finally {
      setIsMedusaSaving(false);
    }
  };

  const deleteMedusaProduct = async () => {
    if (!activeMedusaProductId) return;
    const ok = window.confirm(`Delete Medusa product ${activeMedusaProductId}? This is permanent.`);
    if (!ok) return;

    setIsMedusaDeleting(true);
    try {
      const res = await fetch(`/api/medusa/products/${activeMedusaProductId}`, { method: 'DELETE' });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Failed to delete Medusa product');

      await refreshMedusaProducts(useProductStore.getState().organizationId || '');
      alert('Deleted Medusa product');
      closeMedusaModal();
    } catch (err) {
      console.error('Failed to delete Medusa product:', err);
      alert('Failed to delete Medusa product');
    } finally {
      setIsMedusaDeleting(false);
    }
  };

  const handleEditMedusaProduct = async (id: string) => {
    try {
      const res = await fetch(`/api/medusa/products/${id}`, { cache: 'no-store' });
      const json = (await res.json()) as { product?: MedusaProductDetails; error?: string };
      if (!res.ok) throw new Error(json.error || 'Failed to fetch Medusa product');

      const prod = json.product || (json as unknown as MedusaProductDetails);

      // Map to internal state
      const mappedData = mapExternalToProduct(prod);

      // Reset store and load mapped data
      resetStore();
      bulkUpdate({
        ...mappedData,
        medusaProductId: id, // Track that we are editing this existing product
      });

      // Apply org defaults if needed (though mapping should handle most)
      applyMedusaDefaultsForNewProduct({
        defaultSalesChannelId: settings.defaultSalesChannelId,
        defaultShippingProfileId: settings.defaultShippingProfileId,
        defaultCollectionId: settings.defaultCollectionId,
        defaultCategoryIds: settings.defaultCategoryIds,
      });

      await saveToDb(); // Save as a draft locally so we don't lose work

      router.push('/product-details');
    } catch (err) {
      console.error('Failed to load Medusa product for editing:', err);
      alert('Failed to load product for editing');
    }
  };

  const exportMedusaToLocal = async (mode: 'copy' | 'move') => {
    if (!activeMedusaProductId) return;

    const ok =
      mode === 'move'
        ? window.confirm('Move to local? This will copy into Supabase then permanently delete it from Medusa.')
        : window.confirm('Export to local? This will copy it into Supabase (Medusa product remains).');

    if (!ok) return;

    setIsMedusaExporting(true);
    try {
      const res = await fetch(`/api/medusa/products/${activeMedusaProductId}/export-to-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        localProductId?: string;
        deletedFromMedusa?: boolean;
        error?: string;
      };

      if (!res.ok) throw new Error(json.error || 'Failed to export product to local storage');

      const orgId = useProductStore.getState().organizationId;
      if (orgId) await refreshLocalProducts(orgId);
      await refreshMedusaProducts(orgId || '');

      if (json.localProductId) {
        alert(
          mode === 'move'
            ? `Moved to local (new id: ${json.localProductId}). Deleted from Medusa.`
            : `Exported to local (new id: ${json.localProductId}).`
        );
      } else {
        alert(mode === 'move' ? 'Moved to local.' : 'Exported to local.');
      }

      closeMedusaModal();
    } catch (err) {
      console.error('Export/Move failed:', err);
      alert('Failed to export/move product to local storage');
    } finally {
      setIsMedusaExporting(false);
    }
  };

  const startFromTemplate = async (productId: string) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Template not found');

      loadFromSavedProduct(data);

      // Start a NEW product derived from the template (avoid overwriting the template row).
      // Note: we also adjust handle to reduce collision risk.
      const suffix = crypto.randomUUID().slice(0, 8);
      bulkUpdate({
        id: undefined,
        status: 'draft',
        handle: `${String(data.handle || 'template').replace(/[^\w-]/g, '')}-copy-${suffix}`,
      });

      router.push('/product-details');
    } catch (err) {
      console.error('Failed to use template:', err);
      alert('Failed to start from template');
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const mappedData = mapExternalToProduct(json);
        resetStore();
        bulkUpdate(mappedData);

        // Apply org defaults only when the import did not provide taxonomy values.
        // This keeps JSON imports deterministic while still auto-filling missing store fields.
        applyMedusaDefaultsForNewProduct({
          defaultSalesChannelId: settings.defaultSalesChannelId,
          defaultShippingProfileId: settings.defaultShippingProfileId,
          defaultCollectionId: settings.defaultCollectionId,
          defaultCategoryIds: settings.defaultCategoryIds,
        });

        // Save to DB immediately after import
        await saveToDb();

        // Load settings to get active languages before translating
        const orgId = useProductStore.getState().organizationId;
        if (orgId) {
          await settings.loadFromDb(orgId);
        }

        // Start background translations for all active languages
        translateAllActiveLanguages().catch(err => {
          console.error('Background translation error:', err);
        });

        router.push('/product-details');
      } catch (err) {
        console.error('Invalid JSON import:', err);
        alert('Invalid JSON file');
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadDemo = () => {
    const demoProduct = {
      title: "Minimalist Recycled Leather Wallet",
      description: "Hand-crafted from 100% recycled premium leather, this slim wallet combines sustainability with timeless design. Featuring a precision-cut silhouette and reinforced stitching for ultimate longevity.",
      subtitle: "Sustainability meets sophisticated design.",
      sku: "WL-MIN-001",
      price: 45.00,
      images: [
        "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&q=80&w=800",
        "https://images.unsplash.com/photo-1550520920-27af500dae7a?auto=format&fit=crop&q=80&w=800"
      ],
      options: [
        {
          name: "Color",
          values: ["Obsidian Black", "Arctic White", "Saddle Brown"]
        },
        {
          name: "Size",
          values: ["Slim", "Executive"]
        }
      ],
      features: [
        "100% recycled leather",
        "Holds up to 8 cards",
        "RFID protection layer",
        "Hand-stitched durability"
      ],
      metadata_title: "Minimalist Wallet | Recycled Leather | The Uncut Brand",
      metadata_description: "Shop our handcrafted minimalist wallet made from recycled leather. Sustainable, slim, and built to last.",
      keywords: ["wallet", "leather", "minimalist", "sustainable", "recycled", "rfid protection"]
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(demoProduct, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "product-demo.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // UNIFIED PRODUCT TYPE
  type UnifiedProduct = {
    id: string; // The primary ID (Local ID preferred, fallback to Medusa ID)
    title: string;
    handle: string;
    thumbnail: string | null;
    created_at: string;
    
    // Local State
    local: SavedProductRow | null;
    isLocal: boolean;
    isTemplate: boolean;

    // Medusa State
    medusa: MedusaProductRow | null;
    isMedusa: boolean;
    medusaStatus: 'published' | 'draft' | 'proposed' | 'rejected' | null;
    medusaId: string | null;
  };

  // Memoize unified products
  const unifiedProducts: UnifiedProduct[] = useMemo(() => {
    const map = new Map<string, UnifiedProduct>();

    // 1. Add all Local Products first
    products.forEach((p) => {
      // Use medusa_product_id to find a match later, or use local ID as key
      const medusaId = p.medusa_product_id;
      
      const u: UnifiedProduct = {
        id: p.id,
        title: p.title,
        handle: p.handle,
        thumbnail: getThumbnailFromProductData(p.data),
        created_at: p.created_at,
        local: p,
        isLocal: true,
        isTemplate: p.is_template || false,
        medusa: null,
        isMedusa: false,
        medusaStatus: null,
        medusaId: medusaId || null,
      };

      // If linked, map by medusaId so we can merge later. Otherwise map by local ID.
      if (medusaId) {
        map.set(medusaId, u);
      } else {
        map.set(p.id, u);
      }
    });

    // 2. Merge Medusa Products
    storeProducts.forEach((m) => {
      // Check if we already have this product (via linkage)
      const existing = map.get(m.id);

      if (existing) {
        // MERGE: We found a local product that claims this Medusa ID
        existing.medusa = m;
        existing.isMedusa = true;
        existing.medusaStatus = m.status as any;
      } else {
        // NEW: This exists in Medusa but not locally
        map.set(m.id, {
          id: m.id,
          title: m.title,
          handle: m.handle,
          thumbnail: m.thumbnail || null,
          created_at: m.created_at,
          local: null,
          isLocal: false,
          isTemplate: false,
          medusa: m,
          isMedusa: true,
          medusaStatus: m.status as any,
          medusaId: m.id,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [products, storeProducts]);

  // Filter unified list based on active Tab
  const [activeTab, setActiveTab] = useState<'all' | 'local' | 'medusa_prod' | 'medusa_draft'>('all');

  const filteredUnifiedProducts = useMemo(() => {
    let list = unifiedProducts;

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => 
        p.title.toLowerCase().includes(q) || 
        p.handle?.toLowerCase().includes(q)
      );
    }

    // Tabs
    switch (activeTab) {
      case 'local':
        return list.filter(p => p.isLocal);
      case 'medusa_prod':
        return list.filter(p => p.isMedusa && p.medusaStatus === 'published');
      case 'medusa_draft':
        return list.filter(p => p.isMedusa && p.medusaStatus === 'draft');
      case 'all':
      default:
        return list;
    }
  }, [unifiedProducts, activeTab, searchQuery]);

  // Bulk Selection Helpers (Unified)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = (id: string, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(filteredUnifiedProducts.map(p => p.id)));
  };

  const clearBulkStatus = () =>
    setBulkStatus({
      kind: null,
      running: false,
      total: 0,
      done: 0,
      failures: [],
    });

  // Action Runners (Unified Wrapper)
  const runBulkLocalDelete = async () => {
    // Filter selected IDs that are LOCAL
    const ids = Array.from(selectedIds).filter(id => {
       const p = unifiedProducts.find(x => x.id === id);
       return p?.isLocal;
    });
    
    if (ids.length === 0) return;
    const ok = window.confirm(`Delete ${ids.length} local product(s)? This cannot be undone.`);
    if (!ok) return;

    clearBulkStatus();
    setBulkStatus({ kind: 'local_delete', running: true, total: ids.length, done: 0, failures: [] });

    const failures: Array<{ id: string; error: string }> = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error || 'Failed to delete');
        setProducts((prev) => prev.filter((p) => p.id !== id));
      } catch (e) {
        failures.push({ id, error: e instanceof Error ? e.message : 'Failed to delete' });
      } finally {
        setBulkStatus((prev) => ({ ...prev, done: i + 1, failures }));
      }
    }

    setSelectedIds(new Set());
    setBulkStatus((prev) => ({ ...prev, running: false }));
  };

  // Helper to render badges
  const renderBadge = (p: UnifiedProduct) => {
    const badges = [];

    if (p.isLocal && p.isMedusa) {
       // Hybrid
       const color = p.medusaStatus === 'published' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-amber-400 border-amber-500/30 bg-amber-500/10';
       badges.push(
         <span key="hybrid" className={cn("text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1.5", color)}>
           <div className={cn("w-1.5 h-1.5 rounded-full", p.medusaStatus === 'published' ? "bg-emerald-400" : "bg-amber-400")} />
           Local & Medusa {p.medusaStatus === 'published' ? 'Prod' : 'Draft'}
         </span>
       );
    } else if (p.isLocal) {
       badges.push(
         <span key="local" className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 flex items-center gap-1.5">
           <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
           Local Only
         </span>
       );
    } else if (p.isMedusa) {
       const color = p.medusaStatus === 'published' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-zinc-400 border-zinc-500/30 bg-zinc-500/10';
       badges.push(
         <span key="medusa" className={cn("text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1.5", color)}>
           <div className={cn("w-1.5 h-1.5 rounded-full", p.medusaStatus === 'published' ? "bg-emerald-400" : "bg-zinc-400")} />
           Medusa {p.medusaStatus === 'published' ? 'Prod' : 'Draft'}
         </span>
       );
    }

    if (p.isTemplate) {
        badges.push(
            <span key="tpl" className="text-[10px] px-2 py-0.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 flex items-center gap-1">
                <Star className="w-3 h-3" /> Template
            </span>
        );
    }

    return <div className="flex flex-wrap gap-2">{badges}</div>;
  };


  return (
    <div className="space-y-12">
      <Suspense fallback={null}>
        <OnboardingCompletionHandler />
      </Suspense>
      <FirstTimeGuide />
      {/* Header Section */}
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium uppercase tracking-wider">
          <Sparkles className="w-3 h-3" />
          Powered by AI
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-[1.1]">
          Architect your <br />
          <span className="text-zinc-500">product catalog.</span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl">
          Enter a product concept or import an existing JSON to begin the high-fidelity orchestration flow.
        </p>
      </header>

      {/* Primary Actions */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Import & Demo Actions */}
        <div className="lg:col-span-12 flex flex-col gap-4">
          <button
            onClick={() => router.push('/create')}
            disabled={isImporting}
            className="w-full flex-1 glass rounded-2xl p-4 border border-white/10 hover:border-indigo-500/30 transition-all flex items-center justify-center gap-4 group active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-all">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold flex items-center gap-2">
                Create Product
                <ArrowRight className="w-3 h-3 text-zinc-500" />
              </p>
              <p className="text-xs text-zinc-500">Unified creation flow</p>
            </div>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="w-full flex-1 glass rounded-2xl p-4 border border-white/10 hover:border-indigo-500/30 transition-all flex items-center justify-center gap-4 group active:scale-[0.98]"
          >
            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              accept=".json"
              onChange={handleFileImport}
            />
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-all">
              {isImporting ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileJson className="w-6 h-6" />}
            </div>
            <div className="text-left">
              <p className="text-white font-semibold flex items-center gap-2">
                Import JSON
                <UploadCloud className="w-3 h-3 text-zinc-500" />
              </p>
              <p className="text-xs text-zinc-500">Shopify, Medusa, or custom</p>
            </div>
          </button>

          <button
            onClick={handleDownloadDemo}
            className="w-full glass rounded-2xl p-4 border border-white/10 hover:border-emerald-500/30 transition-all flex items-center justify-center gap-4 group active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-zinc-400 group-hover:text-emerald-400 group-hover:bg-emerald-500/10 transition-all">
              <FileDown className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold flex items-center gap-2">
                Download Demo
                <Sparkles className="w-3 h-3 text-zinc-500" />
              </p>
              <p className="text-xs text-zinc-500">Best outcome blueprint</p>
            </div>
          </button>
        </div>
      </section>

      {/* Quick Stats / Features Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: Zap, title: 'Rapid Generation', desc: 'From idea to JSON in under 60 seconds.' },
          { icon: Globe, title: 'Multi-Lingual', desc: 'Automated localization for global markets.' },
          { icon: Package, title: 'Schema Ready', desc: 'Valid output for headless platforms.' },
        ].map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + (i * 0.1) }}
            className="p-6 rounded-2xl glass border border-white/5 space-y-3"
          >
            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-indigo-400">
              <feature.icon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">{feature.desc}</p>
          </motion.div>
        ))}
      </section>

      {/* Products Library - Mobile-First Card Layout */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-400" />
            Product Library
          </h2>
          <div className="flex items-center gap-3">
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 glass px-3 py-2 rounded-xl border border-white/10">
                <span className="text-xs text-zinc-300 font-semibold">{selectedIds.size} selected</span>
                
                {/* Unified Actions based on selection */}
                <button
                  onClick={() => {
                     // Determine what we can do with the selection
                     // For now just clear
                     if (confirm('Bulk actions coming soon. Clear selection?')) setSelectedIds(new Set());
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/5 text-zinc-300 hover:bg-white/10 transition-all text-xs font-semibold disabled:opacity-60"
                >
                  Actions
                </button>
                
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1.5 rounded-lg bg-white/5 text-zinc-300 hover:bg-white/10 transition-all text-xs font-semibold"
                >
                  Clear
                </button>
              </div>
            )}
            <div className="hidden md:flex items-center gap-2 glass px-3 py-2 rounded-xl border border-white/10">
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  suppressHydrationWarning
                  type="checkbox"
                  checked={filteredUnifiedProducts.length > 0 && filteredUnifiedProducts.every(p => selectedIds.has(p.id))}
                  onChange={(e) => {
                    if (e.target.checked) selectAllVisible();
                    else setSelectedIds(new Set());
                  }}
                />
                Select all
              </label>
            </div>
            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              {unifiedProducts.length} Total
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              suppressHydrationWarning
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/50 border border-white/10 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-indigo-500/50 outline-none"
            />
          </div>
          <div className="flex gap-2 bg-black/20 p-1 rounded-xl border border-white/5">
            {[
              { id: 'all', label: 'All' },
              { id: 'local', label: 'Local' },
              { id: 'medusa_prod', label: 'Medusa Prod' },
              { id: 'medusa_draft', label: 'Medusa Drafts' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                  activeTab === tab.id
                    ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filtered Products */}
        {filteredUnifiedProducts.length === 0 && !isLoadingProducts && !isLoadingStoreProducts ? (
          <div className="glass rounded-2xl border border-white/10 p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <Package className="w-6 h-6 text-zinc-500" />
            </div>
            <p className="text-sm font-medium text-zinc-400 mb-1">No products found</p>
            <p className="text-xs text-zinc-500">
              Try adjusting your search or filters
            </p>
          </div>
        ) : null}

        {/* Product Cards - Mobile-First */}
        {isLoadingProducts || (isStoreConfigured && isLoadingStoreProducts) ? (
          <div className="glass rounded-2xl border border-white/10 p-12 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mx-auto mb-2" />
            <span className="text-sm text-zinc-400">Loading catalog...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUnifiedProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => {
                  if (product.isLocal) openSavedProduct(product.id);
                  else if (product.medusaId) openMedusaModal(product.medusaId);
                }}
                className="glass rounded-2xl border border-white/10 p-4 hover:border-indigo-500/30 transition-all cursor-pointer group relative overflow-hidden"
              >
                {/* Selection Checkbox */}
                <div className="absolute top-4 right-4 z-10">
                   <input 
                     type="checkbox" 
                     className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 checked:bg-indigo-500 transition-all"
                     checked={selectedIds.has(product.id)}
                     onClick={(e) => e.stopPropagation()}
                     onChange={(e) => toggleSelection(product.id, e.target.checked)}
                   />
                </div>

                <div className="flex items-start gap-3 mb-3">
                  <div className="w-16 h-16 rounded-xl bg-zinc-900 border border-white/5 flex-shrink-0 overflow-hidden relative">
                    {product.thumbnail ? (
                      <img src={product.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-6 h-6 text-zinc-700" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white truncate flex-1">{product.title}</h3>
                    </div>
                    <p className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">{product.handle}</p>
                    <div className="mt-2">
                        {renderBadge(product)}
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  {/* Local Actions */}
                  {product.isLocal && (
                    <>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (product.isTemplate && product.local) startFromTemplate(product.local.id);
                                else if (product.local) openSavedProduct(product.local.id);
                            }}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-xs font-semibold text-white transition-colors"
                        >
                            {product.isTemplate ? 'Use Template' : 'Edit'}
                        </button>

                        {/* Push to Medusa (only if NOT linked yet) */}
                        {!product.isMedusa && product.local && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    publishSavedProductToMedusa(product.local!);
                                }}
                                disabled={!isStoreConfigured}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-emerald-500/20 hover:text-emerald-400 text-zinc-400 transition-all"
                                title="Push to Medusa"
                            >
                                <UploadCloud className="w-3.5 h-3.5" />
                            </button>
                        )}
                        
                        <button
                            onClick={(e) => { e.stopPropagation(); if(product.local) deleteSavedProduct(product.local.id); }}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 transition-all"
                            title="Delete Local"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </>
                  )}

                  {/* Medusa Only Actions */}
                  {!product.isLocal && product.isMedusa && product.medusaId && (
                     <>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                // Open the full editor for this Medusa product (import into local store and navigate to editor)
                                handleEditMedusaProduct(product.medusaId!);
                            }}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition-colors border border-white/10"
                        >
                            Edit Remote
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                // Also allow viewing the remote quickly in the modal
                                openMedusaModal(product.medusaId!);
                            }}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-indigo-500/20 hover:text-indigo-400 text-zinc-400 transition-all"
                            title="View Remote"
                        >
                            <FileDown className="w-3.5 h-3.5" />
                        </button>
                     </>
                  )}
                  
                  {/* Hybrid Actions (Already synced) */}
                  {product.isLocal && product.isMedusa && (
                     <div className="ml-auto flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500">Synced</span>
                     </div>
                  )}

                </div>
              </div>
            ))}
          </div>
        )}

      </section>

      {/* Medusa Modal - (Kept for Edit/View/Import workflows) */}
      <AnimatePresence>
        {isMedusaModalOpen && activeMedusaProductId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMedusaModal}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg glass border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              <button
                onClick={closeMedusaModal}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Globe className="w-5 h-5 text-emerald-400" />
                Medusa Product
              </h2>

              {!activeMedusaProduct ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Info Card */}
                  <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5 space-y-3">
                    <div className="flex gap-4">
                      <div className="w-16 h-16 rounded-lg bg-black border border-white/10 flex-shrink-0 overflow-hidden">
                        {activeMedusaProduct.thumbnail ? (
                          <img src={activeMedusaProduct.thumbnail} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                             <Package className="w-6 h-6 text-zinc-700" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                         <div className="text-sm font-medium text-white truncate">{activeMedusaProduct.title}</div>
                         <div className="text-xs text-zinc-500 font-mono mt-1 truncate">{activeMedusaProduct.id}</div>
                         <div className="mt-2 flex gap-2">
                            <span className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full border uppercase font-bold tracking-wider",
                              activeMedusaProduct.status === 'published' 
                                ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                                : "text-zinc-400 border-zinc-500/20 bg-zinc-500/10"
                            )}>
                              {activeMedusaProduct.status}
                            </span>
                         </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Edit Fields */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">Title</label>
                      <input
                        type="text"
                        value={medusaEditTitle}
                        onChange={(e) => setMedusaEditTitle(e.target.value)}
                        className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-white focus:ring-2 focus:ring-emerald-500/50 outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">Handle</label>
                      <input
                        type="text"
                        value={medusaEditHandle}
                        onChange={(e) => setMedusaEditHandle(e.target.value)}
                        className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-white font-mono focus:ring-2 focus:ring-emerald-500/50 outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">Status</label>
                      <div className="flex bg-black/20 p-1 rounded-lg border border-white/5">
                        <button
                          onClick={() => setMedusaEditStatus('draft')}
                          className={cn(
                            "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                            medusaEditStatus === 'draft' ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          Draft
                        </button>
                        <button
                          onClick={() => setMedusaEditStatus('published')}
                          className={cn(
                            "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                            medusaEditStatus === 'published' ? "bg-emerald-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          Published
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={saveMedusaEdits}
                      disabled={isMedusaSaving}
                      className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      {isMedusaSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Changes'}
                    </button>
                  </div>

                  <div className="pt-6 border-t border-white/5 space-y-3">
                     <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Danger Zone</p>
                     
                     <div className="grid grid-cols-2 gap-3">
                        <button
                           onClick={() => exportMedusaToLocal('copy')}
                           disabled={isMedusaExporting}
                           className="py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 text-xs font-medium transition-colors"
                        >
                           Export to Local (Copy)
                        </button>
                        <button
                           onClick={() => exportMedusaToLocal('move')}
                           disabled={isMedusaExporting}
                           className="py-2 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 text-xs font-medium transition-colors"
                        >
                           Move to Local (Delete Remote)
                        </button>
                     </div>
                     
                     <button
                        onClick={deleteMedusaProduct}
                        disabled={isMedusaDeleting}
                        className="w-full py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-medium transition-colors"
                     >
                        Delete from Medusa
                     </button>
                  </div>

                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
