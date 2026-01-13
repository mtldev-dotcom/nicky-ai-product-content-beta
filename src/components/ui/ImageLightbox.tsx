'use client';

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';

/**
 * Simple image lightbox (click-to-zoom).
 *
 * Preconditions:
 * - `src` is an http(s) URL (or empty string).
 *
 * Postconditions:
 * - When open, Escape closes the dialog.
 * - Backdrop click closes the dialog.
 *
 * Notes:
 * - We keep this intentionally lightweight (no focus trap library).
 * - This is a UI-only enhancer; it does not mutate product state.
 */
export function ImageLightbox(props: {
  src: string | null;
  alt?: string;
  onClose: () => void;
}) {
  const { src, alt = '', onClose } = props;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!src) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    // Best-effort: focus close button for keyboard users.
    setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [src, onClose]);

  const canOpenExternally = typeof src === 'string' && (src.startsWith('https://') || src.startsWith('http://'));

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            className="w-full max-w-6xl max-h-[90vh] rounded-2xl border border-white/10 bg-zinc-950/80 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
              <div className="text-xs text-zinc-400 truncate">Preview</div>
              <div className="flex items-center gap-2">
                {canOpenExternally && (
                  <a
                    href={src}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 text-xs font-semibold inline-flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open
                  </a>
                )}
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10"
                  aria-label="Close image preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="bg-black/30">
              <img
                src={src}
                alt={alt}
                className="w-full h-[calc(90vh-52px)] object-contain"
                draggable={false}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


