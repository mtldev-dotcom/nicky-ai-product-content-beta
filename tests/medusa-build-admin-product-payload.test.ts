import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMedusaAdminProductPayloadFromSavedProduct } from '../src/lib/medusa/build-admin-product-payload';

test('buildMedusaAdminProductPayloadFromSavedProduct returns a payload with sanitized currency_code and omits inventory', () => {
  const payload = buildMedusaAdminProductPayloadFromSavedProduct({
    id: 'local_1',
    title: 'Test Product',
    handle: 'test-product',
    status: 'draft',
    sku: 'SKU-1',
    price: 45,
    data: {
      subtitle: 'Sub',
      description: 'Desc',
      thumbnail: 'https://example.com/thumb.jpg',
      activeLanguages: ['en'],
      localization: {
        en: {
          title: 'Test Product',
          subtitle: 'Sub',
          description: 'Desc',
          features: ['f1'],
          metadata_title: 'SEO title',
          metadata_description: 'SEO desc',
          keywords: ['k1'],
        },
      },
      images: ['https://example.com/1.jpg'],
      vault: ['https://example.com/v1.jpg'],
      options: [],
      variants: [
        {
          title: 'v1',
          sku: 'SKU-1',
          options: {},
          prices: [{ amount: 45, currency_code: { code: 'USD' } }],
          manage_inventory: true,
          allow_backorder: false,
          inventory: [{ location_id: 'loc', stocked_quantity: 10 }], // should be omitted
        },
      ],
      tags: ['tag1'],
      categories: ['cat1'],
      sales_channels: ['sc1'],
      shipping_profile_id: 'sp1',
    },
  });

  assert.equal(typeof payload, 'object');
  assert.ok(payload && !Array.isArray(payload));

  const p = payload as any;
  assert.equal(p.title, 'Test Product');
  assert.equal(p.handle, 'test-product');

  // Sanitized currency_code should be a lowercase string.
  assert.equal(p.variants[0].prices[0].currency_code, 'usd');

  // Inventory should not be present in Medusa create/update payload.
  assert.equal('inventory' in p.variants[0], false);
});


