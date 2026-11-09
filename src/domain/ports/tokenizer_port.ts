/**
 * SIEVE Domain Port: N-Gram Tokenizer & Linguistic Classifier
 *
 * Clean Architecture inbound port contract defining token decomposition,
 * semantic classification, stopword masking, and Wilson score calculations.
 * Strict Dependency Rule: Depends ONLY on src/domain/types.
 */

import type {
  GramDegree,
  TokenClassification,
  AggregatedTokenMetric,
  TokenMatrixFilter,
  QueryString,
  TokenString,
  ClickCount,
  ConversionCount,
  SearchTermRecord,
} from '../types/index.ts';

/**
 * Wilson score 95% confidence interval computation bounds.
 */
export interface WilsonScoreResult {
  readonly lowerBound: number;
  readonly upperBound: number;
}

/**
 * Token decomposition configuration parameters.
 */
export interface TokenizeOptions {
  readonly minDegree?: GramDegree;
  readonly maxDegree?: GramDegree;
  readonly stripStopwords?: boolean;
}

/**
 * Decoupled Port Contract for N-Gram Tokenization & Intent Classification.
 */
export interface INgramTokenizerPort {
  /**
   * Decomposes a search term query into constituent N-gram token strings.
   */
  tokenize(
    query: QueryString,
    options?: TokenizeOptions
  ): readonly TokenString[];

  /**
   * Classifies a token into a semantic category based on linguistic intent.
   */
  classifyToken(
    token: TokenString
  ): TokenClassification;

  /**
   * Applies syntactic stopword mask, filtering non-discriminative syntactic tokens.
   */
  applyStopwordMask(
    tokens: readonly TokenString[]
  ): readonly TokenString[];

  /**
   * Evaluates if a given token is identified as a syntactic stopword.
   */
  isStopword(
    token: TokenString
  ): boolean;

  /**
   * Computes the Wilson score confidence interval upper and lower bounds for conversion rate.
   */
  calculateWilsonScore(
    trials: ClickCount | number,
    successes: ConversionCount | number,
    confidenceZ?: number
  ): WilsonScoreResult;

  /**
   * Aggregates token statistics across search term records and evaluates confidence metrics.
   */
  aggregateTokens(
    searchTerms: readonly SearchTermRecord[],
    filter?: TokenMatrixFilter
  ): readonly AggregatedTokenMetric[];
}
