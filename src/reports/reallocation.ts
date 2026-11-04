/**
 * Capital Efficiency and Reallocation Engine (Phase 6)
 *
 * Implements deterministic budget reallocation modeling based on historical
 * account marginal acquisition cost (CPA) and negative keyword waste recovery.
 *
 * Formulas:
 * 1. Incremental Conversions: ΔConversions = Waste_Recovered / CPA_Marginal
 * 2. Projected Total Conversions: Conversions_Total = Conversions_Baseline + ΔConversions
 * 3. Projected Account CPA: CPA_Projected = Spend_Baseline / Conversions_Total
 * 4. Incremental Revenue: ΔRevenue = ΔConversions × AOV_Baseline
 * 5. Projected ROAS: ROAS_Projected = (Revenue_Baseline + ΔRevenue) / Spend_Baseline
 * 6. Efficiency Multiplier: Index = CPA_Baseline / CPA_Projected
 */

export interface ReallocationParams {
  recoveredWaste: number;
  marginalCPA: number;
  baselineSpend?: number;
  baselineConversions?: number;
  baselineRevenue?: number;
}

export interface ReallocationModel {
  recoveredWaste: number;
  marginalCPA: number;
  incrementalConversions: number;
  projectedConversions: number;
  currentCPA: number;
  projectedCPA: number;
  currentROAS: number;
  projectedROAS: number;
  roasLiftPercent: number;
  conversionLiftPercent: number;
  efficiencyMultiplier: number;
  incrementalRevenue: number;
  projectedRevenue: number;
}

/**
 * Computes deterministic capital reallocation metrics from recovered waste
 * and target/marginal acquisition costs.
 */
export function calculateReallocationModel(params: ReallocationParams): ReallocationModel {
  const recoveredWaste = Math.max(0, params.recoveredWaste || 0);
  const marginalCPA = Math.max(0, params.marginalCPA || 0);

  // If marginal CPA is <= 0, no incremental conversions can be projected deterministically
  const incrementalConversions = marginalCPA > 0
    ? Math.round((recoveredWaste / marginalCPA) * 100) / 100
    : 0;

  // Derive or use provided baseline parameters
  const baselineSpend = params.baselineSpend !== undefined
    ? Math.max(0, params.baselineSpend)
    : (recoveredWaste > 0 ? recoveredWaste * 5 : 50000);

  const baselineConversions = params.baselineConversions !== undefined
    ? Math.max(0, params.baselineConversions)
    : (marginalCPA > 0 ? Math.max(1, Math.round(baselineSpend / (marginalCPA * 2))) : 500);

  const currentCPA = baselineConversions > 0
    ? baselineSpend / baselineConversions
    : (marginalCPA > 0 ? marginalCPA * 2 : 100);

  const baselineRevenue = params.baselineRevenue !== undefined
    ? Math.max(0, params.baselineRevenue)
    : baselineConversions * (marginalCPA > 0 ? marginalCPA * 3 : 150);

  const currentROAS = baselineSpend > 0
    ? baselineRevenue / baselineSpend
    : 3.0;

  const aov = baselineConversions > 0
    ? baselineRevenue / baselineConversions
    : (marginalCPA > 0 ? marginalCPA * 3 : 150);

  const incrementalRevenue = incrementalConversions * aov;
  const projectedConversions = baselineConversions + incrementalConversions;
  const projectedRevenue = baselineRevenue + incrementalRevenue;

  const projectedCPA = projectedConversions > 0
    ? baselineSpend / projectedConversions
    : currentCPA;

  const projectedROAS = baselineSpend > 0
    ? projectedRevenue / baselineSpend
    : currentROAS;

  const roasLiftPercent = currentROAS > 0
    ? ((projectedROAS - currentROAS) / currentROAS) * 100
    : 0;

  const conversionLiftPercent = baselineConversions > 0
    ? (incrementalConversions / baselineConversions) * 100
    : 0;

  const efficiencyMultiplier = projectedCPA > 0
    ? currentCPA / projectedCPA
    : 1.0;

  return {
    recoveredWaste,
    marginalCPA,
    incrementalConversions,
    projectedConversions,
    currentCPA,
    projectedCPA,
    currentROAS,
    projectedROAS,
    roasLiftPercent,
    conversionLiftPercent,
    efficiencyMultiplier,
    incrementalRevenue,
    projectedRevenue,
  };
}

/**
 * Calculates the capital efficiency multiplier between baseline and marginal CPA.
 */
export function calculateCapitalEfficiency(
  _recoveredWaste: number,
  marginalCPA: number,
  currentCPA: number
): number {
  if (marginalCPA <= 0) return 1.0;
  return Math.round((currentCPA / marginalCPA) * 100) / 100;
}

export { formatCurrency, type SupportedCurrency } from '../utils/currency.ts';
