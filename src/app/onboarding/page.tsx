'use client';

import React, { useState, Suspense } from 'react';
import { createOrganization, saveWizardSettings } from './actions';
import { testMedusaConnection } from '@/app/settings/actions';
import { Sparkles, Loader2, ArrowRight, Building2, Store, Zap, CheckCircle2, Eye, EyeOff, ExternalLink, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useRouter } from 'next/navigation';
import { WizardProgress } from '@/components/onboarding/WizardProgress';
import { StepIndicator } from '@/components/onboarding/StepIndicator';
import { useToast } from '@/components/ui/ToastProvider';
import { cn } from '@/lib/utils';

const isDev = process.env.NODE_ENV === 'development';

type WizardStep = 1 | 2 | 3;

function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const error = searchParams.get('error');

  // Step 1: Organization
  const [orgName, setOrgName] = useState('');

  // Step 2: Store Settings
  const [storePlatform, setStorePlatform] = useState<'medusa' | 'none'>('none');
  const [medusaUrl, setMedusaUrl] = useState('');
  const [medusaApiKey, setMedusaApiKey] = useState('');
  const [showMedusaKey, setShowMedusaKey] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  // Step 3: AI Configuration
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [brandVoice, setBrandVoice] = useState('');

  const stepLabels = ['Create Workspace', 'Connect Store', 'Set Up AI'];

  // Dev auto-fill handlers
  const handleStep1AutoFill = () => {
    setOrgName(`Test Organization ${Date.now()}`);
  };

  const handleStep2AutoFill = () => {
    setStorePlatform('medusa');
    setMedusaUrl('https://admin.medusa-commerce.com');
    setMedusaApiKey('test_medusa_api_key_12345');
  };

  const handleStep3AutoFill = () => {
    setOpenaiApiKey('sk-test-openai-api-key-1234567890');
    setBrandName('Test Brand');
    setBrandVoice('Professional, friendly, and modern');
  };

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', orgName.trim());

      const result = await createOrganization(formData);
      if (result && 'organizationId' in result && result.organizationId) {
        setOrgId(result.organizationId);
        setCurrentStep(2);
        toast({
          type: 'success',
          title: 'Workspace created!',
          description: 'Your organization is ready. Let\'s connect your store next.',
          duration: 4000,
        });
      }
    } catch (err) {
      toast({
        type: 'error',
        title: 'Failed to create workspace',
        description: err instanceof Error ? err.message : 'Please try again.',
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestMedusaConnection = async () => {
    if (!orgId || !medusaUrl.trim() || !medusaApiKey.trim()) {
      setConnectionTestResult({ success: false, error: 'Please enter both URL and API key' });
      return;
    }

    setIsTestingConnection(true);
    setConnectionTestResult(null);

    try {
      const result = await testMedusaConnection(orgId, medusaUrl.trim(), medusaApiKey.trim());
      setConnectionTestResult(result);
      
      if (result.success) {
        toast({
          type: 'success',
          title: 'Connection successful!',
          description: 'Your Medusa store is connected and ready.',
          duration: 3000,
        });
      } else {
        toast({
          type: 'error',
          title: 'Connection failed',
          description: result.error || 'Please check your credentials.',
          duration: 5000,
        });
      }
    } catch (err) {
      setConnectionTestResult({ success: false, error: 'Network error' });
      toast({
        type: 'error',
        title: 'Connection test failed',
        description: 'Please try again.',
        duration: 5000,
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleStep2Next = () => {
    // Step 2 is optional - can skip if no store configured
    if (storePlatform === 'none') {
      setCurrentStep(3);
      return;
    }

    // If Medusa is selected, validate
    if (storePlatform === 'medusa') {
      if (!medusaUrl.trim() || !medusaApiKey.trim()) {
        toast({
          type: 'warning',
          title: 'Store configuration incomplete',
          description: 'Please enter Medusa URL and API key, or select "None" to skip.',
          duration: 4000,
        });
        return;
      }

      // Save store settings
      handleSaveStep2();
    } else {
      setCurrentStep(3);
    }
  };

  const handleSaveStep2 = async () => {
    if (!orgId) return;

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('storePlatform', storePlatform);
      if (medusaUrl.trim()) formData.append('medusaUrl', medusaUrl.trim());
      if (medusaApiKey.trim()) formData.append('medusaApiKey', medusaApiKey.trim());

      const result = await saveWizardSettings(formData);
      if (result.success) {
        setCurrentStep(3);
      } else {
        toast({
          type: 'error',
          title: 'Failed to save settings',
          description: result.error || 'Please try again.',
          duration: 5000,
        });
      }
    } catch (err) {
      toast({
        type: 'error',
        title: 'Error saving settings',
        description: 'Please try again.',
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep3Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;

    // OpenAI key is required for core features
    if (!openaiApiKey.trim()) {
      toast({
        type: 'warning',
        title: 'OpenAI API key required',
        description: 'An API key is needed for AI-powered features. You can add it later in settings.',
        duration: 5000,
      });
      // Allow continuing anyway, but warn
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      if (openaiApiKey.trim()) formData.append('openaiApiKey', openaiApiKey.trim());
      if (brandName.trim()) formData.append('brandName', brandName.trim());
      if (brandVoice.trim()) formData.append('brandVoice', brandVoice.trim());

      const result = await saveWizardSettings(formData);
      if (result.success) {
        toast({
          type: 'success',
          title: 'Setup complete!',
          description: 'Welcome to Product Architect. Let\'s create your first product!',
          duration: 5000,
        });
        
        // Redirect to dashboard after a brief delay
        setTimeout(() => {
          router.push('/?onboarding=complete');
        }, 1500);
      } else {
        toast({
          type: 'error',
          title: 'Failed to save settings',
          description: result.error || 'Please try again.',
          duration: 5000,
        });
      }
    } catch (err) {
      toast({
        type: 'error',
        title: 'Error completing setup',
        description: 'Please try again.',
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-2xl mx-auto space-y-8"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium uppercase tracking-wider mb-4">
          <Sparkles className="w-3 h-3" />
          Set up your workspace
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Welcome to Product Architect
        </h1>
        <p className="text-zinc-400">
          Let's get you set up in just a few steps. You can always change these settings later.
        </p>
      </div>

      {/* Progress Bar */}
      <div className="glass-dark rounded-3xl p-6 border border-white/10">
        <WizardProgress 
          currentStep={currentStep} 
          totalSteps={3} 
          stepLabels={stepLabels}
        />
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="glass-dark rounded-3xl p-8 border border-white/10 shadow-2xl">
        <AnimatePresence mode="wait">
          {/* Step 1: Organization Setup */}
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <StepIndicator
                step={1}
                totalSteps={3}
                title="Create Your Workspace"
                description="Organizations help you collaborate with your team and manage product catalogs in a shared space."
              />

              {isDev && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <button
                    type="button"
                    onClick={handleStep1AutoFill}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition-all"
                  >
                    <Zap className="w-3 h-3" />
                    Dev: Auto-fill Organization Name
                  </button>
                </div>
              )}

              <form onSubmit={handleStep1Submit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-500 ml-1">Organization Name</label>
                  <div className="relative group">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
                    <input 
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      type="text"
                      placeholder="Acme Corp"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 px-1 leading-relaxed mt-1">
                    This will be your workspace name. You can invite team members later.
                  </p>
                </div>

                <button 
                  type="submit"
                  disabled={isLoading || !orgName.trim()}
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
            </motion.div>
          )}

          {/* Step 2: Store Settings */}
          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <StepIndicator
                step={2}
                totalSteps={3}
                title="Connect Your Store"
                description="Link your Medusa store to sync products and taxonomy. You can skip this step and configure it later."
              />

              {isDev && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <button
                    type="button"
                    onClick={handleStep2AutoFill}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition-all"
                  >
                    <Zap className="w-3 h-3" />
                    Dev: Auto-fill Medusa Settings
                  </button>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-500 ml-1">Store Platform</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setStorePlatform('medusa');
                        setMedusaUrl('');
                        setMedusaApiKey('');
                        setConnectionTestResult(null);
                      }}
                      className={cn(
                        "p-4 rounded-xl border-2 transition-all text-left",
                        storePlatform === 'medusa'
                          ? "bg-indigo-500/10 border-indigo-500/40"
                          : "bg-white/5 border-white/10 hover:border-white/20"
                      )}
                    >
                      <Store className="w-5 h-5 text-indigo-400 mb-2" />
                      <p className="text-sm font-semibold text-white">Medusa</p>
                      <p className="text-xs text-zinc-500 mt-1">Connect your Medusa store</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStorePlatform('none');
                        setMedusaUrl('');
                        setMedusaApiKey('');
                        setConnectionTestResult(null);
                      }}
                      className={cn(
                        "p-4 rounded-xl border-2 transition-all text-left",
                        storePlatform === 'none'
                          ? "bg-indigo-500/10 border-indigo-500/40"
                          : "bg-white/5 border-white/10 hover:border-white/20"
                      )}
                    >
                      <Info className="w-5 h-5 text-zinc-400 mb-2" />
                      <p className="text-sm font-semibold text-white">Skip for now</p>
                      <p className="text-xs text-zinc-500 mt-1">Configure later in settings</p>
                    </button>
                  </div>
                </div>

                {storePlatform === 'medusa' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-4 pt-4 border-t border-white/5"
                  >
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-zinc-500 ml-1">Medusa URL</label>
                      <input 
                        value={medusaUrl}
                        onChange={(e) => setMedusaUrl(e.target.value)}
                        type="url"
                        placeholder="https://your-store.medusa-commerce.com"
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all"
                      />
                      <p className="text-[10px] text-zinc-500 px-1 leading-relaxed mt-1">
                        Your Medusa store admin URL (e.g., https://admin.medusa-commerce.com)
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-zinc-500 ml-1">Admin API Key</label>
                      <div className="relative group">
                        <input 
                          value={medusaApiKey}
                          onChange={(e) => setMedusaApiKey(e.target.value)}
                          type={showMedusaKey ? 'text' : 'password'}
                          placeholder="Enter your Medusa admin API key"
                          className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowMedusaKey(!showMedusaKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          {showMedusaKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-zinc-500 px-1 leading-relaxed mt-1">
                        Find this in your Medusa admin dashboard under Settings → API Keys
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleTestMedusaConnection}
                      disabled={isTestingConnection || !medusaUrl.trim() || !medusaApiKey.trim()}
                      className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTestingConnection ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Testing connection...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Test Connection
                        </>
                      )}
                    </button>

                    {connectionTestResult && (
                      <div className={cn(
                        "p-3 rounded-xl text-sm",
                        connectionTestResult.success
                          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                          : "bg-red-500/10 border border-red-500/20 text-red-400"
                      )}>
                        {connectionTestResult.success ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Connection successful!</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Info className="w-4 h-4" />
                            <span>{connectionTestResult.error || 'Connection failed'}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white py-3 rounded-xl font-semibold transition-all"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleStep2Next}
                    disabled={isLoading}
                    className="flex-1 bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 group/btn"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        {storePlatform === 'none' ? 'Skip' : 'Continue'}
                        <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: AI Configuration */}
          {currentStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <StepIndicator
                step={3}
                totalSteps={3}
                title="Set Up AI"
                description="Configure your AI provider to enable product generation and enhancement features."
              />

              {isDev && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <button
                    type="button"
                    onClick={handleStep3AutoFill}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition-all"
                  >
                    <Zap className="w-3 h-3" />
                    Dev: Auto-fill AI Settings
                  </button>
                </div>
              )}

              <form onSubmit={handleStep3Submit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-500 ml-1 flex items-center gap-2">
                    OpenAI API Key
                    <span className="text-red-400">*</span>
                  </label>
                  <div className="relative group">
                    <Zap className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
                    <input 
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      type={showOpenaiKey ? 'text' : 'password'}
                      placeholder="sk-..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-12 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 px-1 leading-relaxed mt-1 flex items-center gap-1">
                    Required for AI features. Get your key from{' '}
                    <a 
                      href="https://platform.openai.com/api-keys" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1"
                    >
                      OpenAI Platform
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-500 ml-1">Brand Name (Optional)</label>
                  <input 
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    type="text"
                    placeholder="Your Brand"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all"
                  />
                  <p className="text-[10px] text-zinc-500 px-1 leading-relaxed mt-1">
                    Used in AI-generated content to personalize product descriptions
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-500 ml-1">Brand Voice (Optional)</label>
                  <textarea 
                    value={brandVoice}
                    onChange={(e) => setBrandVoice(e.target.value)}
                    placeholder="Professional, friendly, minimalist..."
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all resize-none"
                  />
                  <p className="text-[10px] text-zinc-500 px-1 leading-relaxed mt-1">
                    Describe your brand's tone and style for AI-generated content
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white py-4 rounded-xl font-semibold transition-all"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 group/btn"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Complete Setup
                        <CheckCircle2 className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
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
        <OnboardingWizard />
      </Suspense>
    </div>
  );
}
