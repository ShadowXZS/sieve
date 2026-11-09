/**
 * SIEVE Domain Port: Econometric Bid Elasticity & Reallocation Engine
 *
 * Clean Architecture port contract to compute break-even bid ceilings
 * via AdGroup CVR x Target CPA, map the elasticity spectrum, and compute
 * convex reallocation yields damped by gamma (0.70 - 0.85).
 * Strict Dependency Rule: Depends ONLY on src/domain/types.
 */

import type {
  BidElasticitySpectrum,
  ConvexReallocationYield,
  SpendWaterfallSpectrum,
  ElasticityZone,
  CurrencyMicros,
  SearchTermRecord,
} from '../types/index.ts';

/**
 * Reallocation model configuration parameters.
 */
export interface ReallocationOptions {
  /** Cobb-Douglas elasticity damping exponent gamma (standard: 0.70 to 0.85). */
  readonly gammaDamping?: number;
  /** Annualization multiplier for monetary yield projection (e.g. 12 for monthly). */
  readonly annualizationMultiplier?: number;
}

/**
 * Decoupled Port Contract for Econometric Bid Elasticity & Capital Optimization.
 */
export interface IEconometricEnginePort {
  /**
   * Computes the break-even maximum bid ceiling: AdGroup CVR * Target CPA.
   */
  computeBreakEvenBidCeiling(
    conversionRate: number,
    targetCpaMicros: CurrencyMicros
  ): CurrencyMicros;

  /**
   * Analyzes search term records to map the bid elasticity spectrum between
   * converting and non-converting auctions.
   */
  mapElasticitySpectrum(
    searchTerms: readonly SearchTermRecord[],
    targetCpaMicros?: CurrencyMicros
  ): BidElasticitySpectrum;

  /**
   * Classifies an observed cost-per-click into an econometric elasticity zone.
   */
  classifyElasticityZone(
    cpcMicros: CurrencyMicros,
    optimalCeilingMicros: CurrencyMicros
  ): ElasticityZone;

  /**
   * Computes convex reallocation yield using Cobb-Douglas production elasticity
   * damped by gamma (0.70 - 0.85).
   */
  computeConvexReallocationYield(
    recoveredWasteMicros: CurrencyMicros,
    baselineSpendMicros: CurrencyMicros,
    baselineConversions: number,
    targetCpaMicros: CurrencyMicros,
    options?: ReallocationOptions
  ): ConvexReallocationYield;

  /**
   * Decomposes total advertising spend into the four-tier spend waterfall spectrum.
   */
  computeSpendWaterfall(
    searchTerms: readonly SearchTermRecord[],
    targetCpaMicros: CurrencyMicros
  ): SpendWaterfallSpectrum;
}
