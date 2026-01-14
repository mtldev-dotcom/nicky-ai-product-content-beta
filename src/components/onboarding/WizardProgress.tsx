'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardProgressProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

export function WizardProgress({ currentStep, totalSteps, stepLabels }: WizardProgressProps) {
  return (
    <div className="w-full space-y-4">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">Setup Progress</span>
          <span className="text-indigo-400 font-semibold">
            Step {currentStep} of {totalSteps}
          </span>
        </div>
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Step Indicators */}
      <div className="flex items-center justify-between">
        {stepLabels.map((label, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;
          const isUpcoming = stepNumber > currentStep;

          return (
            <div key={stepNumber} className="flex-1 flex flex-col items-center">
              <div className="flex items-center w-full">
                {/* Step Circle */}
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all',
                    isCompleted &&
                      'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
                    isCurrent &&
                      'bg-indigo-500/10 border-indigo-500/40 text-indigo-400 ring-2 ring-indigo-500/20',
                    isUpcoming && 'bg-zinc-800 border-zinc-700 text-zinc-600'
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <span className="text-xs font-semibold">{stepNumber}</span>
                  )}
                </div>

                {/* Connector Line */}
                {index < stepLabels.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-0.5 mx-2 transition-all',
                      isCompleted ? 'bg-emerald-500/20' : 'bg-zinc-800'
                    )}
                  />
                )}
              </div>

              {/* Step Label */}
              <div className="mt-2 text-center">
                <p
                  className={cn(
                    'text-xs font-medium transition-colors',
                    isCurrent && 'text-indigo-400',
                    isCompleted && 'text-emerald-400',
                    isUpcoming && 'text-zinc-600'
                  )}
                >
                  {label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
