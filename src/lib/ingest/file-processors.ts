/**
 * File processing utilities for various file types.
 * 
 * Handles parsing of CSV, JSON, PDF, images, and text files.
 */

/**
 * Processes a CSV file and returns parsed data.
 * Attempts to detect headers automatically.
 */
export async function processCSV(content: string): Promise<{
  headers: string[];
  rows: string[][];
}> {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  
  // Try to detect if first line is headers (contains text, not just numbers)
  const firstLine = lines[0].split(',').map(cell => cell.trim());
  const secondLine = lines[1]?.split(',').map(cell => cell.trim()) || [];
  
  // Heuristic: if first line has more text-like cells, it's probably headers
  const firstLineTextRatio = firstLine.filter(cell => /[a-zA-Z]/.test(cell)).length / firstLine.length;
  const secondLineTextRatio = secondLine.filter(cell => /[a-zA-Z]/.test(cell)).length / secondLine.length;
  
  let headers: string[];
  let dataRows: string[];
  
  if (firstLineTextRatio > 0.5 && firstLineTextRatio > secondLineTextRatio) {
    // First line is headers
    headers = firstLine;
    dataRows = lines.slice(1);
  } else {
    // No headers detected, use generic names
    const colCount = firstLine.length;
    headers = Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`);
    dataRows = lines;
  }
  
  const rows = dataRows.map(line => 
    line.split(',').map(cell => cell.trim())
  );
  
  return { headers, rows };
}

/**
 * Processes a JSON file and returns parsed data.
 * Validates that it's valid JSON.
 */
export async function processJSON(content: string): Promise<unknown> {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Processes a PDF file.
 * Note: Full PDF parsing requires a library like pdf-parse.
 * For now, this is a placeholder that would need external dependency.
 */
export async function processPDF(content: Buffer): Promise<string> {
  // TODO: Implement PDF text extraction
  // Would require: npm install pdf-parse
  // For now, return empty string
  throw new Error('PDF processing not yet implemented. Requires pdf-parse library.');
}

/**
 * Processes plain text.
 * Returns the text as-is (extraction happens in extractor).
 */
export async function processText(content: string): Promise<string> {
  return content;
}

/**
 * Determines file type from MIME type or extension.
 */
export function detectFileType(mime: string | undefined, filename?: string): 'csv' | 'json' | 'pdf' | 'image' | 'text' | 'other' {
  // If mime is provided, use it first
  if (mime && typeof mime === 'string') {
    const mimeLower = mime.toLowerCase();
    
    if (mimeLower.includes('csv') || mimeLower === 'text/csv') return 'csv';
    if (mimeLower.includes('json') || mimeLower === 'application/json') return 'json';
    if (mimeLower.includes('pdf') || mimeLower === 'application/pdf') return 'pdf';
    if (mimeLower.startsWith('image/')) return 'image';
    if (mimeLower.startsWith('text/')) return 'text';
  }
  
  // Fallback to extension from filename or URL
  if (filename && typeof filename === 'string') {
    // Extract filename from URL if it's a full URL
    let actualFilename = filename;
    try {
      const url = new URL(filename);
      actualFilename = url.pathname.split('/').pop() || filename;
    } catch {
      // Not a URL, use as-is
    }
    
    if (actualFilename) {
      const ext = actualFilename.toLowerCase().split('.').pop();
      if (ext === 'csv') return 'csv';
      if (ext === 'json') return 'json';
      if (ext === 'pdf') return 'pdf';
      if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) return 'image';
      if (ext === 'txt') return 'text';
    }
  }
  
  return 'other';
}

