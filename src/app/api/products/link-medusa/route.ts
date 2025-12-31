import { NextResponse } from 'next/server';
import { z } from 'zod';

import { setLocalProductMedusaId } from '@/app/products/actions';

export const runtime = 'nodejs';

const LinkSchema = z.object({
  productId: z.string().min(1),
  medusaProductId: z.string().min(1),
});

/**
 * Link a local product row to its Medusa product id (org-scoped via server action).
 */
export async function POST(req: Request) {
  try {
    const { productId, medusaProductId } = LinkSchema.parse(await req.json());
    await setLocalProductMedusaId(productId, medusaProductId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to link Medusa product id';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


