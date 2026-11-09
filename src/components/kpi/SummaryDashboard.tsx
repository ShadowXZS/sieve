/**
 * Executive Analytics Summary Dashboard Component
 * Displays four reconciled metric tiers derived from pure 64-bit CurrencyMicros domain engines.
 */
import React, { useMemo } from 'react';
import { ShieldCheck, AlertTriangle, TrendingUp, Percent, Layers, CheckCircle2 } from 'lucide-react';
import { useSieveStore, formatCurrencyMicros } from '../../state/useSieveStore.ts';

export interface SummaryDashboardProps { className?: string; }

export const SummaryDashboard: React.FC<SummaryDashboardProps> = ({ className = '' }) => {
  const {
    keywords, filteredKeywords, kpi, currency, isLoading, isIngesting,
    ingestionProgress, errorMessage, fileLoaded,
  } = useSieveStore();

  const active = filteredKeywords.length > 0 ? filteredKeywords : keywords;
  const metrics = useMemo(() => {
    return useSieveStore.getState().getSummaryMetrics();
  }, [keywords, filteredKeywords, kpi]);

  const actionableWaste = metrics.actionableWasteMicros;
  const securedSpend = metrics.securedSpendMicros;
  const exploratorySpend = metrics.exploratorySpendMicros;
  const matchedVolume = metrics.filterMatchedVolumeMicros;
  const wastePct = metrics.wastePercentage;

  // Cooper's 5 UI States
  const isError = Boolean(errorMessage);
  const isBusy = Boolean(isLoading || isIngesting);
  const isBlank = !fileLoaded && active.length === 0;
  const isPartial = active.length > 0 && active.length < 5;

  return (
    <div data-testid="summary-dashboard" className={`grid grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {/* Cooper State 5: Error Banner */}
      {isError && (
        <div data-testid="dashboard-error-banner" role="alert" className="col-span-2 lg:col-span-4 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Cooper State 2: Loading / Ingestion Progress HUD */}
      {isBusy && (
        <div data-testid="dashboard-loading-hud" className="col-span-2 lg:col-span-4 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-300">
            <span className="flex items-center gap-1.5 font-medium"><Layers className="w-3.5 h-3.5 text-emerald-400 animate-spin" /> Ingesting & computing domain metrics...</span>
            <span className="font-mono tabular-nums text-emerald-400">{ingestionProgress || 45}%</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div className="bg-emerald-500 h-full transition-all duration-300 ease-out" style={{ width: `${ingestionProgress || 45}%` }} />
          </div>
        </div>
      )}

      {/* Cooper State 1: Blank / Empty State Guidance */}
      {isBlank && !isBusy && !isError && (
        <div data-testid="dashboard-blank-banner" className="col-span-2 lg:col-span-4 p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center text-xs text-zinc-400 font-mono">
          Upload search term CSV report to populate executive KPI metrics.
        </div>
      )}

      {/* Tier 1: Rose - Actionable Waste Bleed */}
      <div
        data-testid="tier-waste-bleed"
        className="h-full flex flex-col justify-between p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-rose-500/30 hover:bg-zinc-900/80 hover:-translate-y-0.5 group"
      >
        <div data-testid="executive-card-waste">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-rose-400/90 group-hover:text-rose-400 transition-colors">
              Identified Waste
            </span>
            <div className="flex items-center gap-1.5">
              <span
                data-testid="waste-percentage-badge"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20"
              >
                <Percent className="w-2.5 h-2.5" />
                {wastePct.toFixed(1)}%
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center font-mono font-bold text-xs select-none">
                <span>{currency}</span>
              </div>
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-zinc-100 mb-1">
            {formatCurrencyMicros(actionableWaste, currency)}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-rose-400">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            <span>CPA Drag: +{formatCurrencyMicros(metrics.cpaDragMicros, currency)} ({wastePct.toFixed(1)}%)</span>
          </div>
          {matchedVolume > 0n && matchedVolume !== actionableWaste && (
            <div data-testid="matched-volume-readout" className="text-[10px] text-zinc-400 font-mono mt-1 pt-1 border-t border-zinc-800/60">
              Total Filter-Matched Volume: {formatCurrencyMicros(matchedVolume, currency)}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-2">
          <span>Actionable zero-conversion waste drag</span>
          {isPartial && <span data-testid="dashboard-partial-badge" className="text-[10px] text-amber-400 font-mono">Partial</span>}
        </div>
      </div>

      {/* Tier 2: Emerald - Safe-List Protected */}
      <div
        data-testid="tier-safe-protection"
        className="h-full flex flex-col justify-between p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-emerald-500/30 hover:bg-zinc-900/80 hover:-translate-y-0.5 group"
      >
        <div data-testid="executive-card-safe">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-400/90 group-hover:text-emerald-400 transition-colors">
              Safe-List Protected
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400 mb-1">
            {metrics.protectedConversions.toLocaleString()} Convs
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-zinc-300">
            <span>Secured: {formatCurrencyMicros(securedSpend, currency)}</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">{metrics.exactLockedCount} locked</span>
          </div>
        </div>
        <div className="text-[11px] text-zinc-500 mt-2">
          Active conversion shielding via safe-list rules
        </div>
      </div>

      {/* Tier 3: Amber - High-Risk Clicks */}
      <div
        data-testid="tier-exploratory-risk"
        className="h-full flex flex-col justify-between p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-amber-500/30 hover:bg-zinc-900/80 hover:-translate-y-0.5 group"
      >
        <div data-testid="executive-card-risk">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-amber-400/90 group-hover:text-amber-400 transition-colors">
              High-Risk Clicks
            </span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-400 mb-1">
            {metrics.highRiskClicks.toLocaleString()} Clicks
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-zinc-300">
            <span>Ceiling: {formatCurrencyMicros(metrics.optimalBidCeilingMicros, currency)}</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">{formatCurrencyMicros(exploratorySpend, currency)}</span>
          </div>
        </div>
        <div className="text-[11px] text-zinc-500 mt-2">
          High CPC queries operating above break-even ceiling
        </div>
      </div>

      {/* Tier 4: Indigo - Reallocation Yield */}
      <div
        data-testid="tier-reallocation-yield"
        className="h-full flex flex-col justify-between p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-indigo-500/30 hover:bg-zinc-900/80 hover:-translate-y-0.5 group"
      >
        <div data-testid="executive-card-yield">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-indigo-400/90 group-hover:text-indigo-400 transition-colors">
              Reallocation Yield
            </span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-indigo-400 mb-1">
            +{metrics.incrementalConversions.toLocaleString()} Convs
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-zinc-300">
            <span>Annual: {formatCurrencyMicros(metrics.annualizedRecoveryMicros, currency)}</span>
            <span className="text-zinc-600">•</span>
            <span className="text-emerald-400">+{metrics.roasLiftPercent}% ROAS</span>
          </div>
        </div>
        <div className="text-[11px] text-zinc-500 mt-2">
          Capital reallocation yield via convex-damped lift
        </div>
      </div>
    </div>
  );
};
