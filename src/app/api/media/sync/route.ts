import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/crypto';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

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

    // 1. Fetch the external image
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) throw new Error('Failed to fetch external image');
    
    const arrayBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(arrayBuffer);

    // 2. Setup S3 Client
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const filename = url.split('/').pop() || 'image.jpg';
    const fileKey = `${membership.organization_id}/sync/${Date.now()}-${filename}`;

    // 3. Upload to R2
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);
    const publicUrl = `${publicUrlBase}/${fileKey}`;

    return NextResponse.json({ publicUrl, fileKey });
  } catch (error: any) {
    console.error('Media Sync Error:', error);
    return NextResponse.json({ error: 'Failed to sync image to bucket' }, { status: 500 });
  }
}

