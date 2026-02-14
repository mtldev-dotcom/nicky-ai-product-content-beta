import { NextResponse } from 'next/server';

import { getMedusaAuth } from '@/lib/medusa/client';
import { parseMedusaResponse } from '@/lib/medusa/response-parser';
import { parseMedusaError } from '@/lib/medusa/error-handler';
import { withRetry } from '@/lib/medusa/retry';

export const runtime = 'nodejs';

/**
 * Export all Medusa products with minimal fields (id, thumbnail, images, metadata).
 *
 * GET /api/medusa/products/export-json
 *
 * Returns JSON array with only:
 * - id
 * - thumbnail
 * - images (array of URLs)
 * - metadata
 */

interface MedusaImage {
  id: string;
  url: string;
}

interface MedusaProduct {
  id: string;
  thumbnail: string | null;
  images: MedusaImage[];
  metadata: Record<string, unknown> | null;
}

interface MinimalProduct {
  id: string;
  thumbnail: string | null;
  images: string[];
  metadata: Record<string, unknown> | null;
}

export async function GET() {
  try {
    const auth = await getMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const allProducts: MinimalProduct[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const res = await withRetry(async () => {
        return fetch(`${auth.baseUrl}/admin/products?limit=${limit}&offset=${offset}`, {
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

      const products: MedusaProduct[] = json.products || [];

      // Extract only the fields we need
      const minimalProducts: MinimalProduct[] = products.map((p: MedusaProduct) => ({
        id: p.id,
        thumbnail: p.thumbnail,
        images: (p.images || []).map((img: MedusaImage | string) =>
          typeof img === 'string' ? img : img.url
        ),
        metadata: p.metadata,
      }));

      allProducts.push(...minimalProducts);

      if (products.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    // Return as downloadable JSON file
    return new NextResponse(JSON.stringify(allProducts, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="medusa-products.json"',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export Medusa products';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
