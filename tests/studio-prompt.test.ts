/**
 * Unit tests for AI Studio prompt builder.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildStudioPrompt } from '../src/lib/ai/studioPrompt';

describe('AI Studio Prompt Builder', () => {
  it('should include preserve-identity rule and no-watermark rule', () => {
    const { promptText } = buildStudioPrompt({
      setupId: 'ring_setup_01_concrete_pedestal',
      modelId: 'none',
      options: {
        macro: false,
        noFingerprints: false,
        extraRimLight: false,
        darkness: 50,
      },
    });

    assert.match(promptText, /PRESERVE JEWELRY IDENTITY/i);
    assert.match(promptText, /no text/i);
    assert.match(promptText, /no watermark/i);
  });

  it('should include setup + model prompts', () => {
    const { promptText } = buildStudioPrompt({
      setupId: 'pendant_setup_01_suspended_hero',
      modelId: 'model_01_minimalist',
      options: {
        macro: false,
        noFingerprints: false,
        extraRimLight: false,
        darkness: 40,
      },
    });

    assert.match(promptText, /Men’s pendant hanging/i);
    assert.match(promptText, /Male fashion model/i);
  });

  it('should reflect toggle modifiers', () => {
    const { promptText } = buildStudioPrompt({
      setupId: 'chain_setup_01_vertical_drop',
      modelId: 'none',
      options: {
        macro: true,
        noFingerprints: true,
        extraRimLight: true,
        darkness: 80,
      },
    });

    assert.match(promptText, /macro close-up/i);
    assert.match(promptText, /no reflections, no fingerprints/i);
    assert.match(promptText, /extra rim light/i);
    assert.match(promptText, /80\/100/);
  });

  it('should throw on invalid setup or model ids', () => {
    assert.throws(() =>
      buildStudioPrompt({
        setupId: 'not-a-real-setup',
        modelId: 'none',
        options: { macro: false, noFingerprints: false, extraRimLight: false, darkness: 50 },
      })
    );

    assert.throws(() =>
      buildStudioPrompt({
        setupId: 'ring_setup_01_concrete_pedestal',
        modelId: 'not-a-real-model',
        options: { macro: false, noFingerprints: false, extraRimLight: false, darkness: 50 },
      })
    );
  });
});


