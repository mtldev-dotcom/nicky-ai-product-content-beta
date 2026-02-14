/**
 * Fetch all products from Medusa Admin API and save minimal data to JSON.
 *
 * Usage:
 *   node scripts/fetch-medusa-products.mjs
 *
 * Reads from .env.local:
 *   MEDUSA_URL       - Your Medusa backend URL
 *   MEDUSA_API_TOKEN - Your Medusa admin API token
 *
 * Output:
 *   Creates medusa-products.json with only: id, thumbnail, images, metadata
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local manually
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex);
      const value = trimmed.slice(eqIndex + 1);
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

loadEnv();

async function fetchMedusaProducts() {
  const medusaUrl = process.env.MEDUSA_URL;
  const apiToken = process.env.MEDUSA_API_TOKEN;

  if (!medusaUrl) {
    console.error('Error: MEDUSA_URL not found in .env.local');
    console.error('Please add: MEDUSA_URL=https://your-medusa-domain.com');
    process.exit(1);
  }

  if (!apiToken) {
    console.error('Error: MEDUSA_API_TOKEN not found in .env.local');
    console.error('Please add: MEDUSA_API_TOKEN=your_admin_token');
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

  const allProducts = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  console.log('Fetching products from Medusa...');
  console.log(`URL: ${baseUrl}`);

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
    const products = data.products || [];

    // Extract only the fields we need
    const minimalProducts = products.map((p) => ({
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
  const outputPath = path.join(__dirname, '..', 'medusa-products.json');
  fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2));

  console.log(`Saved to ${outputPath}`);
}

fetchMedusaProducts().catch((err) => {
  console.error('Failed to fetch products:', err);
  process.exit(1);
});
