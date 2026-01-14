'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
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

export default function Dashboard() {
  const [isImporting, setIsImporting] = useState(false);
  const [products, setProducts] = useState<SavedProductRow[]>([]);
  const [storeProducts, setStoreProducts] = useState<MedusaProductRow[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingStoreProducts, setIsLoadingStoreProducts] = useState(false);
  const [isStoreConfigured, setIsStoreConfigured] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'published' | 'template'>('all');
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
  const searchParams = useSearchParams();
  const { toast } = useToast();
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

  const toggleSelectedLocal = (id: string, next: boolean) => {
    setSelectedLocalIds((prev) => {
      const s = new Set(prev);
      if (next) s.add(id);
      else s.delete(id);
      return s;
    });
  };

  const toggleSelectedMedusa = (id: string, next: boolean) => {
    setSelectedMedusaIds((prev) => {
      const s = new Set(prev);
      if (next) s.add(id);
      else s.delete(id);
      return s;
    });
  };

  const selectAllLocalFiltered = () => {
    setSelectedLocalIds(new Set(filteredProducts.map((p) => p.id)));
  };

  const selectAllMedusaVisible = () => {
    setSelectedMedusaIds(new Set(storeProducts.map((p) => p.id)));
  };

  const allMedusaSelected = storeProducts.length > 0 && storeProducts.every((p) => selectedMedusaIds.has(p.id));
  const someMedusaSelected = storeProducts.some((p) => selectedMedusaIds.has(p.id)) && !allMedusaSelected;

  const clearBulkStatus = () =>
    setBulkStatus({
      kind: null,
      running: false,
      total: 0,
      done: 0,
      failures: [],
    });

  const runBulkLocalDelete = async () => {
    const ids = Array.from(selectedLocalIds);
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

    setSelectedLocalIds(new Set());
    setBulkStatus((prev) => ({ ...prev, running: false }));
  };

  const runBulkLocalPublishToMedusa = async () => {
    const ids = Array.from(selectedLocalIds);
    if (ids.length === 0) return;
    if (!isStoreConfigured) {
      alert('Medusa is not configured for this organization.');
      return;
    }

    const ok = window.confirm(`Publish ${ids.length} local product(s) to Medusa? (Local drafts remain unchanged)`);
    if (!ok) return;

    clearBulkStatus();
    setBulkStatus({ kind: 'local_publish', running: true, total: ids.length, done: 0, failures: [] });

    const failures: Array<{ id: string; error: string }> = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const p = products.find((x) => x.id === id);
      if (!p) {
        failures.push({ id, error: 'Local product not found in current list' });
        setBulkStatus((prev) => ({ ...prev, done: i + 1, failures }));
        continue;
      }

      try {
        await publishSavedProductToMedusa(p, { confirm: false, alertOnSuccess: false, silent: true, skipRefresh: true });
      } catch (e) {
        failures.push({ id, error: e instanceof Error ? e.message : 'Failed to publish' });
      } finally {
        setBulkStatus((prev) => ({ ...prev, done: i + 1, failures }));
      }
    }

    const orgId = useProductStore.getState().organizationId;
    if (orgId) {
      try {
        await refreshLocalProducts(orgId);
      } catch {
        // Best-effort refresh; UI already attempted to update linkage while publishing.
      }
      await refreshMedusaProducts(orgId);
    }

    setSelectedLocalIds(new Set());
    setBulkStatus((prev) => ({ ...prev, running: false }));
  };

  const runBulkMedusaExport = async (mode: 'copy' | 'move') => {
    const ids = Array.from(selectedMedusaIds);
    if (ids.length === 0) return;

    const ok =
      mode === 'move'
        ? window.confirm(`Move ${ids.length} Medusa product(s) to local? This will delete them from Medusa.`)
        : window.confirm(`Export ${ids.length} Medusa product(s) to local? (Medusa products remain)`);
    if (!ok) return;

    clearBulkStatus();
    setBulkStatus({
      kind: mode === 'move' ? 'medusa_move' : 'medusa_export',
      running: true,
      total: ids.length,
      done: 0,
      failures: [],
    });

    const failures: Array<{ id: string; error: string }> = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        const res = await fetch(`/api/medusa/products/${id}/export-to-local`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error || 'Failed to export');
      } catch (e) {
        failures.push({ id, error: e instanceof Error ? e.message : 'Failed to export' });
      } finally {
        setBulkStatus((prev) => ({ ...prev, done: i + 1, failures }));
      }
    }

    const orgId = useProductStore.getState().organizationId;
    if (orgId) {
      await refreshLocalProducts(orgId);
      await refreshMedusaProducts(orgId);
    }

    setSelectedMedusaIds(new Set());
    setBulkStatus((prev) => ({ ...prev, running: false }));
  };

  const runBulkMedusaDelete = async () => {
    const ids = Array.from(selectedMedusaIds);
    if (ids.length === 0) return;

    const ok = window.confirm(`Delete ${ids.length} Medusa product(s)? This is permanent.`);
    if (!ok) return;

    clearBulkStatus();
    setBulkStatus({ kind: 'medusa_delete', running: true, total: ids.length, done: 0, failures: [] });

    const failures: Array<{ id: string; error: string }> = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        const res = await fetch(`/api/medusa/products/${id}`, { method: 'DELETE' });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error || 'Failed to delete');
      } catch (e) {
        failures.push({ id, error: e instanceof Error ? e.message : 'Failed to delete' });
      } finally {
        setBulkStatus((prev) => ({ ...prev, done: i + 1, failures }));
      }
    }

    const orgId = useProductStore.getState().organizationId;
    if (orgId) await refreshMedusaProducts(orgId);

    setSelectedMedusaIds(new Set());
    setBulkStatus((prev) => ({ ...prev, running: false }));
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

  // Memoize filtered products - must be at top level to follow Rules of Hooks
  const filteredProducts = useMemo(() => {
    let filtered = products;
    
    // Filter by status
    if (filterStatus === 'draft') {
      filtered = filtered.filter(p => p.status === 'draft' && !p.is_template);
    } else if (filterStatus === 'published') {
      filtered = filtered.filter(p => p.status === 'published');
    } else if (filterStatus === 'template') {
      filtered = filtered.filter(p => p.is_template);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(query) ||
        p.handle?.toLowerCase().includes(query) ||
        p.sku?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [products, filterStatus, searchQuery]);

  // Derived selection state (must be AFTER `filteredProducts` initialization to avoid TDZ errors).
  const allLocalFilteredSelected =
    filteredProducts.length > 0 && filteredProducts.every((p) => selectedLocalIds.has(p.id));
  const someLocalFilteredSelected =
    filteredProducts.some((p) => selectedLocalIds.has(p.id)) && !allLocalFilteredSelected;

  // Handle onboarding completion
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

  return (
    <div className="space-y-12">
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
            {selectedLocalIds.size > 0 && (
              <div className="flex items-center gap-2 glass px-3 py-2 rounded-xl border border-white/10">
                <span className="text-xs text-zinc-300 font-semibold">{selectedLocalIds.size} selected</span>
                <button
                  onClick={runBulkLocalDelete}
                  disabled={bulkStatus.running}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-all text-xs font-semibold disabled:opacity-60"
                  title="Bulk delete local products"
                >
                  Delete
                </button>
                <button
                  onClick={runBulkLocalPublishToMedusa}
                  disabled={bulkStatus.running || !isStoreConfigured}
                  className={cn(
                    "px-3 py-1.5 rounded-lg transition-all text-xs font-semibold disabled:opacity-60",
                    isStoreConfigured
                      ? "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                      : "bg-white/5 text-zinc-600 cursor-not-allowed"
                  )}
                  title={isStoreConfigured ? "Bulk publish to Medusa" : "Medusa not configured"}
                >
                  Publish to Medusa
                </button>
                <button
                  onClick={() => setSelectedLocalIds(new Set())}
                  disabled={bulkStatus.running}
                  className="px-3 py-1.5 rounded-lg bg-white/5 text-zinc-300 hover:bg-white/10 transition-all text-xs font-semibold disabled:opacity-60"
                >
                  Clear
                </button>
              </div>
            )}
            <div className="hidden md:flex items-center gap-2 glass px-3 py-2 rounded-xl border border-white/10">
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={allLocalFilteredSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someLocalFilteredSelected;
                  }}
                  onChange={(e) => {
                    if (e.target.checked) selectAllLocalFiltered();
                    else setSelectedLocalIds(new Set());
                  }}
                />
                Select all (filtered)
              </label>
            </div>
            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              {products.length} Total
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/50 border border-white/10 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-indigo-500/50 outline-none"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'draft', 'published', 'template'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={cn(
                  "px-3 py-2 rounded-xl text-xs font-medium transition-all",
                  filterStatus === status
                    ? "bg-indigo-500 text-white"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10"
                )}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Filtered Products */}
        {filteredProducts.length === 0 && !isLoadingProducts ? (
          <div className="glass rounded-2xl border border-white/10 p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <Package className="w-6 h-6 text-zinc-500" />
            </div>
            <p className="text-sm font-medium text-zinc-400 mb-1">No products found</p>
            <p className="text-xs text-zinc-500">
              {searchQuery || filterStatus !== 'all' 
                ? 'Try adjusting your search or filters'
                : 'Create your first product using the AI bar above'}
            </p>
          </div>
        ) : null}

        {/* Product Cards - Mobile-First */}
        {isLoadingProducts ? (
          <div className="glass rounded-2xl border border-white/10 p-12 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mx-auto mb-2" />
            <span className="text-sm text-zinc-400">Loading catalog...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => openSavedProduct(product.id)}
                className="glass rounded-2xl border border-white/10 p-4 hover:border-indigo-500/30 transition-all cursor-pointer group"
              >
                {/* Bulk select checkbox */}
                <div className="flex justify-end -mt-1 -mr-1">
                  <label
                    className="inline-flex items-center gap-2 text-[10px] text-zinc-400 bg-black/20 border border-white/10 rounded-lg px-2 py-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedLocalIds.has(product.id)}
                      onChange={(e) => toggleSelectedLocal(product.id, e.target.checked)}
                    />
                    Select
                  </label>
                </div>

                <div className="flex items-start gap-3 mb-3">
                  <div className="w-16 h-16 rounded-xl bg-zinc-900 border border-white/5 flex-shrink-0 overflow-hidden">
                    {getThumbnailFromProductData(product.data) ? (
                      <img src={getThumbnailFromProductData(product.data) ?? ''} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-6 h-6 text-zinc-700" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white truncate flex-1">{product.title}</h3>
                      {product.is_template && (
                        <Star className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">{product.handle}</p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                    product.status === 'published' 
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                      : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                  )}>
                    <div className={cn("w-1 h-1 rounded-full", product.status === 'published' ? "bg-emerald-400" : "bg-zinc-400")} />
                    {product.status}
                  </div>
                  {product.price && (
                    <span className="text-xs font-medium text-white">${product.price.toFixed(2)}</span>
                  )}
                </div>
                
                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <span>{new Date(product.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  {product.sku && (
                    <span className="font-mono">{product.sku}</span>
                  )}
                </div>

                {product.medusa_product_id && (
                  <div className="mt-2 text-[10px] text-emerald-400 font-mono truncate">
                    Medusa: {product.medusa_product_id}
                  </div>
                )}
                
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (product.is_template) {
                        startFromTemplate(product.id);
                      } else {
                        openSavedProduct(product.id);
                      }
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-xs font-semibold text-white transition-colors"
                  >
                    {product.is_template ? 'Use Template' : 'Edit'}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      publishSavedProductToMedusa(product);
                    }}
                    disabled={!isStoreConfigured}
                    className={cn(
                      "p-1.5 rounded-lg transition-all",
                      isStoreConfigured
                        ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                        : "bg-white/5 text-zinc-600 cursor-not-allowed"
                    )}
                    aria-label="Publish to Medusa"
                    title={isStoreConfigured ? "Create in Medusa" : "Medusa not configured"}
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTemplate(product.id, !product.is_template);
                    }}
                    className={cn(
                      "p-1.5 rounded-lg transition-all",
                      product.is_template 
                        ? "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20" 
                        : "bg-white/5 text-zinc-400 hover:bg-white/10"
                    )}
                    aria-label={product.is_template ? "Unmark as template" : "Mark as template"}
                  >
                    <Star className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSavedProduct(product.id);
                    }}
                    className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                    aria-label="Delete local product"
                    title="Delete local product"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Store Products Table (MedusaJS) */}
      {isStoreConfigured && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Package className="w-6 h-6 text-emerald-400" />
              MedusaJS Catalog
            </h2>
            <div className="flex items-center gap-3">
              {selectedMedusaIds.size > 0 && (
                <div className="flex items-center gap-2 glass px-3 py-2 rounded-xl border border-white/10">
                  <span className="text-xs text-zinc-300 font-semibold">{selectedMedusaIds.size} selected</span>
                  <button
                    onClick={() => runBulkMedusaExport('copy')}
                    disabled={bulkStatus.running}
                    className="px-3 py-1.5 rounded-lg bg-white/5 text-white hover:bg-white/10 transition-all text-xs font-semibold disabled:opacity-60"
                    title="Bulk export from Medusa to local"
                  >
                    Export to Local
                  </button>
                  <button
                    onClick={() => runBulkMedusaExport('move')}
                    disabled={bulkStatus.running}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 transition-all text-xs font-semibold disabled:opacity-60"
                    title="Bulk move from Medusa to local (export + delete)"
                  >
                    Move to Local
                  </button>
                  <button
                    onClick={runBulkMedusaDelete}
                    disabled={bulkStatus.running}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-all text-xs font-semibold disabled:opacity-60"
                    title="Bulk delete from Medusa"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setSelectedMedusaIds(new Set())}
                    disabled={bulkStatus.running}
                    className="px-3 py-1.5 rounded-lg bg-white/5 text-zinc-300 hover:bg-white/10 transition-all text-xs font-semibold disabled:opacity-60"
                  >
                    Clear
                  </button>
                </div>
              )}
              <button
                onClick={() => {
                  const orgId = useProductStore.getState().organizationId;
                  if (orgId) refreshMedusaProducts(orgId);
                }}
                disabled={isMedusaRefreshing}
                className="glass px-3 py-2 rounded-xl text-xs font-semibold text-white flex items-center gap-2 hover:bg-white/5 transition-all disabled:text-zinc-500"
              >
                <RefreshCw className={cn("w-4 h-4", isMedusaRefreshing && "animate-spin")} />
                Refresh
              </button>
              <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                {storeProducts.length} External Products
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/5">
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Select</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Product</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Variants</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Created</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                  <tr className="bg-white/5 border-b border-white/5">
                    <th className="px-6 py-3">
                      <input
                        type="checkbox"
                        checked={allMedusaSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someMedusaSelected;
                        }}
                        onChange={(e) => {
                          if (e.target.checked) selectAllMedusaVisible();
                          else setSelectedMedusaIds(new Set());
                        }}
                        aria-label="Select all Medusa products on this page"
                      />
                    </th>
                    <th colSpan={5} className="px-6 py-3 text-xs text-zinc-500">
                      Select all (this page)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isLoadingStoreProducts ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                          <span className="text-sm">Fetching from Medusa...</span>
                        </div>
                      </td>
                    </tr>
                  ) : storeProducts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-2">
                            <Package className="w-6 h-6" />
                          </div>
                          <p className="text-sm font-medium text-zinc-400">No products found in MedusaJS</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    storeProducts.map((product) => (
                      <tr 
                        key={product.id} 
                        className="group hover:bg-emerald-500/[0.02] transition-colors"
                      >
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedMedusaIds.has(product.id)}
                            onChange={(e) => toggleSelectedMedusa(product.id, e.target.checked)}
                            aria-label="Select Medusa product"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/5 flex-shrink-0 overflow-hidden">
                              {product.thumbnail ? (
                                <img src={product.thumbnail} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package className="w-4 h-4 text-zinc-700" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{product.title}</p>
                              <p className="text-[10px] text-zinc-500 font-mono truncate">{product.handle}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-mono text-zinc-400">
                            {product.variants?.length || 0} variants
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                            product.status === 'published' 
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                              : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                          )}>
                            <div className={cn("w-1 h-1 rounded-full", product.status === 'published' ? "bg-emerald-400" : "bg-zinc-400")} />
                            {product.status}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] text-zinc-500 uppercase">
                            {new Date(product.created_at).toLocaleDateString(undefined, { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openMedusaModal(product.id)}
                              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
                              aria-label="View / edit"
                              title="View / edit"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bulk progress / result summary */}
          {bulkStatus.kind && (
            <div className="glass rounded-2xl border border-white/10 p-4 text-sm text-zinc-300">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <RefreshCw className={cn("w-4 h-4", bulkStatus.running && "animate-spin")} />
                  <span className="font-semibold">
                    Bulk {bulkStatus.kind.replace(/_/g, ' ')}: {bulkStatus.done}/{bulkStatus.total}
                  </span>
                  {bulkStatus.failures.length > 0 && (
                    <span className="text-red-300">({bulkStatus.failures.length} failed)</span>
                  )}
                </div>
                {!bulkStatus.running && (
                  <button
                    onClick={clearBulkStatus}
                    className="px-3 py-1.5 rounded-lg bg-white/5 text-zinc-300 hover:bg-white/10 transition-all text-xs font-semibold"
                  >
                    Dismiss
                  </button>
                )}
              </div>
              {bulkStatus.failures.length > 0 && !bulkStatus.running && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">
                    View failures
                  </summary>
                  <div className="mt-2 space-y-2">
                    {bulkStatus.failures.slice(0, 50).map((f) => (
                      <div key={f.id} className="text-xs text-red-300 font-mono">
                        {f.id}: {f.error}
                      </div>
                    ))}
                    {bulkStatus.failures.length > 50 && (
                      <div className="text-xs text-zinc-500">Showing first 50 failures.</div>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
        </section>
      )}

      {/* Medusa Product Modal */}
      <AnimatePresence>
        {isMedusaModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
            onClick={closeMedusaModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              className="w-full max-w-2xl glass-dark border border-white/10 rounded-2xl p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Pencil className="w-5 h-5 text-emerald-400" />
                    Medusa Product
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono">{activeMedusaProductId}</p>
                </div>
                <button
                  onClick={closeMedusaModal}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Title</span>
                  <input
                    value={medusaEditTitle}
                    onChange={(e) => setMedusaEditTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Handle</span>
                  <input
                    value={medusaEditHandle}
                    onChange={(e) => setMedusaEditHandle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Status</span>
                  <select
                    value={medusaEditStatus}
                    onChange={(e) => setMedusaEditStatus(e.target.value === 'published' ? 'published' : 'draft')}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  onClick={deleteMedusaProduct}
                  disabled={isMedusaDeleting}
                  className="px-4 py-2 rounded-xl bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/20 transition-all text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                >
                  <Trash2 className="w-4 h-4" />
                  {isMedusaDeleting ? 'Deleting…' : 'Delete'}
                </button>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <button
                    onClick={() => exportMedusaToLocal('copy')}
                    disabled={isMedusaExporting}
                    className="px-4 py-2 rounded-xl bg-white/5 text-white hover:bg-white/10 transition-all text-sm font-semibold flex items-center gap-2 disabled:text-zinc-500"
                    title="Copy product from Medusa into local Supabase"
                  >
                    <Download className="w-4 h-4" />
                    {isMedusaExporting ? 'Working…' : 'Export to Local'}
                  </button>

                  <button
                    onClick={() => exportMedusaToLocal('move')}
                    disabled={isMedusaExporting}
                    className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 transition-all text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                    title="Copy into local Supabase, then delete from Medusa"
                  >
                    <UploadCloud className="w-4 h-4" />
                    {isMedusaExporting ? 'Working…' : 'Move to Local'}
                  </button>

                  <button
                    onClick={saveMedusaEdits}
                    disabled={isMedusaSaving}
                    className="px-4 py-2 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-all text-sm font-semibold flex items-center gap-2 disabled:bg-zinc-800 disabled:text-zinc-500"
                  >
                    <Save className="w-4 h-4" />
                    {isMedusaSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {activeMedusaProduct && (
                <details className="pt-2">
                  <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">
                    Advanced JSON (read-only)
                  </summary>
                  <pre className="mt-3 max-h-[280px] overflow-auto rounded-xl bg-black/40 border border-white/10 p-3 text-[11px] text-indigo-200/90">
                    {JSON.stringify(activeMedusaProduct, null, 2)}
                  </pre>
                </details>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
