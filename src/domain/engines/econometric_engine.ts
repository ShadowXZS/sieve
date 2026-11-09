/**
 * SIEVE Domain Core: Econometric & Bid Elasticity Engine
 *
 * Implements IEconometricEnginePort adhering strictly to Clean Architecture:
 * - Calculates break-even bid ceilings (AdGroup CVR * Target CPA)
 * - Repairs inverted bid ceiling anomaly to prevent unchoking converting traffic
 * - Maps bid elasticity spectrum between converting and non-converting auctions
 * - Implements convex capital reallocation yield damped by Cobb-Douglas gamma
 * - Partitions advertising capital into four-tier spend waterfall
 *
 * Operating constraints: <= 200 lines, pure headless arithmetic, zero UI/DOM.
 */

import type { IEconometricEnginePort, ReallocationOptions } from '../ports/econometric_port.ts';
import type {
  BidElasticitySpectrum,
  ConvexReallocationYield,
  SpendWaterfallSpectrum,
  ElasticityZone,
  CurrencyMicros,
  SearchTermRecord,
} from '../types/index.ts';

function computeMedian(values: CurrencyMicros[]): CurrencyMicros {
  if (values.length === 0) return 0n as CurrencyMicros;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return ((sorted[mid - 1] + sorted[mid]) / 2n) as CurrencyMicros;
}

export class EconometricEngine implements IEconometricEnginePort {
  computeBreakEvenBidCeiling(
    conversionRate: number,
    targetCpaMicros: CurrencyMicros
  ): CurrencyMicros {
    if (conversionRate <= 0 || targetCpaMicros <= 0n) return 0n as CurrencyMicros;
    return BigInt(Math.round(conversionRate * Number(targetCpaMicros))) as CurrencyMicros;
  }

  classifyElasticityZone(
    cpcMicros: CurrencyMicros,
    optimalCeilingMicros: CurrencyMicros,
    breakEvenBoundaryMicros?: CurrencyMicros
  ): ElasticityZone {
    if (cpcMicros <= optimalCeilingMicros) return 'PROFITABLE';
    const boundary = breakEvenBoundaryMicros ?? ((optimalCeilingMicros * 150n) / 100n);
    if (cpcMicros <= boundary) return 'DIMINISHING';
    return 'DEAD_ZONE';
  }

  mapElasticitySpectrum(
    searchTerms: readonly SearchTermRecord[],
    targetCpaMicros?: CurrencyMicros
  ): BidElasticitySpectrum {
    const convertingCpcs: CurrencyMicros[] = [];
    const nonConvertingCpcs: CurrencyMicros[] = [];
    let maxObservedCpc = 0n as CurrencyMicros;
    let totalClicks = 0;
    let totalConversions = 0;

    for (const term of searchTerms) {
      if (term.clicks > 0) {
        totalClicks += term.clicks;
        totalConversions += term.conversions;
        const cpc = term.averageCpcMicros > 0n
          ? term.averageCpcMicros
          : term.spendMicros > 0n
            ? ((term.spendMicros / BigInt(Math.round(term.clicks))) as CurrencyMicros)
            : (0n as CurrencyMicros);

        if (cpc > maxObservedCpc) maxObservedCpc = cpc;
        if (term.conversions > 0) {
          convertingCpcs.push(cpc);
        } else {
          nonConvertingCpcs.push(cpc);
        }
      }
    }

    const convertingMedianCpcMicros = computeMedian(convertingCpcs);
    const nonConvertingMedianCpcMicros = computeMedian(nonConvertingCpcs);
    const cpcBoundaryDeltaMicros = convertingMedianCpcMicros > nonConvertingMedianCpcMicros
      ? ((convertingMedianCpcMicros - nonConvertingMedianCpcMicros) as CurrencyMicros)
      : (0n as CurrencyMicros);

    const cvr = totalClicks > 0 ? totalConversions / totalClicks : 0;
    const optimalBidCeilingMicros = targetCpaMicros && targetCpaMicros > 0n
      ? this.computeBreakEvenBidCeiling(cvr, targetCpaMicros)
      : (0n as CurrencyMicros);

    const elasticityZone = this.classifyElasticityZone(maxObservedCpc, optimalBidCeilingMicros);

    return {
      convertingMedianCpcMicros,
      nonConvertingMedianCpcMicros,
      cpcBoundaryDeltaMicros,
      optimalBidCeilingMicros,
      elasticityZone,
      maxObservedCpcMicros: maxObservedCpc,
    };
  }

  computeConvexReallocationYield(
    recoveredWasteMicros: CurrencyMicros,
    baselineSpendMicros: CurrencyMicros,
    baselineConversions: number,
    targetCpaMicros: CurrencyMicros,
    options?: ReallocationOptions
  ): ConvexReallocationYield {
    const rawGamma = options?.gammaDamping ?? 0.75;
    const elasticityCoefficient = Math.min(0.85, Math.max(0.70, rawGamma));
    const annualMult = BigInt(Math.round(options?.annualizationMultiplier ?? 12));

    const safeRecovered = recoveredWasteMicros > 0n ? recoveredWasteMicros : 0n;
    const safeTargetCpa = targetCpaMicros > 0n ? targetCpaMicros : 0n;
    const safeBaselineConvs = Math.max(0, baselineConversions);

    const linearConversions = safeTargetCpa > 0n
      ? Number(safeRecovered / safeTargetCpa)
      : 0;
    const incrementalConversions = Math.round(linearConversions * elasticityCoefficient);
    const projectedConversions = safeBaselineConvs + incrementalConversions;

    const projectedRoasLift = safeBaselineConvs > 0
      ? incrementalConversions / safeBaselineConvs
      : 0;

    const efficiencyMultiplier = safeBaselineConvs > 0
      ? projectedConversions / safeBaselineConvs
      : 1.0;

    const annualizedRecoveryMicros = (safeRecovered * annualMult) as CurrencyMicros;

    return {
      baselineConversions: safeBaselineConvs,
      projectedConversions,
      elasticityCoefficient,
      targetCpaMicros: safeTargetCpa as CurrencyMicros,
      projectedRoasLift,
      incrementalConversions,
      annualizedRecoveryMicros,
      efficiencyMultiplier,
    };
  }

  computeSpendWaterfall(
    searchTerms: readonly SearchTermRecord[],
    targetCpaMicros: CurrencyMicros,
    options?: { optimalBidCeilingMicros?: CurrencyMicros; minClicks?: number }
  ): SpendWaterfallSpectrum {
    let securedSpendMicros = 0n as CurrencyMicros;
    let exploratorySpendMicros = 0n as CurrencyMicros;
    let wasteSpendMicros = 0n as CurrencyMicros;

    const safeTargetCpa = targetCpaMicros > 0n ? targetCpaMicros : 0n;
    const ceiling = options?.optimalBidCeilingMicros ?? 0n;
    const minClicks = options?.minClicks ?? 5;

    for (const term of searchTerms) {
      const spend = term.spendMicros > 0n ? term.spendMicros : 0n;
      if (spend === 0n) continue;

      if (term.conversions > 0) {
        if (safeTargetCpa > 0n) {
          const allowableCost = BigInt(Math.round(term.conversions * Number(safeTargetCpa))) as CurrencyMicros;
          if (spend <= allowableCost) {
            securedSpendMicros = (securedSpendMicros + spend) as CurrencyMicros;
          } else {
            securedSpendMicros = (securedSpendMicros + allowableCost) as CurrencyMicros;
            wasteSpendMicros = (wasteSpendMicros + (spend - allowableCost)) as CurrencyMicros;
          }
        } else {
          securedSpendMicros = (securedSpendMicros + spend) as CurrencyMicros;
        }
      } else {
        const isLowSample = (safeTargetCpa > 0n && spend < safeTargetCpa) || (term.clicks > 0 && term.clicks < Math.max(10, minClicks * 2));
        const isHighCpc = ceiling > 0n && term.averageCpcMicros >= ceiling;
        const isExploratory = isLowSample && (isHighCpc || term.conversions <= 0);

        if (isExploratory) {
          exploratorySpendMicros = (exploratorySpendMicros + spend) as CurrencyMicros;
        } else if (term.hasCollision) {
          securedSpendMicros = (securedSpendMicros + spend) as CurrencyMicros;
        } else {
          wasteSpendMicros = (wasteSpendMicros + spend) as CurrencyMicros;
        }
      }
    }

    const totalSpendMicros = (securedSpendMicros + exploratorySpendMicros + wasteSpendMicros) as CurrencyMicros;
    const protectedSpendMicros = (totalSpendMicros >= (wasteSpendMicros + exploratorySpendMicros)
      ? (totalSpendMicros - wasteSpendMicros - exploratorySpendMicros)
      : 0n) as CurrencyMicros;

    return {
      totalSpendMicros,
      wasteSpendMicros,
      securedSpendMicros: protectedSpendMicros,
      exploratorySpendMicros,
    };
  }
}
