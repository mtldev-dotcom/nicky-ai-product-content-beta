import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getMedusaAuth } from '@/lib/medusa/client';
import { parseMedusaResponse } from '@/lib/medusa/response-parser';
import { parseMedusaError } from '@/lib/medusa/error-handler';
import { withRetry } from '@/lib/medusa/retry';

export const runtime = 'nodejs';

/**
 * Medusa Admin Product Option proxy (entity-level).
 *
 * Supports:
 * - POST /api/medusa/products/:id/options/:optionId -> POST /admin/products/:id/options/:optionId (Update option)
 * - DELETE /api/medusa/products/:id/options/:optionId -> DELETE /admin/products/:id/options/:optionId (Delete option)
 */

const UpdateOptionSchema = z.object({
  payload: z.unknown(),
});

// Use centralized Medusa client

export async function POST(req: Request, ctx: { params: Promise<{ id: string; optionId: string }> }) {
  try {
    const { id, optionId } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
    if (!optionId) return NextResponse.json({ error: 'Missing option id' }, { status: 400 });

    const auth = await getMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { payload } = UpdateOptionSchema.parse(await req.json());

    const res = await withRetry(async () => {
      return fetch(
        `${auth.baseUrl}/admin/products/${encodeURIComponent(id)}/options/${encodeURIComponent(optionId)}`,
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
      console.error('Medusa API error (update option):', {
        status: res.status,
        statusText: res.statusText,
        productId: id,
        optionId,
        url: `${auth.baseUrl}/admin/products/${encodeURIComponent(id)}/options/${encodeURIComponent(optionId)}`,
        response: json,
      });

      return NextResponse.json(
        { error: error.message, details: json },
        { status: 502 }
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update Medusa product option';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; optionId: string }> }) {
  try {
    const { id, optionId } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
    if (!optionId) return NextResponse.json({ error: 'Missing option id' }, { status: 400 });

    const auth = await getMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const res = await withRetry(async () => {
      return fetch(
        `${auth.baseUrl}/admin/products/${encodeURIComponent(id)}/options/${encodeURIComponent(optionId)}`,
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
      console.error('Medusa API error (delete option):', {
        status: res.status,
        statusText: res.statusText,
        productId: id,
        optionId,
        url: `${auth.baseUrl}/admin/products/${encodeURIComponent(id)}/options/${encodeURIComponent(optionId)}`,
        response: json,
      });

      return NextResponse.json(
        { error: error.message, details: json },
        { status: 502 }
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete Medusa product option';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
