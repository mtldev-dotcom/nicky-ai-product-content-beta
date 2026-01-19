import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/lib/crypto';
import { z } from 'zod';
import { StudioAssetUploadSchema } from '@/lib/api-schemas';

/**
 * POST /api/studio-assets/upload
 * 
 * Handles uploading a model or studio photo to R2 and saving metadata to database.
 * 
 * Request body:
 * - file: File (via FormData)
 * - type: 'model' | 'studio'
 * - name: string
 * - tags?: string[]
 * - description?: string
 * 
 * Returns:
 * - id: UUID of created asset
 * - imageUrl: Public URL of uploaded image
 * - thumbnailUrl: Public URL of thumbnail (if generated)
 */
export async function POST(req: Request) {
  try {
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

    // Parse FormData
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string | null;
    const name = formData.get('name') as string | null;
    const tagsStr = formData.get('tags') as string | null;
    const description = formData.get('description') as string | null;

    // Validate file
    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    // Validate file type (images only)
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are supported' }, { status: 400 });
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 });
    }

    // Validate metadata
    const tags = tagsStr ? JSON.parse(tagsStr) : [];
    const metadata = StudioAssetUploadSchema.parse({
      type: type || 'model',
      name: name || file.name.replace(/\.[^/.]+$/, ''), // Use filename without extension as default
      tags: Array.isArray(tags) ? tags : [],
      description: description || undefined,
    });

    // Get organization settings for R2
    const { data: settings } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', orgId)
      .single();

    let accessKeyId = settings?.r2_access_key_id;
    let secretAccessKey = settings?.r2_secret_access_key;
    let accountId = settings?.r2_account_id;

    // Decrypt credentials
    if (accessKeyId) accessKeyId = decrypt(accessKeyId, { allowPlaintext: true });
    if (secretAccessKey) secretAccessKey = decrypt(secretAccessKey, { allowPlaintext: true });
    if (accountId) accountId = decrypt(accountId, { allowPlaintext: true });

    accessKeyId = accessKeyId || process.env.S3_ACCESS_KEY_ID;
    secretAccessKey = secretAccessKey || process.env.S3_SECRET_ACCESS_KEY;

    // Support both S3_ACCOUNT_ID and S3_ENDPOINT
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

    if (!accessKeyId || !secretAccessKey || !bucket || !accountId || !publicUrlBase) {
      return NextResponse.json({
        error: 'R2/S3 not configured. Please configure R2 in organization settings or set S3_* environment variables.',
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

    // Generate safe filename and file key
    const safeFilename = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 120);
    const timestamp = Date.now();
    const uuid = crypto.randomUUID().slice(0, 8);
    const fileKey = `${user.id}/studio-assets/${metadata.type}/${timestamp}-${uuid}-${safeFilename}`;

    // Upload main image
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      ContentType: file.type,
      Body: Buffer.from(await file.arrayBuffer()),
    });

    await s3Client.send(command);
    const imageUrl = `${publicUrlBase}/${fileKey}`;

    // TODO: Generate thumbnail (will be implemented in image-processing.ts)
    // For now, we'll use the same URL as thumbnail
    const thumbnailUrl = imageUrl;

    // Save to database
    const { data: asset, error: dbError } = await supabase
      .from('studio_assets')
      .insert({
        organization_id: orgId,
        user_id: user.id,
        type: metadata.type,
        name: metadata.name,
        image_url: imageUrl,
        thumbnail_url: thumbnailUrl,
        metadata: {
          tags: metadata.tags || [],
          description: metadata.description || null,
        },
      })
      .select()
      .single();

    if (dbError) {
      console.error('Failed to save asset to database:', dbError);
      return NextResponse.json({ error: 'Failed to save asset metadata' }, { status: 500 });
    }

    return NextResponse.json({
      id: asset.id,
      imageUrl: asset.image_url,
      thumbnailUrl: asset.thumbnail_url,
      type: asset.type,
      name: asset.name,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload asset' },
      { status: 500 }
    );
  }
}
