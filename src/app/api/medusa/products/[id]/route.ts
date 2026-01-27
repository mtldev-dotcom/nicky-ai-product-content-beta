import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getMedusaAuth } from '@/lib/medusa/client';
import { parseMedusaResponse } from '@/lib/medusa/response-parser';
import { parseMedusaError } from '@/lib/medusa/error-handler';
import { withRetry } from '@/lib/medusa/retry';
import { sanitizeMedusaProductPayload } from '@/lib/medusa/normalize-product-payload';

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

    const auth = await getMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { payload } = UpdateProductSchema.parse(await req.json());

    // Sanitize payload (normalize currency_code, etc.)
    const sanitizedPayload = sanitizeMedusaProductPayload(payload);

    const res = await withRetry(async () => {
      return fetch(`${auth.baseUrl}/admin/products/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: auth.headers,
        cache: 'no-store',
        body: JSON.stringify(sanitizedPayload),
      });
    });

    const text = await res.text();
    const json = parseMedusaResponse(text);

    if (!res.ok) {
      // Log the full error for debugging
      const payloadObj = typeof sanitizedPayload === 'object' && sanitizedPayload !== null && !Array.isArray(sanitizedPayload)
        ? sanitizedPayload as Record<string, unknown>
        : {};
      
      const error = parseMedusaError(res.status, res.statusText, json);
      console.error('Medusa API error (update):', {
        status: res.status,
        statusText: res.statusText,
        productId: id,
        url: `${auth.baseUrl}/admin/products/${encodeURIComponent(id)}`,
        response: json,
        payloadPreview: {
          title: payloadObj.title,
          handle: payloadObj.handle,
          variantsCount: Array.isArray(payloadObj.variants) ? payloadObj.variants.length : 0,
        },
      });

      return NextResponse.json(
        { error: error.message, details: json },
        { status: 502 }
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update Medusa product';
    return NextResponse.json({ error: message }, { status: 400 });
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


