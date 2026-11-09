/**
 * SIEVE Domain Core: Match Type Dilution & Cannibalization Models
 *
 * Models query pairs where loose targeting (phrase or broad match) cannibalizes
 * exact match search intent, inflating CPC and draining campaign budgets.
 * All monetary values use integer micro-units to prevent IEEE-754 drift.
 */

import type {
  CurrencyMicros,
  ClickCount,
  QueryString,
} from './primitives.ts';

/**
 * Qualitative dilution severity classifying the economic impact of cannibalization.
 * - `NEGLIGIBLE`: Inflation ratio below 1.10x with minor budget impact.
 * - `MODERATE`: Inflation ratio between 1.10x and 1.30x with measurable budget drain.
 * - `SEVERE`: Inflation ratio between 1.30x and 1.75x with substantial budget drain.
 * - `CRITICAL`: Inflation ratio exceeding 1.75x representing severe auction cannibalization.
 */
export type DilutionSeverity = 'NEGLIGIBLE' | 'MODERATE' | 'SEVERE' | 'CRITICAL';

/**
 * Represents a pair of conflicting queries where a broad or phrase match
 * cannibalized traffic that should have routed to an exact match keyword benchmark,
 * incurring cost-per-click inflation and budget waste.
 */
export interface DilutedQueryPair {
  /** The high-intent exact match query benchmark. */
  readonly exactQuery: QueryString;
  /** The broad or phrase match query variant that intercepted the auction. */
  readonly broadQuery: QueryString;
  /** Benchmark cost-per-click observed on the exact match query in micro-units. */
  readonly exactCpcMicros: CurrencyMicros;
  /** Inflated cost-per-click incurred on the broad match variant in micro-units. */
  readonly broadCpcMicros: CurrencyMicros;
  /**
   * Ratio of broad CPC over exact CPC (e.g., 1.45 represents 45% inflation).
   * Calculated as `broadCpcMicros / exactCpcMicros`.
   */
  readonly cpcInflationRatio: number;
  /** Volume of clicks hijacked by the loose broad match variant. */
  readonly hijackedClicks: ClickCount;
  /**
   * Estimated budget lost due to paying premium broad CPC over exact CPC in micro-units.
   * Calculated as `(broadCpcMicros - exactCpcMicros) * hijackedClicks`.
   */
  readonly budgetLostMicros: CurrencyMicros;
  /** Optional classified severity of the dilution pair. */
  readonly severity?: DilutionSeverity;
}

/**
 * Aggregated summary of match dilution across an advertising account or campaign.
 */
export interface DilutionSummary {
  /** Match Dilution Index score expressed as a percentage (0.0 to 100.0). */
  readonly dilutionIndexPercent: number;
  /** Total financial budget lost to match dilution in integer micro-units. */
  readonly totalBudgetLostMicros: CurrencyMicros;
  /** Total count of search queries identified with match type dilution. */
  readonly dilutedQueryCount: number;
  /** Weighted average CPC inflation ratio across all diluted queries. */
  readonly averageInflationRatio: number;
  /** Detailed collection of identified diluted query pairs. */
  readonly pairs: readonly DilutedQueryPair[];
  /** Total clicks captured across all diluted queries. */
  readonly totalDilutedClicks?: ClickCount;
  /** Total spend incurred on diluted queries in integer micro-units. */
  readonly totalDilutedSpendMicros?: CurrencyMicros;
}

/**
 * Diagnostic configuration thresholds for detecting match type dilution.
 */
export interface DilutionDetectionConfig {
  /** Minimum CPC inflation ratio to flag as dilution (e.g., 1.10 for 10% premium). */
  readonly minInflationRatio: number;
  /** Minimum hijacked clicks required to ensure statistical significance. */
  readonly minHijackedClicks: ClickCount;
  /** Minimum budget lost in integer micro-units to trigger rule generation. */
  readonly minBudgetLostMicros: CurrencyMicros;
}
