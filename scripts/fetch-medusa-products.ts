/**
 * Fetch all products from Medusa Admin API and save minimal data to JSON.
 *
 * Usage:
 *   npx ts-node scripts/fetch-medusa-products.ts
 *
 * Environment variables required:
 *   MEDUSA_URL       - Your Medusa backend URL (e.g., https://your-domain.com)
 *   MEDUSA_API_TOKEN - Your Medusa admin API token
 *
 * Output:
 *   Creates medusa-products.json with only: id, thumbnail, images, metadata
 */

import * as fs from 'fs';
import * as path from 'path';

interface MedusaImage {
  id: string;
  url: string;
  created_at?: string;
  updated_at?: string;
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

async function fetchMedusaProducts(): Promise<void> {
  const medusaUrl = process.env.MEDUSA_URL;
  const apiToken = process.env.MEDUSA_API_TOKEN;

  if (!medusaUrl) {
    console.error('Error: MEDUSA_URL environment variable is required');
    process.exit(1);
  }

  if (!apiToken) {
    console.error('Error: MEDUSA_API_TOKEN environment variable is required');
    process.exit(1);
  }

  // Normalize URL
  let baseUrl = medusaUrl.trim().replace(/\/$/, '');
  if (baseUrl.endsWith('/admin')) {
    baseUrl = baseUrl.replace(/\/admin$/, '');
  }

  const headers = {
    'x-medusa-access-token': apiToken,
    Authorization: `Basic ${Buffer.from(`${apiToken}:`).toString('base64')}`,
    'Content-Type': 'application/json',
  };

  const allProducts: MinimalProduct[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  console.log('Fetching products from Medusa...');

  while (hasMore) {
    const url = `${baseUrl}/admin/products?limit=${limit}&offset=${offset}`;
    console.log(`Fetching offset=${offset}...`);

    const res = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Error fetching products: ${res.status} ${res.statusText}`);
      console.error(text);
      process.exit(1);
    }

    const data = await res.json();
    const products: MedusaProduct[] = data.products || [];

    // Extract only the fields we need
    const minimalProducts: MinimalProduct[] = products.map((p) => ({
      id: p.id,
      thumbnail: p.thumbnail,
      images: (p.images || []).map((img) =>
        typeof img === 'string' ? img : img.url
      ),
      metadata: p.metadata,
    }));

    allProducts.push(...minimalProducts);

    // Check if there are more products
    if (products.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
    }
  }

  console.log(`Fetched ${allProducts.length} products total.`);

  // Write to JSON file
  const outputPath = path.join(process.cwd(), 'medusa-products.json');
  fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2));

  console.log(`Saved to ${outputPath}`);
}

fetchMedusaProducts().catch((err) => {
  console.error('Failed to fetch products:', err);
  process.exit(1);
});
