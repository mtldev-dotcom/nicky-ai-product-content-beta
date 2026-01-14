'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface StepIndicatorProps {
  step: number;
  totalSteps: number;
  title: string;
  description?: string;
}

export function StepIndicator({ step, totalSteps, title, description }: StepIndicatorProps) {
  return (
    <div className="space-y-2 mb-6">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
          Step {step} of {totalSteps}
        </span>
      </div>
      <h2 className="text-2xl font-bold text-white">{title}</h2>
      {description && (
        <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
      )}
    </div>
  );
}
