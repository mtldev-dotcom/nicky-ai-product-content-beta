import { NextResponse } from 'next/server';
import { z } from 'zod';

import { archiveLocalProductAfterPublish } from '@/app/products/actions';

export const runtime = 'nodejs';

const Schema = z.object({
  productId: z.string().min(1),
  reason: z.string().optional(),
});

/**
 * Archive a local product row (org-scoped).
 * Used to hide local working copies after pushing to Medusa, without deleting data.
 */
export async function POST(req: Request) {
  try {
    const { productId, reason } = Schema.parse(await req.json());
    await archiveLocalProductAfterPublish(productId, reason);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to archive product';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
