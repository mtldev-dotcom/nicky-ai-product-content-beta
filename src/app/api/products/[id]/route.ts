import { NextResponse } from 'next/server';

import { deleteProductFromCloud } from '@/app/products/actions';

export const runtime = 'nodejs';

/**
 * Local product CRUD (entity-level).
 *
 * Why an API route instead of calling the server action directly?
 * - This is used by client components (dashboard) via `fetch`.
 * - Keeps the client thin and avoids wiring server actions into UI events.
 */

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 });

    await deleteProductFromCloud(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete product';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


