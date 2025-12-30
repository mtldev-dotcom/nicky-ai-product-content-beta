'use client';

import React, { useEffect, useState } from 'react';
import { Navigation } from './Navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export const Shell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/onboarding';
  const prefersReducedMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Skip animations on mobile or if user prefers reduced motion
  const shouldAnimate = !prefersReducedMotion && !isMobile;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col md:flex-row">
      {!isAuthPage && <Navigation />}
      
      <main className={cn(
        "flex-1 flex flex-col pb-24 md:pb-0",
        !isAuthPage && "md:pl-20"
      )}>
        {shouldAnimate ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex-1 flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="flex-1 flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full">
            {children}
          </div>
        )}
      </main>
      
      {/* Background Glows for High-Fidelity Feel */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full" />
      </div>
    </div>
  );
};

