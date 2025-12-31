-- Add organization-level AI Studio prompt configuration.
-- Non-secret JSON overrides that power the Studio Photo generator UI + backend.
-- Safe, additive migration.

alter table public.organization_settings
  add column if not exists ai_studio_prompt_library jsonb,
  add column if not exists ai_studio_toggle_phrases jsonb;

create index if not exists organization_settings_ai_studio_prompt_idx
  on public.organization_settings (organization_id);


