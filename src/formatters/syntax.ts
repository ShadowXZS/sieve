/**
 * Platform Syntax Normalizer (Phase 5)
 *
 * Implements strict sanitization and validation routines adhering to platform-specific
 * API and Editor schemas for Amazon PPC Advertising and Google Ads Editor.
 */

export interface AmazonNormalizationResult {
  isValid: boolean;
  normalizedText: string;
  matchType: 'Negative Exact' | 'Negative Phrase';
  errors: string[];
  wordCount: number;
  charCount: number;
}

export interface GoogleAdsNormalizationResult {
  keywordText: string;
  criterionType: 'Negative Exact' | 'Negative Phrase' | 'Negative Broad';
  formattedText: string;
}

/**
 * Normalizes and validates a negative keyword term for Amazon PPC Advertising.
 *
 * Amazon PPC Constraints:
 * 1. Maximum 10 words per negative term.
 * 2. Maximum 80 characters in length.
 * 3. Only alphanumeric characters, hyphens, spaces, and apostrophes are allowed.
 *    Strictly strips brackets [], quotes "", pluses +, asterisks *, and punctuation.
 * 4. Match type support: Only 'Negative Exact' and 'Negative Phrase' (Broad negatives unsupported).
 */
export function normalizeAmazonKeyword(
  rawKeyword: string,
  matchType: 'exact' | 'phrase' | 'broad' = 'phrase'
): AmazonNormalizationResult {
  const errors: string[] = [];

  // Strip brackets, quotes, pluses, asterisks, punctuation, and illegal symbols
  let cleaned = rawKeyword
    .replace(/[\[\]"'+*!?@#$%^&_={}|;:<>,\/?~\\`]/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned ? cleaned.split(/\s+/) : [];
  const wordCount = words.length;
  const charCount = cleaned.length;

  // Validate constraints
  if (wordCount === 0) {
    errors.push('Keyword cannot be empty after sanitization');
  }

  if (wordCount > 10) {
    errors.push(`Exceeds Amazon maximum limit of 10 words (found ${wordCount})`);
  }

  if (charCount > 80) {
    errors.push(`Exceeds Amazon maximum limit of 80 characters (found ${charCount})`);
  }

  // Amazon PPC only supports Negative Exact and Negative Phrase
  let amazonMatchType: 'Negative Exact' | 'Negative Phrase';
  if (matchType === 'exact') {
    amazonMatchType = 'Negative Exact';
  } else {
    // Coerce 'broad' or default to 'Negative Phrase'
    amazonMatchType = 'Negative Phrase';
  }

  return {
    isValid: errors.length === 0,
    normalizedText: cleaned,
    matchType: amazonMatchType,
    errors,
    wordCount,
    charCount,
  };
}

/**
 * Normalizes a negative keyword for Google Ads Editor bulk paste.
 * Strips formatting brackets/quotes from keyword text (as Criterion Type determines match type)
 * and sanitizes tabs/newlines to prevent TSV/CSV column disruption.
 */
export function normalizeGoogleAdsKeyword(
  rawKeyword: string,
  matchType: 'exact' | 'phrase' | 'broad' = 'broad',
  hasCollision: boolean = false
): GoogleAdsNormalizationResult {
  // Strip enclosing brackets or quotes
  let cleaned = rawKeyword
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/^"(.*)"$/, '$1')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();

  // If collision detected, safety guard strictly overrides match type to exact
  const effectiveMatchType = hasCollision ? 'exact' : matchType;

  let criterionType: 'Negative Exact' | 'Negative Phrase' | 'Negative Broad';
  let formattedText: string;

  switch (effectiveMatchType) {
    case 'exact':
      criterionType = 'Negative Exact';
      formattedText = `[${cleaned}]`;
      break;
    case 'phrase':
      criterionType = 'Negative Phrase';
      formattedText = `"${cleaned}"`;
      break;
    case 'broad':
    default:
      criterionType = 'Negative Broad';
      formattedText = cleaned;
      break;
  }

  return {
    keywordText: cleaned,
    criterionType,
    formattedText,
  };
}

