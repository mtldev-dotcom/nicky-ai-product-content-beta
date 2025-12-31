import test from 'node:test';
import assert from 'node:assert/strict';

import { mapMedusaProductToLocalSavePayload } from '../src/lib/medusa/map-medusa-product-to-local';

test('mapMedusaProductToLocalSavePayload stores raw snapshot and uses medusa_product_id only when keepLinked=true', () => {
  const medusaProduct = {
    id: 'prod_123',
    title: 'Medusa T-Shirt',
    handle: 'medusa-t-shirt',
    subtitle: 'Sub',
    description: 'Desc',
    status: 'published',
    thumbnail: 'https://example.com/thumb.jpg',
    images: [{ url: 'https://example.com/1.jpg' }],
    options: [{ title: 'Size', values: ['S', 'M'] }],
    variants: [{ title: 'Default', sku: 'SKU-1', manage_inventory: true, prices: [{ amount: 2999, currency_code: 'usd' }] }],
    tags: [{ value: 'apparel' }],
    categories: [{ id: 'cat_1' }],
    type_id: 'pt_1',
    collection_id: 'pc_1',
    weight: 10,
    length: 1,
    width: 2,
    height: 3,
  };

  const copied = mapMedusaProductToLocalSavePayload({ medusaProduct, keepLinked: true });
  const copiedData = copied.data as any;
  assert.equal(copied.title, 'Medusa T-Shirt');
  assert.equal(copied.handle, 'medusa-t-shirt');
  assert.equal(copied.status, 'draft'); // imported as draft by design
  assert.equal(copiedData.medusa_product_id, 'prod_123');
  assert.equal(copiedData.medusa_source_id, undefined);
  assert.ok(copiedData.medusa_raw);

  const moved = mapMedusaProductToLocalSavePayload({ medusaProduct, keepLinked: false });
  const movedData = moved.data as any;
  assert.equal(movedData.medusa_product_id, undefined);
  assert.equal(movedData.medusa_source_id, 'prod_123');
  assert.equal(movedData.medusa_deleted_from_source, true);
});


