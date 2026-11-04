/**
 * Executive Analytics Dashboard Component (Phase 10)
 *
 * Implements the color-coded Executive Analytics Dashboard featuring 4 semantic tiers:
 * 1. Rose/Red: Identified Waste Bleed and CPA Drag.
 * 2. Emerald/Green: Safe-List Protected Conversions and Secured Revenue.
 * 3. Amber/Orange: Exploratory High-Risk Clicks (High CPC, low sample size).
 * 4. Indigo/Slate: Capital Reallocation Yield and Annualized Recovery.
 *
 * Architectural Invariants:
 * - Bilaterally symmetrical 4-column equal grid layout (`grid-cols-2 lg:grid-cols-4`).
 * - Color tokens strictly follow Tailwind dark zinc palette:
 *   `rose-500/10 text-rose-400`, `emerald-500/10 text-emerald-400`, `amber-500/10 text-amber-400`, `indigo-500/10 text-indigo-400`.
 * - Waste percentage calculation handles division-by-zero ($0 total spend) safely with zero layout shifts.
 */

import React, { useMemo } from 'react';
import { ShieldCheck, AlertTriangle, TrendingUp, Percent } from 'lucide-react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import { computeExecutiveAnalytics } from '../../utils/executiveAnalytics.ts';

export interface ExecutiveDashboardProps {
  className?: string;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({ className = '' }) => {
  const { keywords, filteredKeywords, thresholds, kpi, currency } = useSieveStore();

  const analytics = useMemo(() => {
    const activeKeywords = filteredKeywords.length > 0 ? filteredKeywords : keywords;
    return computeExecutiveAnalytics(activeKeywords, thresholds, kpi, currency);
  }, [keywords, filteredKeywords, thresholds, kpi, currency]);

  // Safe waste percentage calculation: (Identified Waste / Total Spend) * 100
  // Safely handles division-by-zero ($0 total spend) without NaN or Infinity
  const wastePercentage = useMemo(() => {
    const waste = analytics.wasteBleed.amount;
    const spend = analytics.spendWaterfall.totalSpend;
    if (spend <= 0 || !Number.isFinite(spend)) {
      return 0.0;
    }
    const pct = (waste / spend) * 100;
    return Number.isFinite(pct) ? Math.min(100.0, Math.max(0.0, Math.round(pct * 10) / 10)) : 0.0;
  }, [analytics]);

  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {/* Tier 1: Rose/Red - Identified Waste Bleed & CPA Drag */}
      <div
        data-testid="executive-card-waste"
        className="h-full flex flex-col justify-between p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-rose-500/30 hover:bg-zinc-900/80 hover:-translate-y-0.5 group"
      >
        <div>
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-rose-400/90 group-hover:text-rose-400 transition-colors">
              Identified Waste
            </span>
            <div className="flex items-center gap-1.5">
              <span
                data-testid="waste-percentage-badge"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20"
                title="Identified Waste as percentage of total spend"
              >
                <Percent className="w-2.5 h-2.5" />
                {wastePercentage.toFixed(1)}%
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center font-mono font-bold text-xs select-none">
                <span>{currency}</span>
              </div>
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-zinc-100 mb-1">
            {analytics.wasteBleed.formatted}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-rose-400">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            <span>CPA Drag: +{analytics.wasteBleed.formattedCpaDrag}</span>
          </div>
        </div>
        <div className="text-[11px] text-zinc-500 mt-2">
          Marginal CPA drag across non-converting tokens
        </div>
      </div>

      {/* Tier 2: Emerald/Green - Safe-List Protected Conversions & Secured Revenue */}
      <div
        data-testid="executive-card-safe"
        className="h-full flex flex-col justify-between p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-emerald-500/30 hover:bg-zinc-900/80 hover:-translate-y-0.5 group"
      >
        <div>
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-400/90 group-hover:text-emerald-400 transition-colors">
              Safe-List Protected
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400 mb-1">
            {analytics.safeListProtection.protectedConversions.toLocaleString()} Convs
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-zinc-300">
            <span>Secured: {analytics.safeListProtection.formattedSecuredRevenue}</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">{analytics.safeListProtection.exactLockedCount} locked</span>
          </div>
        </div>
        <div className="text-[11px] text-zinc-500 mt-2">
          Inverted safe-list overrides protecting conversions
        </div>
      </div>

      {/* Tier 3: Amber/Orange - Exploratory High-Risk Clicks & Bid Elasticity */}
      <div
        data-testid="executive-card-risk"
        className="h-full flex flex-col justify-between p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-amber-500/30 hover:bg-zinc-900/80 hover:-translate-y-0.5 group"
      >
        <div>
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-amber-400/90 group-hover:text-amber-400 transition-colors">
              High-Risk Clicks
            </span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-400 mb-1">
            {analytics.exploratoryRisk.highRiskClicks.toLocaleString()} Clicks
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-zinc-300">
            <span>Ceiling: {analytics.exploratoryRisk.formattedOptimalBidCeiling}</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">&Delta;: {analytics.exploratoryRisk.formattedBoundaryDelta}</span>
          </div>
        </div>
        <div className="text-[11px] text-zinc-500 mt-2">
          High CPC & low sample size above bid ceiling
        </div>
      </div>

      {/* Tier 4: Indigo/Slate - Capital Reallocation Yield & Annualized Recovery */}
      <div
        data-testid="executive-card-yield"
        className="h-full flex flex-col justify-between p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-indigo-500/30 hover:bg-zinc-900/80 hover:-translate-y-0.5 group"
      >
        <div>
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-indigo-400/90 group-hover:text-indigo-400 transition-colors">
              Reallocation Yield
            </span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-indigo-400 mb-1">
            +{analytics.reallocationYield.incrementalConversions.toFixed(1)} Convs
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-zinc-300">
            <span>Annual: {analytics.reallocationYield.formattedAnnualizedRecovery}</span>
            <span className="text-zinc-600">•</span>
            <span className="text-emerald-400">+{analytics.reallocationYield.roasLiftPercent}% ROAS</span>
          </div>
        </div>
        <div className="text-[11px] text-zinc-500 mt-2">
          Capital recovery reinvested at target CPA
        </div>
      </div>
    </div>
  );
};

