import React from 'react';
import { Activity, Cpu, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

type KikiStatus = 'idle' | 'thinking' | 'working';

interface KikiHUDProps {
  status?: KikiStatus;
  className?: string;
}

export function KikiHUD({ status = 'idle', className }: KikiHUDProps) {
  // Status config
  const config = {
    idle: {
      color: 'bg-yellow-500',
      shadow: 'shadow-yellow-500/50',
      text: 'text-yellow-500',
      label: 'SYSTEM IDLE',
      icon: Activity,
      pulse: 'animate-pulse',
    },
    thinking: {
      color: 'bg-blue-500',
      shadow: 'shadow-blue-500/50',
      text: 'text-blue-500',
      label: 'NEURAL PROCESSING',
      icon: Cpu,
      pulse: 'animate-ping', // Fast flicker
    },
    working: {
      color: 'bg-emerald-500',
      shadow: 'shadow-emerald-500/50',
      text: 'text-emerald-500',
      label: 'EXECUTING PROTOCOL',
      icon: Zap,
      pulse: 'animate-spin', // Spinner for working
    },
  };

  const active = config[status];
  const Icon = active.icon;

  return (
    <div className={cn("flex items-center gap-3 p-3 rounded-xl bg-black/40 border border-white/5 backdrop-blur-md", className)}>
      {/* The Core (Visual Indicator) */}
      <div className="relative">
        <div className={cn("w-3 h-3 rounded-full absolute inset-0 opacity-75", active.color, active.pulse)} />
        <div className={cn("w-3 h-3 rounded-full relative z-10", active.color, active.shadow, "shadow-[0_0_10px_2px]")} />
      </div>

      {/* Text Readout */}
      <div className="flex flex-col">
        <span className={cn("text-[10px] font-bold tracking-[0.2em] leading-none mb-1 opacity-80", active.text)}>
          KIKI_CORE_V1
        </span>
        <div className="flex items-center gap-2">
          <Icon className={cn("w-3 h-3", active.text)} />
          <span className="text-xs font-mono text-zinc-300 font-medium">
            {active.label}
          </span>
        </div>
      </div>
    </div>
  );
}
