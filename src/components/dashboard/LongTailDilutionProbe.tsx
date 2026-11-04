/**
 * Long-Tail & Match Dilution Diagnostic Probe (Phase 11)
 *
 * Implements balanced layout slots displaying diagnostic metrics for:
 * 1. Fragmented Long-Tail Aggregator: identifies shared root tokens across queries
 *    with <= 2 clicks that collectively cause significant waste.
 * 2. Match-Type Dilution Index: calculates budget lost when automated broad/phrase
 *    queries capture searches that exist as exact match keywords at higher CPCs.
 *
 * Architectural Invariants:
 * - Bilaterally symmetrical 2-column balanced layout (`grid grid-cols-1 md:grid-cols-2 gap-4`).
 * - Color tokens strictly follow Tailwind dark zinc palette with semantic accents (rose & indigo/amber).
 * - Numeric alignment with `font-mono tabular-nums` preventing layout shifts.
 * - Multi-currency responsive formatting (JPY zero-decimals, standard 2-decimals for others).
 */

import React, { useMemo } from 'react';
import { Layers, GitBranch, ArrowRight, TrendingUp, AlertTriangle } from 'lucide-react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import {
  computeFragmentedLongTail,
  computeMatchTypeDilution,
} from '../../utils/executiveAnalytics.ts';
import { formatCurrency } from '../../utils/currency.ts';

export interface LongTailDilutionProbeProps {
  className?: string;
  onOpenDrawer?: (tab: 'long-tail' | 'dilution') => void;
}

export const LongTailDilutionProbe: React.FC<LongTailDilutionProbeProps> = ({
  className = '',
  onOpenDrawer,
}) => {
  const {
    keywords,
    filteredKeywords,
    thresholds,
    currency,
    longTailResult,
    dilutionResult,
    setAnalyticalDrawerOpen,
  } = useSieveStore();

  const activeKeywords = useMemo(
    () => (filteredKeywords.length > 0 ? filteredKeywords : keywords),
    [filteredKeywords, keywords]
  );

  // Compute reactive diagnostics or use worker-provided WASM result
  const longTail = useMemo(() => {
    if (longTailResult && longTailResult.total_long_tail_queries > 0) {
      return longTailResult;
    }
    return computeFragmentedLongTail(activeKeywords, thresholds.targetCPA, currency);
  }, [longTailResult, activeKeywords, thresholds.targetCPA, currency]);

  const dilution = useMemo(() => {
    if (dilutionResult && dilutionResult.diluted_queries_count > 0) {
      return dilutionResult;
    }
    return computeMatchTypeDilution(activeKeywords, currency);
  }, [dilutionResult, activeKeywords, currency]);

  const handleOpenLongTail = () => {
    if (onOpenDrawer) {
      onOpenDrawer('long-tail');
    } else {
      setAnalyticalDrawerOpen(true, 'long-tail');
    }
  };

  const handleOpenDilution = () => {
    if (onOpenDrawer) {
      onOpenDrawer('dilution');
    } else {
      setAnalyticalDrawerOpen(true, 'dilution');
    }
  };

  return (
    <div
      data-testid="longtail-dilution-probe"
      className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}
    >
      {/* Slot 1: Fragmented Long-Tail Aggregator */}
      <div
        data-testid="longtail-aggregator-slot"
        className="flex flex-col justify-between p-4 sm:p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-rose-500/30 hover:bg-zinc-900/80 group"
      >
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-400">
                  Fragmented Long-Tail Aggregator
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Collective waste across queries with &le; 2 clicks
                </p>
              </div>
            </div>
            <span
              data-testid="longtail-query-badge"
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold tabular-nums bg-rose-500/10 text-rose-400 border border-rose-500/20"
            >
              {longTail.total_long_tail_queries.toLocaleString()} queries
            </span>
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <div>
              <div className="text-2xl font-bold font-mono tabular-nums text-zinc-100">
                {formatCurrency(longTail.total_long_tail_waste, currency)}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-rose-400/90 mt-0.5">
                {longTail.identified_root_tokens_count} shared root tokens identified
              </div>
            </div>
            <div className="text-right text-xs font-mono tabular-nums text-zinc-400">
              <div>{longTail.total_long_tail_clicks.toLocaleString()} clicks</div>
              <div className="text-[10px] text-zinc-500">
                {formatCurrency(longTail.total_long_tail_cost, currency)} total spend
              </div>
            </div>
          </div>

          {/* Top Root Tokens Pill Cluster */}
          {longTail.root_tokens.length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-800/60">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium block mb-1.5">
                Top Root Bleed Tokens
              </span>
              <div className="flex flex-wrap gap-1.5" data-testid="longtail-root-pills">
                {longTail.root_tokens.slice(0, 5).map((rt) => (
                  <span
                    key={rt.token}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800/80 border border-zinc-700/60 text-zinc-200"
                    title={`${rt.query_count} queries, ${formatCurrency(rt.waste, currency)} waste`}
                  >
                    <span className="font-semibold text-rose-300">{rt.token}</span>
                    <span className="text-[10px] text-zinc-500 font-normal">
                      ({formatCurrency(rt.waste, currency)})
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          data-testid="open-longtail-drawer-btn"
          onClick={handleOpenLongTail}
          className="mt-4 flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800/50 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60 transition-all duration-150 ease-out active:scale-[0.99] group/btn"
        >
          <span className="flex items-center gap-1.5">
            <span>Inspect Root Tokens</span>
            <span className="text-zinc-500">({longTail.root_tokens.length})</span>
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover/btn:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Slot 2: Match-Type Dilution Index */}
      <div
        data-testid="match-dilution-slot"
        className="flex flex-col justify-between p-4 sm:p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-amber-500/30 hover:bg-zinc-900/80 group"
      >
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <GitBranch className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  Match-Type Dilution Index
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Budget lost when broad/phrase captures exact searches
                </p>
              </div>
            </div>
            <span
              data-testid="dilution-index-badge"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold tabular-nums bg-amber-500/10 text-amber-400 border border-amber-500/20"
            >
              <TrendingUp className="w-3 h-3" />
              {(dilution.dilution_index * 100).toFixed(1)}% Dilution
            </span>
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <div>
              <div className="text-2xl font-bold font-mono tabular-nums text-amber-400">
                {formatCurrency(dilution.budget_lost, currency)}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-zinc-400 mt-0.5">
                {dilution.diluted_queries_count} search queries diluted
              </div>
            </div>
            <div className="text-right text-xs font-mono tabular-nums text-zinc-400">
              <div className="text-rose-400 font-semibold">
                +{((dilution.average_cpc_inflation - 1) * 100).toFixed(0)}% CPC Inflation
              </div>
              <div className="text-[10px] text-zinc-500">
                {dilution.total_diluted_clicks.toLocaleString()} hijacked clicks
              </div>
            </div>
          </div>

          {/* Diluted Queries Preview */}
          {dilution.items.length > 0 ? (
            <div className="mt-3 pt-3 border-t border-zinc-800/60">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium block mb-1.5">
                Top Diluted Searches
              </span>
              <div className="flex flex-wrap gap-1.5" data-testid="diluted-query-pills">
                {dilution.items.slice(0, 3).map((item) => (
                  <span
                    key={item.query}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800/80 border border-zinc-700/60 text-zinc-200"
                    title={`Exact CPC: ${formatCurrency(item.exact_cpc, currency)} vs Broad: ${formatCurrency(item.broad_cpc, currency)}`}
                  >
                    <span className="font-semibold text-amber-300 truncate max-w-[140px]">
                      {item.query}
                    </span>
                    <span className="text-[10px] text-rose-400 font-semibold font-mono">
                      -{formatCurrency(item.budget_lost, currency)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-3 pt-3 border-t border-zinc-800/60 text-[11px] text-zinc-500 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-zinc-600" />
              <span>Zero exact match cannibalization detected in active traffic</span>
            </div>
          )}
        </div>

        <button
          type="button"
          data-testid="open-dilution-drawer-btn"
          onClick={handleOpenDilution}
          className="mt-4 flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800/50 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60 transition-all duration-150 ease-out active:scale-[0.99] group/btn"
        >
          <span className="flex items-center gap-1.5">
            <span>Inspect Dilution Bleed</span>
            <span className="text-zinc-500">({dilution.items.length})</span>
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover/btn:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};

