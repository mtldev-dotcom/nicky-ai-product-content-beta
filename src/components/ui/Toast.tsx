'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const styles = {
  success: {
    container: 'bg-emerald-500/10 border-emerald-500/20',
    icon: 'text-emerald-400',
    title: 'text-emerald-300',
    description: 'text-emerald-400/80',
  },
  error: {
    container: 'bg-red-500/10 border-red-500/20',
    icon: 'text-red-400',
    title: 'text-red-300',
    description: 'text-red-400/80',
  },
  info: {
    container: 'bg-indigo-500/10 border-indigo-500/20',
    icon: 'text-indigo-400',
    title: 'text-indigo-300',
    description: 'text-indigo-400/80',
  },
  warning: {
    container: 'bg-amber-500/10 border-amber-500/20',
    icon: 'text-amber-400',
    title: 'text-amber-300',
    description: 'text-amber-400/80',
  },
};

export function ToastComponent({ toast, onDismiss }: ToastProps) {
  const Icon = icons[toast.type];
  const style = styles[toast.type];
  const duration = toast.duration ?? 5000;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(toast.id);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, toast.id, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      className={cn(
        'glass-dark rounded-xl p-4 border min-w-[320px] max-w-[420px] shadow-lg',
        style.container
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', style.icon)} />
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-semibold', style.title)}>
            {toast.title}
          </p>
          {toast.description && (
            <p className={cn('text-xs mt-1 leading-relaxed', style.description)}>
              {toast.description}
            </p>
          )}
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className={cn(
                'mt-2 text-xs font-semibold underline hover:no-underline transition-all',
                style.title
              )}
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className={cn(
            'flex-shrink-0 p-1 rounded-lg hover:bg-white/5 transition-colors',
            style.description
          )}
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
