/**
 * Sieve PII Scrubber Type Definitions
 * Physical line ceiling: <= 250 lines.
 */

export type PiiType =
  | 'email'
  | 'phone'
  | 'credit_card'
  | 'ssn'
  | 'ip'
  | 'secret'
  | 'address';

export type PIIType = PiiType;

export type RedactionMode = 'labeled' | 'compact' | 'generic' | 'mask';

export interface PiiMatchDetail {
  type: PiiType;
  startIndex: number;
  endIndex: number;
  originalLength: number;
  replacement: string;
}

export interface RawMatch {
  type: PiiType;
  startIndex: number;
  endIndex: number;
  value: string;
}

export interface PiiScrubStats {
  totalScrubbed: number;
  emailCount: number;
  phoneCount: number;
  cardCount: number;
  ssnCount: number;
  ipCount: number;
  secretCount: number;
  addressCount: number;
  redactedTokens: number;
}

export interface PiiScrubOptions {
  mode?: RedactionMode;
  types?: PiiType[];
  customReplacer?: (type: PiiType, original: string) => string;
}

export interface PiiScrubResult {
  scrubbedText: string;
  hasPii: boolean;
  redactedCount: number;
  matches: PiiMatchDetail[];
}

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
