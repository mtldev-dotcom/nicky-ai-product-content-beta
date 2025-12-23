'use client';

import React, { useState, Suspense } from 'react';
import { createOrganization } from './actions';
import { Sparkles, Loader2, ArrowRight, Building2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';

function OnboardingForm() {
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md space-y-8"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium uppercase tracking-wider mb-4">
          <Sparkles className="w-3 h-3" />
          Set up your workspace
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Create an Organization
        </h1>
        <p className="text-zinc-400">
          Organizations allow you to collaborate with your team and manage your product catalogs in a shared space.
        </p>
      </div>

      {/* Form Container */}
      <div className="glass-dark rounded-3xl p-8 border border-white/10 shadow-2xl space-y-6">
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        <form action={createOrganization} onSubmit={() => setIsLoading(true)} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500 ml-1">Organization Name</label>
            <div className="relative group">
              <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
              <input 
                name="name"
                type="text"
                placeholder="Acme Corp"
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all"
              />
            </div>
          </div>

          <p className="text-[10px] text-zinc-500 px-1 leading-relaxed">
            By creating an organization, you will become the owner of this workspace and can invite other members later.
          </p>

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 group/btn mt-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Create Workspace
                <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      </div>
    </motion.div>
  );
}

export default function OnboardingPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Suspense fallback={
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-zinc-500 text-sm animate-pulse">Preparing your workspace setup...</p>
        </div>
      }>
        <OnboardingForm />
      </Suspense>
    </div>
  );
}
