/**
 * Unit tests for preview layout normalization.
 *
 * Goal:
 * - Ensure org-stored layout JSON never crashes the UI
 * - Ensure all known cards end up in exactly one bucket
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreviewLayout } from '../src/lib/preview-layout';

type CardId = 'a' | 'b' | 'c';

describe('normalizePreviewLayout', () => {
  const ALL: readonly CardId[] = ['a', 'b', 'c'] as const;

  it('should produce a complete layout even when raw is null', () => {
    const layout = normalizePreviewLayout<CardId>(null, ALL);
    const allBuckets = [...layout.main, ...layout.sidebar, ...layout.hidden];
    assert.equal(new Set(allBuckets).size, 3);
    assert.deepEqual(new Set(allBuckets), new Set(ALL));
    assert.equal(layout.version, 1);
    assert.equal(layout.cardSettings.a.size, 'md');
  });

  it('should drop unknown cards and dedupe duplicates', () => {
    const raw = {
      version: 1,
      main: ['a', 'a', 'x'],
      sidebar: ['b', 'a'],
      hidden: ['c', 'b'],
      cardSettings: {
        a: { size: 'lg' },
        x: { size: 'sm' },
      },
    };

    const layout = normalizePreviewLayout<CardId>(raw, ALL);
    const allBuckets = [...layout.main, ...layout.sidebar, ...layout.hidden];
    assert.equal(new Set(allBuckets).size, 3);
    assert.deepEqual(new Set(allBuckets), new Set(ALL));
    assert.equal(layout.cardSettings.a.size, 'lg');
    assert.equal(layout.cardSettings.b.size, 'md');
    assert.equal(layout.cardSettings.c.size, 'md');
  });

  it('should coerce invalid sizes to md', () => {
    const raw = {
      version: 1,
      main: ['a'],
      sidebar: ['b'],
      hidden: ['c'],
      cardSettings: {
        a: { size: 'xxl' },
      },
    };

    const layout = normalizePreviewLayout<CardId>(raw, ALL);
    assert.equal(layout.cardSettings.a.size, 'md');
  });
});

