'use client';

import React from 'react';
import { Reorder } from 'framer-motion';
import { Eye, EyeOff, ArrowLeftRight, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PreviewLayoutV1, PreviewCardSize } from '@/lib/preview-layout';
import type { PreviewCardId } from './ProductDetailPreview';

const CARD_LABELS: Record<PreviewCardId, { title: string; hint: string }> = {
  hero: { title: 'Hero', hint: 'Title, status, price, SKU, handle' },
  gallery: { title: 'Gallery', hint: 'Thumbnail + vault/images' },
  description: { title: 'Description', hint: 'Rich text long description' },
  features: { title: 'Features', hint: 'Bulleted feature list' },
  variants: { title: 'Variants', hint: 'Options + variant summary' },
  taxonomy: { title: 'Taxonomy', hint: 'Collection/type/categories/tags' },
  logistics: { title: 'Logistics', hint: 'Shipping weight + dimensions' },
  seo: { title: 'SEO', hint: 'Meta title/description/keywords' },
};

function SizeSelect(props: {
  value: PreviewCardSize;
  onChange: (next: PreviewCardSize) => void;
}) {
  return (
    <select
      className="bg-zinc-900/40 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-indigo-500/50"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as PreviewCardSize)}
    >
      <option value="sm">sm</option>
      <option value="md">md</option>
      <option value="lg">lg</option>
    </select>
  );
}

function CardRow(props: {
  id: PreviewCardId;
  size: PreviewCardSize;
  isHidden: boolean;
  column: 'main' | 'sidebar' | 'hidden';
  onToggleHidden: () => void;
  onMoveColumn: () => void;
  onChangeSize: (next: PreviewCardSize) => void;
}) {
  const meta = CARD_LABELS[props.id];

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/30 border border-white/10">
      <div className="text-zinc-500">
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-white truncate">{meta.title}</div>
        <div className="text-[10px] text-zinc-500 truncate">{meta.hint}</div>
      </div>

      <SizeSelect value={props.size} onChange={props.onChangeSize} />

      <button
        onClick={props.onMoveColumn}
        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors"
        title={props.column === 'main' ? 'Move to sidebar' : props.column === 'sidebar' ? 'Move to main' : 'Move to main'}
      >
        <ArrowLeftRight className="w-4 h-4" />
      </button>

      <button
        onClick={props.onToggleHidden}
        className={cn(
          'p-2 rounded-lg transition-colors',
          props.isHidden ? 'bg-red-500/10 hover:bg-red-500/15 text-red-300' : 'bg-white/5 hover:bg-white/10 text-zinc-300'
        )}
        title={props.isHidden ? 'Show card' : 'Hide card'}
      >
        {props.isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

/**
 * Layout editor for `/preview`.
 *
 * Design constraints:
 * - No new dependencies: we use Framer Motion Reorder, already present in the repo.
 * - "Positions" means ordering + column (main vs sidebar).
 * - "Size" means per-card density/typography (sm/md/lg).
 */
export function LayoutEditor(props: {
  layout: PreviewLayoutV1<PreviewCardId>;
  onChange: (next: PreviewLayoutV1<PreviewCardId>) => void;
  onSave?: (layout: PreviewLayoutV1<PreviewCardId>) => void;
  onReset?: () => void;
  canSave?: boolean;
}) {
  const setCardSize = (id: PreviewCardId, size: PreviewCardSize) => {
    props.onChange({
      ...props.layout,
      cardSettings: {
        ...props.layout.cardSettings,
        [id]: { size },
      },
    });
  };

  const isHidden = (id: PreviewCardId) => props.layout.hidden.includes(id);

  const toggleHidden = (id: PreviewCardId) => {
    const hidden = new Set(props.layout.hidden);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    props.onChange({ ...props.layout, hidden: Array.from(hidden) });
  };

  const moveToColumn = (id: PreviewCardId, target: 'main' | 'sidebar') => {
    // Remove from both visible columns.
    const main = props.layout.main.filter((x) => x !== id);
    const sidebar = props.layout.sidebar.filter((x) => x !== id);

    // Add to target at the end.
    if (target === 'main') main.push(id);
    else sidebar.push(id);

    props.onChange({ ...props.layout, main, sidebar });
  };

  return (
    <section className="glass rounded-2xl p-6 border border-white/10 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">Layout editor</h2>
          <p className="text-xs text-zinc-500">
            Drag to reorder. Use the arrows to switch columns. Use the eye to hide/show. Sizes are per-card density.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => props.onReset?.()}
            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-200 border border-white/10 transition-colors"
            type="button"
          >
            Reset
          </button>
          <button
            onClick={() => props.onSave?.(props.layout)}
            disabled={!props.canSave}
            className={cn(
              'px-3 py-2 rounded-xl text-xs font-semibold border transition-colors',
              props.canSave
                ? 'bg-indigo-500 hover:bg-indigo-600 text-white border-indigo-400/30'
                : 'bg-zinc-900/40 text-zinc-600 border-white/10 cursor-not-allowed'
            )}
            type="button"
          >
            Save org default
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 space-y-3">
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Main</div>
          <Reorder.Group
            axis="y"
            values={props.layout.main}
            onReorder={(next) => props.onChange({ ...props.layout, main: next as PreviewCardId[] })}
            className="space-y-2"
          >
            {props.layout.main.map((id) => (
              <Reorder.Item
                key={id}
                value={id}
                className="cursor-grab active:cursor-grabbing"
                whileDrag={{ scale: 1.02 }}
              >
                <CardRow
                  id={id}
                  size={props.layout.cardSettings[id]?.size ?? 'md'}
                  isHidden={isHidden(id)}
                  column="main"
                  onToggleHidden={() => toggleHidden(id)}
                  onMoveColumn={() => moveToColumn(id, 'sidebar')}
                  onChangeSize={(s) => setCardSize(id, s)}
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>

        <div className="lg:col-span-6 space-y-3">
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Sidebar</div>
          <Reorder.Group
            axis="y"
            values={props.layout.sidebar}
            onReorder={(next) => props.onChange({ ...props.layout, sidebar: next as PreviewCardId[] })}
            className="space-y-2"
          >
            {props.layout.sidebar.map((id) => (
              <Reorder.Item
                key={id}
                value={id}
                className="cursor-grab active:cursor-grabbing"
                whileDrag={{ scale: 1.02 }}
              >
                <CardRow
                  id={id}
                  size={props.layout.cardSettings[id]?.size ?? 'md'}
                  isHidden={isHidden(id)}
                  column="sidebar"
                  onToggleHidden={() => toggleHidden(id)}
                  onMoveColumn={() => moveToColumn(id, 'main')}
                  onChangeSize={(s) => setCardSize(id, s)}
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Hidden</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {props.layout.hidden.length === 0 ? (
            <div className="text-xs text-zinc-600 italic">No hidden cards.</div>
          ) : (
            props.layout.hidden.map((id) => (
              <div key={id} className="p-3 rounded-xl bg-zinc-900/30 border border-white/10 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{CARD_LABELS[id].title}</div>
                  <div className="text-[10px] text-zinc-500 truncate">{CARD_LABELS[id].hint}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => moveToColumn(id, 'main')}
                    className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-200 border border-white/10 transition-colors"
                    type="button"
                  >
                    Add to main
                  </button>
                  <button
                    onClick={() => moveToColumn(id, 'sidebar')}
                    className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-200 border border-white/10 transition-colors"
                    type="button"
                  >
                    Add to sidebar
                  </button>
                  <button
                    onClick={() => toggleHidden(id)}
                    className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/15 text-red-300 transition-colors"
                    title="Unhide"
                    type="button"
                  >
                    <EyeOff className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

