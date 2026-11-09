/**
 * Spend Waterfall Bar Component
 * Immediate visual breakdown of active account spend across efficiency tiers:
 * 1. Secured / Protected Spend (Emerald)
 * 2. Exploratory High-Risk Spend (Amber)
 * 3. Identified Waste Bleed (Rose)
 * 4. Capital Reallocation Potential (Indigo)
 */
import React, { useMemo } from 'react';
import { Layers, ArrowRight } from 'lucide-react';
import { useSieveStore, formatCurrencyMicros } from '../../state/useSieveStore.ts';
import type { CurrencyMicros } from '../../domain/types/index.ts';

export interface SpendWaterfallBarProps { className?: string; }

export const SpendWaterfallBar: React.FC<SpendWaterfallBarProps> = ({ className = '' }) => {
  const { keywords, filteredKeywords, thresholds, kpi, currency } = useSieveStore();

  const metrics = useMemo(() => useSieveStore.getState().getSummaryMetrics(), [keywords, filteredKeywords, thresholds, kpi]);
  const { securedSpendMicros, exploratorySpendMicros, wasteSpendMicros, totalSpendMicros } = metrics;
  const total = (totalSpendMicros > 0n ? totalSpendMicros : (securedSpendMicros + exploratorySpendMicros + wasteSpendMicros)) as CurrencyMicros;

  // Compute normalized segment percentages guaranteed to sum to exactly 100.0%
  const { securedWidth, exploratoryWidth, wasteWidth } = useMemo(() => {
    if (total > 0n) {
      const sPct = Math.round(Number((securedSpendMicros * 10000n) / total) / 10) / 10;
      const ePct = exploratorySpendMicros > 0n
        ? Math.max(0.1, Math.round(Number((exploratorySpendMicros * 10000n) / total) / 10) / 10)
        : 0.0;
      const wPct = Math.round((100 - sPct - ePct) * 10) / 10;
      return { securedWidth: sPct, exploratoryWidth: ePct, wasteWidth: wPct };
    }
    return { securedWidth: 50.0, exploratoryWidth: 25.0, wasteWidth: 25.0 };
  }, [total, securedSpendMicros, exploratorySpendMicros, wasteSpendMicros]);

  return (
    <div
      data-testid="spend-waterfall-bar-card"
      className={`p-4 sm:p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-zinc-700 ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-zinc-800/80 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">
              Spend Waterfall Breakdown
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Immediate structural breakdown of active account spend across efficiency tiers
            </p>
          </div>
        </div>

        {/* Total Spend Readout */}
        <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-mono tabular-nums bg-zinc-800/40 px-3 py-1.5 rounded-lg border border-zinc-700/50">
          <span className="text-zinc-400">Total Analyzed Spend:</span>
          <span data-testid="waterfall-total-spend" className="text-zinc-100 font-bold">
            {formatCurrencyMicros(total, currency)}
          </span>
        </div>
      </div>

      {/* Main Stacked Waterfall Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono tabular-nums text-zinc-400">
          <span>Capital Allocation Distribution</span>
          <span>100% Account Spend</span>
        </div>

        <div
          data-testid="waterfall-bar"
          className="w-full h-4 sm:h-5 rounded-full overflow-hidden flex bg-zinc-800 p-0.5 gap-0.5"
          role="progressbar"
          aria-label="Account Spend Waterfall"
        >
          {/* Secured / Protected Segment (Emerald) */}
          <div
            data-testid="waterfall-segment-secured"
            className="bg-emerald-500 hover:bg-emerald-400 transition-all duration-300 rounded-l-full relative group cursor-pointer"
            style={{ width: `${securedWidth}%` }}
            title={`Secured Spend: ${formatCurrencyMicros(securedSpendMicros, currency)} (${securedWidth}%)`}
          />

          {/* Exploratory High-Risk Segment (Amber) */}
          <div
            data-testid="waterfall-segment-exploratory"
            className="bg-amber-500 hover:bg-amber-400 transition-all duration-300 relative group cursor-pointer"
            style={{ width: `${exploratoryWidth}%` }}
            title={`Exploratory High-Risk Spend: ${formatCurrencyMicros(exploratorySpendMicros, currency)} (${exploratoryWidth}%)`}
          />

          {/* Identified Waste Bleed Segment (Rose) */}
          <div
            data-testid="waterfall-segment-waste"
            className="bg-rose-500 hover:bg-rose-400 transition-all duration-300 rounded-r-full relative group cursor-pointer"
            style={{ width: `${wasteWidth}%` }}
            title={`Identified Waste Bleed: ${formatCurrencyMicros(wasteSpendMicros, currency)} (${wasteWidth}%)`}
          />
        </div>
      </div>

      {/* Symmetrical 4-Tier Breakdown Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        {/* Emerald: Secured Spend */}
        <div className="p-3 rounded-lg bg-zinc-950/40 border border-emerald-500/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold mb-1">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Protected Spend</span>
              <span className="font-mono tabular-nums text-[11px]">{securedWidth.toFixed(1)}%</span>
            </div>
            <div data-testid="waterfall-secured-value" className="text-base sm:text-lg font-bold font-mono tabular-nums text-zinc-100">
              {formatCurrencyMicros(securedSpendMicros, currency)}
            </div>
          </div>
          <div className="text-[10px] text-zinc-500 mt-2">Safe-list locked traffic driving conversions</div>
        </div>

        {/* Amber: Exploratory Spend */}
        <div className="p-3 rounded-lg bg-zinc-950/40 border border-amber-500/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-amber-400 text-xs font-semibold mb-1">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />Exploratory Spend</span>
              <span className="font-mono tabular-nums text-[11px]">{exploratoryWidth.toFixed(1)}%</span>
            </div>
            <div data-testid="waterfall-exploratory-value" className="text-base sm:text-lg font-bold font-mono tabular-nums text-zinc-100">
              {formatCurrencyMicros(exploratorySpendMicros, currency)}
            </div>
          </div>
          <div className="text-[10px] text-zinc-500 mt-2">High CPC & low sample queries testing intent</div>
        </div>

        {/* Rose: Waste Bleed Spend */}
        <div className="p-3 rounded-lg bg-zinc-950/40 border border-rose-500/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-rose-400 text-xs font-semibold mb-1">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" />Identified Waste</span>
              <span className="font-mono tabular-nums text-[11px]">{wasteWidth.toFixed(1)}%</span>
            </div>
            <div data-testid="waterfall-waste-value" className="text-base sm:text-lg font-bold font-mono tabular-nums text-zinc-100">
              {formatCurrencyMicros(wasteSpendMicros, currency)}
            </div>
          </div>
          <div className="text-[10px] text-zinc-500 mt-2">Negative candidates causing direct CPA drag</div>
        </div>

        {/* Indigo: Reallocation Yield Potential */}
        <div className="p-3 rounded-lg bg-zinc-950/40 border border-indigo-500/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-indigo-400 text-xs font-semibold mb-1">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500" />Recovery Yield</span>
              <span className="font-mono tabular-nums text-[11px] text-emerald-400 flex items-center"><ArrowRight className="w-2.5 h-2.5 inline mr-0.5" />Lift</span>
            </div>
            <div data-testid="waterfall-reallocation-value" className="text-base sm:text-lg font-bold font-mono tabular-nums text-indigo-400">
              +{metrics.incrementalConversions.toLocaleString()} Convs
            </div>
          </div>
          <div className="text-[10px] text-zinc-500 mt-2 font-mono tabular-nums">Annual: {formatCurrencyMicros(metrics.annualizedRecoveryMicros, currency)}</div>
        </div>
      </div>
    </div>
  );
};
