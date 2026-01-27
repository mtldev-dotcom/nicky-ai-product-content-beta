import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getMedusaAuth } from '@/lib/medusa/client';
import { parseMedusaResponse } from '@/lib/medusa/response-parser';
import { parseMedusaError } from '@/lib/medusa/error-handler';
import { withRetry } from '@/lib/medusa/retry';

export const runtime = 'nodejs';

/**
 * Medusa Admin Product Variants proxy (collection-level).
 *
 * Supports:
 * - POST /api/medusa/products/:id/variants -> POST /admin/products/:id/variants (Create variant)
 */

const CreateVariantSchema = z.object({
  payload: z.unknown(),
});

// Use centralized Medusa client

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 });

    const auth = await getMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { payload } = CreateVariantSchema.parse(await req.json());

    const res = await withRetry(async () => {
      return fetch(`${auth.baseUrl}/admin/products/${encodeURIComponent(id)}/variants`, {
        method: 'POST',
        headers: auth.headers,
        cache: 'no-store',
        body: JSON.stringify(payload),
      });
    });

    const text = await res.text();
    const json = parseMedusaResponse(text);

    if (!res.ok) {
      const error = parseMedusaError(res.status, res.statusText, json);
      console.error('Medusa API error (create variant):', {
        status: res.status,
        statusText: res.statusText,
        productId: id,
        url: `${auth.baseUrl}/admin/products/${encodeURIComponent(id)}/variants`,
        response: json,
      });

      return NextResponse.json(
        { error: error.message, details: json },
        { status: 502 }
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Medusa product variant';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
