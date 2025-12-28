'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ImagePlus, FileJson, PenTool, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const OPTIONS = [
  {
    id: 'drop-it',
    title: 'JUST DROP IT',
    subtitle: 'Recommended',
    description: 'Paste anything: AliExpress page, CSV snippet, screenshots, product notes. We\'ll parse and structure it.',
    icon: Sparkles,
    href: '/create/drop-it',
    gradient: 'from-indigo-500 to-purple-600',
    recommended: true,
  },
  {
    id: 'image-text',
    title: 'Image + Text',
    subtitle: 'Visual AI',
    description: 'Upload 1–10 images with optional notes. We\'ll infer materials, style, and details.',
    icon: ImagePlus,
    href: '/', // Existing flow
    gradient: 'from-blue-500 to-cyan-600',
  },
  {
    id: 'json',
    title: 'JSON Import',
    subtitle: 'Power users',
    description: 'Upload a pre-structured JSON that matches your schema.',
    icon: FileJson,
    href: '/', // Existing flow
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'manual',
    title: 'Manual Build',
    subtitle: 'Step by step',
    description: 'Start from a blank template and fill it step by step.',
    icon: PenTool,
    href: '/product-details',
    gradient: 'from-zinc-500 to-zinc-700',
  },
];

export default function CreateProductPage() {
  const router = useRouter();

  return (
    <div className="space-y-12 pb-20 md:pb-0">
      <header className="space-y-4">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-[1.1]">
          How do you want to <br />
          <span className="text-zinc-500">create this product?</span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl">
          Start from whatever you have — our AI will normalize it into your product schema.
        </p>
        <p className="text-sm text-zinc-500 italic">
          All paths end in the same editor and Medusa-ready JSON.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {OPTIONS.map((option, index) => {
          const Icon = option.icon;
          return (
            <motion.button
              key={option.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => router.push(option.href)}
              className={cn(
                'glass rounded-2xl p-6 border border-white/10 hover:border-indigo-500/30 transition-all text-left group relative overflow-hidden',
                option.recommended && 'ring-2 ring-indigo-500/50'
              )}
            >
              {option.recommended && (
                <div className="absolute top-4 right-4 px-2 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-xs font-medium">
                  Recommended
                </div>
              )}
              
              <div className="relative z-10 space-y-4">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br',
                    option.gradient,
                    'group-hover:scale-110 transition-transform'
                  )}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xl font-semibold text-white">{option.title}</h3>
                      {option.subtitle && (
                        <span className="text-xs text-zinc-500 uppercase tracking-wider">
                          {option.subtitle}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      {option.description}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-indigo-400 text-sm font-medium group-hover:gap-3 transition-all">
                  Get started
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

