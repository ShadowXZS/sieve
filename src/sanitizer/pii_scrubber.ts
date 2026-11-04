/**
 * Sieve Client-Side PII Scrubber (Phase 14 Sanitizer)
 *
 * Provides deterministic, client-side redaction of sensitive Personally
 * Identifiable Information (emails, phones, payment cards, SSNs, IPs)
 * from search term reports with customizable placeholder tokens.
 */

export type PIIType =
  | 'email'
  | 'phone'
  | 'credit_card'
  | 'ssn'
  | 'ip'
  | 'secret'
  | 'address';

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

import { isValidLuhn } from '../crypto/pii_scrubber.ts';
export { isValidLuhn };

// ---------------------------------------------------------------------------
// Detection Regular Expressions
// ---------------------------------------------------------------------------
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
const SSN_REGEX = /\b(?!000|666|9\d{2})\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b/g;
const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\b/g;

// Payment cards: Formatted or continuous digits
const FORMATTED_CARD_REGEX = /\b(?:\d{4}[- ]){3}\d{4}\b|\b3[47]\d{2}[- ]\d{6}[- ]\d{5}\b/g;
const CONTINUOUS_CARD_REGEX = /\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|2[2-7]\d{14}|3[47]\d{13}|6(?:011|5\d{2})\d{12})\b/g;

// Telephones:
const PHONE_INTL_REGEX = /(?<!\d[-.])(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
const PHONE_PAREN_REGEX = /(?<!\d[-.])\(\d{3}\)\s*\d{3}[-.\s]\d{4}\b/g;
const PHONE_TOLL_FREE_REGEX = /(?<!\d[-.])\b1?[-.\s]?8(?:00|88|77|66|55|44)[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const PHONE_E164_REGEX = /(?<!\d[-.])\+\d{1,3}[-.\s]\d{2,4}[-.\s]\d{3,4}[-.\s]\d{3,4}\b/g;

const SECRET_REGEX = /\b(?:password|passwd|pwd|api[_-]?key|bearer|secret)\s*[:=]\s*[^\s,;]{4,}/gi;
const ADDRESS_REGEX = /\b\d{1,5}\s+(?:[A-Za-z0-9.#-]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Square|Sq|Highway|Hwy|Terrace|Ter|Parkway|Pkwy)\b/gi;

function findRawMatches(text: string, allowedTypes: Set<PIIType>): PIIMatch[] {
  const matches: PIIMatch[] = [];

  const collect = (regex: RegExp, type: PIIType, validator?: (val: string) => boolean) => {
    if (!allowedTypes.has(type)) return;
    const r = new RegExp(regex.source, regex.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(text)) !== null) {
      const val = m[0];
      if (!validator || validator(val)) {
        matches.push({
          type,
          value: val,
          startIndex: m.index,
          endIndex: m.index + val.length,
        });
      }
    }
  };

  collect(EMAIL_REGEX, 'email');
  collect(SSN_REGEX, 'ssn');
  collect(IPV4_REGEX, 'ip');
  collect(FORMATTED_CARD_REGEX, 'credit_card', (val) => isValidLuhn(val));
  collect(CONTINUOUS_CARD_REGEX, 'credit_card', (val) => isValidLuhn(val));
  collect(PHONE_INTL_REGEX, 'phone');
  collect(PHONE_PAREN_REGEX, 'phone');
  collect(PHONE_TOLL_FREE_REGEX, 'phone');
  collect(PHONE_E164_REGEX, 'phone');
  collect(SECRET_REGEX, 'secret');
  collect(ADDRESS_REGEX, 'address');

  if (matches.length === 0) return [];

  // Sort by start index ascending, length descending
  matches.sort((a, b) => {
    if (a.startIndex !== b.startIndex) {
      return a.startIndex - b.startIndex;
    }
    return (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex);
  });

  // Filter overlapping matches
  const resolved: PIIMatch[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.startIndex >= lastEnd) {
      resolved.push(m);
      lastEnd = m.endIndex;
    }
  }

  return resolved;
}

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

  const rawMatches = findRawMatches(text, allowedTypes);

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

  for (const m of rawMatches) {
    result += text.slice(cursor, m.startIndex);
    const replacement = resolvePlaceholder(m.type, m.value, options.placeholder);
    result += replacement;
    typesFound.add(m.type);
    cursor = m.endIndex;
  }
  result += text.slice(cursor);

  return {
    text: result,
    hasPII: true,
    redactedCount: rawMatches.length,
    types: Array.from(typesFound),
    matches: rawMatches,
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
