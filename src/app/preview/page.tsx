'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Globe, Layers, ToggleLeft, ToggleRight } from 'lucide-react';
import { useProductStore } from '@/store/useProductStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { ALL_LANGUAGES } from '@/lib/languages';
import { cn } from '@/lib/utils';
import { normalizePreviewLayout } from '@/lib/preview-layout';
import { ALL_PREVIEW_CARD_IDS, ProductDetailPreview, type PreviewCardId, type PreviewProductData } from '@/components/preview/ProductDetailPreview';
import { LayoutEditor } from '@/components/preview/LayoutEditor';

type PreviewMode = 'single' | 'all';

export default function PreviewPage() {
  const settings = useSettingsStore();
  const loadSettingsFromDb = useSettingsStore((s) => s.loadFromDb);
  const product = useProductStore();

  const [selectedLang, setSelectedLang] = useState<string>('en');
  const [mode, setMode] = useState<PreviewMode>('single');
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  // Load org settings so `settings.activeLanguages` is correct.
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/org/context', { cache: 'no-store' });
        const payload = (await res.json()) as { orgId?: string };
        if (!res.ok || !payload.orgId) return;
        setOrganizationId(payload.orgId);
        await loadSettingsFromDb(payload.orgId);
      } catch (error) {
        console.error('Failed to load org context for preview:', error);
      }
    };

    init();
  }, [loadSettingsFromDb]);

  const enabledLangs = useMemo(() => {
    const langs = settings.activeLanguages?.length ? settings.activeLanguages : ['en'];
    // Ensure English always exists as a safe fallback.
    return Array.from(new Set(['en', ...langs]));
  }, [settings.activeLanguages]);

  const availableLanguages = useMemo(() => {
    return ALL_LANGUAGES.filter((l) => enabledLangs.includes(l.code));
  }, [enabledLangs]);

  const effectiveSelectedLang = enabledLangs.includes(selectedLang) ? selectedLang : (enabledLangs[0] || 'en');

  const defaultLayout = useMemo(() => {
    // This is the default if the org has never saved a layout.
    // (We will later load settings.previewLayout once persistence is wired.)
    return normalizePreviewLayout<PreviewCardId>(
      null,
      ALL_PREVIEW_CARD_IDS,
      {
        main: ['hero', 'description', 'features', 'variants'],
        sidebar: ['gallery', 'taxonomy', 'logistics', 'seo'],
        hidden: [],
      }
    );
  }, []);

  const savedLayout = useMemo(() => {
    return normalizePreviewLayout<PreviewCardId>(
      settings.previewLayout,
      ALL_PREVIEW_CARD_IDS,
      {
        main: ['hero', 'description', 'features', 'variants'],
        sidebar: ['gallery', 'taxonomy', 'logistics', 'seo'],
        hidden: [],
      }
    );
  }, [settings.previewLayout]);

  const [layoutDraft, setLayoutDraft] = useState<typeof defaultLayout | null>(null);
  const layout = layoutDraft ?? savedLayout;

  const previewProduct: PreviewProductData = useMemo(() => ({
    title: product.title,
    subtitle: product.subtitle,
    status: product.status,
    handle: product.handle,
    thumbnail: product.thumbnail,
    images: product.images,
    vault: product.vault,
    sku: product.sku,
    price: product.price,
    localization: product.localization,
    options: product.options,
    variants: product.variants,
    tags: product.tags,
    categories: product.categories,
    sales_channels: product.sales_channels,
    collection_id: product.collection_id,
    type_id: product.type_id,
    shipping_profile_id: product.shipping_profile_id,
    shipping_weight: product.shipping_weight,
    shipping_dimensions: product.shipping_dimensions,
  }), [product]);

  const langsToRender = mode === 'all' ? enabledLangs : [effectiveSelectedLang];

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <header className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Globe className="text-indigo-400 w-8 h-8" />
              Preview
            </h1>
            <p className="text-zinc-400">
              Real product detail preview from your current draft, across all enabled languages.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setMode((m) => (m === 'single' ? 'all' : 'single'))}
              className="flex items-center gap-2 text-sm font-medium transition-colors"
              title="Toggle single language vs all languages"
            >
              <span className={cn(mode === 'all' ? 'text-indigo-400' : 'text-zinc-500')}>
                {mode === 'all' ? 'All languages' : 'Single'}
              </span>
              {mode === 'all' ? (
                <ToggleRight className="w-8 h-8 text-indigo-500" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-zinc-600" />
              )}
            </button>
          </div>
        </div>

        {/* Language tabs (disabled in All mode, since all are shown) */}
        <div className={cn(
          'flex gap-2 p-1 bg-white/5 rounded-xl border border-white/10 overflow-x-auto no-scrollbar',
          mode === 'all' && 'opacity-60'
        )}>
          {availableLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => mode === 'single' && setSelectedLang(lang.code)}
              disabled={mode === 'all'}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap',
                effectiveSelectedLang === lang.code && mode === 'single'
                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
                mode === 'all' && 'cursor-not-allowed'
              )}
            >
              <span>{lang.flag}</span>
              {lang.name}
            </button>
          ))}
        </div>

        {!organizationId && (
          <div className="glass rounded-2xl p-4 border border-white/10 text-sm text-zinc-400 flex items-center gap-3">
            <Layers className="w-4 h-4 text-zinc-500" />
            Login is required to load organization language settings. Showing a safe default preview.
          </div>
        )}
      </header>

      <LayoutEditor
        layout={layout}
        onChange={setLayoutDraft}
        onSave={async (nextLayout) => {
          if (!organizationId) return;
          // Persist to the org settings store, then save.
          // Preconditions:
          // - user is authenticated and is member of org (server action enforces scope)
          // Postconditions:
          // - org default preview layout is persisted for future sessions
          setLayoutDraft(nextLayout);
          useSettingsStore.getState().setStoreSettings({ previewLayout: nextLayout });
          await useSettingsStore.getState().saveToDb(organizationId);
        }}
        canSave={!!organizationId}
        onReset={() => setLayoutDraft(defaultLayout)}
      />

      <div className="space-y-10">
        {langsToRender.map((langCode) => {
          const langInfo = ALL_LANGUAGES.find((l) => l.code === langCode);
          return (
            <section key={langCode} className="space-y-4">
              {mode === 'all' && (
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-widest">
                  <span>{langInfo?.flag}</span>
                  <span>{langInfo?.name || langCode}</span>
                </div>
              )}
              <ProductDetailPreview lang={langCode} product={previewProduct} layout={layout} />
            </section>
          );
        })}
      </div>
    </div>
  );
}

