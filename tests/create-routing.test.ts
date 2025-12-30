/**
 * Unit tests for create flow routing logic (fast vs ingest path determination)
 */

import { describe, it, expect } from 'node:test';

// Replicate the routing logic from create page
type FileItem = {
  id: string;
  mimeType?: string;
  file?: { type: string };
};

type GenerationMode = 'fast' | 'ingest' | null;

function determineGenerationMode(
  prompt: string,
  images: FileItem[],
  urls: string[],
  textBlocks: string[],
  files: FileItem[]
): GenerationMode {
  const hasPrompt = prompt.trim().length > 0;
  const hasImages = images.length > 0;
  const hasUrls = urls.some(u => u.trim().length > 0);
  const hasTextBlocks = textBlocks.some(b => b.trim().length > 0);
  const hasFiles = files.length > 0;

  // Fast path: prompt + 0-1 image only
  if (hasPrompt && !hasUrls && !hasTextBlocks && !hasFiles && images.length <= 1) {
    return 'fast';
  }

  // Ingest path: any mixed sources, URLs, multiple images, or files
  if (hasUrls || hasTextBlocks || hasFiles || images.length > 1) {
    return 'ingest';
  }

  // Edge case: only prompt (no image) -> fast path
  if (hasPrompt && !hasImages) {
    return 'fast';
  }

  // Edge case: only 1 image (no prompt) -> fast path
  if (hasImages && images.length === 1 && !hasPrompt) {
    return 'fast';
  }

  return null;
}

describe('Create Routing Logic', () => {
  describe('Fast Path (prompt + 0-1 image)', () => {
    it('should route to fast path with prompt only', () => {
      const mode = determineGenerationMode(
        'A minimalist wallet',
        [],
        [],
        [],
        []
      );
      expect(mode).toBe('fast');
    });

    it('should route to fast path with prompt + 1 image', () => {
      const mode = determineGenerationMode(
        'A minimalist wallet',
        [{ id: '1', mimeType: 'image/jpeg' }],
        [],
        [],
        []
      );
      expect(mode).toBe('fast');
    });

    it('should route to fast path with 1 image only (no prompt)', () => {
      const mode = determineGenerationMode(
        '',
        [{ id: '1', mimeType: 'image/jpeg' }],
        [],
        [],
        []
      );
      expect(mode).toBe('fast');
    });
  });

  describe('Ingest Path (mixed sources)', () => {
    it('should route to ingest path with URLs', () => {
      const mode = determineGenerationMode(
        'A product',
        [],
        ['https://example.com/product'],
        [],
        []
      );
      expect(mode).toBe('ingest');
    });

    it('should route to ingest path with text blocks', () => {
      const mode = determineGenerationMode(
        '',
        [],
        [],
        ['Product description here'],
        []
      );
      expect(mode).toBe('ingest');
    });

    it('should route to ingest path with files', () => {
      const mode = determineGenerationMode(
        '',
        [],
        [],
        [],
        [{ id: '1', mimeType: 'text/csv' }]
      );
      expect(mode).toBe('ingest');
    });

    it('should route to ingest path with multiple images', () => {
      const mode = determineGenerationMode(
        'A product',
        [
          { id: '1', mimeType: 'image/jpeg' },
          { id: '2', mimeType: 'image/png' }
        ],
        [],
        [],
        []
      );
      expect(mode).toBe('ingest');
    });

    it('should route to ingest path with prompt + URLs', () => {
      const mode = determineGenerationMode(
        'A product',
        [],
        ['https://example.com'],
        [],
        []
      );
      expect(mode).toBe('ingest');
    });

    it('should route to ingest path with prompt + text blocks', () => {
      const mode = determineGenerationMode(
        'A product',
        [],
        [],
        ['Additional notes'],
        []
      );
      expect(mode).toBe('ingest');
    });

    it('should route to ingest path with prompt + files', () => {
      const mode = determineGenerationMode(
        'A product',
        [],
        [],
        [],
        [{ id: '1', mimeType: 'application/json' }]
      );
      expect(mode).toBe('ingest');
    });
  });

  describe('Edge Cases', () => {
    it('should return null for empty inputs', () => {
      const mode = determineGenerationMode('', [], [], [], []);
      expect(mode).toBeNull();
    });

    it('should handle whitespace-only prompt as empty', () => {
      const mode = determineGenerationMode('   ', [], [], [], []);
      expect(mode).toBeNull();
    });

    it('should ignore empty URLs in array', () => {
      const mode = determineGenerationMode(
        'A product',
        [],
        ['', '   '],
        [],
        []
      );
      expect(mode).toBe('fast');
    });

    it('should ignore empty text blocks in array', () => {
      const mode = determineGenerationMode(
        'A product',
        [],
        [],
        ['', '   '],
        []
      );
      expect(mode).toBe('fast');
    });
  });
});

