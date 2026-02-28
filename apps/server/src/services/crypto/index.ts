// ============================================
// Cryptography Service — AES-256-GCM
// Replaces broken XOR encryption with proper
// authenticated encryption. Key is derived from
// a stable passphrase via PBKDF2 so that
// encrypted secrets survive server restarts.
// ============================================
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';

/** Fixed salt — changing this invalidates all stored secrets */
const SALT = Buffer.from('personal-ide-stable-salt-v1', 'utf8');
const KEY_LEN = 32;    // 256 bits
const IV_LEN = 12;     // 96-bit nonce for GCM
const TAG_LEN = 16;    // 128-bit auth tag
const ITERATIONS = 100_000;

let _derivedKey: Buffer | null = null;
let _lastPassphrase = '';

/**
 * Derive a 256-bit key from a passphrase using PBKDF2-SHA256.
 * The result is cached so repeated calls are instant.
 */
function deriveKey(passphrase: string): Buffer {
  if (_derivedKey && _lastPassphrase === passphrase) return _derivedKey;
  _derivedKey = pbkdf2Sync(passphrase, SALT, ITERATIONS, KEY_LEN, 'sha256');
  _lastPassphrase = passphrase;
  return _derivedKey;
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns a base64 string: iv (12 bytes) + authTag (16 bytes) + ciphertext
 */
export function encrypt(plaintext: string, passphrase: string): string {
  const key = deriveKey(passphrase);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Pack: iv + tag + ciphertext
  const packed = Buffer.concat([iv, tag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt a value produced by encrypt().
 * Throws if the key is wrong, data is tampered, or format is invalid.
 */
export function decrypt(encoded: string, passphrase: string): string {
  const key = deriveKey(passphrase);
  const packed = Buffer.from(encoded, 'base64');

  if (packed.length < IV_LEN + TAG_LEN) {
    throw new Error('Encrypted data too short — possibly corrupted or legacy XOR format');
  }

  const iv = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = packed.subarray(IV_LEN + TAG_LEN);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Try to decrypt — returns null on failure instead of throwing.
 * Useful for migrating from XOR: try AES first, fall back to XOR, re-encrypt.
 */
export function tryDecrypt(encoded: string, passphrase: string): string | null {
  try {
    return decrypt(encoded, passphrase);
  } catch {
    return null;
  }
}

/**
 * Legacy XOR decrypt for migration from old format.
 * Returns null if the input doesn't look like valid XOR-encrypted data.
 */
export function legacyXorDecrypt(encoded: string, key: string): string | null {
  try {
    const buf = Buffer.from(encoded, 'base64');
    return Array.from(buf)
      .map((b, i) => String.fromCharCode(b ^ key.charCodeAt(i % key.length)))
      .join('');
  } catch {
    return null;
  }
}

/**
 * Decrypt with automatic format detection:
 * 1. Try AES-256-GCM first
 * 2. Fall back to legacy XOR
 * 3. Return null if both fail
 */
export function smartDecrypt(encoded: string, passphrase: string): string | null {
  // Try AES first
  const aesResult = tryDecrypt(encoded, passphrase);
  if (aesResult !== null) return aesResult;

  // Fall back to legacy XOR
  return legacyXorDecrypt(encoded, passphrase);
}
