'use server';

import { createClient } from '@/utils/supabase/server';

/**
 * Server-side product persistence.
 *
 * Rationale:
 * - Do not trust org_id coming from the browser.
 * - Enforce org membership server-side before writing.
 * - Reduce reliance on client-side anon writes (RLS-only protection).
 */

export type ProductSavePayload = {
  id?: string;

  // Root fields
  title: string;
  handle: string;
  status: 'draft' | 'published';
  sku: string;
  price: number;

  // JSON payload blob (everything else)
  data: unknown;
};

export async function saveProductToCloud(payload: ProductSavePayload): Promise<{ id: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!membership?.organization_id) {
    throw new Error('No organization found');
  }

  const record = {
    organization_id: membership.organization_id,
    title: payload.title,
    handle: payload.handle,
    status: payload.status,
    sku: payload.sku,
    price: payload.price,
    data: payload.data,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from('products')
      .update(record)
      .eq('id', payload.id)
      .eq('organization_id', membership.organization_id)
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    if (!data?.id) throw new Error('Failed to save product');
    return { id: data.id };
  }

  const { data, error } = await supabase.from('products').insert(record).select('id').single();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('Failed to save product');
  return { id: data.id };
}

/**
 * Delete a product row securely (org-scoped).
 *
 * Preconditions:
 * - User is authenticated.
 * - User is a member of an organization.
 *
 * Postconditions:
 * - Deletes ONLY if `(id + organization_id)` match.
 * - Throws if the caller is not authorized, or if deletion fails.
 */
export async function deleteProductFromCloud(
  productId: string,
  supabaseOverride?: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  if (!productId) throw new Error('Missing product id');

  const supabase = supabaseOverride ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!membership?.organization_id) {
    throw new Error('No organization found');
  }

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('organization_id', membership.organization_id);

  if (error) throw new Error(error.message);
}

/**
 * Persist a Medusa linkage on a local product row (org-scoped).
 *
 * Rationale:
 * - When we publish a local draft to Medusa, we want to store the resulting Medusa `product.id`
 *   back on the local record without a schema migration (store in `products.data` blob).
 */
export async function setLocalProductMedusaId(
  productId: string,
  medusaProductId: string,
  supabaseOverride?: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  if (!productId) throw new Error('Missing product id');
  if (!medusaProductId) throw new Error('Missing Medusa product id');

  const supabase = supabaseOverride ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!membership?.organization_id) {
    throw new Error('No organization found');
  }

  // Load existing data so we can patch it safely (no JSONB functions required).
  const { data: row, error: readErr } = await supabase
    .from('products')
    .select('data')
    .eq('id', productId)
    .eq('organization_id', membership.organization_id)
    .single();

  if (readErr) throw new Error(readErr.message);

  const existing = (row?.data && typeof row.data === 'object' && row.data !== null) ? (row.data as Record<string, unknown>) : {};
  const next = { ...existing, medusa_product_id: medusaProductId };

  const { error: writeErr } = await supabase
    .from('products')
    .update({ data: next })
    .eq('id', productId)
    .eq('organization_id', membership.organization_id);

  if (writeErr) throw new Error(writeErr.message);
}


