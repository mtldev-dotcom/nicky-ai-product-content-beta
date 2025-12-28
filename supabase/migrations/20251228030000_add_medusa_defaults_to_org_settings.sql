-- Add organization-level default Medusa taxonomy selections.
-- These defaults are used to pre-fill new product drafts automatically.

alter table public.organization_settings
  add column if not exists default_sales_channel_id text,
  add column if not exists default_shipping_profile_id text,
  add column if not exists default_collection_id text,
  add column if not exists default_category_ids text[] not null default '{}';

create index if not exists organization_settings_defaults_idx
  on public.organization_settings (organization_id, default_sales_channel_id, default_shipping_profile_id, default_collection_id);


