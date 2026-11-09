/**
 * Sieve Binary Hash Packer & Hex Lookup
 * Provides high-speed byte lookup table and hash packing into contiguous Uint8Arrays.
 * Physical line ceiling: <= 250 lines.
 */

export const LOOKUP_PAIR = new Uint8Array(65536);
const hexDigits = '0123456789abcdef';
for (let i = 0; i < 16; i++) {
  for (let j = 0; j < 16; j++) {
    const val = (i << 4) | j;
    const c1 = hexDigits.charCodeAt(i);
    const c2 = hexDigits.charCodeAt(j);
    LOOKUP_PAIR[(c1 << 8) | c2] = val;
    const c1U = hexDigits.toUpperCase().charCodeAt(i);
    const c2U = hexDigits.toUpperCase().charCodeAt(j);
    LOOKUP_PAIR[(c1U << 8) | c2U] = val;
    LOOKUP_PAIR[(c1U << 8) | c2] = val;
    LOOKUP_PAIR[(c1 << 8) | c2U] = val;
  }
}

/**
 * Computes deterministic SHA-256 hash using Web Crypto API.
 * Normalizes keyword (trimmed, lowercase), match type, and campaign scope.
 */
export async function computeKeywordHash(
  keyword: string,
  matchType: string,
  campaignId?: string
): Promise<string> {
  const normKeyword = keyword.trim().toLowerCase();
  const normMatchType = matchType.trim().toLowerCase();
  const normCampaign = campaignId ? campaignId.trim() : '';
  const raw = `${normKeyword}|${normMatchType}|${normCampaign}`;

  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(raw));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Packs deterministic 32-byte hexadecimal hashes into a contiguous binary Uint8Array buffer.
 */
export function packHashesToBuffer(hashes: string[]): Uint8Array {
  const count = hashes.length;
  const buffer = new Uint8Array(count * 32);

  for (let i = 0; i < count; i++) {
    const h = hashes[i];
    const offset = i * 32;
    for (let j = 0; j < 32; j++) {
      const idx = j * 2;
      buffer[offset + j] = LOOKUP_PAIR[(h.charCodeAt(idx) << 8) | h.charCodeAt(idx + 1)];
    }
  }

  return buffer;
}
