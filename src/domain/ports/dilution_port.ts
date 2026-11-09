/**
 * SIEVE Domain Port: Match Type Dilution & Cannibalization Engine
 *
 * Clean Architecture port contract to compare queries across match types
 * (Exact vs. Broad/Phrase), identify hijacked clicks, calculate CPC inflation
 * ratios, and compute total lost budget.
 * Strict Dependency Rule: Depends ONLY on src/domain/types.
 */

import type {
  DilutedQueryPair,
  DilutionSummary,
  DilutionDetectionConfig,
  DilutionSeverity,
  SearchTermRecord,
  CurrencyMicros,
  ClickCount,
} from '../types/index.ts';

/**
 * Decoupled Port Contract for Match Type Dilution & Cannibalization Analysis.
 */
export interface IMatchDilutionPort {
  /**
   * Compares search query performance across match types to detect cannibalization
   * and compute an account-level dilution summary.
   */
  detectDilution(
    searchTerms: readonly SearchTermRecord[],
    config?: DilutionDetectionConfig
  ): DilutionSummary;

  /**
   * Identifies hijacked clicks intercepted by loose match types (Phrase/Broad)
   * that should have routed to exact match keyword benchmarks.
   */
  identifyHijackedClicks(
    exactRecord: SearchTermRecord,
    broadRecord: SearchTermRecord
  ): ClickCount;

  /**
   * Calculates the CPC inflation ratio between broad/phrase and exact auctions.
   */
  calculateInflationRatio(
    exactCpcMicros: CurrencyMicros,
    broadCpcMicros: CurrencyMicros
  ): number;

  /**
   * Computes total lost budget incurred from paying inflated CPCs over exact benchmarks.
   */
  calculateLostBudget(
    exactCpcMicros: CurrencyMicros,
    broadCpcMicros: CurrencyMicros,
    hijackedClicks: ClickCount
  ): CurrencyMicros;

  /**
   * Classifies the economic severity of a dilution pair from its CPC inflation ratio.
   */
  classifySeverity(
    inflationRatio: number
  ): DilutionSeverity;

  /**
   * Compares partitioned exact match benchmarks against broad/phrase query records.
   */
  findDilutedPairs(
    exactRecords: readonly SearchTermRecord[],
    broadRecords: readonly SearchTermRecord[],
    config?: DilutionDetectionConfig
  ): readonly DilutedQueryPair[];
}
