'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BlueprintPreviewProps {
  data: unknown;
  className?: string;
}

export function BlueprintPreview({ data, className }: BlueprintPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className={cn('glass rounded-2xl border border-white/10 overflow-hidden', className)}>
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">JSON Preview</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            title="Copy JSON"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="p-4 overflow-auto max-h-[600px]">
          <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap break-words">
            {jsonString}
          </pre>
        </div>
      )}
    </div>
  );
}

