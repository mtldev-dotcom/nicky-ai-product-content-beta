import test from 'node:test';
import assert from 'node:assert/strict';

import { assertPdfNotSupported } from '@/lib/ingest/pdf-policy';

test('PDF policy: rejects files marked as pdf', () => {
    assert.throws(
        () =>
            assertPdfNotSupported([
                { id: '1', type: 'pdf', mime: 'application/pdf', url: 'https://example.com/a.pdf' },
            ]),
        /PDF files are not supported yet/
    );
});

test('PDF policy: allows non-pdf files', () => {
    assert.doesNotThrow(() =>
        assertPdfNotSupported([
            { id: '1', type: 'json', mime: 'application/json', url: 'https://example.com/a.json' },
            { id: '2', type: 'image', mime: 'image/png', url: 'https://example.com/a.png' },
        ])
    );
});


