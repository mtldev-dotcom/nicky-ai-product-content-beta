-- Add organization-level variant option presets.
-- Non-secret JSON storage for reusable option presets (e.g., Color, Size).
-- Safe, additive migration.

alter table public.organization_settings
  add column if not exists variant_option_presets jsonb;

create index if not exists organization_settings_variant_presets_idx
  on public.organization_settings (organization_id);
