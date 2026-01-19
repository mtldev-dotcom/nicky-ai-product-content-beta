'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { useSettingsStore } from '@/store/useSettingsStore';
import { PROMPT_LIBRARY_JSON } from '@/lib/ai/promptLibrary';
import { cn } from '@/lib/utils';
import { ArrowLeft, Plus, Save, Trash2, AlertCircle, RotateCcw } from 'lucide-react';
import { z } from 'zod';
import { useIsMobile } from '@/lib/mobile-utils';

/**
 * Structured editor for the AI Studio prompt library.
 *
 * - Full CRUD: jewelryTypes, setups, models, optionalModifiers, brand, finalPromptTemplate
 * - Saved org-scoped into `organization_settings.ai_studio_prompt_library`
 * - Toggle modifier phrases saved into `organization_settings.ai_studio_toggle_phrases`
 *
 * Safety:
 * - Server still enforces preserve-identity + no-watermark rules regardless of edits.
 */

const TogglePhrasesSchema = z.object({
  macro: z.string().min(1),
  noFingerprints: z.string().min(1),
  extraRimLight: z.string().min(1),
});

const PromptLibrarySchema = z
  .object({
    brand: z.object({
      name: z.string().min(1),
      visualStyle: z.string().min(1),
      globalBase: z.string().min(1),
    }),
    jewelryTypes: z.array(z.string().min(1)).min(1),
    setups: z
      .array(
        z.object({
          id: z.string().min(1),
          jewelryType: z.string().min(1),
          title: z.string().min(1),
          prompt: z.string().min(1),
        })
      )
      .min(1),
    models: z
      .array(
        z.object({
          id: z.string().min(1),
          title: z.string().min(1),
          prompt: z.string().min(1),
        })
      )
      .min(1),
    optionalModifiers: z.array(z.string().min(1)).min(1),
    finalPromptTemplate: z.object({
      description: z.string().min(1),
      template: z.string().min(1),
    }),
  })
  .superRefine((val, ctx) => {
    // Unique jewelryTypes
    if (val.jewelryTypes.length !== new Set(val.jewelryTypes).size) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'jewelryTypes must be unique' });
    }

    const setupIds = val.setups.map((s) => s.id);
    if (setupIds.length !== new Set(setupIds).size) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'setup ids must be unique' });
    }

    const modelIds = val.models.map((m) => m.id);
    if (modelIds.length !== new Set(modelIds).size) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'model ids must be unique' });
    }

    // Setup jewelryType must exist in jewelryTypes
    const typeSet = new Set(val.jewelryTypes);
    for (const s of val.setups) {
      if (!typeSet.has(s.jewelryType)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `setup '${s.id}' has jewelryType '${s.jewelryType}' not in jewelryTypes`,
        });
      }
    }

    // Recommend (not require) placeholders exist
    const tpl = val.finalPromptTemplate.template;
    const placeholders = ['{GLOBAL_BASE}', '{SETUP_PROMPT}', '{MODEL_PROMPT}', '{TOGGLES_AND_MODIFIERS}'];
    for (const p of placeholders) {
      if (!tpl.includes(p)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `finalPromptTemplate.template is missing placeholder ${p}`,
        });
      }
    }
  });

type PromptLibraryEditable = z.infer<typeof PromptLibrarySchema>;
type TogglePhrases = z.infer<typeof TogglePhrasesSchema>;

const DEFAULT_TOGGLE_PHRASES: TogglePhrases = {
  macro: 'macro close-up, extreme detail on metal grain',
  noFingerprints: 'no reflections, no fingerprints. no dust, no smudges.',
  extraRimLight: 'extra rim light for clean edge separation, still realistic',
};

function coercePromptLibrary(v: unknown): PromptLibraryEditable {
  // If stored value is invalid, fall back to the embedded default.
  const maybe = PromptLibrarySchema.safeParse(v);
  if (maybe.success) return maybe.data;

  // PROMPT_LIBRARY_JSON matches this schema shape.
  return PromptLibrarySchema.parse(PROMPT_LIBRARY_JSON);
}

function coerceTogglePhrases(v: unknown): TogglePhrases {
  const maybe = TogglePhrasesSchema.safeParse(v);
  if (maybe.success) return maybe.data;
  return DEFAULT_TOGGLE_PHRASES;
}

export default function AiStudioSettingsPage() {
  const settings = useSettingsStore();
  const loadSettingsFromDb = useSettingsStore((s) => s.loadFromDb);
  const supabase = createClient();
  const isMobile = useIsMobile();

  const [orgId, setOrgId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [library, setLibrary] = useState<PromptLibraryEditable>(() => PromptLibrarySchema.parse(PROMPT_LIBRARY_JSON));
  const [togglePhrases, setTogglePhrases] = useState<TogglePhrases>(DEFAULT_TOGGLE_PHRASES);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!membership?.organization_id) return;
      setOrgId(membership.organization_id);
      await loadSettingsFromDb(membership.organization_id);
    };

    init();
  }, [loadSettingsFromDb, supabase]);

  useEffect(() => {
    setLibrary(coercePromptLibrary(settings.aiStudioPromptLibrary));
    setTogglePhrases(coerceTogglePhrases(settings.aiStudioTogglePhrases));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.aiStudioPromptLibrary, settings.aiStudioTogglePhrases]);

  const jewelryTypes = library.jewelryTypes;

  const handleSave = async () => {
    if (!orgId) return;
    setError(null);

    const parsed = PromptLibrarySchema.safeParse(library);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).slice(0, 6).join('\n'));
      return;
    }

    const parsedPhrases = TogglePhrasesSchema.safeParse(togglePhrases);
    if (!parsedPhrases.success) {
      setError(parsedPhrases.error.issues.map((i) => i.message).slice(0, 6).join('\n'));
      return;
    }

    settings.setAiStudioPromptLibrary(parsed.data);
    settings.setAiStudioTogglePhrases(parsedPhrases.data);
    await settings.saveToDb(orgId);

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const clearOverrides = async () => {
    if (!orgId) return;
    const ok = window.confirm('Clear AI Studio prompt overrides and revert to built-in defaults?');
    if (!ok) return;

    settings.setAiStudioPromptLibrary(null);
    settings.setAiStudioTogglePhrases(null);
    await settings.saveToDb(orgId);
  };

  const header = useMemo(
    () => (
      <div className={cn("flex items-start justify-between gap-4", isMobile && "flex-col")}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className={cn("inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors touch-target", isMobile ? "text-sm" : "text-xs")}
            >
              <ArrowLeft className={cn(isMobile ? "w-5 h-5" : "w-4 h-4")} />
              Back to Settings
            </Link>
          </div>
          <h1 className={cn("font-bold text-white", isMobile ? "text-xl" : "text-2xl md:text-3xl")}>AI Studio Photo — Prompt Library</h1>
          <p className={cn("text-zinc-400", isMobile ? "text-xs" : "text-sm")}>
            Edit the prompt library and toggle modifier phrases used by Product → Media → AI Studio Photo.
          </p>
        </div>
        <div className={cn("flex items-center gap-2", isMobile && "w-full flex-col")}>
          <button
            onClick={clearOverrides}
            className={cn(
              "rounded-xl bg-white/5 text-zinc-200 hover:bg-white/10 border border-white/10 font-semibold flex items-center justify-center gap-2 touch-target-large",
              isMobile ? "w-full px-4 py-3 text-base" : "px-4 py-2 text-sm"
            )}
          >
            <RotateCcw className={cn(isMobile ? "w-5 h-5" : "w-4 h-4")} />
            Reset to defaults
          </button>
          <button
            onClick={handleSave}
            disabled={saved}
            className={cn(
              "rounded-xl font-semibold flex items-center justify-center gap-2 border transition-all touch-target-large",
              isMobile ? "w-full px-5 py-3 text-base" : "px-5 py-2 text-sm",
              saved
                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                : "bg-indigo-500 text-white border-indigo-500/30 hover:bg-indigo-600"
            )}
          >
            <Save className={cn(isMobile ? "w-5 h-5" : "w-4 h-4")} />
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    ),
    [clearOverrides, handleSave, saved, isMobile]
  );

  return (
    <div className={cn("max-w-6xl space-y-6 md:space-y-8", isMobile && "pb-24")}>
      {header}

      {error && (
        <div className={cn("rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 whitespace-pre-line flex items-start gap-3", isMobile ? "p-3 text-xs" : "p-4 text-sm")}>
          <AlertCircle className={cn("mt-0.5 shrink-0", isMobile ? "w-4 h-4" : "w-5 h-5")} />
          <div>
            <div className="font-semibold">Fix validation issues</div>
            <div className="opacity-90">{error}</div>
          </div>
        </div>
      )}

      {/* Toggle phrases */}
      <section className={cn("glass rounded-2xl border border-white/10 space-y-4", isMobile ? "p-4" : "p-6")}>
        <h2 className={cn("font-semibold text-white", isMobile ? "text-base" : "text-lg")}>Toggle modifier phrases</h2>
        <p className={cn("text-zinc-500", isMobile ? "text-xs" : "text-xs")}>
          These strings are injected into the final prompt when the user enables the toggle in the Studio modal.
          Guardrails (preserve identity + no watermark) are still enforced server-side.
        </p>
        <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3")}>
          <label className="space-y-1">
            <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Macro</span>
            <textarea
              className={cn(
                "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30",
                isMobile ? "min-h-[100px] px-4 py-3 text-base" : "min-h-[90px] px-3 py-2 text-sm"
              )}
              value={togglePhrases.macro}
              onChange={(e) => setTogglePhrases({ ...togglePhrases, macro: e.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>No fingerprints / dust</span>
            <textarea
              className={cn(
                "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30",
                isMobile ? "min-h-[100px] px-4 py-3 text-base" : "min-h-[90px] px-3 py-2 text-sm"
              )}
              value={togglePhrases.noFingerprints}
              onChange={(e) => setTogglePhrases({ ...togglePhrases, noFingerprints: e.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Extra rim light</span>
            <textarea
              className={cn(
                "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30",
                isMobile ? "min-h-[100px] px-4 py-3 text-base" : "min-h-[90px] px-3 py-2 text-sm"
              )}
              value={togglePhrases.extraRimLight}
              onChange={(e) => setTogglePhrases({ ...togglePhrases, extraRimLight: e.target.value })}
            />
          </label>
        </div>
      </section>

      {/* Brand */}
      <section className={cn("glass rounded-2xl border border-white/10 space-y-4", isMobile ? "p-4" : "p-6")}>
        <h2 className={cn("font-semibold text-white", isMobile ? "text-base" : "text-lg")}>Brand</h2>
        <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}>
          <label className="space-y-1">
            <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Name</span>
            <input
              className={cn(
                "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30 touch-target",
                isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"
              )}
              value={library.brand.name}
              onChange={(e) => setLibrary({ ...library, brand: { ...library.brand, name: e.target.value } })}
            />
          </label>
          <label className="space-y-1">
            <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Visual style</span>
            <input
              className={cn(
                "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30 touch-target",
                isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"
              )}
              value={library.brand.visualStyle}
              onChange={(e) => setLibrary({ ...library, brand: { ...library.brand, visualStyle: e.target.value } })}
            />
          </label>
          <label className={cn("space-y-1", isMobile ? "" : "md:col-span-2")}>
            <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Global base prompt</span>
            <textarea
              className={cn(
                "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30",
                isMobile ? "min-h-[120px] px-4 py-3 text-base" : "min-h-[120px] px-3 py-2 text-sm"
              )}
              value={library.brand.globalBase}
              onChange={(e) => setLibrary({ ...library, brand: { ...library.brand, globalBase: e.target.value } })}
            />
          </label>
        </div>
      </section>

      {/* Jewelry types */}
      <section className={cn("glass rounded-2xl border border-white/10 space-y-4", isMobile ? "p-4" : "p-6")}>
        <div className={cn("flex items-center justify-between gap-3", isMobile && "flex-col items-stretch")}>
          <h2 className={cn("font-semibold text-white", isMobile ? "text-base" : "text-lg")}>Jewelry types</h2>
          <button
            onClick={() => setLibrary({ ...library, jewelryTypes: [...library.jewelryTypes, `type_${library.jewelryTypes.length + 1}`] })}
            className={cn(
              "rounded-xl bg-white/5 text-white hover:bg-white/10 border border-white/10 font-semibold flex items-center justify-center gap-2 touch-target-large",
              isMobile ? "w-full px-4 py-3 text-base" : "px-3 py-2 text-xs"
            )}
          >
            <Plus className={cn(isMobile ? "w-5 h-5" : "w-4 h-4")} />
            Add type
          </button>
        </div>
        <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}>
          {library.jewelryTypes.map((t, idx) => (
            <div key={`${t}-${idx}`} className="flex items-center gap-2">
              <input
                className={cn(
                  "flex-1 bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30 font-mono touch-target",
                  isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"
                )}
                value={t}
                onChange={(e) => {
                  const next = [...library.jewelryTypes];
                  next[idx] = e.target.value;
                  setLibrary({ ...library, jewelryTypes: next });
                }}
              />
              <button
                onClick={() => setLibrary({ ...library, jewelryTypes: library.jewelryTypes.filter((_, i) => i !== idx) })}
                className={cn("rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/20 touch-target", isMobile ? "p-3" : "p-2")}
                aria-label="Remove jewelry type"
              >
                <Trash2 className={cn(isMobile ? "w-5 h-5" : "w-4 h-4")} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Setups */}
      <section className={cn("glass rounded-2xl border border-white/10 space-y-4", isMobile ? "p-4" : "p-6")}>
        <div className={cn("flex items-center justify-between gap-3", isMobile && "flex-col items-stretch")}>
          <h2 className={cn("font-semibold text-white", isMobile ? "text-base" : "text-lg")}>Setups</h2>
          <button
            onClick={() =>
              setLibrary({
                ...library,
                setups: [
                  ...library.setups,
                  {
                    id: `setup_${library.setups.length + 1}`,
                    jewelryType: jewelryTypes[0] || 'ring',
                    title: 'New setup',
                    prompt: 'Describe the studio setup...',
                  },
                ],
              })
            }
            className={cn(
              "rounded-xl bg-white/5 text-white hover:bg-white/10 border border-white/10 font-semibold flex items-center justify-center gap-2 touch-target-large",
              isMobile ? "w-full px-4 py-3 text-base" : "px-3 py-2 text-xs"
            )}
          >
            <Plus className={cn(isMobile ? "w-5 h-5" : "w-4 h-4")} />
            Add setup
          </button>
        </div>

        <div className="space-y-4">
          {library.setups.map((s, idx) => (
            <div key={`${s.id}-${idx}`} className={cn("rounded-2xl border border-white/10 bg-zinc-900/30 space-y-3", isMobile ? "p-3" : "p-4")}>
              <div className="flex items-center justify-between gap-3">
                <div className={cn("text-zinc-400 font-semibold", isMobile ? "text-sm" : "text-xs")}>Setup #{idx + 1}</div>
                <button
                  onClick={() => setLibrary({ ...library, setups: library.setups.filter((_, i) => i !== idx) })}
                  className={cn("rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/20 touch-target", isMobile ? "p-3" : "p-2")}
                  aria-label="Remove setup"
                >
                  <Trash2 className={cn(isMobile ? "w-5 h-5" : "w-4 h-4")} />
                </button>
              </div>

              <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3")}>
                <label className="space-y-1">
                  <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>ID</span>
                  <input
                    className={cn(
                      "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30 font-mono touch-target",
                      isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"
                    )}
                    value={s.id}
                    onChange={(e) => {
                      const next = [...library.setups];
                      next[idx] = { ...next[idx], id: e.target.value };
                      setLibrary({ ...library, setups: next });
                    }}
                  />
                </label>
                <label className="space-y-1">
                  <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Jewelry type</span>
                  <select
                    className={cn(
                      "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30 touch-target",
                      isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"
                    )}
                    value={s.jewelryType}
                    onChange={(e) => {
                      const next = [...library.setups];
                      next[idx] = { ...next[idx], jewelryType: e.target.value };
                      setLibrary({ ...library, setups: next });
                    }}
                  >
                    {jewelryTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Title</span>
                  <input
                    className={cn(
                      "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30 touch-target",
                      isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"
                    )}
                    value={s.title}
                    onChange={(e) => {
                      const next = [...library.setups];
                      next[idx] = { ...next[idx], title: e.target.value };
                      setLibrary({ ...library, setups: next });
                    }}
                  />
                </label>
              </div>

              <label className="space-y-1">
                <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Prompt</span>
                <textarea
                  className={cn(
                    "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30",
                    isMobile ? "min-h-[120px] px-4 py-3 text-base" : "min-h-[120px] px-3 py-2 text-sm"
                  )}
                  value={s.prompt}
                  onChange={(e) => {
                    const next = [...library.setups];
                    next[idx] = { ...next[idx], prompt: e.target.value };
                    setLibrary({ ...library, setups: next });
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      {/* Models */}
      <section className={cn("glass rounded-2xl border border-white/10 space-y-4", isMobile ? "p-4" : "p-6")}>
        <div className={cn("flex items-center justify-between gap-3", isMobile && "flex-col items-stretch")}>
          <h2 className={cn("font-semibold text-white", isMobile ? "text-base" : "text-lg")}>Models</h2>
          <button
            onClick={() =>
              setLibrary({
                ...library,
                models: [
                  ...library.models,
                  {
                    id: `model_${String(library.models.length + 1).padStart(2, '0')}`,
                    title: 'New model',
                    prompt: 'Describe the model...',
                  },
                ],
              })
            }
            className={cn(
              "rounded-xl bg-white/5 text-white hover:bg-white/10 border border-white/10 font-semibold flex items-center justify-center gap-2 touch-target-large",
              isMobile ? "w-full px-4 py-3 text-base" : "px-3 py-2 text-xs"
            )}
          >
            <Plus className={cn(isMobile ? "w-5 h-5" : "w-4 h-4")} />
            Add model
          </button>
        </div>

        <div className="space-y-4">
          {library.models.map((m, idx) => (
            <div key={`${m.id}-${idx}`} className={cn("rounded-2xl border border-white/10 bg-zinc-900/30 space-y-3", isMobile ? "p-3" : "p-4")}>
              <div className="flex items-center justify-between gap-3">
                <div className={cn("text-zinc-400 font-semibold", isMobile ? "text-sm" : "text-xs")}>Model #{idx + 1}</div>
                <button
                  onClick={() => setLibrary({ ...library, models: library.models.filter((_, i) => i !== idx) })}
                  className={cn("rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/20 touch-target", isMobile ? "p-3" : "p-2")}
                  aria-label="Remove model"
                >
                  <Trash2 className={cn(isMobile ? "w-5 h-5" : "w-4 h-4")} />
                </button>
              </div>

              <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}>
                <label className="space-y-1">
                  <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>ID</span>
                  <input
                    className={cn(
                      "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30 font-mono touch-target",
                      isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"
                    )}
                    value={m.id}
                    onChange={(e) => {
                      const next = [...library.models];
                      next[idx] = { ...next[idx], id: e.target.value };
                      setLibrary({ ...library, models: next });
                    }}
                  />
                </label>
                <label className="space-y-1">
                  <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Title</span>
                  <input
                    className={cn(
                      "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30 touch-target",
                      isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"
                    )}
                    value={m.title}
                    onChange={(e) => {
                      const next = [...library.models];
                      next[idx] = { ...next[idx], title: e.target.value };
                      setLibrary({ ...library, models: next });
                    }}
                  />
                </label>
              </div>

              <label className="space-y-1">
                <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Prompt</span>
                <textarea
                  className={cn(
                    "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30",
                    isMobile ? "min-h-[120px] px-4 py-3 text-base" : "min-h-[120px] px-3 py-2 text-sm"
                  )}
                  value={m.prompt}
                  onChange={(e) => {
                    const next = [...library.models];
                    next[idx] = { ...next[idx], prompt: e.target.value };
                    setLibrary({ ...library, models: next });
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      {/* Optional modifiers */}
      <section className={cn("glass rounded-2xl border border-white/10 space-y-4", isMobile ? "p-4" : "p-6")}>
        <div className={cn("flex items-center justify-between gap-3", isMobile && "flex-col items-stretch")}>
          <h2 className={cn("font-semibold text-white", isMobile ? "text-base" : "text-lg")}>Optional modifiers</h2>
          <button
            onClick={() => setLibrary({ ...library, optionalModifiers: [...library.optionalModifiers, 'new modifier'] })}
            className={cn(
              "rounded-xl bg-white/5 text-white hover:bg-white/10 border border-white/10 font-semibold flex items-center justify-center gap-2 touch-target-large",
              isMobile ? "w-full px-4 py-3 text-base" : "px-3 py-2 text-xs"
            )}
          >
            <Plus className={cn(isMobile ? "w-5 h-5" : "w-4 h-4")} />
            Add modifier
          </button>
        </div>
        <div className="space-y-2">
          {library.optionalModifiers.map((m, idx) => (
            <div key={`${idx}-${m.slice(0, 12)}`} className="flex items-center gap-2">
              <input
                className={cn(
                  "flex-1 bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30 touch-target",
                  isMobile ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"
                )}
                value={m}
                onChange={(e) => {
                  const next = [...library.optionalModifiers];
                  next[idx] = e.target.value;
                  setLibrary({ ...library, optionalModifiers: next });
                }}
              />
              <button
                onClick={() => setLibrary({ ...library, optionalModifiers: library.optionalModifiers.filter((_, i) => i !== idx) })}
                className={cn("rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/20 touch-target", isMobile ? "p-3" : "p-2")}
                aria-label="Remove modifier"
              >
                <Trash2 className={cn(isMobile ? "w-5 h-5" : "w-4 h-4")} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Final prompt template */}
      <section className={cn("glass rounded-2xl border border-white/10 space-y-4", isMobile ? "p-4" : "p-6")}>
        <h2 className={cn("font-semibold text-white", isMobile ? "text-base" : "text-lg")}>Final prompt template</h2>
        <label className="space-y-1">
          <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Description</span>
          <textarea
            className={cn(
              "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30",
              isMobile ? "min-h-[100px] px-4 py-3 text-base" : "min-h-[80px] px-3 py-2 text-sm"
            )}
            value={library.finalPromptTemplate.description}
            onChange={(e) =>
              setLibrary({ ...library, finalPromptTemplate: { ...library.finalPromptTemplate, description: e.target.value } })
            }
          />
        </label>
        <label className="space-y-1">
          <span className={cn("font-bold text-zinc-500 uppercase tracking-widest", isMobile ? "text-xs" : "text-[10px]")}>Template</span>
          <textarea
            className={cn(
              "w-full bg-zinc-900/50 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500/30 font-mono",
              isMobile ? "min-h-[160px] px-4 py-3 text-base" : "min-h-[140px] px-3 py-2 text-sm"
            )}
            value={library.finalPromptTemplate.template}
            onChange={(e) =>
              setLibrary({ ...library, finalPromptTemplate: { ...library.finalPromptTemplate, template: e.target.value } })
            }
          />
          <p className={cn("text-zinc-500", isMobile ? "text-xs" : "text-[10px]")}>
            Keep placeholders: <span className="font-mono">{'{GLOBAL_BASE} {SETUP_PROMPT} {MODEL_PROMPT} {TOGGLES_AND_MODIFIERS}'}</span>
          </p>
        </label>
      </section>

      {/* Mobile: Sticky Save Button */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 z-40 glass-dark border-t border-white/10 p-4 pb-safe">
          <div className="max-w-6xl mx-auto flex gap-3">
            <button
              onClick={clearOverrides}
              className="flex-1 touch-target-large rounded-xl bg-white/5 text-zinc-200 hover:bg-white/10 border border-white/10 font-semibold flex items-center justify-center gap-2 text-base"
            >
              <RotateCcw className="w-5 h-5" />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saved}
              className={cn(
                "flex-1 touch-target-large rounded-xl font-semibold flex items-center justify-center gap-2 border transition-all text-base",
                saved
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                  : "bg-indigo-500 text-white border-indigo-500/30 hover:bg-indigo-600"
              )}
            >
              <Save className="w-5 h-5" />
              {saved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


