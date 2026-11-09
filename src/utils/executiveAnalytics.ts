/**
 * Sieve Executive Analytics Engine (Phase 10)
 *
 * Provides analytical models and calculations for the Executive Analytics Dashboard:
 * 1. Tier 1 (Rose/Red): Identified Waste Bleed and CPA Drag.
 * 2. Tier 2 (Emerald/Green): Safe-List Protected Conversions and Secured Revenue.
 * 3. Tier 3 (Amber/Orange): Exploratory High-Risk Clicks and Bid Elasticity Probe.
 * 4. Tier 4 (Indigo/Slate): Capital Reallocation Yield and Annualized Recovery.
 * 5. Spend Waterfall Breakdown: Proportional allocation across account spend tiers.
 * Physical line ceiling: <= 250 lines.
 */

import type {
  PersistedNegativeKeyword,
  FragmentedLongTailResult,
  MatchTypeDilutionResult,
  LongTailRootTokenRecord,
  DilutedQueryRecord,
} from '../workers/protocol.ts';
import type { SieveThresholds, KPISummary } from '../state/useSieveStore.ts';
import { type SupportedCurrency } from './currency.ts';
import {
  type WasteBleedMetrics,
  type SafeListProtectionMetrics,
  type ExploratoryRiskMetrics,
  type ReallocationYieldMetrics,
  type SpendWaterfallMetrics,
  type ExecutiveAnalytics,
  calculateMedian,
} from './executiveAnalyticsTypes.ts';
import { calculateOptimalBidCeiling, computeExecutiveTiers } from './executiveAnalyticsTiers.ts';

export type {
  WasteBleedMetrics,
  SafeListProtectionMetrics,
  ExploratoryRiskMetrics,
  ReallocationYieldMetrics,
  SpendWaterfallMetrics,
  ExecutiveAnalytics,
};
export { calculateMedian, calculateOptimalBidCeiling };

export function computeExecutiveAnalytics(
  keywords: PersistedNegativeKeyword[],
  thresholds: SieveThresholds,
  kpi: KPISummary,
  currency: SupportedCurrency = '$'
): ExecutiveAnalytics {
  return computeExecutiveTiers(keywords, thresholds, kpi, currency);
}

export function computeFragmentedLongTail(
  keywords: PersistedNegativeKeyword[],
  targetCPA: number = 50,
  currency: SupportedCurrency = '$'
): FragmentedLongTailResult {
  const safeTargetCPA = typeof targetCPA === 'number' && Number.isFinite(targetCPA) ? Math.max(0, targetCPA) : 50;
  const rootMap = new Map<string, { query_count: number; total_clicks: number; total_cost: number; total_conversions: number; waste: number }>();

  let total_long_tail_queries = 0;
  let total_long_tail_clicks = 0;
  let total_long_tail_cost = 0;
  let total_long_tail_waste = 0;

  for (const k of keywords) {
    const clicks = typeof k.clicks === 'number' && Number.isFinite(k.clicks) ? k.clicks : 0;
    const cost = typeof k.cost === 'number' && Number.isFinite(k.cost) ? k.cost : (k.marginalWaste || 0);
    const conv = typeof k.conversions === 'number' && Number.isFinite(k.conversions) ? k.conversions : 0;

    if (clicks <= 2) {
      total_long_tail_queries++;
      total_long_tail_clicks += clicks;
      total_long_tail_cost += cost;

      const waste = conv <= 0 ? cost : Math.max(0, cost - conv * safeTargetCPA);
      total_long_tail_waste += waste;

      const cleanKw = k.keyword.replace(/[\[\]"']/g, '').toLowerCase();
      const words = Array.from(new Set(cleanKw.split(/[\s,\-_/]+/).filter((w) => w.length >= 2)));

      for (const word of words) {
        const existing = rootMap.get(word) || { query_count: 0, total_clicks: 0, total_cost: 0, total_conversions: 0, waste: 0 };
        existing.query_count += 1;
        existing.total_clicks += clicks;
        existing.total_cost += cost;
        existing.total_conversions += conv;
        existing.waste += waste;
        rootMap.set(word, existing);
      }
    }
  }

  const root_tokens: LongTailRootTokenRecord[] = Array.from(rootMap.entries())
    .filter(([_, agg]) => agg.query_count >= 2 && agg.waste > 0)
    .map(([token, agg]) => ({
      token,
      query_count: agg.query_count,
      total_clicks: agg.total_clicks,
      total_cost: currency === '¥' ? Math.round(agg.total_cost) : Math.round(agg.total_cost * 100) / 100,
      total_conversions: Math.round(agg.total_conversions),
      waste: currency === '¥' ? Math.round(agg.waste) : Math.round(agg.waste * 100) / 100,
    }))
    .sort((a, b) => b.waste - a.waste);

  return {
    total_long_tail_queries,
    total_long_tail_clicks,
    total_long_tail_cost: currency === '¥' ? Math.round(total_long_tail_cost) : Math.round(total_long_tail_cost * 100) / 100,
    total_long_tail_waste: currency === '¥' ? Math.round(total_long_tail_waste) : Math.round(total_long_tail_waste * 100) / 100,
    identified_root_tokens_count: root_tokens.length,
    root_tokens,
  };
}

export function computeMatchTypeDilution(
  keywords: PersistedNegativeKeyword[],
  currency: SupportedCurrency = '$'
): MatchTypeDilutionResult {
  const exactMap = new Map<string, { clicks: number; cost: number; cpc: number }>();

  for (const k of keywords) {
    const isExact = k.matchType === 'exact' || (k.keyword.startsWith('[') && k.keyword.endsWith(']'));
    if (isExact) {
      const clean = k.keyword.replace(/[\[\]"']/g, '').trim().toLowerCase();
      const clicks = typeof k.clicks === 'number' && Number.isFinite(k.clicks) ? k.clicks : 1;
      const cost = typeof k.cost === 'number' && Number.isFinite(k.cost) ? k.cost : (k.marginalWaste || 0);
      const cpc = clicks > 0 ? cost / clicks : cost;
      if (cpc > 0) {
        const existing = exactMap.get(clean);
        if (existing) {
          existing.clicks += clicks;
          existing.cost += cost;
          existing.cpc = existing.clicks > 0 ? existing.cost / existing.clicks : existing.cpc;
        } else {
          exactMap.set(clean, { clicks, cost, cpc });
        }
      }
    }
  }

  const items: DilutedQueryRecord[] = [];
  let total_budget_lost = 0, total_diluted_clicks = 0, total_diluted_spend = 0, total_benchmark_spend = 0, total_account_spend = 0;

  for (const k of keywords) {
    const cost = typeof k.cost === 'number' && Number.isFinite(k.cost) ? k.cost : (k.marginalWaste || 0);
    total_account_spend += cost;

    const isExact = k.matchType === 'exact' || (k.keyword.startsWith('[') && k.keyword.endsWith(']'));
    if (!isExact) {
      const clean = k.keyword.replace(/[\[\]"']/g, '').trim().toLowerCase();
      const clicks = typeof k.clicks === 'number' && Number.isFinite(k.clicks) ? k.clicks : 0;
      if (clicks > 0 && cost > 0) {
        const broad_cpc = cost / clicks;
        const benchmark = exactMap.get(clean);
        if (benchmark && benchmark.cpc > 0 && broad_cpc > benchmark.cpc) {
          const budget_lost = (broad_cpc - benchmark.cpc) * clicks;
          const inflation = broad_cpc / benchmark.cpc;

          total_budget_lost += budget_lost;
          total_diluted_clicks += clicks;
          total_diluted_spend += cost;
          total_benchmark_spend += benchmark.cpc * clicks;

          items.push({
            query: clean,
            broad_cpc: currency === '¥' ? Math.round(broad_cpc) : Math.round(broad_cpc * 100) / 100,
            exact_cpc: currency === '¥' ? Math.round(benchmark.cpc) : Math.round(benchmark.cpc * 100) / 100,
            clicks,
            budget_lost: currency === '¥' ? Math.round(budget_lost) : Math.round(budget_lost * 100) / 100,
            cpc_inflation_ratio: Math.round(inflation * 100) / 100,
          });
        }
      }
    }
  }

  items.sort((a, b) => b.budget_lost - a.budget_lost);
  const dilution_index = total_account_spend > 0 ? Math.min(1.0, Math.round((total_budget_lost / total_account_spend) * 10000) / 10000) : 0;
  const avg_inflation = total_benchmark_spend > 0
    ? Math.round((total_diluted_spend / total_benchmark_spend) * 100) / 100
    : items.length > 0 ? Math.round((items.reduce((s, i) => s + i.cpc_inflation_ratio, 0) / items.length) * 100) / 100 : 1.0;

  return {
    dilution_index,
    budget_lost: currency === '¥' ? Math.round(total_budget_lost) : Math.round(total_budget_lost * 100) / 100,
    diluted_queries_count: items.length,
    total_diluted_clicks,
    diluted_spend: currency === '¥' ? Math.round(total_diluted_spend) : Math.round(total_diluted_spend * 100) / 100,
    exact_benchmark_spend: currency === '¥' ? Math.round(total_benchmark_spend) : Math.round(total_benchmark_spend * 100) / 100,
    average_cpc_inflation: avg_inflation,
    items,
  };
}
