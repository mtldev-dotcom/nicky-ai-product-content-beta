import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeMedusaProductPayload } from '../src/lib/medusa/normalize-product-payload';

test('sanitizeMedusaProductPayload normalizes variants[].prices[].currency_code to string code', () => {
  type CurrencyLike =
    | string
    | {
        code: string;
        // Allow extra fields from Medusa currency objects (symbol, name, timestamps, etc.)
        [k: string]: unknown;
      }
    | undefined;

  type Price = { amount: number; currency_code?: CurrencyLike };
  type Variant = { title: string; prices: Price[] };
  type Payload = { title: string; variants: Variant[] };

  const input: Payload = {
    title: 'Test',
    variants: [
      {
        title: 'v1',
        prices: [
          { amount: 20, currency_code: { code: 'USD', name: 'US Dollar' } },
          { amount: 25, currency_code: 'CAD' },
          { amount: 30 }, // missing currency_code
        ],
      },
    ],
  };

  const out = sanitizeMedusaProductPayload(input);

  // Ensure output is sanitized
  const prices = out.variants[0].prices;
  assert.equal(prices[0].currency_code, 'usd');
  assert.equal(prices[1].currency_code, 'cad');
  assert.equal(prices[2].currency_code, 'usd');

  // Ensure we don't mutate the original input
  const originalPrices = input.variants[0].prices;
  assert.equal(typeof originalPrices[0].currency_code, 'object');
  assert.equal(originalPrices[1].currency_code, 'CAD');
});

test('sanitizeMedusaProductPayload is a no-op when variants is missing', () => {
  const input = { title: 'No variants' };
  const out = sanitizeMedusaProductPayload(input);
  assert.deepEqual(out, input);
});


