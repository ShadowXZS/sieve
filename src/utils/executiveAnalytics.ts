/**
 * Sieve Executive Analytics Engine (Phase 10)
 *
 * Provides analytical models and calculations for the Executive Analytics Dashboard:
 * 1. Tier 1 (Rose/Red): Identified Waste Bleed and CPA Drag.
 * 2. Tier 2 (Emerald/Green): Safe-List Protected Conversions and Secured Revenue.
 * 3. Tier 3 (Amber/Orange): Exploratory High-Risk Clicks (High CPC, low sample size)
 *    and Bid Elasticity Probe (Optimal Bid Ceiling).
 * 4. Tier 4 (Indigo/Slate): Capital Reallocation Yield and Annualized Recovery.
 * 5. Spend Waterfall Breakdown: Proportional allocation across account spend tiers.
 *
 * Mathematical Invariants:
 * - Pure functional transformations.
 * - Zero division-by-zero, Zero NaN, Zero Infinity.
 * - Strict multi-currency support with zero-decimal rounding for JPY ('¥').
 */

import type { PersistedNegativeKeyword } from '../workers/protocol.ts';
import type { SieveThresholds, KPISummary } from '../state/useSieveStore.ts';
import { type SupportedCurrency, formatCurrency } from './currency.ts';
import { calculateReallocationModel } from '../reports/reallocation.ts';

export interface WasteBleedMetrics {
  amount: number;
  formatted: string;
  cpaDrag: number;
  formattedCpaDrag: string;
  dragRatioPercent: number;
  candidateCount: number;
}

export interface SafeListProtectionMetrics {
  protectedConversions: number;
  securedRevenue: number;
  formattedSecuredRevenue: string;
  collisionCount: number;
  exactLockedCount: number;
}

export interface ExploratoryRiskMetrics {
  highRiskClicks: number;
  highRiskSpend: number;
  formattedHighRiskSpend: string;
  optimalBidCeiling: number;
  formattedOptimalBidCeiling: string;
  elasticityZone: 'efficient' | 'diminishing' | 'negative';
  maxObservedCPC: number;
  formattedMaxObservedCPC: string;
  baselineCVR: number;
  convertingMedianCPC: number;
  formattedConvertingMedianCPC: string;
  nonConvertingMedianCPC: number;
  formattedNonConvertingMedianCPC: string;
  boundaryDelta: number;
  formattedBoundaryDelta: string;
}

/**
 * Computes median value from a numeric array with NaN/Infinity protection.
 */
export function calculateMedian(values: number[]): number {
  const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  if (valid.length === 0) return 0;
  valid.sort((a, b) => a - b);
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 !== 0 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

export interface ReallocationYieldMetrics {
  incrementalConversions: number;
  annualizedRecovery: number;
  formattedAnnualizedRecovery: string;
  roasLiftPercent: number;
  efficiencyMultiplier: number;
}

export interface SpendWaterfallMetrics {
  totalSpend: number;
  formattedTotalSpend: string;
  securedSpend: number;
  formattedSecuredSpend: string;
  securedPct: number;
  exploratorySpend: number;
  formattedExploratorySpend: string;
  exploratoryPct: number;
  wasteSpend: number;
  formattedWasteSpend: string;
  wastePct: number;
}

export interface ExecutiveAnalytics {
  wasteBleed: WasteBleedMetrics;
  safeListProtection: SafeListProtectionMetrics;
  exploratoryRisk: ExploratoryRiskMetrics;
  reallocationYield: ReallocationYieldMetrics;
  spendWaterfall: SpendWaterfallMetrics;
}

/**
 * Calculates the Optimal Bid Ceiling where higher bids stop yielding conversions
 * and enter diminishing/negative marginal return zones.
 *
 * Formula:
 * - When empirical converting CPCs exist:
 *     Ceiling = min(max(converting_cpc) * 1.10, TargetCPA * CVR * 1.25)
 * - Otherwise:
 *     Ceiling = TargetCPA * CVR * 1.15
 *
 * Invariant: JPY enforces zero-decimal rounding, other currencies 2-decimals.
 */
export function calculateOptimalBidCeiling(
  targetCPA: number,
  cvr: number,
  convertingCPCs: number[] = [],
  currency: SupportedCurrency = '$'
): number {
  const safeTargetCPA = typeof targetCPA === 'number' && Number.isFinite(targetCPA) ? Math.max(0, targetCPA) : 0;
  const safeCVR = typeof cvr === 'number' && Number.isFinite(cvr) ? Math.max(0.001, Math.min(1.0, cvr)) : 0.035;

  if (safeTargetCPA <= 0) return 0;

  const breakEvenBid = safeTargetCPA * safeCVR;
  let ceiling: number;

  const validConvertingCPCs = convertingCPCs.filter((cpc) => typeof cpc === 'number' && Number.isFinite(cpc) && cpc > 0);

  if (validConvertingCPCs.length > 0) {
    const maxConvertingCPC = Math.max(...validConvertingCPCs);
    ceiling = Math.min(maxConvertingCPC * 1.1, breakEvenBid * 1.25);
  } else {
    ceiling = breakEvenBid * 1.15;
  }

  // Enforce currency-specific rounding
  if (currency === '¥') {
    return Math.max(1, Math.round(ceiling));
  }
  return Math.max(0.01, Math.round(ceiling * 100) / 100);
}

/**
 * Computes the complete Executive Analytics Suite from active state.
 */
export function computeExecutiveAnalytics(
  keywords: PersistedNegativeKeyword[],
  thresholds: SieveThresholds,
  kpi: KPISummary,
  currency: SupportedCurrency = '$'
): ExecutiveAnalytics {
  const targetCPA = typeof thresholds?.targetCPA === 'number' && Number.isFinite(thresholds.targetCPA)
    ? Math.max(0, thresholds.targetCPA)
    : 50;

  const totalWaste = typeof kpi?.totalWaste === 'number' && Number.isFinite(kpi.totalWaste)
    ? Math.max(0, kpi.totalWaste)
    : 0;

  const collisionCount = typeof kpi?.collisionCount === 'number' && Number.isFinite(kpi.collisionCount)
    ? Math.max(0, kpi.collisionCount)
    : 0;

  const exactLockedCount = typeof kpi?.exactLockedCount === 'number' && Number.isFinite(kpi.exactLockedCount)
    ? Math.max(0, kpi.exactLockedCount)
    : 0;

  // --- Aggregate Raw Account Metrics ---
  let rawTotalSpend = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let maxObservedCPC = 0;
  const convertingCPCs: number[] = [];
  const nonConvertingCPCs: number[] = [];

  const len = keywords.length;
  for (let i = 0; i < len; i++) {
    const k = keywords[i];
    const cost = typeof k.cost === 'number' && Number.isFinite(k.cost)
      ? Math.max(0, k.cost)
      : (typeof k.marginalWaste === 'number' && Number.isFinite(k.marginalWaste) ? Math.max(0, k.marginalWaste) : 0);
    const clicks = typeof k.clicks === 'number' && Number.isFinite(k.clicks) ? Math.max(0, k.clicks) : 0;
    const convs = typeof k.conversions === 'number' && Number.isFinite(k.conversions) ? Math.max(0, k.conversions) : 0;

    rawTotalSpend += cost;
    totalClicks += clicks;
    totalConversions += convs;

    if (clicks > 0 && cost > 0) {
      const cpc = cost / clicks;
      if (Number.isFinite(cpc)) {
        if (cpc > maxObservedCPC) maxObservedCPC = cpc;
        if (convs > 0) {
          convertingCPCs.push(cpc);
        } else {
          nonConvertingCPCs.push(cpc);
        }
      }
    }
  }

  // Fallback spend modeling when keyword list has sparse cost fields
  const totalSpend = rawTotalSpend > 0 ? rawTotalSpend : Math.max(totalWaste * 1.5, totalWaste > 0 ? totalWaste + 500 : 0);

  // --- Baseline Conversion Rate (CVR) ---
  const empiricalCVR = totalClicks > 0 && totalConversions > 0 ? totalConversions / totalClicks : 0;
  const baselineCVR = empiricalCVR > 0 ? Math.min(0.25, Math.max(0.01, empiricalCVR)) : 0.035;

  // --- Tier 1: Rose (Waste Bleed & CPA Drag) ---
  const formattedWaste = formatCurrency(totalWaste, currency);
  const dragRatioPercent = totalSpend > 0 ? Math.min(100, Math.round((totalWaste / totalSpend) * 1000) / 10) : 0;

  let cpaDrag = 0;
  if (totalConversions > 0) {
    const realizedCPA = totalSpend / totalConversions;
    cpaDrag = Math.max(0, realizedCPA - targetCPA);
  } else {
    cpaDrag = totalWaste;
  }
  cpaDrag = currency === '¥' ? Math.round(cpaDrag) : Math.round(cpaDrag * 100) / 100;
  const formattedCpaDrag = formatCurrency(cpaDrag, currency);

  // --- Tier 2: Emerald (Safe-List Protected Conversions & Secured Revenue) ---
  let protectedConversions = 0;
  for (let i = 0; i < len; i++) {
    const k = keywords[i];
    if (k.hasCollision || k.matchType === 'exact') {
      const convs = typeof k.conversions === 'number' && Number.isFinite(k.conversions) ? k.conversions : 0;
      protectedConversions += convs;
    }
  }
  // If no explicit conversions recorded on collided terms, use collisionCount as safety baseline
  if (protectedConversions === 0 && collisionCount > 0) {
    protectedConversions = collisionCount;
  }

  // Baseline AOV = Target CPA * 3 (standard 3:1 ROAS baseline from reallocation engine)
  const baselineAOV = targetCPA * 3;
  let securedRevenue = protectedConversions * baselineAOV;
  securedRevenue = currency === '¥' ? Math.round(securedRevenue) : Math.round(securedRevenue * 100) / 100;
  const formattedSecuredRevenue = formatCurrency(securedRevenue, currency);

  // --- Tier 3: Amber (Exploratory High-Risk Clicks & Bid Elasticity Probe) ---
  const optimalBidCeiling = calculateOptimalBidCeiling(targetCPA, baselineCVR, convertingCPCs, currency);
  const formattedOptimalBidCeiling = formatCurrency(optimalBidCeiling, currency);

  let highRiskClicks = 0;
  let highRiskSpend = 0;

  for (let i = 0; i < len; i++) {
    const k = keywords[i];
    const clicks = typeof k.clicks === 'number' && Number.isFinite(k.clicks) ? k.clicks : 0;
    const cost = typeof k.cost === 'number' && Number.isFinite(k.cost) ? k.cost : 0;
    const convs = typeof k.conversions === 'number' && Number.isFinite(k.conversions) ? k.conversions : 0;
    const cpc = clicks > 0 ? cost / clicks : 0;

    // High risk: non-converting or low-converting with high CPC and small sample size
    const isLowSample = clicks > 0 && clicks < Math.max(10, (thresholds?.minClicks || 5) * 2);
    const isHighCPC = cpc >= optimalBidCeiling * 0.9;
    const isUnproven = convs <= 0;

    if (isLowSample && (isHighCPC || isUnproven)) {
      highRiskClicks += clicks;
      highRiskSpend += cost;
    }
  }

  // Fallback modeling for high risk clicks when dataset lacks click-level breakdowns
  if (highRiskClicks === 0 && totalWaste > 0 && totalClicks === 0) {
    const estimatedClicks = Math.max(1, Math.round(totalWaste / (optimalBidCeiling || 2.5) * 0.2));
    highRiskClicks = estimatedClicks;
    highRiskSpend = currency === '¥' ? Math.round(totalWaste * 0.2) : Math.round(totalWaste * 0.2 * 100) / 100;
  }

  const roundedHighRiskSpend = currency === '¥' ? Math.round(highRiskSpend) : Math.round(highRiskSpend * 100) / 100;
  const formattedHighRiskSpend = formatCurrency(roundedHighRiskSpend, currency);

  let elasticityZone: 'efficient' | 'diminishing' | 'negative' = 'efficient';
  if (maxObservedCPC > optimalBidCeiling * 1.5) {
    elasticityZone = 'negative';
  } else if (maxObservedCPC > optimalBidCeiling) {
    elasticityZone = 'diminishing';
  }

  const roundedMaxCPC = currency === '¥' ? Math.round(maxObservedCPC) : Math.round(maxObservedCPC * 100) / 100;
  const formattedMaxObservedCPC = formatCurrency(roundedMaxCPC, currency);

  // --- Tier 4: Indigo (Capital Reallocation Yield & Annualized Recovery) ---
  const reallocation = calculateReallocationModel({
    recoveredWaste: totalWaste,
    marginalCPA: targetCPA,
  });

  const rawAnnualized = totalWaste * 12;
  const annualizedRecovery = currency === '¥' ? Math.round(rawAnnualized) : Math.round(rawAnnualized * 100) / 100;
  const formattedAnnualizedRecovery = formatCurrency(annualizedRecovery, currency);

  // --- Spend Waterfall Breakdown ---
  // Principled partitioning across efficiency tiers: Secured, Exploratory, and Waste
  let calculatedSecuredSpend = 0;
  let calculatedExploratorySpend = 0;
  let calculatedWasteSpend = 0;

  for (let i = 0; i < len; i++) {
    const k = keywords[i];
    const cost = typeof k.cost === 'number' && Number.isFinite(k.cost)
      ? Math.max(0, k.cost)
      : (typeof k.marginalWaste === 'number' && Number.isFinite(k.marginalWaste) ? Math.max(0, k.marginalWaste) : 0);
    const convs = typeof k.conversions === 'number' && Number.isFinite(k.conversions) ? k.conversions : 0;
    const clicks = typeof k.clicks === 'number' && Number.isFinite(k.clicks) ? k.clicks : 0;

    if (convs > 0 || k.hasCollision) {
      // Converting or safe-list protected traffic
      const allowableCost = convs > 0 ? convs * targetCPA : cost;
      calculatedSecuredSpend += Math.min(cost, allowableCost);
      if (cost > allowableCost) {
        calculatedWasteSpend += (cost - allowableCost);
      }
    } else {
      // Non-converting traffic
      const isLowSample = clicks > 0 && clicks < Math.max(10, (thresholds?.minClicks || 5) * 2);
      if (isLowSample || k.confidenceScore < 0.85) {
        calculatedExploratorySpend += cost;
      } else {
        calculatedWasteSpend += cost;
      }
    }
  }

  // Ensure waterfall totals match overall account metrics gracefully
  let wasteSpend = calculatedWasteSpend;
  let exploratorySpend = calculatedExploratorySpend;
  let securedSpend = calculatedSecuredSpend;

  if (rawTotalSpend === 0 && totalWaste > 0) {
    wasteSpend = totalWaste;
    exploratorySpend = roundedHighRiskSpend;
    securedSpend = Math.max(0, totalSpend - wasteSpend - exploratorySpend);
  }

  if (currency === '¥') {
    wasteSpend = Math.round(wasteSpend);
    exploratorySpend = Math.round(exploratorySpend);
    securedSpend = Math.round(securedSpend);
  } else {
    wasteSpend = Math.round(wasteSpend * 100) / 100;
    exploratorySpend = Math.round(exploratorySpend * 100) / 100;
    securedSpend = Math.round(securedSpend * 100) / 100;
  }

  const safeTotalSpend = securedSpend + exploratorySpend + wasteSpend;

  const securedPct = safeTotalSpend > 0 ? Math.round((securedSpend / safeTotalSpend) * 1000) / 10 : 0;
  const exploratoryPct = safeTotalSpend > 0 ? Math.round((exploratorySpend / safeTotalSpend) * 1000) / 10 : 0;
  const wastePct = safeTotalSpend > 0 ? Math.round((wasteSpend / safeTotalSpend) * 1000) / 10 : 0;

  const convertingMedianCPC = calculateMedian(convertingCPCs);
  const nonConvertingMedianCPC = calculateMedian(nonConvertingCPCs);
  const boundaryDelta = Math.max(0, convertingMedianCPC - nonConvertingMedianCPC);

  const roundedConvertingMedian = currency === '¥' ? Math.round(convertingMedianCPC) : Math.round(convertingMedianCPC * 100) / 100;
  const roundedNonConvertingMedian = currency === '¥' ? Math.round(nonConvertingMedianCPC) : Math.round(nonConvertingMedianCPC * 100) / 100;
  const roundedBoundaryDelta = currency === '¥' ? Math.round(boundaryDelta) : Math.round(boundaryDelta * 100) / 100;

  const formattedConvertingMedianCPC = formatCurrency(roundedConvertingMedian, currency);
  const formattedNonConvertingMedianCPC = formatCurrency(roundedNonConvertingMedian, currency);
  const formattedBoundaryDelta = formatCurrency(roundedBoundaryDelta, currency);

  return {
    wasteBleed: {
      amount: totalWaste,
      formatted: formattedWaste,
      cpaDrag,
      formattedCpaDrag,
      dragRatioPercent,
      candidateCount: kpi?.totalKeywords || 0,
    },
    safeListProtection: {
      protectedConversions,
      securedRevenue,
      formattedSecuredRevenue,
      collisionCount,
      exactLockedCount,
    },
    exploratoryRisk: {
      highRiskClicks,
      highRiskSpend: roundedHighRiskSpend,
      formattedHighRiskSpend,
      optimalBidCeiling,
      formattedOptimalBidCeiling,
      elasticityZone,
      maxObservedCPC: roundedMaxCPC,
      formattedMaxObservedCPC,
      baselineCVR,
      convertingMedianCPC: roundedConvertingMedian,
      formattedConvertingMedianCPC,
      nonConvertingMedianCPC: roundedNonConvertingMedian,
      formattedNonConvertingMedianCPC,
      boundaryDelta: roundedBoundaryDelta,
      formattedBoundaryDelta,
    },
    reallocationYield: {
      incrementalConversions: reallocation.incrementalConversions,
      annualizedRecovery,
      formattedAnnualizedRecovery,
      roasLiftPercent: Math.round(reallocation.roasLiftPercent * 10) / 10,
      efficiencyMultiplier: Math.round(reallocation.efficiencyMultiplier * 100) / 100,
    },
    spendWaterfall: {
      totalSpend: safeTotalSpend,
      formattedTotalSpend: formatCurrency(safeTotalSpend, currency),
      securedSpend,
      formattedSecuredSpend: formatCurrency(securedSpend, currency),
      securedPct,
      exploratorySpend,
      formattedExploratorySpend: formatCurrency(exploratorySpend, currency),
      exploratoryPct,
      wasteSpend,
      formattedWasteSpend: formatCurrency(wasteSpend, currency),
      wastePct,
    },
  };
}
