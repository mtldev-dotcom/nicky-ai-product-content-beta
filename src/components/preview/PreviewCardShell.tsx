'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { PreviewCardSize } from '@/lib/preview-layout';

function paddingFor(size: PreviewCardSize): string {
  switch (size) {
    case 'sm':
      return 'p-4';
    case 'lg':
      return 'p-8';
    case 'md':
    default:
      return 'p-6';
  }
}

function titleFor(size: PreviewCardSize): string {
  switch (size) {
    case 'sm':
      return 'text-base';
    case 'lg':
      return 'text-xl';
    case 'md':
    default:
      return 'text-lg';
  }
}

/**
 * Generic card shell used by the `/preview` page.
 *
 * Preconditions:
 * - Content is safe to render (for rich text cards, sanitize before passing HTML).
 *
 * Postconditions:
 * - Consistent "glass" styling across preview cards.
 */
export function PreviewCardShell(props: {
  title: string;
  size: PreviewCardSize;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('glass rounded-2xl border border-white/10 space-y-4', paddingFor(props.size), props.className)}>
      <div className="flex items-center justify-between gap-4">
        <h2 className={cn('font-semibold text-white', titleFor(props.size))}>{props.title}</h2>
        {props.rightSlot}
      </div>
      <div>{props.children}</div>
    </section>
  );
}

