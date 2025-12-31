-- Add organization-level AI image generation provider configuration.
-- Secrets are stored encrypted-at-rest by the app (see `src/app/settings/actions.ts`).
-- This migration is additive and safe.

alter table public.organization_settings
  add column if not exists fal_api_key text,
  add column if not exists gemini_api_key text,
  add column if not exists ai_image_provider text not null default 'openai',
  add column if not exists ai_image_model text not null default '';

create index if not exists organization_settings_ai_image_idx
  on public.organization_settings (organization_id, ai_image_provider);


