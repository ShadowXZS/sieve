/**
 * Long-Tail Bleed Diagnostic Card Component
 *
 * Implements the Fragmented Long-Tail Query Aggregator card displaying:
 * - Collective waste across low-sample search queries (<= 2 clicks).
 * - High-priority shared root tokens causing spend bleed.
 * - Tabular numerals (`font-mono tabular-nums`) and standard dark zinc styling.
 */

import React, { useMemo } from 'react';
import { Layers, ArrowRight } from 'lucide-react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import { computeFragmentedLongTail } from '../../utils/executiveAnalytics.ts';
import { formatCurrency } from '../../utils/currency.ts';

export interface LongTailBleedCardProps {
  className?: string;
  onOpenDrawer?: () => void;
}

export const LongTailBleedCard: React.FC<LongTailBleedCardProps> = ({
  className = '',
  onOpenDrawer,
}) => {
  const {
    keywords,
    filteredKeywords,
    thresholds,
    currency,
    longTailResult,
    setAnalyticalDrawerOpen,
  } = useSieveStore();

  const activeKeywords = useMemo(
    () => (filteredKeywords.length > 0 ? filteredKeywords : keywords),
    [filteredKeywords, keywords]
  );

  const longTail = useMemo(() => {
    if (longTailResult && longTailResult.total_long_tail_queries > 0) {
      return longTailResult;
    }
    return computeFragmentedLongTail(activeKeywords, thresholds.targetCPA, currency);
  }, [longTailResult, activeKeywords, thresholds.targetCPA, currency]);

  const handleOpen = () => {
    if (onOpenDrawer) {
      onOpenDrawer();
    } else {
      setAnalyticalDrawerOpen(true, 'long-tail');
    }
  };

  return (
    <div
      data-testid="long-tail-bleed-card"
      className={`h-full flex flex-col justify-between p-4 sm:p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-rose-500/30 hover:bg-zinc-900/80 hover:-translate-y-0.5 group ${className}`}
    >
      <div>
        <div className="flex items-center justify-between text-zinc-400 mb-2.5 pb-2.5 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-rose-400 group-hover:text-rose-300 transition-colors">
              Long-Tail Bleed
            </span>
          </div>
          <span
            data-testid="long-tail-query-badge"
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20"
          >
            {longTail.total_long_tail_queries.toLocaleString()} queries (&le;2 clicks)
          </span>
        </div>

        <div className="text-2xl font-bold font-mono tabular-nums text-zinc-100 mb-1">
          {formatCurrency(longTail.total_long_tail_waste, currency)}
        </div>

        <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-rose-400 mb-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          <span>{longTail.identified_root_tokens_count} shared root tokens causing waste</span>
        </div>

        {/* Top Root Tokens */}
        {longTail.root_tokens.length > 0 && (
          <div className="mt-2 pt-2 border-t border-zinc-800/60">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1.5">
              Top Bleed Roots
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="long-tail-roots-pills">
              {longTail.root_tokens.slice(0, 4).map((rt) => (
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
        onClick={handleOpen}
        data-testid="open-long-tail-details-btn"
        className="mt-4 flex items-center justify-between w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60 transition-all duration-150 ease-out active:scale-[0.99] group/btn"
      >
        <span className="flex items-center gap-1.5">
          <span>Inspect Root Tokens</span>
          <span className="text-zinc-500">({longTail.root_tokens.length})</span>
        </span>
        <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover/btn:translate-x-0.5 transition-transform" />
      </button>
    </div>
  );
};

