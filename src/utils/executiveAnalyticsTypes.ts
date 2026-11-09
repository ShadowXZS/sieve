/**
 * Sieve Executive Analytics Types & Statistical Utilities
 * Physical line ceiling: <= 250 lines.
 */

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
