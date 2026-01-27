import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getMedusaAuth } from '@/lib/medusa/client';
import { parseMedusaResponse, extractProductId } from '@/lib/medusa/response-parser';
import { parseMedusaError } from '@/lib/medusa/error-handler';
import { withRetry } from '@/lib/medusa/retry';
import { sanitizeMedusaProductPayload } from '@/lib/medusa/normalize-product-payload';

export const runtime = 'nodejs';

/**
 * Medusa Admin Product proxy (collection-level).
 *
 * Security:
 * - Auth required (Supabase session).
 * - Org derived from membership server-side.
 * - Medusa API key is decrypted server-side and never returned to the browser.
 *
 * Notes:
 * - We normalize the configured Medusa URL to avoid double `/admin` prefixes.
 * - Medusa Admin API supports `x-medusa-access-token` and `Authorization: Basic base64(key:)`.
 *   We send both for compatibility with different Medusa setups.
 */

const CreateProductSchema = z.object({
  payload: z.unknown(),
});

// Use centralized Medusa client

export async function GET(req: Request) {
  try {
    const auth = await getMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    /**
     * Passthrough some supported query params to Medusa.
     * We keep this allowlist tight to avoid accidental open proxy behavior.
     */
    const url = new URL(req.url);
    const allowedKeys = new Set(['limit', 'offset', 'q', 'status', 'fields', 'order', 'with_deleted']);
    const search = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      if (!allowedKeys.has(key)) return;
      // Support repeated keys (e.g., status=published&status=draft).
      search.append(key, value);
    });

    // Default pagination to keep payloads bounded.
    if (!search.has('limit')) search.set('limit', '20');

    const res = await withRetry(async () => {
      return fetch(`${auth.baseUrl}/admin/products?${search.toString()}`, {
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
    const message = error instanceof Error ? error.message : 'Failed to fetch Medusa products';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { payload } = CreateProductSchema.parse(await req.json());
    const sanitizedPayload = sanitizeMedusaProductPayload(payload);

    const res = await withRetry(async () => {
      return fetch(`${auth.baseUrl}/admin/products`, {
        method: 'POST',
        headers: auth.headers,
        cache: 'no-store',
        body: JSON.stringify(sanitizedPayload),
      });
    });

    const text = await res.text();
    const json = parseMedusaResponse(text);

    if (!res.ok) {
      const error = parseMedusaError(res.status, res.statusText, json);
      console.error('Medusa API error (create product):', {
        status: res.status,
        statusText: res.statusText,
        url: `${auth.baseUrl}/admin/products`,
        response: json,
      });
      return NextResponse.json(
        { error: error.message, details: json },
        { status: 502 }
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Medusa product';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


