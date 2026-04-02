'use server';

import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';

/**
 * Server-side product persistence.
 *
 * Rationale:
 * - Do not trust org_id coming from the browser.
 * - Enforce org membership server-side before writing.
 * - Reduce reliance on client-side anon writes (RLS-only protection).
 */

const ProductSaveSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  handle: z.string().min(1),
  status: z.enum(['draft', 'published']),
  sku: z.string(),
  price: z.number(),
  data: z.record(z.string(), z.unknown()),
});

export type ProductSavePayload = z.infer<typeof ProductSaveSchema>;

export async function saveProductToCloud(payload: ProductSavePayload): Promise<{ id: string }> {
  // Validate at the server action boundary — TypeScript types are compile-time only.
  const parsed = ProductSaveSchema.parse(payload);

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
    title: parsed.title,
    handle: parsed.handle,
    status: parsed.status,
    sku: parsed.sku,
    price: parsed.price,
    data: parsed.data,
  };

  // Extract medusa_product_id from data blob to check for existing products
  const medusaProductId = typeof parsed.data.medusa_product_id === 'string' ? parsed.data.medusa_product_id : null;

  if (parsed.id) {
    // Update existing product.
    // IMPORTANT: For products that were previously pushed to Medusa we may only send
    // partial UI fields from the client (title/handle/status). Overwriting the entire
    // `data` blob with that partial object will wipe options, variants, and other fields.
    // To avoid that, load the existing `data` blob and deep-merge the incoming payload.data
    // into it so unspecified fields are preserved.

    // Helper: deep merge two plain objects (returns a new object).
    const deepMerge = (target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = { ...target };
      for (const [k, v] of Object.entries(source)) {
        const existingVal = out[k];
        if (
          typeof existingVal === 'object' && existingVal !== null && !Array.isArray(existingVal) &&
          typeof v === 'object' && v !== null && !Array.isArray(v)
        ) {
          out[k] = deepMerge(existingVal as Record<string, unknown>, v as Record<string, unknown>);
        } else {
          out[k] = v;
        }
      }
      return out;
    };

    // Read existing row data
    const { data: existingRow, error: readErr } = await supabase
      .from('products')
      .select('data')
      .eq('id', parsed.id)
      .eq('organization_id', membership.organization_id)
      .single();

    if (readErr) throw new Error(readErr.message);

    const existingData = existingRow && typeof existingRow.data === 'object' && existingRow.data !== null ? (existingRow.data as Record<string, unknown>) : {};
    const mergedData = deepMerge(existingData, parsed.data);

    const recordToUpdate = { ...record, data: mergedData };

    const { data, error } = await supabase
      .from('products')
      .update(recordToUpdate)
      .eq('id', parsed.id)
      .eq('organization_id', membership.organization_id)
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    if (!data?.id) throw new Error('Failed to save product');
    return { id: data.id };
  }

  // Check if a product with the same medusaProductId already exists (prevent duplicates)
  if (medusaProductId) {
    const { data: existingProducts } = await supabase
      .from('products')
      .select('id')
      .eq('organization_id', membership.organization_id)
      .eq('data->>medusa_product_id', medusaProductId)
      .limit(1);

    if (existingProducts && existingProducts.length > 0) {
      // Update existing product instead of creating duplicate
      const existingId = existingProducts[0].id;
      const { data, error } = await supabase
        .from('products')
        .update(record)
        .eq('id', existingId)
        .eq('organization_id', membership.organization_id)
        .select('id')
        .single();

      if (error) throw new Error(error.message);
      if (!data?.id) throw new Error('Failed to update existing product');
      return { id: data.id };
    }
  }

  // Create new product
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
 * - Deletes all associated images from R2 bucket.
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

  const orgId = membership.organization_id;

  // Fetch all product images for this product to delete from R2
  const { data: productImages } = await supabase
    .from('product_images')
    .select('file_key')
    .eq('product_id', productId)
    .eq('organization_id', orgId);

  // Get R2 credentials for deleting images
  const { data: settings } = await supabase
    .from('organization_settings')
    .select('*')
    .eq('organization_id', orgId)
    .single();

  let accessKeyId = settings?.r2_access_key_id;
  let secretAccessKey = settings?.r2_secret_access_key;
  let accountId = settings?.r2_account_id;

  const { decrypt } = await import('@/lib/crypto');
  if (accessKeyId) accessKeyId = decrypt(accessKeyId, { allowPlaintext: true });
  if (secretAccessKey) secretAccessKey = decrypt(secretAccessKey, { allowPlaintext: true });
  if (accountId) accountId = decrypt(accountId, { allowPlaintext: true });

  accessKeyId = accessKeyId || process.env.S3_ACCESS_KEY_ID;
  secretAccessKey = secretAccessKey || process.env.S3_SECRET_ACCESS_KEY;

  if (!accountId) {
    accountId = process.env.S3_ACCOUNT_ID;
    if (!accountId && process.env.S3_ENDPOINT) {
      const endpointMatch = process.env.S3_ENDPOINT.match(/https?:\/\/([a-f0-9]+)\.r2\.cloudflarestorage\.com/);
      if (endpointMatch && endpointMatch[1]) {
        accountId = endpointMatch[1];
      }
    }
  }

  const bucket = settings?.r2_bucket_name || process.env.S3_BUCKET;

  // Delete images from R2 if configured
  if (accessKeyId && secretAccessKey && bucket && accountId && productImages && productImages.length > 0) {
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Delete all images in parallel
    await Promise.all(
      productImages.map(async (img) => {
        try {
          if (img.file_key) {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: bucket,
              Key: img.file_key,
            }));
          }
        } catch (r2Error) {
          console.error('Failed to delete image from R2:', img.file_key, r2Error);
          // Continue with other deletions even if one fails
        }
      })
    );
  }

  // Delete from database (cascade will handle product_images due to FK constraint)
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

/**
 * Archive a local product row after it has been published to Medusa.
 *
 * We do NOT delete by default (keeps a recoverable working copy), but we hide it
 * from the Local catalog list to avoid a confusing "two sources of truth" UI.
 *
 * Implementation: store an `archived` flag inside `products.data`.
 */
export async function archiveLocalProductAfterPublish(
  productId: string,
  reason?: string,
  supabaseOverride?: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  if (!productId) throw new Error('Missing product id');

  const supabase = supabaseOverride ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Unauthorized');

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!membership?.organization_id) throw new Error('No organization found');

  const { data: row, error: readErr } = await supabase
    .from('products')
    .select('data')
    .eq('id', productId)
    .eq('organization_id', membership.organization_id)
    .single();

  if (readErr) throw new Error(readErr.message);

  const existing =
    row?.data && typeof row.data === 'object' && row.data !== null
      ? (row.data as Record<string, unknown>)
      : {};

  const next = {
    ...existing,
    archived: true,
    archived_at: new Date().toISOString(),
    archived_reason: typeof reason === 'string' && reason.trim().length > 0 ? reason.trim() : 'published_to_medusa',
  };

  const { error: writeErr } = await supabase
    .from('products')
    .update({ data: next })
    .eq('id', productId)
    .eq('organization_id', membership.organization_id);

  if (writeErr) throw new Error(writeErr.message);
}


