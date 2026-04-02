import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const GetProductImagesSchema = z.object({
  productId: z.string().uuid(),
});

/**
 * GET /api/products/images
 * 
 * Fetches all tracked images for a product.
 * Returns image records with their database IDs for deletion operations.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    const parsed = GetProductImagesSchema.parse({ productId });

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

    // Fetch all images for this product
    const { data: images, error: fetchError } = await supabase
      .from('product_images')
      .select('id, public_url, file_key, content_type, size_bytes, created_at')
      .eq('product_id', parsed.productId)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('Failed to fetch product images:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 });
    }

    return NextResponse.json({ images: images || [] });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('Get product images error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch product images' },
      { status: 500 }
    );
  }
}
