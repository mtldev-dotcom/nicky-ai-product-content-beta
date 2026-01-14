'use client';

import React from 'react';
import { Save, CheckCircle2, RotateCcw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface StickySaveBarProps {
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onReset: () => void;
  saved: boolean;
}

export function StickySaveBar({
  isDirty,
  isSaving,
  onSave,
  onReset,
  saved,
}: StickySaveBarProps) {
  return (
    <AnimatePresence>
      {(isDirty || isSaving || saved) && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl"
        >
          <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-4 shadow-2xl shadow-black/50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 px-2">
              <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center transition-colors",
                saved ? "bg-emerald-500/20" : "bg-indigo-500/20"
              )}>
                {saved ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-indigo-400" />
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-white">
                  {saved ? 'Changes Saved' : 'Unsaved Changes'}
                </p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                  {saved ? 'Syncing to cloud complete' : 'You have pending changes'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!saved && !isSaving && (
                <button
                  onClick={onReset}
                  className="px-4 py-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-all text-xs font-bold flex items-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Discard
                </button>
              )}
              
              <button
                onClick={onSave}
                disabled={isSaving || saved}
                className={cn(
                  "px-8 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95",
                  saved 
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                    : "bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                )}
              >
                {isSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : saved ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Save Configuration
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
