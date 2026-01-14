'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, Sparkles, Package, Settings, Zap, ArrowRight, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getOnboardingState, updateOnboardingState, shouldShowGuide } from '@/lib/user-onboarding';
import { useToast } from '@/components/ui/ToastProvider';
import { cn } from '@/lib/utils';

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  action?: () => void;
  actionLabel?: string;
}

export function FirstTimeGuide() {
  const [isVisible, setIsVisible] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    // Check if guide should be shown
    if (!shouldShowGuide()) {
      return;
    }

    const state = getOnboardingState();
    
    // Build checklist based on current state
    const items: ChecklistItem[] = [
      {
        id: 'create-product',
        label: 'Create your first product',
        completed: state.firstProductCreated,
        action: () => {
          router.push('/create');
          dismissGuide();
        },
        actionLabel: 'Get Started',
      },
      {
        id: 'configure-store',
        label: 'Configure your store connection',
        completed: state.storeConfigured,
        action: () => {
          router.push('/settings?tab=store');
          dismissGuide();
        },
        actionLabel: 'Configure',
      },
      {
        id: 'setup-ai',
        label: 'Set up AI provider',
        completed: state.aiConfigured,
        action: () => {
          router.push('/settings?tab=ai-engine');
          dismissGuide();
        },
        actionLabel: 'Set Up',
      },
    ];

    setChecklist(items);
    setIsVisible(true);

    // Show welcome toast
    setTimeout(() => {
      toast({
        type: 'success',
        title: 'Welcome to Product Architect!',
        description: "Let's create your first product to get started.",
        duration: 6000,
        action: {
          label: 'Get Started',
          onClick: () => {
            router.push('/create');
            dismissGuide();
          },
        },
      });
    }, 500);
  }, [router, toast]);

  const dismissGuide = (permanent = false) => {
    setIsVisible(false);
    if (permanent) {
      updateOnboardingState({ guideDismissed: true });
    }
  };

  const completedCount = checklist.filter((item) => item.completed).length;
  const totalCount = checklist.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => dismissGuide(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
          />

          {/* Guide Card */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="glass-dark rounded-3xl p-6 border border-indigo-500/20 shadow-2xl space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Getting Started</h3>
                    <p className="text-xs text-zinc-400">Complete these steps to get the most out of Product Architect</p>
                  </div>
                </div>
                <button
                  onClick={() => dismissGuide(true)}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                  aria-label="Dismiss guide"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Progress</span>
                  <span className="text-indigo-400 font-semibold">
                    {completedCount} of {totalCount} completed
                  </span>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                    className="h-full bg-indigo-500 rounded-full"
                  />
                </div>
              </div>

              {/* Checklist */}
              <div className="space-y-2">
                {checklist.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-xl border transition-all',
                      item.completed
                        ? 'bg-emerald-500/5 border-emerald-500/20'
                        : 'bg-white/5 border-white/10 hover:border-indigo-500/20'
                    )}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {item.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-zinc-600 flex-shrink-0" />
                      )}
                      <span
                        className={cn(
                          'text-sm font-medium',
                          item.completed ? 'text-emerald-300 line-through' : 'text-white'
                        )}
                      >
                        {item.label}
                      </span>
                    </div>
                    {!item.completed && item.action && (
                      <button
                        onClick={item.action}
                        className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        {item.actionLabel || 'Start'}
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <button
                  onClick={() => dismissGuide(true)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Don't show again
                </button>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Info className="w-3 h-3" />
                  <span>You can always access settings later</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
