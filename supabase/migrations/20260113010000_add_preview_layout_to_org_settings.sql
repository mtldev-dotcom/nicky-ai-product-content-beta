-- Add org-level product detail preview layout configuration.
-- Non-secret JSON that controls the `/preview` card layout editor.
-- Safe, additive migration.

alter table public.organization_settings
  add column if not exists preview_layout jsonb;

create index if not exists organization_settings_preview_layout_idx
  on public.organization_settings (organization_id);

