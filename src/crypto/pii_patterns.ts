/**
 * Sieve PII Pattern Detection & Luhn Verification
 * High-performance regex patterns and checksum validators for client-side PII scrub.
 * Physical line ceiling: <= 250 lines.
 */

import type { PiiType, RedactionMode, PiiMatchDetail, RawMatch } from './pii_types.ts';

export type { PiiType, RedactionMode, PiiMatchDetail, RawMatch };

export function isValidLuhn(rawNumber: string): boolean {
  const digits = rawNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits.charAt(i), 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

const LABELED_TOKENS: Record<PiiType, string> = {
  email: '[REDACTED_EMAIL]',
  phone: '[REDACTED_PHONE]',
  credit_card: '[REDACTED_CARD]',
  ssn: '[REDACTED_SSN]',
  ip: '[REDACTED_IP]',
  secret: '[REDACTED_SECRET]',
  address: '[REDACTED_ADDRESS]',
};

const COMPACT_TOKENS: Record<PiiType, string> = {
  email: '[EMAIL]',
  phone: '[PHONE]',
  credit_card: '[CARD]',
  ssn: '[SSN]',
  ip: '[IP]',
  secret: '[SECRET]',
  address: '[ADDRESS]',
};

export function getReplacement(
  type: PiiType,
  original: string,
  mode: RedactionMode,
  customReplacer?: (type: PiiType, original: string) => string
): string {
  if (customReplacer) {
    return customReplacer(type, original);
  }
  switch (mode) {
    case 'labeled':
      return LABELED_TOKENS[type];
    case 'compact':
      return COMPACT_TOKENS[type];
    case 'generic':
      return '[REDACTED_PII]';
    case 'mask':
      return '*'.repeat(Math.min(original.length, 12));
    default:
      return LABELED_TOKENS[type];
  }
}

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
const SSN_REGEX = /\b(?!000|666|9\d{2})\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b/g;
const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\b/g;
const IPV6_REGEX = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}\b/g;
const FORMATTED_CARD_REGEX = /\b(?:\d{4}[- ]){3}\d{4}\b|\b3[47]\d{2}[- ]\d{6}[- ]\d{5}\b/g;
const CONTINUOUS_CARD_REGEX = /\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|2[2-7]\d{14}|3[47]\d{13}|6(?:011|5\d{2})\d{12})\b/g;
const PHONE_INTL_REGEX = /(?<!\d[-.])(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
const PHONE_PAREN_REGEX = /(?<!\d[-.])\(\d{3}\)\s*\d{3}[-.\s]\d{4}\b/g;
const PHONE_TOLL_FREE_REGEX = /(?<!\d[-.])\b1?[-.\s]?8(?:00|88|77|66|55|44)[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const PHONE_E164_REGEX = /(?<!\d[-.])\+\d{1,3}[-.\s]\d{2,4}[-.\s]\d{3,4}[-.\s]\d{3,4}\b/g;
const SECRET_REGEX = /\b(?:password|passwd|pwd|api[_-]?key|bearer|secret)\s*[:=]\s*[^\s,;]{4,}/gi;
const ADDRESS_REGEX = /\b\d{1,5}\s+(?:[A-Za-z0-9.#-]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Square|Sq|Highway|Hwy|Terrace|Ter|Parkway|Pkwy)\b/gi;

export function findPiiMatches(text: string, allowedTypes: Set<PiiType>): RawMatch[] {
  if (!text || typeof text !== 'string') return [];
  const rawMatches: RawMatch[] = [];

  const collectRegex = (regex: RegExp, type: PiiType, validator?: (val: string) => boolean) => {
    if (!allowedTypes.has(type)) return;
    const r = new RegExp(regex.source, regex.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(text)) !== null) {
      const val = m[0];
      if (!validator || validator(val)) {
        rawMatches.push({
          type,
          startIndex: m.index,
          endIndex: m.index + val.length,
          value: val,
        });
      }
    }
  };

  collectRegex(EMAIL_REGEX, 'email');
  collectRegex(SSN_REGEX, 'ssn');
  collectRegex(IPV4_REGEX, 'ip');
  collectRegex(IPV6_REGEX, 'ip');
  collectRegex(FORMATTED_CARD_REGEX, 'credit_card', (val) => isValidLuhn(val));
  collectRegex(CONTINUOUS_CARD_REGEX, 'credit_card', (val) => isValidLuhn(val));
  collectRegex(PHONE_INTL_REGEX, 'phone');
  collectRegex(PHONE_PAREN_REGEX, 'phone');
  collectRegex(PHONE_TOLL_FREE_REGEX, 'phone');
  collectRegex(PHONE_E164_REGEX, 'phone');
  collectRegex(SECRET_REGEX, 'secret');
  collectRegex(ADDRESS_REGEX, 'address');

  if (rawMatches.length === 0) return [];

  rawMatches.sort((a, b) => {
    if (a.startIndex !== b.startIndex) {
      return a.startIndex - b.startIndex;
    }
    return (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex);
  });

  const resolved: RawMatch[] = [];
  let lastEnd = 0;
  for (const m of rawMatches) {
    if (m.startIndex >= lastEnd) {
      resolved.push(m);
      lastEnd = m.endIndex;
    }
  }

  return resolved;
}
