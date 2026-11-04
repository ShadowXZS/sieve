/**
 * Sieve Cryptographic Vault Storage Engine (Phase 8)
 *
 * Implements client-side encrypted backup archiving (.sievevault).
 * Enforces AES-GCM-256 encryption with keys derived via PBKDF2 (SHA-256, 100,000 iterations),
 * cryptographically random 16-byte salt, and 96-bit (12-byte) initialization vectors (IV).
 */

import {
  SieveDatabase,
  type IngestionSessionRecord,
  type PersistedExclusionRecord,
} from '../storage/db.ts';

export const VAULT_MAGIC_HEADER = 'SIEV_VAULT_V1';
export const PBKDF2_ITERATIONS = 100000;
const SALT_BYTE_LENGTH = 16;
const IV_BYTE_LENGTH = 12; // 96-bit initialization vector

export interface SieveVaultPayload {
  version: number;
  exportedAt: number;
  sessions: IngestionSessionRecord[];
  exclusions: PersistedExclusionRecord[];
  metadata?: {
    appVersion?: string;
    totalWasteRecovered?: number;
    platformCount?: number;
    [key: string]: any;
  };
}

/**
 * Derives an AES-GCM-256 key from a passphrase and salt using PBKDF2 (SHA-256, 100,000 iterations).
 */
async function deriveEncryptionKey(
  passphrase: string,
  salt: Uint8Array,
  usage: 'encrypt' | 'decrypt'
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passphraseBytes = enc.encode(passphrase);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passphraseBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

/**
 * Exports current IndexedDB state into a contiguous AES-GCM-256 encrypted binary buffer.
 */
export async function exportVaultToBuffer(
  db: SieveDatabase,
  passphrase: string,
  metadata?: Record<string, any>
): Promise<Uint8Array> {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters in length');
  }

  // 1. Fetch persistent state from IndexedDB
  const sessions = await db.sessions.toArray();
  const exclusions = await db.exclusions.toArray();

  const payload: SieveVaultPayload = {
    version: 1,
    exportedAt: Date.now(),
    sessions,
    exclusions,
    metadata,
  };

  const jsonString = JSON.stringify(payload);
  const plaintextBytes = new TextEncoder().encode(jsonString);

  // 2. Generate cryptographically random 16-byte salt and 12-byte IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));

  // 3. Derive key and encrypt payload
  const derivedKey = await deriveEncryptionKey(passphrase, salt, 'encrypt');
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    plaintextBytes
  );
  const ciphertext = new Uint8Array(ciphertextBuffer);

  // 4. Assemble container binary: [MAGIC_HEADER(13)] + [SALT(16)] + [IV(12)] + [CIPHERTEXT]
  const magicBytes = new TextEncoder().encode(VAULT_MAGIC_HEADER);
  const containerLength = magicBytes.byteLength + salt.byteLength + iv.byteLength + ciphertext.byteLength;
  const container = new Uint8Array(containerLength);

  let offset = 0;
  container.set(magicBytes, offset);
  offset += magicBytes.byteLength;

  container.set(salt, offset);
  offset += salt.byteLength;

  container.set(iv, offset);
  offset += iv.byteLength;

  container.set(ciphertext, offset);

  return container;
}

/**
 * Imports and restores an encrypted .sievevault binary buffer into IndexedDB.
 */
export async function importVaultFromBuffer(
  buffer: Uint8Array,
  passphrase: string,
  targetDb?: SieveDatabase
): Promise<SieveVaultPayload> {
  const magicLength = new TextEncoder().encode(VAULT_MAGIC_HEADER).byteLength;
  const minRequiredLength = magicLength + SALT_BYTE_LENGTH + IV_BYTE_LENGTH + 16; // 16 bytes minimum auth tag

  if (buffer.byteLength < minRequiredLength) {
    throw new Error('Corrupted or invalid vault buffer: insufficient length');
  }

  // 1. Verify magic header
  const headerBytes = buffer.slice(0, magicLength);
  const headerText = new TextDecoder().decode(headerBytes);
  if (headerText !== VAULT_MAGIC_HEADER) {
    throw new Error(`Invalid vault header identifier. Expected "${VAULT_MAGIC_HEADER}", got "${headerText}"`);
  }

  // 2. Extract salt, IV, and ciphertext
  let offset = magicLength;
  const salt = buffer.slice(offset, offset + SALT_BYTE_LENGTH);
  offset += SALT_BYTE_LENGTH;

  const iv = buffer.slice(offset, offset + IV_BYTE_LENGTH);
  offset += IV_BYTE_LENGTH;

  const ciphertext = buffer.slice(offset);

  // 3. Derive key and decrypt payload
  let plaintextBuffer: ArrayBuffer;
  try {
    const derivedKey = await deriveEncryptionKey(passphrase, salt, 'decrypt');
    plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      ciphertext
    );
  } catch (err: any) {
    throw new Error(
      'Authentication failed: Invalid passphrase or corrupted vault payload (GCM tag verification failure).'
    );
  }

  // 4. Parse decrypted JSON
  const jsonString = new TextDecoder().decode(plaintextBuffer);
  let payload: SieveVaultPayload;
  try {
    payload = JSON.parse(jsonString);
  } catch (err: any) {
    throw new Error('Corrupted vault payload: invalid JSON structure post-decryption');
  }

  // 5. Restore into IndexedDB if target database provided
  if (targetDb) {
    await targetDb.transaction('rw', [targetDb.sessions, targetDb.exclusions], async () => {
      if (payload.sessions && payload.sessions.length > 0) {
        await targetDb.sessions.bulkPut(payload.sessions);
      }
      if (payload.exclusions && payload.exclusions.length > 0) {
        await targetDb.exclusions.bulkPut(payload.exclusions);
      }
    });
  }

  return payload;
}

