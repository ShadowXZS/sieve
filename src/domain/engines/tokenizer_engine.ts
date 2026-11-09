/**
 * SIEVE Domain Core: Headless N-Gram Tokenizer & Intent Engine
 *
 * Implements INgramTokenizerPort adhering strictly to Clean Architecture:
 * - Decomposes queries into unigrams/bigrams ignoring punctuation & casing
 * - Masks syntactic stopwords to protect campaign traffic pools
 * - Aggregates sub-click long-tail query waste with zero precision loss
 * - Computes Wilson score binomial confidence intervals
 *
 * Operating constraints: <= 200 lines, zero UI/framework dependencies.
 */

import type { INgramTokenizerPort, TokenizeOptions, WilsonScoreResult } from '../ports/tokenizer_port.ts';
import type {
  GramDegree, TokenClassification, AggregatedTokenMetric, TokenMatrixFilter,
  QueryString, TokenString, ClickCount, ConversionCount, SearchTermRecord, CurrencyMicros,
} from '../types/index.ts';
import { isSyntacticStopword } from './stopwords.ts';

const INFORMATIONAL_RX = /\b(how|what|why|when|where|who|which|tutorial|guide|diy|example|examples|template|templates|learn|definition|meaning|tips|doc|docs|documentation|free)\b/i;
const EMPLOYMENT_RX = /\b(job|jobs|career|careers|salary|salaries|intern|internship|internships|hiring|resume|cv|recruiter|recruitment|employment|openings|vacancies|interview|interviews)\b/i;
const COMMERCIAL_RX = /\b(buy|pricing|price|prices|cost|costs|quote|quotes|vendor|vendors|supplier|suppliers|software|platform|tool|tools|service|services|solution|solutions|enterprise|purchase|order|shop|hire|discount|cheap|deal|deals|review|reviews|vs|alternative|alternatives|agency)\b/i;

function matchesFilter(m: AggregatedTokenMetric, f?: TokenMatrixFilter): boolean {
  if (!f) return true;
  if (f.gramDegree !== undefined && m.gramDegree !== f.gramDegree) return false;
  if (f.classifications && !f.classifications.includes(m.classification)) return false;
  if (f.minOccurrences !== undefined && m.occurrences < f.minOccurrences) return false;
  if (f.minClicks !== undefined && m.totalClicks < f.minClicks) return false;
  if (f.minSpendMicros !== undefined && m.totalSpendMicros < f.minSpendMicros) return false;
  return f.maxWilsonScoreUpperBound === undefined || m.wilsonScoreUpperBound <= f.maxWilsonScoreUpperBound;
}

export class NgramTokenizerEngine implements INgramTokenizerPort {
  private readonly knownBrands: ReadonlySet<string>;

  constructor(options?: { readonly knownBrands?: Iterable<string> }) {
    this.knownBrands = new Set(Array.from(options?.knownBrands ?? []).map((b) => b.trim().toLowerCase()));
  }

  tokenize(query: QueryString, options?: TokenizeOptions): readonly TokenString[] {
    const minDegree = options?.minDegree ?? 1;
    const maxDegree = options?.maxDegree ?? (options?.minDegree ?? 1);
    const normalized = query.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
    let words = normalized.split(/\s+/).filter((w) => w.length > 0);
    if (options?.stripStopwords) words = words.filter((w) => !this.isStopword(w as TokenString));

    const tokens: TokenString[] = [];
    for (let degree = minDegree; degree <= maxDegree; degree++) {
      for (let i = 0; i <= words.length - degree; i++) {
        tokens.push(words.slice(i, i + degree).join(' ') as TokenString);
      }
    }
    return tokens;
  }

  classifyToken(token: TokenString): TokenClassification {
    const normalized = token.trim().toLowerCase();
    if (this.isStopword(token)) return 'SYNTACTIC_STOPWORD';
    if (this.knownBrands.has(normalized)) return 'BRAND';
    if (EMPLOYMENT_RX.test(normalized)) return 'EMPLOYMENT';
    if (INFORMATIONAL_RX.test(normalized)) return 'INFORMATIONAL';
    return COMMERCIAL_RX.test(normalized) ? 'COMMERCIAL' : 'COMMERCIAL';
  }

  applyStopwordMask(tokens: readonly TokenString[]): readonly TokenString[] {
    return tokens.filter((t) => !this.isStopword(t));
  }

  isStopword(token: TokenString): boolean {
    return isSyntacticStopword(token);
  }

  calculateWilsonScore(
    trials: ClickCount | number,
    successes: ConversionCount | number,
    confidenceZ = 1.96
  ): WilsonScoreResult {
    const n = Number(trials);
    if (n <= 0) return { lowerBound: 0.0, upperBound: 1.0 };
    const k = Math.min(n, Math.max(0, Number(successes)));
    const zSq = confidenceZ * confidenceZ;
    if (k === 0) return { lowerBound: 0.0, upperBound: zSq / (n + zSq) };

    const p = k / n;
    const denom = 1 + zSq / n;
    const center = (p + zSq / (2 * n)) / denom;
    const variance = (p * (1 - p)) / n + zSq / (4 * n * n);
    const margin = (confidenceZ * Math.sqrt(Math.max(0, variance))) / denom;

    return {
      lowerBound: Math.max(0.0, center - margin),
      upperBound: Math.min(1.0, center + margin),
    };
  }

  aggregateTokens(
    searchTerms: readonly SearchTermRecord[],
    filter?: TokenMatrixFilter
  ): readonly AggregatedTokenMetric[] {
    type TokenBucket = { occurrences: number; subClicks: number; clicks: number; spend: bigint; convs: number; gramDegree: GramDegree };
    const map = new Map<TokenString, TokenBucket>();
    const minDeg = filter?.gramDegree ?? 1;
    const maxDeg = filter?.gramDegree ?? 2;

    for (const record of searchTerms) {
      const q = record.normalizedQuery || record.rawQuery;
      const tokens = this.tokenize(q, { minDegree: minDeg, maxDegree: maxDeg });
      const uniqueTokens = new Set(tokens);

      for (const token of uniqueTokens) {
        if (!filter?.classifications?.includes('SYNTACTIC_STOPWORD') && this.isStopword(token)) continue;
        let b = map.get(token);
        if (!b) {
          const degree = Math.min(3, Math.max(1, token.split(/\s+/).length)) as GramDegree;
          b = { occurrences: 0, subClicks: 0, clicks: 0, spend: 0n, convs: 0, gramDegree: degree };
          map.set(token, b);
        }
        b.occurrences += 1;
        if (record.clicks <= 2) b.subClicks += 1;
        b.clicks += record.clicks;
        b.spend += record.spendMicros;
        b.convs += record.conversions;
      }
    }

    const results: AggregatedTokenMetric[] = [];
    for (const [token, b] of map.entries()) {
      const classification = this.classifyToken(token);
      const wilson = this.calculateWilsonScore(b.clicks, b.convs);
      const avgCpc = b.clicks > 0 ? ((b.spend / BigInt(Math.round(b.clicks))) as CurrencyMicros) : (0n as CurrencyMicros);
      const metric: AggregatedTokenMetric = {
        tokenText: token,
        gramDegree: b.gramDegree,
        classification,
        occurrences: b.occurrences,
        subClickQueriesCount: b.subClicks,
        totalClicks: b.clicks as ClickCount,
        totalSpendMicros: b.spend as CurrencyMicros,
        conversions: b.convs,
        wilsonScoreUpperBound: wilson.upperBound,
        wilsonScoreLowerBound: wilson.lowerBound,
        averageCpcMicros: avgCpc,
      };

      if (matchesFilter(metric, filter)) results.push(metric);
    }
    return results;
  }

  topBleedRoots(
    searchTerms: readonly SearchTermRecord[],
    limit = 10
  ): readonly AggregatedTokenMetric[] {
    const bleedTerms = searchTerms.filter((t) => t.clicks <= 2);
    const sourceTerms = bleedTerms.length > 0 ? bleedTerms : searchTerms;
    const aggregated = this.aggregateTokens(sourceTerms, { gramDegree: 1 });
    return aggregated
      .filter((m) => !this.isStopword(m.tokenText) && m.classification !== 'SYNTACTIC_STOPWORD')
      .sort((a, b) => (b.totalSpendMicros !== a.totalSpendMicros ? (b.totalSpendMicros > a.totalSpendMicros ? 1 : -1) : b.subClickQueriesCount - a.subClickQueriesCount))
      .slice(0, limit);
  }
}
