/**
 * Sieve Client-Side PII Scrubber (Phase 14 - Privacy Attestation & Release Hardening)
 *
 * Provides high-performance, deterministic redaction of Personally Identifiable
 * Information (PII) from PPC search term reports prior to export or presentation.
 * Physical line ceiling: <= 250 lines.
 */

import {
  type PiiType,
  type RedactionMode,
  type PiiMatchDetail,
  type RawMatch,
  isValidLuhn,
  getReplacement,
  findPiiMatches,
} from './pii_patterns.ts';

import type {
  PIIType,
  PiiScrubStats,
  PiiScrubOptions,
  PiiScrubResult,
  PIIScrubberOptions,
  PIIMatch,
  PIIScrubResult,
  BatchScrubResult,
} from './pii_types.ts';

export type {
  PiiType,
  PIIType,
  RedactionMode,
  PiiMatchDetail,
  RawMatch,
  PiiScrubStats,
  PiiScrubOptions,
  PiiScrubResult,
  PIIScrubberOptions,
  PIIMatch,
  PIIScrubResult,
  BatchScrubResult,
};

export { isValidLuhn, getReplacement, findPiiMatches };

const DEFAULT_PII_TYPES: PiiType[] = [
  'email', 'phone', 'credit_card', 'ssn', 'ip', 'secret', 'address',
];

/**
 * Scrubs Personally Identifiable Information (PII) from a text string.
 */
export function scrubPiiText(text: string, options: PiiScrubOptions = {}): PiiScrubResult {
  if (!text || typeof text !== 'string') {
    return { scrubbedText: text || '', hasPii: false, redactedCount: 0, matches: [] };
  }

  const mode = options.mode || 'labeled';
  const allowed = new Set<PiiType>(options.types || DEFAULT_PII_TYPES);
  const rawMatches = findPiiMatches(text, allowed);

  if (rawMatches.length === 0) {
    return { scrubbedText: text, hasPii: false, redactedCount: 0, matches: [] };
  }

  let result = '';
  let cursor = 0;
  const matchDetails: PiiMatchDetail[] = [];

  for (const m of rawMatches) {
    result += text.slice(cursor, m.startIndex);
    const replacement = getReplacement(m.type, m.value, mode, options.customReplacer);
    result += replacement;
    matchDetails.push({
      type: m.type,
      startIndex: m.startIndex,
      endIndex: m.endIndex,
      originalLength: m.value.length,
      replacement,
    });
    cursor = m.endIndex;
  }
  result += text.slice(cursor);

  return {
    scrubbedText: result,
    hasPii: true,
    redactedCount: matchDetails.length,
    matches: matchDetails,
  };
}

/**
 * Checks if a string contains any PII without modifying it.
 */
export function containsPii(text: string, options: PiiScrubOptions = {}): boolean {
  if (!text || typeof text !== 'string') return false;
  const allowed = new Set<PiiType>(options.types || DEFAULT_PII_TYPES);
  return findPiiMatches(text, allowed).length > 0;
}

/**
 * Scrubs PII from a single negative keyword record.
 */
export function scrubKeywordRecord<T extends { keyword: string; formattedRule?: string }>(
  record: T,
  options: PiiScrubOptions = {}
): T {
  const keywordResult = scrubPiiText(record.keyword, options);
  let formattedRule = record.formattedRule;

  if (formattedRule) {
    formattedRule = scrubPiiText(formattedRule, options).scrubbedText;
  } else if (keywordResult.hasPii) {
    formattedRule = keywordResult.scrubbedText;
  }

  return {
    ...record,
    keyword: keywordResult.scrubbedText,
    formattedRule,
  };
}

const STATS_MAP: Record<PiiType, keyof PiiScrubStats> = {
  email: 'emailCount',
  phone: 'phoneCount',
  credit_card: 'cardCount',
  ssn: 'ssnCount',
  ip: 'ipCount',
  secret: 'secretCount',
  address: 'addressCount',
};

/**
 * Scrubs PII across an array of keyword records and aggregates redaction statistics.
 */
export function scrubKeywordList<T extends { keyword: string; formattedRule?: string }>(
  records: T[],
  options: PiiScrubOptions = {}
): { scrubbed: T[]; stats: PiiScrubStats } {
  const stats: PiiScrubStats = {
    totalScrubbed: 0,
    emailCount: 0,
    phoneCount: 0,
    cardCount: 0,
    ssnCount: 0,
    ipCount: 0,
    secretCount: 0,
    addressCount: 0,
    redactedTokens: 0,
  };

  const scrubbed = records.map((record) => {
    const kwRes = scrubPiiText(record.keyword, options);
    if (kwRes.hasPii) {
      stats.totalScrubbed++;
      stats.redactedTokens += kwRes.redactedCount;
      for (const m of kwRes.matches) {
        const key = STATS_MAP[m.type];
        if (key) (stats[key] as number)++;
      }
    }

    let formattedRule = record.formattedRule;
    if (formattedRule) {
      formattedRule = scrubPiiText(formattedRule, options).scrubbedText;
    }

    return { ...record, keyword: kwRes.scrubbedText, formattedRule };
  });

  return { scrubbed, stats };
}

function resolvePlaceholder(
  type: PIIType,
  val: string,
  placeholder?: string | ((type: PIIType, value?: string) => string)
): string {
  if (typeof placeholder === 'function') return placeholder(type, val);
  if (typeof placeholder === 'string') return placeholder;
  return '[REDACTED]';
}

/**
 * Scrubs Personally Identifiable Information from text with customizable placeholder.
 */
export function scrubPII(text: string, options: PIIScrubberOptions = {}): PIIScrubResult {
  if (!text || typeof text !== 'string') {
    return { text: text || '', hasPII: false, redactedCount: 0, types: [], matches: [] };
  }

  const allowed = new Set<PIIType>(options.types || DEFAULT_PII_TYPES);
  const rawMatches: RawMatch[] = findPiiMatches(text, allowed);

  if (rawMatches.length === 0) {
    return { text, hasPII: false, redactedCount: 0, types: [], matches: [] };
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
    matches.push({ type: m.type, value: m.value, startIndex: m.startIndex, endIndex: m.endIndex });
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

  return { scrubbed, totalRedactions, hasPII };
}
