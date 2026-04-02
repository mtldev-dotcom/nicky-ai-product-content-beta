import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/crypto';
import { z } from 'zod';
import { MediaPresignedRequestSchema } from '@/lib/api-schemas';

export async function POST(req: Request) {
  try {
    const parsed = MediaPresignedRequestSchema.parse(await req.json());
    const { filename, contentType, forIngest } = parsed;

    const contentTypeLower = contentType.toLowerCase();
    
    // If forIngest is true, allow more file types
    if (forIngest) {
      const allowedIngestTypes = [
        'image/',
        'text/csv',
        'application/json',
        'application/pdf',
        'text/plain',
      ];
      
      const isAllowed = allowedIngestTypes.some(type => 
        contentTypeLower.startsWith(type) || contentTypeLower === type
      );
      
      if (!isAllowed) {
        return NextResponse.json({ 
          error: 'File type not supported for ingest. Allowed: images, CSV, JSON, PDF, TXT' 
        }, { status: 400 });
      }
    } else {
      // Default: only allow images
      if (!contentTypeLower.startsWith('image/')) {
        return NextResponse.json({ error: 'Only image uploads are supported' }, { status: 400 });
      }
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
    // Check all required values including publicUrlBase
    if (!accessKeyId || !secretAccessKey || !bucket || !accountId || !publicUrlBase) {
      return NextResponse.json({ 
        error: 'R2/S3 not configured. Please set S3_* environment variables (S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ACCOUNT_ID, S3_BUCKET, S3_FILE_URL) or configure R2 in organization settings.' 
      }, { status: 500 });
    }

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Prevent path traversal: sanitize user-supplied filename.
    const safeFilename = filename.replace(/[^\w.\-]+/g, '_').slice(0, 120);
    // Use 'ingest' folder for ingest files, 'uploads' for regular images
    const folder = forIngest ? 'ingest' : 'uploads';
    // Use per-user folders instead of per-organization for better isolation
    const fileKey = `${user.id}/${folder}/${Date.now()}-${safeFilename}`;
    
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const publicUrl = `${publicUrlBase.replace(/\/+$/, '')}/${fileKey}`;

    return NextResponse.json({ presignedUrl, publicUrl, fileKey });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}

