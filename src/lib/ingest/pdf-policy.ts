import type { IngestFile } from '@/lib/api-schemas';

/**
 * PDF policy (Phase 1.3):
 * - PDFs are explicitly NOT supported yet.
 * - We reject early with a clear error message so the UI and backend stay aligned.
 *
 * Preconditions:
 * - `files` is the parsed request `files` array from `IngestRequestSchema`.
 *
 * Postconditions:
 * - Throws `Error("PDF files are not supported yet")` if a PDF is present.
 */
export function assertPdfNotSupported(files: IngestFile[]): void {
  const hasPdf =
    files.some((f) => f.type === 'pdf') ||
    files.some((f) => f.mime.toLowerCase().includes('pdf')) ||
    files.some((f) => f.url.toLowerCase().includes('.pdf'));

  if (hasPdf) {
    throw new Error('PDF files are not supported yet');
  }
}


