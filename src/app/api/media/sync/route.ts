import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
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
      endpoint: process.env.S3_ENDPOINT || '',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      },
    });

    const filename = url.split('/').pop() || 'image.jpg';
    const fileKey = `sync/${Date.now()}-${filename}`;

    // 3. Upload to R2
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: fileKey,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);
    const publicUrl = `${process.env.S3_FILE_URL}/${fileKey}`;

    return NextResponse.json({ publicUrl, fileKey });
  } catch (error: any) {
    console.error('Media Sync Error:', error);
    return NextResponse.json({ error: 'Failed to sync image to bucket' }, { status: 500 });
  }
}

