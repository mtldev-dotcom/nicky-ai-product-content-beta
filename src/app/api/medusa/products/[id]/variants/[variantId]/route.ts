import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getMedusaAuth } from '@/lib/medusa/client';
import { parseMedusaResponse } from '@/lib/medusa/response-parser';
import { parseMedusaError } from '@/lib/medusa/error-handler';
import { withRetry } from '@/lib/medusa/retry';

export const runtime = 'nodejs';

/**
 * Medusa Admin Product Variant proxy (entity-level).
 *
 * Supports:
 * - POST /api/medusa/products/:id/variants/:variantId -> POST /admin/products/:id/variants/:variantId (Update variant)
 * - DELETE /api/medusa/products/:id/variants/:variantId -> DELETE /admin/products/:id/variants/:variantId (Delete variant)
 */

const UpdateVariantSchema = z.object({
  payload: z.unknown(),
});

// Use centralized Medusa client

export async function POST(req: Request, ctx: { params: Promise<{ id: string; variantId: string }> }) {
  try {
    const { id, variantId } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
    if (!variantId) return NextResponse.json({ error: 'Missing variant id' }, { status: 400 });

    const auth = await getMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { payload } = UpdateVariantSchema.parse(await req.json());

    const res = await withRetry(async () => {
      return fetch(
        `${auth.baseUrl}/admin/products/${encodeURIComponent(id)}/variants/${encodeURIComponent(variantId)}`,
        {
          method: 'POST',
          headers: auth.headers,
          cache: 'no-store',
          body: JSON.stringify(payload),
        }
      );
    });

    const text = await res.text();
    const json = parseMedusaResponse(text);

    if (!res.ok) {
      const error = parseMedusaError(res.status, res.statusText, json);
      console.error('Medusa API error (update variant):', {
        status: res.status,
        statusText: res.statusText,
        productId: id,
        variantId,
        url: `${auth.baseUrl}/admin/products/${encodeURIComponent(id)}/variants/${encodeURIComponent(variantId)}`,
        response: json,
      });

      return NextResponse.json(
        { error: error.message, details: json },
        { status: 502 }
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update Medusa product variant';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; variantId: string }> }) {
  try {
    const { id, variantId } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
    if (!variantId) return NextResponse.json({ error: 'Missing variant id' }, { status: 400 });

    const auth = await getMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const res = await withRetry(async () => {
      return fetch(
        `${auth.baseUrl}/admin/products/${encodeURIComponent(id)}/variants/${encodeURIComponent(variantId)}`,
        {
          method: 'DELETE',
          headers: auth.headers,
          cache: 'no-store',
        }
      );
    });

    const text = await res.text();
    const json = parseMedusaResponse(text);

    if (!res.ok) {
      const error = parseMedusaError(res.status, res.statusText, json);
      console.error('Medusa API error (delete variant):', {
        status: res.status,
        statusText: res.statusText,
        productId: id,
        variantId,
        url: `${auth.baseUrl}/admin/products/${encodeURIComponent(id)}/variants/${encodeURIComponent(variantId)}`,
        response: json,
      });

      return NextResponse.json(
        { error: error.message, details: json },
        { status: 502 }
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete Medusa product variant';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
