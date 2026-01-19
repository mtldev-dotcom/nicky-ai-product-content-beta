'use client';

import { useEffect, useState } from 'react';

/**
 * Hook to detect if the current viewport is mobile (< 768px)
 * Uses window.matchMedia for SSR-safe detection
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    setIsMobile(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, []);

  return isMobile;
}

/**
 * Hook to detect if the device supports touch
 * Useful for enabling touch-specific interactions
 */
export function useTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      // @ts-expect-error - msMaxTouchPoints is IE-specific
      navigator.msMaxTouchPoints > 0
    );
  }, []);

  return isTouch;
}

/**
 * Hook to detect if user prefers reduced motion
 * Respects system accessibility preferences
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, []);

  return prefersReducedMotion;
}

/**
 * Hook to detect if device has low performance
 * Useful for disabling heavy animations/effects
 */
export function useLowPerformance(): boolean {
  const [isLowPerformance, setIsLowPerformance] = useState(false);

  useEffect(() => {
    // Check for hardware concurrency (CPU cores)
    const cores = navigator.hardwareConcurrency || 2;
    // Check for device memory (if available)
    // @ts-expect-error - deviceMemory is not in all browsers
    const memory = navigator.deviceMemory || 4;
    
    // Consider low performance if: < 4 cores OR < 4GB RAM
    setIsLowPerformance(cores < 4 || memory < 4);
  }, []);

  return isLowPerformance;
}

/**
 * Mobile breakpoint constants
 */
export const MOBILE_BREAKPOINTS = {
  xs: 320,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

/**
 * Minimum touch target size (44x44px per WCAG guidelines)
 */
export const MIN_TOUCH_TARGET = 44;
