'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { createClient } from '@/utils/supabase/client';
import { Shield } from 'lucide-react';

// Sections
import { GeneralSection } from '@/components/settings/sections/GeneralSection';
import { StoreSection } from '@/components/settings/sections/StoreSection';
import { AIEngineSection } from '@/components/settings/sections/AIEngineSection';
import { AIStudioSection } from '@/components/settings/sections/AIStudioSection';
import { StorageSection } from '@/components/settings/sections/StorageSection';
import { LocalizationSection } from '@/components/settings/sections/LocalizationSection';

// UI
import { SettingsSidebar, type SettingsTab } from '@/components/settings/ui/SettingsSidebar';
import { StickySaveBar } from '@/components/settings/ui/StickySaveBar';

import { getMedusaTaxonomy } from '@/app/product-details/actions';
import {
  coerceAiImageProviderId,
  topImageModelsForProvider,
} from '@/lib/ai/topImageModels';

export default function SettingsPage() {
  const settings = useSettingsStore();
  const loadSettingsFromDb = useSettingsStore(s => s.loadFromDb);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [localState, setLocalState] = useState({
    openaiApiKey: '',
    openrouterApiKey: '',
    falApiKey: '',
    geminiApiKey: '',
    r2AccountId: '',
    r2AccessKeyId: '',
    r2SecretAccessKey: '',
    r2BucketName: '',
    r2PublicUrl: '',
    brandName: '',
    brandVoice: '',
    customInstructions: '',
    storePlatform: 'medusa',
    medusaUrl: '',
    medusaApiKey: '',
    activeLanguages: [] as string[],
    aiImageProvider: 'openai',
    aiImageModel: '',
    defaultSalesChannelId: null as string | null,
    defaultShippingProfileId: null as string | null,
    defaultCollectionId: null as string | null,
    defaultCategoryIds: [] as string[],
  });

  const [taxonomy, setTaxonomy] = useState<any>(null);
  const [isLoadingTaxonomy, setIsLoadingTaxonomy] = useState(false);
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null);
  const supabase = createClient();

  // Load Initial Settings
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: membership } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .single();

        if (membership) {
          setOrgId(membership.organization_id);
          await loadSettingsFromDb(membership.organization_id);
        }
      }
    };
    init();
  }, [loadSettingsFromDb, supabase]);

  // Sync Store to Local State
  useEffect(() => {
    setLocalState({
      openaiApiKey: settings.openaiApiKey,
      openrouterApiKey: settings.openrouterApiKey,
      falApiKey: settings.falApiKey,
      geminiApiKey: settings.geminiApiKey,
      r2AccountId: settings.r2AccountId,
      r2AccessKeyId: settings.r2AccessKeyId,
      r2SecretAccessKey: settings.r2SecretAccessKey,
      r2BucketName: settings.r2BucketName,
      r2PublicUrl: settings.r2PublicUrl,
      brandName: settings.brandName,
      brandVoice: settings.brandVoice,
      customInstructions: settings.customInstructions,
      storePlatform: settings.storePlatform,
      medusaUrl: settings.medusaUrl,
      medusaApiKey: settings.medusaApiKey,
      activeLanguages: settings.activeLanguages,
      aiImageProvider: settings.aiImageProvider,
      aiImageModel: settings.aiImageModel,
      defaultSalesChannelId: settings.defaultSalesChannelId,
      defaultShippingProfileId: settings.defaultShippingProfileId,
      defaultCollectionId: settings.defaultCollectionId,
      defaultCategoryIds: settings.defaultCategoryIds,
    });
  }, [settings]);

  // Dirty State Detection
  const isDirty = useMemo(() => {
    return (
      localState.openaiApiKey !== settings.openaiApiKey ||
      localState.openrouterApiKey !== settings.openrouterApiKey ||
      localState.falApiKey !== settings.falApiKey ||
      localState.geminiApiKey !== settings.geminiApiKey ||
      localState.r2AccountId !== settings.r2AccountId ||
      localState.r2AccessKeyId !== settings.r2AccessKeyId ||
      localState.r2SecretAccessKey !== settings.r2SecretAccessKey ||
      localState.r2BucketName !== settings.r2BucketName ||
      localState.r2PublicUrl !== settings.r2PublicUrl ||
      localState.brandName !== settings.brandName ||
      localState.brandVoice !== settings.brandVoice ||
      localState.customInstructions !== settings.customInstructions ||
      localState.storePlatform !== settings.storePlatform ||
      localState.medusaUrl !== settings.medusaUrl ||
      localState.medusaApiKey !== settings.medusaApiKey ||
      JSON.stringify(localState.activeLanguages) !== JSON.stringify(settings.activeLanguages) ||
      localState.aiImageProvider !== settings.aiImageProvider ||
      localState.aiImageModel !== settings.aiImageModel ||
      localState.defaultSalesChannelId !== settings.defaultSalesChannelId ||
      localState.defaultShippingProfileId !== settings.defaultShippingProfileId ||
      localState.defaultCollectionId !== settings.defaultCollectionId ||
      JSON.stringify(localState.defaultCategoryIds) !== JSON.stringify(settings.defaultCategoryIds)
    );
  }, [localState, settings]);

  const availableImageProviders = useMemo(() => {
    const hasOpenai = settings.hasOpenaiApiKey || localState.openaiApiKey.trim().length > 0;
    const hasFal = settings.hasFalApiKey || localState.falApiKey.trim().length > 0;
    const hasGemini = settings.hasGeminiApiKey || localState.geminiApiKey.trim().length > 0;

    const providers: string[] = [];
    if (hasOpenai) providers.push('openai');
    if (hasFal) providers.push('fal');
    if (hasGemini) providers.push('gemini');
    return providers;
  }, [settings, localState.openaiApiKey, localState.falApiKey, localState.geminiApiKey]);

  // Provider/Model Auto-Sync
  useEffect(() => {
    if (availableImageProviders.length === 0) return;
    const current = coerceAiImageProviderId(localState.aiImageProvider);
    if (availableImageProviders.includes(current)) return;

    const nextProvider = availableImageProviders[0];
    setLocalState((prev) => ({
      ...prev,
      aiImageProvider: nextProvider,
      aiImageModel: topImageModelsForProvider(nextProvider as any)[0] || '',
    }));
  }, [availableImageProviders, localState.aiImageProvider]);

  // Validate model is valid for current provider
  useEffect(() => {
    const currentProvider = coerceAiImageProviderId(localState.aiImageProvider);
    const availableModels = topImageModelsForProvider(currentProvider);

    if (availableModels.length > 0 && !availableModels.includes(localState.aiImageModel)) {
    setLocalState((prev) => ({
      ...prev,
        aiImageModel: availableModels[0],
    }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localState.aiImageProvider]);

  const syncTaxonomy = useCallback(async () => {
    if (!orgId) return;
    setIsLoadingTaxonomy(true);
    setTaxonomyError(null);
    try {
      const res = await getMedusaTaxonomy(orgId);
      if (!res.success || !res.data) {
        setTaxonomyError(res.error || 'Failed to sync taxonomy');
        setTaxonomy(null);
        return;
      }
      setTaxonomy(res.data);
    } catch (e) {
      console.error('Failed to sync taxonomy:', e);
      setTaxonomyError('Network error syncing taxonomy');
      setTaxonomy(null);
    } finally {
      setIsLoadingTaxonomy(false);
    }
  }, [orgId]);

  const handleSave = async () => {
    if (!orgId) return;
    setIsSaving(true);
    try {
      // Validate and ensure AI image model is valid for the selected provider
      const currentProvider = coerceAiImageProviderId(localState.aiImageProvider);
      const availableModels = topImageModelsForProvider(currentProvider);
      let validModel = localState.aiImageModel;
      
      // If model is empty or invalid, use the first available model
      if (!validModel || !availableModels.includes(validModel)) {
        validModel = availableModels[0] || '';
      }

      // Debug logging
      console.log('[Settings Page] handleSave - AI Image values:', {
        localState: {
          aiImageProvider: localState.aiImageProvider,
          aiImageModel: localState.aiImageModel,
        },
        computed: {
          currentProvider,
          validModel,
          availableModels,
        },
      });

    settings.setOpenaiApiKey(localState.openaiApiKey);
    settings.setOpenrouterApiKey(localState.openrouterApiKey);
    settings.setFalApiKey(localState.falApiKey);
    settings.setGeminiApiKey(localState.geminiApiKey);
    settings.setAiImageDefaults({
        aiImageProvider: currentProvider,
        aiImageModel: validModel,
    });

      // Note: Store update is async in React, so we verify in saveToDb instead
    settings.setR2Settings({
      r2AccountId: localState.r2AccountId,
      r2AccessKeyId: localState.r2AccessKeyId,
      r2SecretAccessKey: localState.r2SecretAccessKey,
      r2BucketName: localState.r2BucketName,
      r2PublicUrl: localState.r2PublicUrl,
    });
    settings.setBrandSettings({
      brandName: localState.brandName,
      brandVoice: localState.brandVoice,
      customInstructions: localState.customInstructions,
    });
    settings.setStoreSettings({
      storePlatform: localState.storePlatform,
      medusaUrl: localState.medusaUrl,
      medusaApiKey: localState.medusaApiKey,
      activeLanguages: localState.activeLanguages,
      defaultSalesChannelId: localState.defaultSalesChannelId,
      defaultShippingProfileId: localState.defaultShippingProfileId,
      defaultCollectionId: localState.defaultCollectionId,
      defaultCategoryIds: localState.defaultCategoryIds,
    });

    await settings.saveToDb(orgId);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setLocalState({
      openaiApiKey: settings.openaiApiKey,
      openrouterApiKey: settings.openrouterApiKey,
      falApiKey: settings.falApiKey,
      geminiApiKey: settings.geminiApiKey,
      r2AccountId: settings.r2AccountId,
      r2AccessKeyId: settings.r2AccessKeyId,
      r2SecretAccessKey: settings.r2SecretAccessKey,
      r2BucketName: settings.r2BucketName,
      r2PublicUrl: settings.r2PublicUrl,
      brandName: settings.brandName,
      brandVoice: settings.brandVoice,
      customInstructions: settings.customInstructions,
      storePlatform: settings.storePlatform,
      medusaUrl: settings.medusaUrl,
      medusaApiKey: settings.medusaApiKey,
      activeLanguages: settings.activeLanguages,
      aiImageProvider: settings.aiImageProvider,
      aiImageModel: settings.aiImageModel,
      defaultSalesChannelId: settings.defaultSalesChannelId,
      defaultShippingProfileId: settings.defaultShippingProfileId,
      defaultCollectionId: settings.defaultCollectionId,
      defaultCategoryIds: settings.defaultCategoryIds,
    });
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 pb-32 px-4 md:px-6 lg:px-8">
      <header className="space-y-4">
        <h1 className="text-4xl font-black text-white flex items-center gap-4 tracking-tight">
          <div className="bg-indigo-500/10 p-2.5 rounded-2xl border border-indigo-500/20">
          <Shield className="text-indigo-400 w-8 h-8" />
          </div>
          Command Center
          <span className="text-zinc-600 font-medium text-lg ml-2">/ Settings</span>
        </h1>
        <p className="text-zinc-400 max-w-2xl leading-relaxed">
          Configure your service credentials and brand identity. All data is encrypted at rest and stored securely in your organization's private workspace.
        </p>
      </header>

      <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-start">
        {/* Navigation Sidebar */}
        <SettingsSidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Content Area - Fixed width for consistency */}
        <main className="flex-1 w-full md:max-w-none bg-zinc-900/20 border border-white/5 rounded-[2rem] p-6 md:p-8 lg:p-12 backdrop-blur-sm">
          {activeTab === 'general' && (
            <GeneralSection localState={localState} setLocalState={setLocalState} />
          )}
          {activeTab === 'store' && (
            <StoreSection 
              localState={localState} 
              setLocalState={setLocalState} 
              settings={settings}
              taxonomy={taxonomy}
              isLoadingTaxonomy={isLoadingTaxonomy}
              taxonomyError={taxonomyError}
              syncTaxonomy={syncTaxonomy}
              orgId={orgId}
            />
          )}
          {activeTab === 'ai-engine' && (
            <AIEngineSection 
              localState={localState} 
              setLocalState={setLocalState} 
              settings={settings}
            />
          )}
          {activeTab === 'ai-studio' && (
            <AIStudioSection 
              localState={localState} 
              setLocalState={setLocalState} 
              availableImageProviders={availableImageProviders}
            />
          )}
          {activeTab === 'storage' && (
            <StorageSection 
              localState={localState} 
              setLocalState={setLocalState} 
              settings={settings}
              orgId={orgId}
            />
          )}
          {activeTab === 'localization' && (
            <LocalizationSection localState={localState} setLocalState={setLocalState} />
          )}
        </main>
          </div>

      <StickySaveBar 
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onReset={handleReset}
        saved={saved}
      />
    </div>
  );
}
