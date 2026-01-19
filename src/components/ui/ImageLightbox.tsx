'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { useIsMobile } from '@/lib/mobile-utils';
import { cn } from '@/lib/utils';

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
  images?: string[]; // Optional: for swipe navigation
  currentIndex?: number; // Optional: current image index
  onNavigate?: (index: number) => void; // Optional: navigation callback
}) {
  const { src, alt = '', onClose, images, currentIndex, onNavigate } = props;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const isMobile = useIsMobile();
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [swipeStart, setSwipeStart] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!src) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (images && onNavigate && currentIndex !== undefined) {
        if (e.key === 'ArrowLeft' && currentIndex > 0) {
          onNavigate(currentIndex - 1);
        } else if (e.key === 'ArrowRight' && currentIndex < images.length - 1) {
          onNavigate(currentIndex + 1);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    // Best-effort: focus close button for keyboard users.
    setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [src, onClose, images, currentIndex, onNavigate]);

  // Reset zoom on image change
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [src]);

  // Touch handlers for swipe and pinch
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setSwipeStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    } else if (e.touches.length === 2) {
      // Pinch zoom start
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && swipeStart) {
      // Single touch - potential swipe
      const deltaX = e.touches[0].clientX - swipeStart.x;
      const deltaY = e.touches[0].clientY - swipeStart.y;
      
      // If horizontal swipe is dominant, prevent default to allow swipe navigation
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        e.preventDefault();
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (swipeStart && images && onNavigate && currentIndex !== undefined) {
      const deltaX = e.changedTouches[0].clientX - swipeStart.x;
      const deltaY = e.changedTouches[0].clientY - swipeStart.y;
      
      // Swipe down to close (if vertical swipe is dominant)
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 50 && deltaY > 0) {
        onClose();
        return;
      }
      
      // Swipe left/right to navigate
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX > 0 && currentIndex > 0) {
          onNavigate(currentIndex - 1);
        } else if (deltaX < 0 && currentIndex < images.length - 1) {
          onNavigate(currentIndex + 1);
        }
      }
    }
    setSwipeStart(null);
    setIsDragging(false);
  };

  // Double tap to zoom
  const handleDoubleClick = () => {
    if (isMobile) {
      setScale(scale === 1 ? 2 : 1);
      setPosition({ x: 0, y: 0 });
    }
  };

  const canOpenExternally = typeof src === 'string' && (src.startsWith('https://') || src.startsWith('http://'));

  const canNavigate = images && onNavigate && currentIndex !== undefined && images.length > 1;
  const canGoPrev = canNavigate && currentIndex! > 0;
  const canGoNext = canNavigate && currentIndex! < images!.length - 1;

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            "fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center",
            isMobile ? "p-0" : "p-4"
          )}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <motion.div
            initial={{ opacity: 0, scale: isMobile ? 1 : 0.98, y: isMobile ? 0 : 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: isMobile ? 1 : 0.98, y: isMobile ? 0 : 6 }}
            className={cn(
              "w-full max-w-6xl max-h-[90vh] border border-white/10 bg-zinc-950/80 overflow-hidden shadow-2xl",
              isMobile ? "rounded-none h-full" : "rounded-2xl"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - Hidden on mobile, shown on desktop */}
            {!isMobile && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
                <div className="text-xs text-zinc-400 truncate">
                  Preview{canNavigate && ` (${currentIndex! + 1} of ${images!.length})`}
                </div>
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
                    className="touch-target p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10"
                    aria-label="Close image preview"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Image container */}
            <div className="relative bg-black/30 flex items-center justify-center" style={{ height: isMobile ? '100vh' : 'calc(90vh - 52px)' }}>
              {/* Navigation arrows - Desktop only */}
              {!isMobile && canNavigate && (
                <>
                  {canGoPrev && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate!(currentIndex! - 1);
                      }}
                      className="absolute left-4 touch-target-large p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/10 z-10"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                  )}
                  {canGoNext && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate!(currentIndex! + 1);
                      }}
                      className="absolute right-4 touch-target-large p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/10 z-10"
                      aria-label="Next image"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  )}
                </>
              )}

              {/* Image */}
              <img
                ref={imageRef}
                src={src}
                alt={alt}
                className={cn(
                  "object-contain",
                  isMobile ? "w-full h-full" : "w-full h-full",
                  scale !== 1 && "transition-transform duration-200"
                )}
                style={{
                  transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
                  transformOrigin: 'center center',
                }}
                draggable={false}
                onDoubleClick={handleDoubleClick}
              />

              {/* Mobile: Close button and navigation */}
              {isMobile && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* Top bar with close and counter */}
                  <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-auto">
                    <div className="text-sm text-white font-medium">
                      {canNavigate && `${currentIndex! + 1} / ${images!.length}`}
                    </div>
                    <button
                      ref={closeButtonRef}
                      type="button"
                      onClick={onClose}
                      className="touch-target-large p-3 rounded-full bg-black/60 backdrop-blur-md text-white"
                      aria-label="Close image preview"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Bottom bar with open link */}
                  {canOpenExternally && (
                    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center p-4 bg-gradient-to-t from-black/80 to-transparent pointer-events-auto pb-safe">
                      <a
                        href={src}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="touch-target-large px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold inline-flex items-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open in New Tab
                      </a>
                    </div>
                  )}

                  {/* Swipe indicators */}
                  {canNavigate && (
                    <>
                      {canGoPrev && (
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <ChevronLeft className="w-8 h-8 text-white/50" />
                        </div>
                      )}
                      {canGoNext && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <ChevronRight className="w-8 h-8 text-white/50" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


