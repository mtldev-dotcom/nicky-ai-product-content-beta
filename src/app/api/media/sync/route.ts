import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/crypto';
import { MediaSyncRequestSchema } from '@/lib/api-schemas';
import { assertSafeExternalUrl, fetchExternalWithLimits, readResponseAsBufferWithLimit, SsrfBlockedError } from '@/lib/ssrf';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url: rawUrl } = MediaSyncRequestSchema.parse(body);

    // Optional allowlist for production hardening.
    const allowedHosts = (process.env.MEDIA_SYNC_ALLOWED_HOSTS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

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

    // allowPlaintext supports legacy rows that stored plaintext before encryption was introduced
    if (accessKeyId) accessKeyId = decrypt(accessKeyId, { allowPlaintext: true });
    if (secretAccessKey) secretAccessKey = decrypt(secretAccessKey, { allowPlaintext: true });
    if (accountId) accountId = decrypt(accountId, { allowPlaintext: true });

    accessKeyId = accessKeyId || process.env.S3_ACCESS_KEY_ID;
    secretAccessKey = secretAccessKey || process.env.S3_SECRET_ACCESS_KEY;
    
    // Support both S3_ACCOUNT_ID and S3_ENDPOINT (extract account ID from endpoint URL)
    if (!accountId) {
      accountId = process.env.S3_ACCOUNT_ID;
      if (!accountId && process.env.S3_ENDPOINT) {
        // Extract account ID from endpoint URL: https://{accountId}.r2.cloudflarestorage.com/...
        const endpointMatch = process.env.S3_ENDPOINT.match(/https?:\/\/([a-f0-9]+)\.r2\.cloudflarestorage\.com/);
        if (endpointMatch && endpointMatch[1]) {
          accountId = endpointMatch[1];
        }
      }
    }
    
    const bucket = settings?.r2_bucket_name || process.env.S3_BUCKET;
    const publicUrlBase = settings?.r2_public_url || process.env.S3_FILE_URL;

    // Env vars are used as defaults when org settings not configured
    // No error if missing - they should be present in .env.local
    if (!accessKeyId || !secretAccessKey || !bucket || !accountId) {
      return NextResponse.json({ 
        error: 'R2/S3 not configured. Please set S3_* environment variables or configure R2 in organization settings.' 
      }, { status: 500 });
    }

    // 1) SSRF-safe URL validation + DNS private-network blocking
    const safeUrl = await assertSafeExternalUrl(rawUrl, { allowedHosts });

    // 2) Fetch with strict limits
    const imageResponse = await fetchExternalWithLimits(safeUrl, {
      timeoutMs: 10_000,
      maxBytes: 10 * 1024 * 1024, // 10MB
    });

    if (!imageResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch external image' }, { status: 400 });
    }

    const contentType = imageResponse.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return NextResponse.json({ error: 'URL must point to an image' }, { status: 400 });
    }

    const buffer = await readResponseAsBufferWithLimit(imageResponse, 10 * 1024 * 1024);

    // 2. Setup S3 Client
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Prevent path traversal: only use URL pathname basename as the filename.
    const filename = safeUrl.pathname.split('/').pop() || 'image';
    const safeFilename = filename.replace(/[^\w.\-]+/g, '_').slice(0, 120);
    // Use per-user folders instead of per-organization for better isolation
    const fileKey = `${user.id}/sync/${Date.now()}-${safeFilename}`;

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
  } catch (error: unknown) {
    // Keep errors non-leaky to clients.
    if (error instanceof SsrfBlockedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to sync image to bucket' }, { status: 500 });
  }
}

