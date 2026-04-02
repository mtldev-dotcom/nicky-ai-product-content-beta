-- Adds product_images table for tracking R2 bucket keys.
-- Enables proper cleanup when products or images are deleted.
-- Safe, additive migration (non-destructive).

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  file_key text not null,
  public_url text not null,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  size_bytes bigint,
  content_type text,
  unique(organization_id, file_key)
);

create index if not exists product_images_product_idx
  on public.product_images (product_id);

create index if not exists product_images_org_idx
  on public.product_images (organization_id);

comment on table public.product_images is 'Tracks R2 bucket images for products with file keys for cleanup';
comment on column public.product_images.file_key is 'R2 object key (e.g., userId/uploads/timestamp-filename.jpg)';
comment on column public.product_images.public_url is 'Public URL for the image';
comment on column public.product_images.size_bytes is 'File size in bytes';
comment on column public.product_images.content_type is 'MIME type (e.g., image/jpeg)';
