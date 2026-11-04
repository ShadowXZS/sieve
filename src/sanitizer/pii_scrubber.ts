/**
 * Sieve Client-Side PII Scrubber (Phase 14 Sanitizer Facade)
 *
 * Provides a clean adapter over the core cryptographic PII scrubber in `src/crypto/pii_scrubber.ts`.
 * Eliminates duplicate regex definitions and ensures 100% DRY compliance.
 */

import {
  type PiiType,
  isValidLuhn,
  findPiiMatches,
  type RawMatch,
} from '../crypto/pii_scrubber.ts';

export type PIIType = PiiType;

export interface PIIScrubberOptions {
  placeholder?: string | ((type: PIIType, value?: string) => string);
  types?: PIIType[];
}

export interface PIIMatch {
  type: PIIType;
  value: string;
  startIndex: number;
  endIndex: number;
}

export interface PIIScrubResult {
  text: string;
  hasPII: boolean;
  redactedCount: number;
  types: PIIType[];
  matches: PIIMatch[];
}

export interface BatchScrubResult {
  scrubbed: string[];
  totalRedactions: number;
  hasPII: boolean;
}

export { isValidLuhn };

function resolvePlaceholder(
  type: PIIType,
  val: string,
  placeholder?: string | ((type: PIIType, value?: string) => string)
): string {
  if (typeof placeholder === 'function') {
    return placeholder(type, val);
  }
  if (typeof placeholder === 'string') {
    return placeholder;
  }
  return '[REDACTED]';
}

/**
 * Scrubs Personally Identifiable Information from text with customizable placeholder.
 */
export function scrubPII(text: string, options: PIIScrubberOptions = {}): PIIScrubResult {
  if (!text || typeof text !== 'string') {
    return {
      text: text || '',
      hasPII: false,
      redactedCount: 0,
      types: [],
      matches: [],
    };
  }

  const allowedTypes = new Set<PIIType>(
    options.types || ['email', 'phone', 'credit_card', 'ssn', 'ip', 'secret', 'address']
  );

  const rawMatches: RawMatch[] = findPiiMatches(text, allowedTypes);

  if (rawMatches.length === 0) {
    return {
      text,
      hasPII: false,
      redactedCount: 0,
      types: [],
      matches: [],
    };
  }

  let result = '';
  let cursor = 0;
  const typesFound = new Set<PIIType>();
  const matches: PIIMatch[] = [];

  for (const m of rawMatches) {
    result += text.slice(cursor, m.startIndex);
    const replacement = resolvePlaceholder(m.type, m.value, options.placeholder);
    result += replacement;
    typesFound.add(m.type);
    matches.push({
      type: m.type,
      value: m.value,
      startIndex: m.startIndex,
      endIndex: m.endIndex,
    });
    cursor = m.endIndex;
  }
  result += text.slice(cursor);

  return {
    text: result,
    hasPII: true,
    redactedCount: rawMatches.length,
    types: Array.from(typesFound),
    matches,
  };
}

/**
 * Batch scrubs an array of search query strings.
 */
export function scrubSearchTerms(
  terms: string[],
  options: PIIScrubberOptions = {}
): BatchScrubResult {
  let totalRedactions = 0;
  let hasPII = false;

  const scrubbed = terms.map((term) => {
    const res = scrubPII(term, options);
    if (res.hasPII) {
      hasPII = true;
      totalRedactions += res.redactedCount;
    }
    return res.text;
  });

  return {
    scrubbed,
    totalRedactions,
    hasPII,
  };
}
