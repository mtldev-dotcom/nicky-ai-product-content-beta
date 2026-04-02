import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const RegisterProductImageSchema = z.object({
  productId: z.string().uuid(),
  fileKey: z.string(),
  publicUrl: z.string().url(),
  sizeBytes: z.number().optional(),
  contentType: z.string().optional(),
});

/**
 * POST /api/products/images/register
 * 
 * Registers a product image in the database after it's uploaded to R2.
 * This enables proper tracking for cleanup when products or images are deleted.
 */
export async function POST(req: Request) {
  try {
    const parsed = RegisterProductImageSchema.parse(await req.json());
    const { productId, fileKey, publicUrl, sizeBytes, contentType } = parsed;

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

    // Verify the product exists and belongs to the same organization
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, organization_id')
      .eq('id', productId)
      .eq('organization_id', orgId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Register the image
    const { data: imageRecord, error: insertError } = await supabase
      .from('product_images')
      .insert({
        organization_id: orgId,
        product_id: productId,
        file_key: fileKey,
        public_url: publicUrl,
        uploaded_by: user.id,
        size_bytes: sizeBytes || null,
        content_type: contentType || null,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to register product image:', insertError);
      return NextResponse.json({ error: 'Failed to register image' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      imageId: imageRecord.id 
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('Register product image error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to register product image' },
      { status: 500 }
    );
  }
}
