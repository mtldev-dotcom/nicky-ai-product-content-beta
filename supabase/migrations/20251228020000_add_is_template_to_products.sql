-- Adds template support to saved products.
-- Safe, additive migration (non-destructive).

alter table public.products
  add column if not exists is_template boolean not null default false;

create index if not exists products_org_is_template_idx
  on public.products (organization_id, is_template);


