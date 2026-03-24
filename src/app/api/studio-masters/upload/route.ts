import { NextResponse } from 'next/server';
import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/crypto';
import { StudioMasterUploadSchema } from '@/lib/api-schemas';

export const runtime = 'nodejs';

/**
 * POST /api/studio-masters/upload
 *
 * Uploads a master reference image to R2 and saves metadata to studio_master_references.
 * Uses upsert semantics: if a master already exists for (org, jewelry_type, master_key),
 * it is replaced.
 *
 * Request body (FormData):
 * - file: image file (required)
 * - jewelry_type: 'ring' | 'bracelet' | 'chain' | 'pendant' | 'earring' (required)
 * - master_key: string matching a setup's masterKey in promptLibrary.ts (required)
 * - label: string (optional)
 *
 * Returns:
 * - id, jewelry_type, master_key, public_url, label
 */
export async function POST(req: Request) {
  try {
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

    // Parse FormData
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const jewelry_type = formData.get('jewelry_type') as string | null;
    const master_key = formData.get('master_key') as string | null;
    const label = formData.get('label') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are supported' }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 20MB' }, { status: 400 });
    }

    // Validate metadata
    const metadata = StudioMasterUploadSchema.parse({
      jewelry_type: jewelry_type ?? '',
      master_key: master_key ?? '',
      label: label || undefined,
    });

    // Load R2 credentials (same pattern as studio-assets/upload)
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
    const publicUrlBase = settings?.r2_public_url || process.env.S3_FILE_URL;

    if (!accessKeyId || !secretAccessKey || !bucket || !accountId || !publicUrlBase) {
      return NextResponse.json(
        { error: 'R2/S3 not configured. Please configure R2 in organization settings.' },
        { status: 500 }
      );
    }

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    // Deterministic R2 key: one master per (user, jewelry_type, master_key).
    // Using userId so that if a different user uploads a replacement, the old key is
    // cleanly overwritten when the DB record is upserted.
    const ext = file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg';
    const r2Key = `${user.id}/studio-masters/${metadata.jewelry_type}/${metadata.master_key}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: r2Key,
      ContentType: file.type,
      Body: Buffer.from(await file.arrayBuffer()),
    });

    await s3Client.send(command);
    const publicUrl = `${publicUrlBase}/${r2Key}`;

    // Upsert into studio_master_references
    const { data: record, error: dbError } = await supabase
      .from('studio_master_references')
      .upsert(
        {
          organization_id: orgId,
          jewelry_type: metadata.jewelry_type,
          master_key: metadata.master_key,
          public_url: publicUrl,
          r2_key: r2Key,
          label: metadata.label ?? null,
        },
        { onConflict: 'organization_id,jewelry_type,master_key' }
      )
      .select('id, jewelry_type, master_key, public_url, label')
      .single();

    if (dbError) {
      console.error('Failed to save master reference:', dbError);
      return NextResponse.json({ error: 'Failed to save master reference metadata' }, { status: 500 });
    }

    return NextResponse.json(record);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('Master upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload master reference' },
      { status: 500 }
    );
  }
}
