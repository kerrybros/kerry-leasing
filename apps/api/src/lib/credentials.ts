/**
 * CREDENTIAL ENCRYPTION
 * AES-256-GCM encryption for telematics API credentials stored in the database.
 * Key is loaded from CREDENTIALS_ENCRYPTION_KEY env var (32-byte hex string = 64 hex chars).
 *
 * Format on disk: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 *
 * Usage:
 *   const encrypted = encryptCredentials({ apiToken: '...' });
 *   const decrypted = decryptCredentials(encrypted); // returns original object
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;    // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;   // 128-bit auth tag
const KEY_HEX_REGEX = /^[0-9a-fA-F]{64}$/;

/**
 * Validate encryption key format and presence.
 * Throws with an actionable message when invalid.
 */
export function assertCredentialsEncryptionKeyConfigured(): void {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY env var is not set');
  }
  if (!KEY_HEX_REGEX.test(hex)) {
    throw new Error(
      'CREDENTIALS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)'
    );
  }
}

function getKey(): Buffer {
  assertCredentialsEncryptionKeyConfigured();
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY!;
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a credentials object to a storable string.
 */
export function encryptCredentials(credentials: Record<string, unknown>): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const plaintext = JSON.stringify(credentials);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a credentials string back to its original object.
 * Returns null if decryption fails (wrong key, corrupted data).
 */
export function decryptCredentials(stored: string): Record<string, unknown> | null {
  try {
    const parts = stored.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, authTagHex, ciphertextHex] = parts;
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Check whether a stored credentials value matches encrypted format.
 * Used by runtime reads and migration scripts.
 */
export function isEncrypted(stored: unknown): boolean {
  if (typeof stored !== 'string') return false;
  const parts = stored.split(':');
  return parts.length === 3 && parts[0].length === IV_LENGTH * 2;
}

/**
 * Read credentials from a provider account's credentialsJson field.
 * Strict mode: only encrypted-string format is accepted at runtime.
 * Throws if decryption fails so callers can surface the error cleanly.
 */
export function readCredentials(credentialsJson: unknown): Record<string, unknown> {
  if (isEncrypted(credentialsJson)) {
    const decrypted = decryptCredentials(credentialsJson as string);
    if (!decrypted) {
      throw new Error('Failed to decrypt credentials — check CREDENTIALS_ENCRYPTION_KEY');
    }
    return decrypted;
  }
  throw new Error('Credentials must be encrypted. Re-save telematics credentials in Admin > Telematics.');
}
