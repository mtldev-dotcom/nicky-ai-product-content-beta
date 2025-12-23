import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/crypto';

export async function POST(req: Request) {
  try {
    const { filename, contentType } = await req.json();

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

    // Get organization settings
    const { data: settings } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .single();

    let accessKeyId = settings?.r2_access_key_id;
    let secretAccessKey = settings?.r2_secret_access_key;
    let accountId = settings?.r2_account_id;

    if (accessKeyId) accessKeyId = decrypt(accessKeyId);
    if (secretAccessKey) secretAccessKey = decrypt(secretAccessKey);
    if (accountId) accountId = decrypt(accountId);

    accessKeyId = accessKeyId || process.env.S3_ACCESS_KEY_ID;
    secretAccessKey = secretAccessKey || process.env.S3_SECRET_ACCESS_KEY;
    accountId = accountId || process.env.S3_ACCOUNT_ID;
    
    const bucket = settings?.r2_bucket_name || process.env.S3_BUCKET;
    const publicUrlBase = settings?.r2_public_url || process.env.S3_FILE_URL;

    if (!accessKeyId || !secretAccessKey || !bucket || !accountId) {
      return NextResponse.json({ error: 'R2/S3 not configured' }, { status: 500 });
    }

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const fileKey = `${membership.organization_id}/uploads/${Date.now()}-${filename}`;
    
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const publicUrl = `${publicUrlBase}/${fileKey}`;

    return NextResponse.json({ presignedUrl, publicUrl, fileKey });
  } catch (error: any) {
    console.error('Presigned URL Error:', error);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}

