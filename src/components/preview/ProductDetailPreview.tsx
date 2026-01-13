'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { Localization, ProductOption, ProductVariant } from '@/store/useProductStore';
import type { PreviewLayoutV1 } from '@/lib/preview-layout';
import { PreviewCardShell } from './PreviewCardShell';

export type PreviewCardId =
  | 'hero'
  | 'gallery'
  | 'description'
  | 'features'
  | 'variants'
  | 'taxonomy'
  | 'logistics'
  | 'seo';

export const ALL_PREVIEW_CARD_IDS: readonly PreviewCardId[] = [
  'hero',
  'gallery',
  'description',
  'features',
  'variants',
  'taxonomy',
  'logistics',
  'seo',
] as const;

export type PreviewProductData = {
  title: string;
  subtitle: string;
  status: 'draft' | 'published';
  handle: string;
  thumbnail: string;
  images: string[];
  vault: string[];
  sku: string;
  price: number;
  localization: Record<string, Localization>;
  options: ProductOption[];
  variants: ProductVariant[];
  tags: string[];
  categories: string[];
  sales_channels: string[];
  collection_id: string;
  type_id: string;
  shipping_profile_id: string;
  shipping_weight: number;
  shipping_dimensions: { length: number; width: number; height: number };
};

function formatPrice(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '—';
  // NOTE: We intentionally avoid currency logic here since the store can be multi-currency.
  // For preview, we show a raw amount as an indicative price.
  return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/**
 * Very small "good enough" HTML sanitizer for previewing rich text.
 *
 * Important:
 * - This is not a complete sanitizer.
 * - It is a best-effort mitigation against accidentally rendering scripts/events.
 *
 * If you need stricter sanitization, we should add a dedicated sanitizer library,
 * but that would be extra scope and new dependencies.
 */
function sanitizeRichTextHtml(html: string): string {
  // Remove script tags entirely.
  const noScripts = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  // Remove inline event handlers like onclick="...".
  const noEvents = noScripts.replace(/\son\w+="[^"]*"/gi, '').replace(/\son\w+='[^']*'/gi, '');
  return noEvents;
}

function getLoc(localization: Record<string, Localization>, lang: string): Localization {
  return localization[lang] ?? localization.en;
}

function Badge({ label, tone }: { label: string; tone: 'indigo' | 'zinc' | 'emerald' }) {
  const cls =
    tone === 'emerald'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
      : tone === 'indigo'
        ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25'
        : 'bg-white/5 text-zinc-300 border-white/10';

  return <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border', cls)}>{label}</span>;
}

export function ProductDetailPreview(props: {
  lang: string;
  product: PreviewProductData;
  layout: PreviewLayoutV1<PreviewCardId>;
}) {
  const loc = getLoc(props.product.localization, props.lang);

  const renderCard = (id: PreviewCardId) => {
    const size = props.layout.cardSettings[id]?.size ?? 'md';

    switch (id) {
      case 'hero':
        return (
          <PreviewCardShell
            title="Product"
            size={size}
            rightSlot={
              <div className="flex items-center gap-2">
                <Badge label={props.product.status === 'published' ? 'Published' : 'Draft'} tone={props.product.status === 'published' ? 'emerald' : 'zinc'} />
                <Badge label={props.lang.toUpperCase()} tone="indigo" />
              </div>
            }
          >
            <div className="space-y-2">
              <div className="text-2xl md:text-3xl font-bold text-white">{loc.title || props.product.title || 'Untitled product'}</div>
              {(loc.subtitle || props.product.subtitle) && <div className="text-zinc-400">{loc.subtitle || props.product.subtitle}</div>}
              <div className="flex flex-wrap gap-3 pt-2 text-sm">
                <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Price</div>
                  <div className="font-semibold text-white">{formatPrice(props.product.price)}</div>
                </div>
                <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">SKU</div>
                  <div className="font-mono text-white text-xs">{props.product.sku || '—'}</div>
                </div>
                <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Handle</div>
                  <div className="font-mono text-white text-xs">{props.product.handle || '—'}</div>
                </div>
              </div>
            </div>
          </PreviewCardShell>
        );

      case 'gallery': {
        const imgs = props.product.vault.length > 0 ? props.product.vault : props.product.images;
        const mainImg = props.product.thumbnail || imgs[0] || '';

        return (
          <PreviewCardShell title="Gallery" size={size}>
            {mainImg ? (
              <div className="space-y-3">
                <div className="relative w-full aspect-square rounded-2xl overflow-hidden border border-white/10 bg-black/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mainImg} alt="Product image" className="w-full h-full object-cover" />
                </div>
                {imgs.length > 1 && (
                  <div className="grid grid-cols-4 gap-2">
                    {imgs.slice(0, 8).map((u, idx) => (
                      <div key={`${u}-${idx}`} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
                {props.product.vault.length > 0 && (
                  <div className="text-[10px] text-indigo-300/80">
                    Using <span className="font-semibold">Vault</span> (optimized gallery: {props.product.vault.length} assets)
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-zinc-500 italic">No images yet. Add some in the Media step.</div>
            )}
          </PreviewCardShell>
        );
      }

      case 'description': {
        const html = loc.description || props.product.subtitle || '';
        const safe = sanitizeRichTextHtml(html);
        const isHtmlLike = /<\/?[a-z][\s\S]*>/i.test(safe);

        return (
          <PreviewCardShell title="Description" size={size}>
            {safe ? (
              isHtmlLike ? (
                <div className="prose prose-invert max-w-none text-zinc-200 prose-p:leading-relaxed" dangerouslySetInnerHTML={{ __html: safe }} />
              ) : (
                <p className="text-zinc-200 leading-relaxed whitespace-pre-wrap">{safe}</p>
              )
            ) : (
              <div className="text-sm text-zinc-500 italic">No description yet.</div>
            )}
          </PreviewCardShell>
        );
      }

      case 'features': {
        const features = loc.features || [];
        return (
          <PreviewCardShell title="Features" size={size}>
            {features.length > 0 ? (
              <ul className="space-y-2">
                {features.map((f, idx) => (
                  <li key={`${idx}-${f}`} className="flex gap-2 text-zinc-200">
                    <span className="text-indigo-400 mt-1">•</span>
                    <span className="leading-relaxed">{f}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-zinc-500 italic">No features yet.</div>
            )}
          </PreviewCardShell>
        );
      }

      case 'variants': {
        const options = props.product.options || [];
        const variants = props.product.variants || [];
        return (
          <PreviewCardShell title="Variants" size={size}>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Options</div>
                  <div className="font-semibold text-white">{options.length}</div>
                </div>
                <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Variants</div>
                  <div className="font-semibold text-white">{variants.length}</div>
                </div>
              </div>

              {options.length > 0 && (
                <div className="space-y-2">
                  {options.map((o) => (
                    <div key={o.id} className="p-3 rounded-xl bg-zinc-900/30 border border-white/10">
                      <div className="text-xs font-semibold text-white">{o.translations?.[props.lang] || o.name}</div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(o.values || []).map((v, idx) => (
                          <span key={`${o.id}-${idx}`} className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-zinc-200">
                            {v.translations?.[props.lang] || v.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {variants.length > 0 && (
                <div className="space-y-2">
                  {variants.slice(0, 5).map((v) => (
                    <div key={v.id} className="p-3 rounded-xl bg-zinc-900/30 border border-white/10 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{v.title || 'Variant'}</div>
                        <div className="text-[10px] text-zinc-500 font-mono truncate">{v.sku || '—'}</div>
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        {(v.prices || []).slice(0, 1).map((p, idx) => (
                          <span key={idx} className="font-semibold text-white">
                            {p.amount ? p.amount.toLocaleString() : '—'} {p.currency_code?.toUpperCase?.() || ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {variants.length > 5 && <div className="text-[10px] text-zinc-500 italic">+ {variants.length - 5} more variants</div>}
                </div>
              )}
            </div>
          </PreviewCardShell>
        );
      }

      case 'taxonomy':
        return (
          <PreviewCardShell title="Store Taxonomy" size={size}>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Collection</div>
                  <div className="text-zinc-200 font-mono text-xs">{props.product.collection_id || '—'}</div>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Type</div>
                  <div className="text-zinc-200 font-mono text-xs">{props.product.type_id || '—'}</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Categories</div>
                <div className="text-zinc-200 font-mono text-xs">{props.product.categories.length ? props.product.categories.join(', ') : '—'}</div>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Sales Channels</div>
                <div className="text-zinc-200 font-mono text-xs">{props.product.sales_channels.length ? props.product.sales_channels.join(', ') : '—'}</div>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Tags</div>
                <div className="text-zinc-200 font-mono text-xs">{props.product.tags.length ? props.product.tags.join(', ') : '—'}</div>
              </div>
            </div>
          </PreviewCardShell>
        );

      case 'logistics':
        return (
          <PreviewCardShell title="Logistics" size={size}>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Shipping Profile</div>
                <div className="text-zinc-200 font-mono text-xs">{props.product.shipping_profile_id || '—'}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Weight (g)</div>
                  <div className="text-zinc-200 font-semibold">{props.product.shipping_weight || 0}</div>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Dimensions (cm)</div>
                  <div className="text-zinc-200 font-mono text-xs">
                    {props.product.shipping_dimensions.length}×{props.product.shipping_dimensions.width}×{props.product.shipping_dimensions.height}
                  </div>
                </div>
              </div>
            </div>
          </PreviewCardShell>
        );

      case 'seo':
        return (
          <PreviewCardShell title="SEO Preview" size={size}>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Meta Title</div>
                <div className="text-zinc-200">{loc.metadata_title || '—'}</div>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Meta Description</div>
                <div className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">{loc.metadata_description || '—'}</div>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Keywords</div>
                <div className="text-zinc-200 text-sm">{(loc.keywords || []).length ? loc.keywords.join(', ') : '—'}</div>
              </div>
            </div>
          </PreviewCardShell>
        );

      default:
        return null;
    }
  };

  const isHidden = (id: PreviewCardId) => props.layout.hidden.includes(id);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        <div className="lg:col-span-8 space-y-6">
          {props.layout.main.filter((id) => !isHidden(id)).map((id) => (
            <React.Fragment key={id}>{renderCard(id)}</React.Fragment>
          ))}
        </div>
        <div className="lg:col-span-4 space-y-6">
          {props.layout.sidebar.filter((id) => !isHidden(id)).map((id) => (
            <React.Fragment key={id}>{renderCard(id)}</React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

