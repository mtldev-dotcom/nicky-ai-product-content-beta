import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/crypto';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { z } from 'zod';

export const runtime = 'nodejs';

const DeleteProductImageSchema = z.object({
  imageId: z.string().uuid(),
});

/**
 * DELETE /api/products/images/[id]
 * 
 * Deletes a single product image from R2 and the database.
 * Used when removing individual images from a product.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }

    const orgId = membership.organization_id;

    // Fetch the image record to get the R2 key
    const { data: imageRecord, error: fetchError } = await supabase
      .from('product_images')
      .select('id, file_key, public_url, organization_id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();

    if (fetchError || !imageRecord) {
      return NextResponse.json({ error: 'Image record not found' }, { status: 404 });
    }

    // Get R2 credentials
    const { data: settings } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', orgId)
      .single();

    let accessKeyId = settings?.r2_access_key_id;
    let secretAccessKey = settings?.r2_secret_access_key;
    let accountId = settings?.r2_account_id;

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
    const publicUrlBase = settings?.r2_public_url || process.env.S3_FILE_URL;

    // Delete from R2 if configured
    if (accessKeyId && secretAccessKey && bucket && accountId && imageRecord.file_key) {
      try {
        const s3Client = new S3Client({
          region: 'auto',
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });

        await s3Client.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: imageRecord.file_key,
        }));
      } catch (r2Error) {
        console.error('Failed to delete image from R2:', r2Error);
        // Continue with DB deletion even if R2 fails
      }
    }

    // Delete from database (cascade will handle product_images record)
    // Note: The product's data.images array will be updated separately by the client
    const { error: deleteError } = await supabase
      .from('product_images')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId);

    if (deleteError) {
      console.error('Failed to delete image from database:', deleteError);
      return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      fileKey: imageRecord.file_key,
      publicUrl: imageRecord.public_url 
    });
  } catch (error: unknown) {
    console.error('Delete product image error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete product image' },
      { status: 500 }
    );
  }
}
