/**
 * Sieve Cryptographic Utilities
 *
 * Centralized, deterministic Web Crypto API helpers for SHA-256 calculation,
 * deterministic JSON canonicalization, and hex encoding.
 */

/**
 * Recursively sorts keys of an object to ensure deterministic canonical JSON serialization.
 */
export function sortKeysRecursively<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortKeysRecursively) as unknown as T;
  }
  const sorted: Record<string, unknown> = {};
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  for (const k of keys) {
    sorted[k] = sortKeysRecursively(record[k]);
  }
  return sorted as unknown as T;
}

/**
 * Computes a deterministic SHA-256 hex digest of a string or byte array using Web Crypto API.
 */
export async function computeSha256(data: string | Uint8Array): Promise<string> {
  const enc = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digestBuffer = await crypto.subtle.digest('SHA-256', enc as unknown as BufferSource);
  const hashArray = Array.from(new Uint8Array(digestBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes canonical SHA-256 hash from any arbitrary JavaScript object.
 */
export async function computeObjectHash(obj: unknown): Promise<string> {
  const canonical = sortKeysRecursively(obj);
  const json = JSON.stringify(canonical);
  return computeSha256(json);
}

