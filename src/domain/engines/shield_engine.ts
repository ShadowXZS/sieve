/**
 * SIEVE Domain Core: Conversion Shield & Negative Rule Staging Engine
 *
 * Implements IConversionShieldPort adhering strictly to Clean Architecture:
 * - Inverted token index & prefix Trie for O(M) collision detection
 * - Permanent exclusion of converting terms (conversions > 0)
 * - Strict threshold gating (clicks >= minClicks, spendMicros >= minSpendMicros)
 * - Bracket-lock fallback ([query]) for safe-list collisions
 *
 * Operating constraints: <= 200 lines, pure headless, zero UI/framework dependencies.
 */

import type { IConversionShieldPort } from '../ports/shield_port.ts';
import type {
  CollisionEvaluationResult, NegativeExclusionRule, SafeListTerm, ExclusionTargetLevel,
  PlatformMatchType, SearchTermRecord, QueryString, CurrencyMicros, CampaignId, AdGroupId,
} from '../types/index.ts';
import { isSyntacticStopword } from './stopwords.ts';

interface TrieNode {
  readonly children: Map<string, TrieNode>;
  isTerminal: boolean;
  readonly safeQueries: Set<QueryString>;
}

function normalize(q: string): string {
  return q.toLowerCase().replace(/[\[\]"']/g, '').replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
}

function tokenize(q: string): string[] {
  const norm = normalize(q);
  return norm.length === 0 ? [] : norm.split(' ');
}

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256(ascii: string): string {
  const ror = (v: number, n: number) => (v >>> n) | (v << (32 - n));
  const words: number[] = [];
  const bitLen = ascii.length * 8;
  let [h0, h1, h2, h3, h4, h5, h6, h7] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  for (let i = 0; i < ascii.length; i++) words[i >> 2] |= (ascii.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
  words[ascii.length >> 2] |= 0x80 << (24 - (ascii.length % 4) * 8);
  const blocks = (((ascii.length + 8) >> 6) + 1) * 16;
  words[blocks - 1] = bitLen;
  for (let i = 0; i < blocks; i += 16) {
    const w = new Int32Array(64);
    for (let j = 0; j < 16; j++) w[j] = words[i + j] || 0;
    for (let j = 16; j < 64; j++) {
      const s0 = ror(w[j - 15], 7) ^ ror(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = ror(w[j - 2], 17) ^ ror(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let j = 0; j < 64; j++) {
      const s1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + K[j] + w[j]) | 0;
      const s0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
      const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

export class ConversionShieldEngine implements IConversionShieldPort {
  private readonly minClicks: number;
  private readonly minSpend: CurrencyMicros;
  private readonly safeTerms = new Map<string, SafeListTerm>();
  private readonly tokenIndex = new Map<string, Set<QueryString>>();
  private readonly root: TrieNode = { children: new Map(), isTerminal: false, safeQueries: new Set() };

  constructor(config?: { readonly minNonConvertingClicks?: number; readonly minSpendMicros?: CurrencyMicros }) {
    this.minClicks = config?.minNonConvertingClicks ?? 4;
    this.minSpend = config?.minSpendMicros ?? (1n as CurrencyMicros);
  }

  registerSafeListTerms(terms: readonly SafeListTerm[]): void {
    for (const t of terms) {
      this.safeTerms.set(normalize(t.query), t);
      const tokens = tokenize(t.query);
      for (const tok of tokens) {
        if (!isSyntacticStopword(tok)) {
          let set = this.tokenIndex.get(tok);
          if (!set) this.tokenIndex.set(tok, (set = new Set()));
          set.add(t.query);
        }
      }
      let curr = this.root;
      for (const tok of tokens) {
        let next = curr.children.get(tok);
        if (!next) curr.children.set(tok, (next = { children: new Map(), isTerminal: false, safeQueries: new Set() }));
        curr = next;
      }
      curr.isTerminal = true;
      curr.safeQueries.add(t.query);
    }
  }

  getSafeListTerms(): readonly SafeListTerm[] {
    return Array.from(this.safeTerms.values());
  }

  evaluateCollision(candidate: QueryString, proposedMatchType?: PlatformMatchType): CollisionEvaluationResult {
    const norm = normalize(candidate);
    const exact = this.safeTerms.get(norm);
    if (exact) {
      return { candidate, verdict: 'SAFE_LIST_CONVERSION', recommendedMatchType: proposedMatchType ?? 'EXACT', conflictingSafeTerms: [exact.query] };
    }
    const tokens = tokenize(candidate);
    const conflicting = new Set<QueryString>();
    for (const tok of tokens) {
      if (!isSyntacticStopword(tok)) {
        const matches = this.tokenIndex.get(tok);
        if (matches) for (const m of matches) conflicting.add(m);
      }
    }
    for (let i = 0; i < tokens.length; i++) {
      let curr = this.root;
      for (let j = i; j < tokens.length; j++) {
        const next = curr.children.get(tokens[j]);
        if (!next) break;
        if (next.isTerminal) for (const q of next.safeQueries) conflicting.add(q);
        curr = next;
      }
    }
    if (conflicting.size > 0) {
      return { candidate, verdict: 'EXACT_BRACKET_LOCK', recommendedMatchType: 'EXACT', conflictingSafeTerms: Array.from(conflicting) };
    }
    const recType: PlatformMatchType = proposedMatchType ?? (tokens.length === 1 ? 'BROAD' : 'PHRASE');
    return { candidate, verdict: 'SAFE_EXCLUSION', recommendedMatchType: recType, conflictingSafeTerms: [] };
  }

  evaluateBatchCollisions(candidates: readonly QueryString[]): readonly CollisionEvaluationResult[] {
    return candidates.map((c) => this.evaluateCollision(c));
  }

  enforceBracketLockFallback(candidate: QueryString, collidingSafeTerms: readonly QueryString[], wasteMicros?: CurrencyMicros): NegativeExclusionRule {
    const raw = candidate.trim().replace(/^\[(.*)\]$/, '$1');
    const candidateTerm = `[${raw}]` as QueryString;
    const matchType: PlatformMatchType = 'EXACT';
    const targetLevel: ExclusionTargetLevel = 'ACCOUNT';
    return {
      candidateTerm, recommendedMatchType: matchType, targetLevel,
      marginalWasteMicros: wasteMicros ?? (0n as CurrencyMicros), confidenceScore: 1.0, verdict: 'EXACT_BRACKET_LOCK',
      ruleFingerprint: this.computeRuleFingerprint(candidateTerm, matchType, targetLevel), collidingSafeTerms,
    };
  }

  emitQualifiedNegativeCandidates(searchTerms: readonly SearchTermRecord[], _targetCpaMicros: CurrencyMicros): readonly NegativeExclusionRule[] {
    for (const term of searchTerms) {
      if (term.conversions > 0) {
        this.registerSafeListTerms([{
          query: term.normalizedQuery || (term.rawQuery.toLowerCase() as QueryString),
          conversions: term.conversions, securedRevenueMicros: term.revenueMicros, createdAtMs: Date.now(),
        }]);
      }
    }
    const rules: NegativeExclusionRule[] = [];
    for (const term of searchTerms) {
      if (term.conversions > 0 || term.clicks < this.minClicks || term.spendMicros <= 0n || term.spendMicros < this.minSpend) {
        continue;
      }
      const evalResult = this.evaluateCollision(term.rawQuery);
      if (evalResult.verdict === 'SAFE_LIST_CONVERSION') continue;
      const isCollision = evalResult.verdict === 'EXACT_BRACKET_LOCK';
      const tokens = tokenize(term.rawQuery);
      const recommendedMatchType: PlatformMatchType = isCollision ? 'EXACT' : (tokens.length === 1 ? 'BROAD' : 'PHRASE');
      const candidateTerm = isCollision ? (`[${term.rawQuery.replace(/^\[(.*)\]$/, '$1')}]` as QueryString) : term.rawQuery;
      const targetLevel: ExclusionTargetLevel = term.adGroupId ? 'AD_GROUP' : (term.campaignId ? 'CAMPAIGN' : 'ACCOUNT');
      const ruleFingerprint = this.computeRuleFingerprint(candidateTerm, recommendedMatchType, targetLevel, term.campaignId, term.adGroupId);
      rules.push({
        candidateTerm, recommendedMatchType, targetLevel,
        marginalWasteMicros: term.spendMicros, confidenceScore: 1.0, verdict: evalResult.verdict,
        campaignId: term.campaignId, adGroupId: term.adGroupId, ruleFingerprint,
        collidingSafeTerms: isCollision ? evalResult.conflictingSafeTerms : undefined,
      });
    }
    return rules;
  }

  computeRuleFingerprint(term: QueryString, matchType: PlatformMatchType, targetLevel: ExclusionTargetLevel, campaignId?: CampaignId, adGroupId?: AdGroupId): string {
    const norm = normalize(term);
    return sha256(`${norm}|${matchType}|${targetLevel}|${campaignId?.trim() ?? ''}|${adGroupId?.trim() ?? ''}`);
  }
}
