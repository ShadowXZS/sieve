/**
 * Bid Elasticity Probe Component
 *
 * Implements the Bid Elasticity Probe displaying the calculated Optimal Bid Ceiling
 * and evaluating the boundary delta between converting median CPC and non-converting median CPC.
 *
 * Architectural Invariants:
 * - Color tokens strictly follow Tailwind dark zinc palette.
 * - Tabular numerals (tabular-nums font-mono) for zero layout shift.
 * - Reactive to targetCPA, active currency, and CPC distributions.
 */

import React, { useMemo } from 'react';
import { Gauge, Info, Activity } from 'lucide-react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import { computeExecutiveAnalytics } from '../../utils/executiveAnalytics.ts';
import { formatCurrency } from '../../utils/currency.ts';

export interface BidElasticityProbeProps {
  className?: string;
}

export const BidElasticityProbe: React.FC<BidElasticityProbeProps> = ({ className = '' }) => {
  const { keywords, filteredKeywords, thresholds, kpi, currency } = useSieveStore();

  const analytics = useMemo(() => {
    const activeKeywords = filteredKeywords.length > 0 ? filteredKeywords : keywords;
    return computeExecutiveAnalytics(activeKeywords, thresholds, kpi, currency);
  }, [keywords, filteredKeywords, thresholds, kpi, currency]);

  const { exploratoryRisk } = analytics;
  const ceiling = exploratoryRisk.optimalBidCeiling;
  const formattedCeiling = exploratoryRisk.formattedOptimalBidCeiling;
  const targetCPA = thresholds.targetCPA;
  const formattedTargetCPA = formatCurrency(targetCPA, currency);

  // Elasticity caution threshold (1.5x of ceiling)
  const cautionThreshold = currency === '¥' ? Math.round(ceiling * 1.5) : Math.round(ceiling * 1.5 * 100) / 100;
  const formattedCautionThreshold = formatCurrency(cautionThreshold, currency);

  const zoneBadgeConfig = {
    efficient: {
      label: 'Optimal Efficiency',
      className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      dot: 'bg-emerald-400',
    },
    diminishing: {
      label: 'Diminishing Returns',
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      dot: 'bg-amber-400',
    },
    negative: {
      label: 'Negative Elasticity',
      className: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      dot: 'bg-rose-400',
    },
  }[exploratoryRisk.elasticityZone];

  return (
    <div
      data-testid="bid-elasticity-probe"
      className={`p-4 sm:p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-zinc-700 ${className}`}
    >
      {/* Probe Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-zinc-800/80 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">
                Bid Elasticity Probe
              </h3>
              <span
                data-testid="elasticity-zone-badge"
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border font-mono ${zoneBadgeConfig.className}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${zoneBadgeConfig.dot}`} />
                {zoneBadgeConfig.label}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Boundary delta evaluation and calculated Optimal Bid Ceiling where higher bids stop yielding conversions
            </p>
          </div>
        </div>

        {/* Target CPA Readout */}
        <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-mono tabular-nums bg-zinc-800/40 px-3 py-1.5 rounded-lg border border-zinc-700/50">
          <span className="text-zinc-400">Target CPA:</span>
          <span className="text-zinc-100 font-bold">{formattedTargetCPA}</span>
        </div>
      </div>

      {/* Main Probe Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        {/* Left Column: Optimal Bid Ceiling & CPC Distribution Medians */}
        <div className="lg:col-span-5 bg-zinc-950/40 p-4 rounded-lg border border-zinc-800/60 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-amber-400/90">
                Optimal Bid Ceiling
              </span>
              <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                Modeled CVR: {(exploratoryRisk.baselineCVR * 100).toFixed(2)}%
              </span>
            </div>
            <div
              data-testid="optimal-bid-ceiling-value"
              className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-zinc-100 mt-1 mb-2 tracking-tight"
            >
              {formattedCeiling}
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Bids beyond <span className="font-mono text-amber-400 font-semibold">{formattedCeiling}</span> trigger
              rapid CPA drag with zero incremental conversions.
            </p>
          </div>

          {/* CPC Distribution Medians & Boundary Delta */}
          <div className="mt-4 pt-3 border-t border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono tabular-nums">
              <span className="text-zinc-400">Converting Median CPC:</span>
              <span data-testid="converting-median-cpc" className="text-emerald-400 font-semibold">
                {exploratoryRisk.formattedConvertingMedianCPC}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono tabular-nums">
              <span className="text-zinc-400">Non-Converting Median CPC:</span>
              <span data-testid="non-converting-median-cpc" className="text-rose-400 font-semibold">
                {exploratoryRisk.formattedNonConvertingMedianCPC}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono tabular-nums pt-1 border-t border-zinc-800/40">
              <span className="text-zinc-300 font-medium flex items-center gap-1">
                <Activity className="w-3 h-3 text-amber-400 inline" />
                CPC Boundary Delta (&Delta;):
              </span>
              <span data-testid="cpc-boundary-delta" className="text-amber-400 font-bold">
                {exploratoryRisk.formattedBoundaryDelta}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Elasticity Gradient Spectrum & Threshold Zones */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-300 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-zinc-500" />
              Marginal Elasticity Spectrum
            </span>
            <span className="font-mono tabular-nums text-zinc-400 text-[11px]">
              Max Observed CPC: <span className="text-zinc-200 font-semibold">{exploratoryRisk.formattedMaxObservedCPC}</span>
            </span>
          </div>

          {/* 3-Tier Gradient Spectrum Bar */}
          <div
            data-testid="elasticity-spectrum-bar"
            className="w-full h-4 rounded-full overflow-hidden flex bg-zinc-800 p-0.5 gap-0.5"
            role="progressbar"
            aria-label="Bid Elasticity Zones"
          >
            {/* Efficient Zone */}
            <div
              className="bg-emerald-500/80 hover:bg-emerald-500 transition-all duration-300 rounded-l-full relative group"
              style={{ width: '45%' }}
              title={`Efficient Zone: <= ${formattedCeiling}`}
            />
            {/* Caution Zone */}
            <div
              className="bg-amber-500/80 hover:bg-amber-500 transition-all duration-300 relative group"
              style={{ width: '30%' }}
              title={`Diminishing Return Zone: ${formattedCeiling} - ${formattedCautionThreshold}`}
            />
            {/* Dead Zone */}
            <div
              className="bg-rose-500/80 hover:bg-rose-500 transition-all duration-300 rounded-r-full relative group"
              style={{ width: '25%' }}
              title={`Dead Zone: > ${formattedCautionThreshold}`}
            />
          </div>

          {/* Zone Spectrum Legend */}
          <div className="grid grid-cols-3 gap-2 mt-1">
            {/* Tier 1 */}
            <div className="bg-zinc-950/30 p-2.5 rounded-lg border border-emerald-500/20">
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Profitable Zone</span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-zinc-300 mt-1">
                &le; {formattedCeiling}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">High conversion elasticity</div>
            </div>

            {/* Tier 2 */}
            <div className="bg-zinc-950/30 p-2.5 rounded-lg border border-amber-500/20">
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Diminishing Yield</span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-zinc-300 mt-1">
                {formattedCeiling} - {formattedCautionThreshold}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Plateauing conversions</div>
            </div>

            {/* Tier 3 */}
            <div className="bg-zinc-950/30 p-2.5 rounded-lg border border-rose-500/20">
              <div className="flex items-center gap-1.5 text-rose-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Dead Zone</span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-zinc-300 mt-1">
                &gt; {formattedCautionThreshold}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">100% CPA drag waste</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

