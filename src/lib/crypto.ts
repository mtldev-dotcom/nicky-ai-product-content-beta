import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts a string using AES-256-GCM.
 * Returns a string format: iv:authTag:encryptedData
 */
export function encrypt(text: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export type DecryptOptions = {
  /**
   * Hybrid compatibility mode.
   *
   * - If true: allow legacy plaintext secrets (no ":" format) to pass through.
   * - If false: require encrypted format and throw otherwise.
   *
   * IMPORTANT: even when true, malformed encrypted strings (containing ":" but not
   * valid iv:authTag:ciphertext) are rejected and never treated as plaintext.
   */
  allowPlaintext?: boolean;
};

function isHex(s: string): boolean {
  return /^[0-9a-fA-F]+$/.test(s);
}

/**
 * Decrypts a string formatted as iv:authTag:encryptedData
 */
export function decrypt(encryptedText: string, options: DecryptOptions = {}): string {
  if (!encryptedText) return '';
  
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }

  const parts = encryptedText.split(':');

  // Legacy plaintext (no delimiters)
  if (parts.length === 1) {
    if (options.allowPlaintext) return encryptedText;
    throw new Error('Secret is not encrypted.');
  }

  // Anything with ":" must be a valid encrypted payload. Never treat malformed ciphertext as plaintext.
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format.');
  }

  const [ivHex, authTagHex, encryptedDataHex] = parts;

  // Validate lengths and hex encoding.
  // iv is 12 bytes => 24 hex chars
  if (!ivHex || ivHex.length !== IV_LENGTH * 2 || !isHex(ivHex)) {
    throw new Error('Invalid encrypted secret IV.');
  }
  // authTag is 16 bytes => 32 hex chars
  if (!authTagHex || authTagHex.length !== AUTH_TAG_LENGTH * 2 || !isHex(authTagHex)) {
    throw new Error('Invalid encrypted secret auth tag.');
  }
  // ciphertext hex must be non-empty and even length
  if (!encryptedDataHex || encryptedDataHex.length < 2 || encryptedDataHex.length % 2 !== 0 || !isHex(encryptedDataHex)) {
    throw new Error('Invalid encrypted secret ciphertext.');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

