import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { decrypt } from '@/lib/crypto';

/**
 * DELETE /api/studio-assets/[id]
 * 
 * Deletes a studio asset from the database and R2 storage.
 * 
 * Returns:
 * - success: boolean
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

    // Get organization for user
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }

    const orgId = membership.organization_id;

    // Fetch the asset to get image URLs and verify ownership
    const { data: asset, error: fetchError } = await supabase
      .from('studio_assets')
      .select('id, image_url, thumbnail_url, organization_id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();

    if (fetchError || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Delete from R2 if configured
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

    // Try to delete from R2 (best effort, don't fail if R2 not configured)
    if (accessKeyId && secretAccessKey && bucket && accountId) {
      try {
        const s3Client = new S3Client({
          region: 'auto',
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });

        // Extract file key from image URL
        const publicUrlBase = settings?.r2_public_url || process.env.S3_FILE_URL;
        if (publicUrlBase && asset.image_url.startsWith(publicUrlBase)) {
          const fileKey = asset.image_url.replace(publicUrlBase + '/', '');
          await s3Client.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: fileKey,
          }));

          // Delete thumbnail if different from main image
          if (asset.thumbnail_url && asset.thumbnail_url !== asset.image_url) {
            const thumbKey = asset.thumbnail_url.replace(publicUrlBase + '/', '');
            await s3Client.send(new DeleteObjectCommand({
              Bucket: bucket,
              Key: thumbKey,
            }));
          }
        }
      } catch (r2Error) {
        // Log but don't fail - asset will still be deleted from DB
        console.error('Failed to delete from R2:', r2Error);
      }
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('studio_assets')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId);

    if (deleteError) {
      console.error('Failed to delete asset from database:', deleteError);
      return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete asset' },
      { status: 500 }
    );
  }
}
