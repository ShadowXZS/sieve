/**
 * Executive Analytics Tiers Computer
 * Implements individual metrics for Waste, Safe-List, Bid Elasticity, and Spend Waterfall.
 * Physical line ceiling: <= 250 lines.
 */

import type { PersistedNegativeKeyword } from '../workers/protocol.ts';
import type { SieveThresholds, KPISummary } from '../state/useSieveStore.ts';
import { type SupportedCurrency, formatCurrency } from './currency.ts';
import { calculateReallocationModel } from '../reports/reallocation.ts';
import {
  type WasteBleedMetrics,
  type SafeListProtectionMetrics,
  type ExploratoryRiskMetrics,
  type ReallocationYieldMetrics,
  type SpendWaterfallMetrics,
  calculateMedian,
} from './executiveAnalyticsTypes.ts';

export function calculateOptimalBidCeiling(
  targetCPA: number,
  cvr: number,
  convertingCPCs: number[] = [],
  currency: SupportedCurrency = '$'
): number {
  const safeTargetCPA = typeof targetCPA === 'number' && Number.isFinite(targetCPA) ? Math.max(0, targetCPA) : 0;
  if (safeTargetCPA <= 0) return 0;

  const safeCVR = typeof cvr === 'number' && Number.isFinite(cvr) && cvr > 0 ? cvr : 0.035;

  let ceiling = 0;
  const validConverting = convertingCPCs.filter((c) => typeof c === 'number' && Number.isFinite(c) && c > 0);

  if (validConverting.length > 0) {
    const maxConverting = Math.max(...validConverting);
    ceiling = Math.min(maxConverting * 1.1, safeTargetCPA * safeCVR * 1.25);
  } else {
    ceiling = safeTargetCPA * safeCVR * 1.15;
  }

  if (currency === '¥') {
    return Math.round(ceiling);
  }
  return Math.round(ceiling * 100) / 100;
}

export function computeExecutiveTiers(
  keywords: PersistedNegativeKeyword[],
  thresholds: SieveThresholds,
  kpi: KPISummary,
  currency: SupportedCurrency
): {
  wasteBleed: WasteBleedMetrics;
  safeListProtection: SafeListProtectionMetrics;
  exploratoryRisk: ExploratoryRiskMetrics;
  reallocationYield: ReallocationYieldMetrics;
  spendWaterfall: SpendWaterfallMetrics;
} {
  const targetCPA = typeof thresholds?.targetCPA === 'number' && Number.isFinite(thresholds.targetCPA) ? Math.max(0, thresholds.targetCPA) : 50;
  const totalWaste = typeof kpi?.totalWaste === 'number' && Number.isFinite(kpi.totalWaste) ? Math.max(0, kpi.totalWaste) : 0;
  const collisionCount = typeof kpi?.collisionCount === 'number' ? kpi.collisionCount : 0;
  const exactLockedCount = typeof kpi?.exactLockedCount === 'number' ? kpi.exactLockedCount : 0;

  const len = keywords.length;
  let rawTotalSpend = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let maxObservedCPC = 0;
  const convertingCPCs: number[] = [];
  const nonConvertingCPCs: number[] = [];

  for (let i = 0; i < len; i++) {
    const k = keywords[i];
    const cost = typeof k.cost === 'number' && Number.isFinite(k.cost) ? Math.max(0, k.cost) : 0;
    const clicks = typeof k.clicks === 'number' && Number.isFinite(k.clicks) ? Math.max(0, k.clicks) : 0;
    const convs = typeof k.conversions === 'number' && Number.isFinite(k.conversions) ? Math.max(0, k.conversions) : 0;
    rawTotalSpend += cost;
    totalClicks += clicks;
    totalConversions += convs;

    if (clicks > 0) {
      const cpc = cost / clicks;
      if (Number.isFinite(cpc) && cpc > 0) {
        if (cpc > maxObservedCPC) maxObservedCPC = cpc;
        if (convs > 0) convertingCPCs.push(cpc);
        else nonConvertingCPCs.push(cpc);
      }
    }
  }

  const totalSpend = rawTotalSpend > 0 ? rawTotalSpend : Math.max(totalWaste * 1.5, totalWaste > 0 ? totalWaste + 500 : 0);
  const empiricalCVR = totalClicks > 0 && totalConversions > 0 ? totalConversions / totalClicks : 0;
  const baselineCVR = empiricalCVR > 0 ? Math.min(0.25, Math.max(0.01, empiricalCVR)) : 0.035;

  // Tier 1: Waste Bleed
  const dragRatioPercent = totalSpend > 0 ? Math.min(100, Math.round((totalWaste / totalSpend) * 1000) / 10) : 0;
  let cpaDrag = totalConversions > 0 ? Math.max(0, totalSpend / totalConversions - targetCPA) : totalWaste;
  cpaDrag = currency === '¥' ? Math.round(cpaDrag) : Math.round(cpaDrag * 100) / 100;

  // Tier 2: Safe-List Protection
  let protectedConversions = 0;
  for (let i = 0; i < len; i++) {
    const k = keywords[i];
    if (k.hasCollision || k.matchType === 'exact') {
      protectedConversions += typeof k.conversions === 'number' && Number.isFinite(k.conversions) ? k.conversions : 0;
    }
  }
  if (protectedConversions === 0 && collisionCount > 0) protectedConversions = collisionCount;

  let securedRevenue = protectedConversions * (targetCPA * 3);
  securedRevenue = currency === '¥' ? Math.round(securedRevenue) : Math.round(securedRevenue * 100) / 100;

  // Tier 3: Exploratory Risk
  const optimalBidCeiling = calculateOptimalBidCeiling(targetCPA, baselineCVR, convertingCPCs, currency);
  let highRiskClicks = 0;
  let highRiskSpend = 0;

  for (let i = 0; i < len; i++) {
    const k = keywords[i];
    const clicks = typeof k.clicks === 'number' && Number.isFinite(k.clicks) ? k.clicks : 0;
    const cost = typeof k.cost === 'number' && Number.isFinite(k.cost) ? k.cost : 0;
    const convs = typeof k.conversions === 'number' && Number.isFinite(k.conversions) ? k.conversions : 0;
    const cpc = clicks > 0 ? cost / clicks : 0;
    const isLowSample = clicks > 0 && clicks < Math.max(10, (thresholds?.minClicks || 5) * 2);
    const isHighCPC = cpc >= optimalBidCeiling * 0.9;
    if (isLowSample && (isHighCPC || convs <= 0)) {
      highRiskClicks += clicks;
      highRiskSpend += cost;
    }
  }

  if (highRiskClicks === 0 && totalWaste > 0 && totalClicks === 0) {
    highRiskClicks = Math.max(1, Math.round(totalWaste / (optimalBidCeiling || 2.5) * 0.2));
    highRiskSpend = currency === '¥' ? Math.round(totalWaste * 0.2) : Math.round(totalWaste * 0.2 * 100) / 100;
  }
  const roundedHighRiskSpend = currency === '¥' ? Math.round(highRiskSpend) : Math.round(highRiskSpend * 100) / 100;

  let elasticityZone: 'efficient' | 'diminishing' | 'negative' = 'efficient';
  if (maxObservedCPC > optimalBidCeiling * 1.5) elasticityZone = 'negative';
  else if (maxObservedCPC > optimalBidCeiling) elasticityZone = 'diminishing';

  const roundedMaxCPC = currency === '¥' ? Math.round(maxObservedCPC) : Math.round(maxObservedCPC * 100) / 100;

  // Tier 4: Reallocation
  const reallocation = calculateReallocationModel({ recoveredWaste: totalWaste, marginalCPA: targetCPA });
  const rawAnnualized = totalWaste * 12;
  const annualizedRecovery = currency === '¥' ? Math.round(rawAnnualized) : Math.round(rawAnnualized * 100) / 100;

  // Spend Waterfall
  let calcSecured = 0, calcExploratory = 0, calcWaste = 0;
  for (let i = 0; i < len; i++) {
    const k = keywords[i];
    const cost = typeof k.cost === 'number' && Number.isFinite(k.cost) ? Math.max(0, k.cost) : (typeof k.marginalWaste === 'number' && Number.isFinite(k.marginalWaste) ? Math.max(0, k.marginalWaste) : 0);
    const convs = typeof k.conversions === 'number' && Number.isFinite(k.conversions) ? k.conversions : 0;
    const clicks = typeof k.clicks === 'number' && Number.isFinite(k.clicks) ? k.clicks : 0;

    if (convs > 0 || k.hasCollision) {
      const allowableCost = convs > 0 ? convs * targetCPA : cost;
      calcSecured += Math.min(cost, allowableCost);
      if (cost > allowableCost) calcWaste += (cost - allowableCost);
    } else {
      const isLowSample = clicks > 0 && clicks < Math.max(10, (thresholds?.minClicks || 5) * 2);
      if (isLowSample || (k.confidenceScore ?? 0) < 0.85) calcExploratory += cost;
      else calcWaste += cost;
    }
  }

  let wasteSpend = calcWaste, exploratorySpend = calcExploratory, securedSpend = calcSecured;
  if (rawTotalSpend === 0 && totalWaste > 0) {
    wasteSpend = totalWaste;
    exploratorySpend = roundedHighRiskSpend;
    securedSpend = Math.max(0, totalSpend - wasteSpend - exploratorySpend);
  }

  if (currency === '¥') {
    wasteSpend = Math.round(wasteSpend); exploratorySpend = Math.round(exploratorySpend); securedSpend = Math.round(securedSpend);
  } else {
    wasteSpend = Math.round(wasteSpend * 100) / 100; exploratorySpend = Math.round(exploratorySpend * 100) / 100; securedSpend = Math.round(securedSpend * 100) / 100;
  }
  const safeTotalSpend = securedSpend + exploratorySpend + wasteSpend;

  const convertingMedianCPC = calculateMedian(convertingCPCs);
  const nonConvertingMedianCPC = calculateMedian(nonConvertingCPCs);
  const boundaryDelta = Math.max(0, convertingMedianCPC - nonConvertingMedianCPC);
  const roundedConvertingMedian = currency === '¥' ? Math.round(convertingMedianCPC) : Math.round(convertingMedianCPC * 100) / 100;
  const roundedNonConvertingMedian = currency === '¥' ? Math.round(nonConvertingMedianCPC) : Math.round(nonConvertingMedianCPC * 100) / 100;
  const roundedBoundaryDelta = currency === '¥' ? Math.round(boundaryDelta) : Math.round(boundaryDelta * 100) / 100;

  return {
    wasteBleed: {
      amount: totalWaste, formatted: formatCurrency(totalWaste, currency),
      cpaDrag, formattedCpaDrag: formatCurrency(cpaDrag, currency), dragRatioPercent, candidateCount: kpi?.totalKeywords || 0,
    },
    safeListProtection: {
      protectedConversions, securedRevenue, formattedSecuredRevenue: formatCurrency(securedRevenue, currency), collisionCount, exactLockedCount,
    },
    exploratoryRisk: {
      highRiskClicks, highRiskSpend: roundedHighRiskSpend, formattedHighRiskSpend: formatCurrency(roundedHighRiskSpend, currency),
      optimalBidCeiling, formattedOptimalBidCeiling: formatCurrency(optimalBidCeiling, currency), elasticityZone,
      maxObservedCPC: roundedMaxCPC, formattedMaxObservedCPC: formatCurrency(roundedMaxCPC, currency), baselineCVR,
      convertingMedianCPC: roundedConvertingMedian, formattedConvertingMedianCPC: formatCurrency(roundedConvertingMedian, currency),
      nonConvertingMedianCPC: roundedNonConvertingMedian, formattedNonConvertingMedianCPC: formatCurrency(roundedNonConvertingMedian, currency),
      boundaryDelta: roundedBoundaryDelta, formattedBoundaryDelta: formatCurrency(roundedBoundaryDelta, currency),
    },
    reallocationYield: {
      incrementalConversions: reallocation.incrementalConversions, annualizedRecovery, formattedAnnualizedRecovery: formatCurrency(annualizedRecovery, currency),
      roasLiftPercent: Math.round(reallocation.roasLiftPercent * 10) / 10, efficiencyMultiplier: Math.round(reallocation.efficiencyMultiplier * 100) / 100,
    },
    spendWaterfall: {
      totalSpend: safeTotalSpend, formattedTotalSpend: formatCurrency(safeTotalSpend, currency), securedSpend, formattedSecuredSpend: formatCurrency(securedSpend, currency),
      securedPct: safeTotalSpend > 0 ? Math.round((securedSpend / safeTotalSpend) * 1000) / 10 : 0, exploratorySpend, formattedExploratorySpend: formatCurrency(exploratorySpend, currency),
      exploratoryPct: safeTotalSpend > 0 ? Math.round((exploratorySpend / safeTotalSpend) * 1000) / 10 : 0, wasteSpend, formattedWasteSpend: formatCurrency(wasteSpend, currency),
      wastePct: safeTotalSpend > 0 ? Math.round((wasteSpend / safeTotalSpend) * 1000) / 10 : 0,
    },
  };
}
