'use client';

import React from 'react';
import { Sparkles, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AISourceBadgeProps {
  source: 'ai' | 'source' | 'mixed';
  className?: string;
}

export function AISourceBadge({ source, className }: AISourceBadgeProps) {
  const config = {
    ai: {
      label: 'AI',
      icon: Sparkles,
      colors: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    },
    source: {
      label: 'Source',
      icon: FileText,
      colors: 'bg-green-500/10 text-green-400 border-green-500/20',
    },
    mixed: {
      label: 'Mixed',
      icon: Sparkles,
      colors: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    },
  };

  const badgeConfig = config[source] || config.source;
  const { label, icon: Icon, colors } = badgeConfig;

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border',
      colors,
      className
    )}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

