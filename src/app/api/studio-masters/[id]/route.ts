import { NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/crypto';

export const runtime = 'nodejs';

/**
 * DELETE /api/studio-masters/[id]
 *
 * Deletes a master reference from R2 (best-effort) and the database.
 *
 * Returns:
 * - { success: true }
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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

    // Fetch record (verifies org ownership via RLS + explicit filter)
    const { data: master, error: fetchError } = await supabase
      .from('studio_master_references')
      .select('id, r2_key, organization_id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();

    if (fetchError || !master) {
      return NextResponse.json({ error: 'Master reference not found' }, { status: 404 });
    }

    // Best-effort R2 deletion
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
        const m = process.env.S3_ENDPOINT.match(/https?:\/\/([a-f0-9]+)\.r2\.cloudflarestorage\.com/);
        if (m?.[1]) accountId = m[1];
      }
    }

    const bucket = settings?.r2_bucket_name || process.env.S3_BUCKET;

    if (accessKeyId && secretAccessKey && bucket && accountId && master.r2_key) {
      try {
        const s3Client = new S3Client({
          region: 'auto',
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId, secretAccessKey },
        });
        await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: master.r2_key }));
      } catch (r2Error) {
        // Best-effort: log but do not abort
        console.error('Failed to delete master reference from R2:', r2Error);
      }
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('studio_master_references')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId);

    if (deleteError) {
      console.error('Failed to delete master reference from database:', deleteError);
      return NextResponse.json({ error: 'Failed to delete master reference' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Master DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete master reference' },
      { status: 500 }
    );
  }
}
