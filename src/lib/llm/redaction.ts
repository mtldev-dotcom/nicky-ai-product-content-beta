/**
 * Redaction utility for masking sensitive information before storing in logs.
 * 
 * This is a generic platform capability - no feature-specific dependencies.
 * Used by all logging functions to ensure secrets never reach the database.
 */

/**
 * Redacts API keys, tokens, emails, and other sensitive patterns.
 * Uses consistent format: *****REDACTED*****
 */
export function redactSecrets(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let redacted = text;

  // Common header-style secrets (authorization / api keys)
  // Examples:
  // - Authorization: Bearer <token>
  // - x-api-key: <token>
  redacted = redacted.replace(
    /\b(authorization|x-api-key|api-key|x-auth-token|x-access-token)\s*:\s*([^\s\r\n]+)/gi,
    (_match, headerName) => `${headerName}: *****REDACTED*****`
  );

  // API keys: sk-... (OpenAI), AIza... (Google), etc.
  redacted = redacted.replace(/sk-[a-zA-Z0-9]{32,}/g, '*****REDACTED*****');
  redacted = redacted.replace(/AIza[0-9A-Za-z_-]{35}/g, '*****REDACTED*****');

  // Supabase publishable keys (modern format)
  redacted = redacted.replace(/sb_publishable_[a-zA-Z0-9]+/g, '*****REDACTED*****');
  
  // JWT tokens: eyJ...
  redacted = redacted.replace(/eyJ[a-zA-Z0-9_-]+\./g, '*****REDACTED*****');
  
  // Bearer tokens
  redacted = redacted.replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, 'Bearer *****REDACTED*****');
  
  // AWS access keys: AKIA...
  redacted = redacted.replace(/AKIA[0-9A-Z]{16}/g, '*****REDACTED*****');

  // Common secret assignments in text blobs (best-effort)
  // Examples: "OPENAI_API_KEY=...", "S3_SECRET_ACCESS_KEY: ...", "password=..."
  redacted = redacted.replace(
    /\b(openai_api_key|supabase_anon_key|supabase_service_role_key|s3_secret_access_key|s3_access_key_id|r2_secret_access_key|password|secret|token)\b\s*[:=]\s*([^\s\r\n]+)/gi,
    (_match, keyName) => `${keyName}=*****REDACTED*****`
  );
  
  // Email addresses (if not necessary for context - be conservative)
  // Only redact if it looks like it might be in a credential context
  redacted = redacted.replace(/(?:api[_-]?key|token|secret|password|credential)[\s:=]+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, 
    (match) => match.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, '*****REDACTED*****'));
  
  // Generic long alphanumeric strings that might be tokens (40+ chars)
  // But be careful not to redact normal text - only if it looks token-like
  redacted = redacted.replace(/\b[a-zA-Z0-9_-]{40,}\b/g, (match) => {
    // Don't redact if it contains spaces or looks like normal text
    if (match.includes(' ') || /[a-z]{3,}[A-Z]/.test(match)) return match;
    return '*****REDACTED*****';
  });

  return redacted;
}

/**
 * Safely truncates text to a maximum byte length, preserving UTF-8 characters.
 * Adds ellipsis if truncated.
 */
export function truncateSafe(text: string, maxBytes: number): string {
  if (!text || typeof text !== 'string') return text;
  
  // Convert to buffer to check byte length
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  
  if (bytes.length <= maxBytes) return text;
  
  // Truncate byte-by-byte, then decode to ensure valid UTF-8
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let truncated = bytes.slice(0, maxBytes - 3); // Reserve 3 bytes for ellipsis
  
  // Try to decode, if it fails, remove last byte and retry (handles multi-byte chars)
  let decoded = decoder.decode(truncated);
  while (decoded === '' && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
    decoded = decoder.decode(truncated);
  }
  
  return decoded + '...';
}

/**
 * Applies both redaction and truncation to content.
 * This is the main function to use before storing any content in logs.
 */
export function minimizeContent(content: string, maxBytes: number): string {
  if (!content || typeof content !== 'string') return content || '';
  
  // First redact secrets
  const redacted = redactSecrets(content);
  
  // Then truncate
  return truncateSafe(redacted, maxBytes);
}

