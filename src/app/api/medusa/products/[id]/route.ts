import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getMedusaAuth } from '@/lib/medusa/client';
import { parseMedusaResponse } from '@/lib/medusa/response-parser';
import { parseMedusaError } from '@/lib/medusa/error-handler';
import { withRetry } from '@/lib/medusa/retry';
import { updateProductInMedusa } from '@/lib/medusa/update-product-strategy';

export const runtime = 'nodejs';

/**
 * Medusa Admin Product proxy (entity-level).
 *
 * Supports:
 * - GET /api/medusa/products/:id      -> GET /admin/products/:id
 * - POST /api/medusa/products/:id     -> POST /admin/products/:id (Medusa uses POST for updates)
 * - DELETE /api/medusa/products/:id   -> DELETE /admin/products/:id
 */

const UpdateProductSchema = z.object({
  payload: z.unknown(),
});

// Use centralized Medusa client

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 });

    const auth = await getMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const res = await withRetry(async () => {
      return fetch(`${auth.baseUrl}/admin/products/${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: auth.headers,
        cache: 'no-store',
      });
    });

    const text = await res.text();
    const json = parseMedusaResponse(text);

    if (!res.ok) {
      const error = parseMedusaError(res.status, res.statusText, json);
      return NextResponse.json(
        { error: error.message, details: json },
        { status: 502 }
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Medusa product';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 });

    const { payload } = UpdateProductSchema.parse(await req.json());

    // Use update strategy with ID reconciliation and validation
    const result = await updateProductInMedusa(id, payload);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update Medusa product';
    
    // Enhanced error logging
    console.error('Product update failed:', {
      productId: (await ctx.params).id,
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { 
        error: message,
        details: error instanceof Error && 'details' in error 
          ? (error as { details?: unknown }).details 
          : undefined,
      },
      { status: 400 }
    );
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 });

    const auth = await getMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const res = await withRetry(async () => {
      return fetch(`${auth.baseUrl}/admin/products/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: auth.headers,
        cache: 'no-store',
      });
    });

    const text = await res.text();
    const json = parseMedusaResponse(text);

    if (!res.ok) {
      const error = parseMedusaError(res.status, res.statusText, json);
      return NextResponse.json(
        { error: error.message, details: json },
        { status: 502 }
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete Medusa product';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


