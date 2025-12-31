/**
 * Unit tests for StudioGenerateRequestSchema validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { StudioGenerateRequestSchema } from '../src/lib/api-schemas';

describe('StudioGenerateRequestSchema', () => {
  it('should accept a valid payload', () => {
    const parsed = StudioGenerateRequestSchema.parse({
      productId: '00000000-0000-0000-0000-000000000000',
      inputImages: [{ id: 'img-1', url: 'https://example.com/a.png' }],
      jewelryType: 'ring',
      setupId: 'ring_setup_01_concrete_pedestal',
      modelId: 'none',
      options: { macro: false, noFingerprints: true, extraRimLight: false, darkness: 50 },
      variants: 1,
      provider: 'gemini',
      providerModel: 'models/gemini-3-pro-image-preview',
    });

    assert.equal(parsed.productId, '00000000-0000-0000-0000-000000000000');
    assert.equal(parsed.variants, 1);
  });

  it('should reject variants > 4', () => {
    assert.throws(() =>
      StudioGenerateRequestSchema.parse({
        productId: '00000000-0000-0000-0000-000000000000',
        inputImages: [{ id: 'img-1', url: 'https://example.com/a.png' }],
        jewelryType: 'ring',
        setupId: 'ring_setup_01_concrete_pedestal',
        modelId: 'none',
        options: { macro: false, noFingerprints: true, extraRimLight: false, darkness: 50 },
        variants: 10,
      })
    );
  });

  it('should reject missing inputImages', () => {
    assert.throws(() =>
      StudioGenerateRequestSchema.parse({
        productId: '00000000-0000-0000-0000-000000000000',
        inputImages: [],
        jewelryType: 'ring',
        setupId: 'ring_setup_01_concrete_pedestal',
        modelId: 'none',
        options: { macro: false, noFingerprints: true, extraRimLight: false, darkness: 50 },
        variants: 1,
      })
    );
  });
});


