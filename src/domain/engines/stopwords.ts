/**
 * SIEVE Domain Core: Syntactic Stopwords & Fast Bitmap Lookup
 *
 * Immutable dictionary and bitset mask of English prepositions, conjunctions,
 * and articles that cannot serve as isolated root exclusion tokens.
 * Operating constraint: <= 200 lines, zero external dependencies.
 */

/**
 * Immutable hash set of English prepositions, conjunctions, and articles.
 */
export const SYNTACTIC_STOPWORDS: ReadonlySet<string> = Object.freeze(
  new Set([
    // Articles
    'a', 'an', 'the',
    // Coordinating & subordinating conjunctions
    'and', 'or', 'but', 'nor', 'so', 'yet', 'for', 'both', 'either',
    'neither', 'although', 'because', 'since', 'unless', 'while', 'whereas',
    'as', 'if', 'than', 'whether', 'though', 'even',
    // Prepositions
    'about', 'above', 'across', 'after', 'against', 'along', 'among',
    'around', 'at', 'before', 'behind', 'below', 'beneath', 'beside',
    'between', 'beyond', 'by', 'despite', 'down', 'during', 'except',
    'from', 'in', 'inside', 'into', 'near', 'of', 'off', 'on', 'onto',
    'out', 'outside', 'over', 'past', 'round', 'through', 'throughout',
    'till', 'to', 'toward', 'towards', 'under', 'underneath', 'until',
    'unto', 'up', 'upon', 'with', 'within', 'without', 'via',
  ])
);

/**
 * Bitset size for fast hash bitmap pre-filtering (512 bits / 16 x 32-bit words).
 */
const BITMAP_SIZE = 512;
const BITMAP_WORDS = BITMAP_SIZE >>> 5;
const STOPWORD_BITMAP = new Uint32Array(BITMAP_WORDS);

/**
 * 32-bit FNV-1a hash algorithm for deterministic token bitset indexing.
 */
function hashToken(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % BITMAP_SIZE;
}

// Populate the bitmap lookup during module evaluation
for (const word of SYNTACTIC_STOPWORDS) {
  const bit = hashToken(word);
  STOPWORD_BITMAP[bit >>> 5] |= 1 << (bit & 31);
}

/**
 * Evaluates whether a token is an English syntactic stopword using
 * a fast bitmap pre-check followed by set verification.
 */
export function isSyntacticStopword(token: string): boolean {
  const normalized = token.trim().toLowerCase();
  if (normalized.length === 0) {
    return false;
  }
  const bit = hashToken(normalized);
  if ((STOPWORD_BITMAP[bit >>> 5] & (1 << (bit & 31))) === 0) {
    return false;
  }
  return SYNTACTIC_STOPWORDS.has(normalized);
}
