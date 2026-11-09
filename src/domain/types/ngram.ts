/**
 * SIEVE Domain Core: N-Gram Metrics & Linguistic Classification
 *
 * Models parsed tokens, n-gram sequences, intent classifications, and
 * statistical confidence bounds (Wilson score upper bound) for conversion rates.
 */

import type {
  CurrencyMicros,
  ClickCount,
  TokenString,
} from './primitives.ts';

/**
 * N-gram degree designating token sequence length.
 * - `1`: Unigram (single token word, e.g. "software")
 * - `2`: Bigram (two contiguous words, e.g. "free software")
 * - `3`: Trigram (three contiguous words, e.g. "download free software")
 */
export type GramDegree = 1 | 2 | 3;

/**
 * Semantic intent classification taxonomy assigned to tokens based on linguistic heuristics.
 * - `INFORMATIONAL`: Exploratory queries with zero commercial intent (e.g., "what is", "how to").
 * - `EMPLOYMENT`: Job seekers or recruitment intent (e.g., "jobs", "salary", "internship").
 * - `COMMERCIAL`: Transactional purchase intent (e.g., "buy", "pricing", "vendor").
 * - `BRAND`: Proprietary trademark or branded navigational intent.
 * - `SYNTACTIC_STOPWORD`: Functional stop words with minimal query discriminability (e.g., "the", "and").
 */
export type TokenClassification =
  | 'INFORMATIONAL'
  | 'EMPLOYMENT'
  | 'COMMERCIAL'
  | 'BRAND'
  | 'SYNTACTIC_STOPWORD';

/**
 * Aggregated metric record representing performance accumulated across all search queries containing a specific token.
 */
export interface AggregatedTokenMetric {
  /** The normalized token text or n-gram sequence. */
  readonly tokenText: TokenString;
  /** Gram degree of the token (1 for unigram, 2 for bigram, 3 for trigram). */
  readonly gramDegree: GramDegree;
  /** Semantic intent classification of the token. */
  readonly classification: TokenClassification;
  /** Number of distinct search query strings containing this token. */
  readonly occurrences: number;
  /** Number of distinct queries containing this token that generated zero clicks (sub-click / zero-click bleed). */
  readonly subClickQueriesCount: number;
  /** Total user clicks accumulated by queries containing this token. */
  readonly totalClicks: ClickCount;
  /** Total advertising spend accumulated by queries containing this token in integer micro-units. */
  readonly totalSpendMicros: CurrencyMicros;
  /** Total conversions attributed to queries containing this token. */
  readonly conversions: number;
  /** Wilson score 95% confidence interval upper bound for conversion rate (0.0 to 1.0). */
  readonly wilsonScoreUpperBound: number;
  /** Wilson score 95% confidence interval lower bound for conversion rate (0.0 to 1.0). */
  readonly wilsonScoreLowerBound?: number;
  /** Average cost-per-click accumulated by this token in integer micro-units. */
  readonly averageCpcMicros?: CurrencyMicros;
}

/**
 * Filter and sorting criteria for querying the token aggregate matrix.
 */
export interface TokenMatrixFilter {
  /** Filter by specific n-gram degree. */
  readonly gramDegree?: GramDegree;
  /** Filter by intent classification. */
  readonly classifications?: readonly TokenClassification[];
  /** Minimum search query occurrences. */
  readonly minOccurrences?: number;
  /** Minimum accumulated clicks. */
  readonly minClicks?: ClickCount;
  /** Minimum accumulated spend in integer micro-units. */
  readonly minSpendMicros?: CurrencyMicros;
  /** Maximum Wilson score upper bound (for identifying zero-conversion bleed). */
  readonly maxWilsonScoreUpperBound?: number;
}
