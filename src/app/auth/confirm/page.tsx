'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Sparkles, CheckCircle2, Loader2, ArrowRight, Mail } from 'lucide-react';
import { motion } from 'framer-motion';

function ConfirmEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [autoRedirect, setAutoRedirect] = useState(true);

  useEffect(() => {
    const verifyEmail = async () => {
      const supabase = createClient();
      
      // Get token and type from URL
      const token = searchParams.get('token');
      const type = searchParams.get('type');
      
      if (!token || type !== 'signup') {
        setStatus('error');
        setErrorMessage('Invalid confirmation link. Please check your email and try again.');
        return;
      }

      try {
        // Verify the email confirmation token
        const { error } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: 'signup',
        });

        if (error) {
          setStatus('error');
          setErrorMessage(error.message || 'Failed to confirm email. The link may have expired.');
          return;
        }

        setStatus('success');
        
        // Start countdown for auto-redirect
        if (autoRedirect) {
          const interval = setInterval(() => {
            setCountdown((prev) => {
              if (prev <= 1) {
                clearInterval(interval);
                router.push('/onboarding');
                return 0;
              }
              return prev - 1;
            });
          }, 1000);

          return () => clearInterval(interval);
        }
      } catch (err) {
        setStatus('error');
        setErrorMessage('An unexpected error occurred. Please try again.');
        console.error('Email confirmation error:', err);
      }
    };

    verifyEmail();
  }, [searchParams, router, autoRedirect]);

  const handleContinue = () => {
    router.push('/onboarding');
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8"
      >
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium uppercase tracking-wider mb-4">
            <Sparkles className="w-3 h-3" />
            Email Confirmation
          </div>

          {/* Status Icon */}
          {status === 'verifying' && (
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              </div>
            </div>
          )}

          {status === 'success' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', duration: 0.5 }}
              className="flex justify-center"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
            </motion.div>
          )}

          {status === 'error' && (
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Mail className="w-8 h-8 text-red-400" />
              </div>
            </div>
          )}

          {/* Title */}
          <h1 className="text-3xl font-bold text-white tracking-tight">
            {status === 'verifying' && 'Verifying your email...'}
            {status === 'success' && 'Email confirmed!'}
            {status === 'error' && 'Confirmation failed'}
          </h1>

          {/* Description */}
          <p className="text-zinc-400">
            {status === 'verifying' && 'Please wait while we verify your email address.'}
            {status === 'success' && 'Your email has been successfully confirmed. Let\'s set up your workspace!'}
            {status === 'error' && errorMessage}
          </p>
        </div>

        {/* Progress Indicator */}
        {status === 'success' && (
          <div className="glass-dark rounded-3xl p-6 border border-white/10 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Setup Progress</span>
                <span className="text-indigo-400 font-semibold">Step 1 of 3</span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '33%' }}
                  transition={{ duration: 0.5 }}
                  className="h-full bg-indigo-500 rounded-full"
                />
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Email confirmed</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-500">
                <div className="w-4 h-4 rounded-full border-2 border-zinc-600" />
                <span>Create your workspace</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-500">
                <div className="w-4 h-4 rounded-full border-2 border-zinc-600" />
                <span>Configure your store</span>
              </div>
            </div>

            {/* Instructions */}
            <div className="pt-4 border-t border-white/5">
              <p className="text-xs text-zinc-500 leading-relaxed">
                Next, you'll create your organization workspace and configure your store settings. 
                This takes just a few minutes.
              </p>
            </div>

            {/* Auto-redirect countdown */}
            {autoRedirect && countdown > 0 && (
              <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
                <span>Redirecting in {countdown} second{countdown !== 1 ? 's' : ''}...</span>
                <button
                  onClick={() => setAutoRedirect(false)}
                  className="text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Continue Button */}
            <button
              onClick={handleContinue}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 group/btn mt-4"
            >
              Continue to Setup
              <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
            </button>
          </div>
        )}

        {/* Error Actions */}
        {status === 'error' && (
          <div className="glass-dark rounded-3xl p-6 border border-white/10 space-y-4">
            <div className="space-y-2 text-sm text-zinc-400">
              <p>If you're having trouble, you can:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Check if the link has expired (links are valid for 24 hours)</li>
                <li>Request a new confirmation email</li>
                <li>Contact support if the problem persists</li>
              </ul>
            </div>
            <button
              onClick={() => router.push('/login')}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              Back to Login
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[80vh] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-zinc-500 text-sm animate-pulse">Loading confirmation...</p>
          </div>
        </div>
      }
    >
      <ConfirmEmailContent />
    </Suspense>
  );
}
