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


