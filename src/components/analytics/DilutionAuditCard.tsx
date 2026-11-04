/**
 * Match-Type Dilution Audit Card Component
 *
 * Implements the Match-Type Dilution Index audit card displaying:
 * - Budget lost when automated broad/phrase queries capture exact searches at higher CPCs.
 * - Average CPC inflation factor and total hijacked clicks.
 * - Tabular numerals (`font-mono tabular-nums`) and standard dark zinc styling.
 */

import React, { useMemo } from 'react';
import { GitBranch, ArrowRight, TrendingUp } from 'lucide-react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import { computeMatchTypeDilution } from '../../utils/executiveAnalytics.ts';
import { formatCurrency } from '../../utils/currency.ts';

export interface DilutionAuditCardProps {
  className?: string;
  onOpenDrawer?: () => void;
}

export const DilutionAuditCard: React.FC<DilutionAuditCardProps> = ({
  className = '',
  onOpenDrawer,
}) => {
  const {
    keywords,
    filteredKeywords,
    currency,
    dilutionResult,
    setAnalyticalDrawerOpen,
  } = useSieveStore();

  const activeKeywords = useMemo(
    () => (filteredKeywords.length > 0 ? filteredKeywords : keywords),
    [filteredKeywords, keywords]
  );

  const dilution = useMemo(() => {
    if (dilutionResult && dilutionResult.diluted_queries_count > 0) {
      return dilutionResult;
    }
    return computeMatchTypeDilution(activeKeywords, currency);
  }, [dilutionResult, activeKeywords, currency]);

  const handleOpen = () => {
    if (onOpenDrawer) {
      onOpenDrawer();
    } else {
      setAnalyticalDrawerOpen(true, 'dilution');
    }
  };

  return (
    <div
      data-testid="dilution-audit-card"
      className={`h-full flex flex-col justify-between p-4 sm:p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-amber-500/30 hover:bg-zinc-900/80 hover:-translate-y-0.5 group ${className}`}
    >
      <div>
        <div className="flex items-center justify-between text-zinc-400 mb-2.5 pb-2.5 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <GitBranch className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-amber-400 group-hover:text-amber-300 transition-colors">
              Match Dilution Audit
            </span>
          </div>
          <span
            data-testid="dilution-pct-badge"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"
          >
            <TrendingUp className="w-2.5 h-2.5" />
            {(dilution.dilution_index * 100).toFixed(1)}% Dilution
          </span>
        </div>

        <div className="text-2xl font-bold font-mono tabular-nums text-amber-400 mb-1">
          {formatCurrency(dilution.budget_lost, currency)}
        </div>

        <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-zinc-300 mb-3">
          <span className="text-rose-400 font-semibold">
            {dilution.average_cpc_inflation.toFixed(2)}x CPC Inflation
          </span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-400">{dilution.total_diluted_clicks} hijacked clicks</span>
        </div>

        {/* Diluted Queries Preview */}
        {dilution.items.length > 0 && (
          <div className="mt-2 pt-2 border-t border-zinc-800/60">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1.5">
              Top Diluted Queries
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="dilution-queries-pills">
              {dilution.items.slice(0, 3).map((item) => (
                <span
                  key={item.query}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800/80 border border-zinc-700/60 text-zinc-200"
                  title={`Exact CPC: ${formatCurrency(item.exact_cpc, currency)} vs Broad: ${formatCurrency(item.broad_cpc, currency)}`}
                >
                  <span className="font-semibold text-amber-300 truncate max-w-[120px]">
                    {item.query}
                  </span>
                  <span className="text-[10px] text-rose-400 font-semibold">
                    -{formatCurrency(item.budget_lost, currency)}
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
        data-testid="open-dilution-details-btn"
        className="mt-4 flex items-center justify-between w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60 transition-all duration-150 ease-out active:scale-[0.99] group/btn"
      >
        <span className="flex items-center gap-1.5">
          <span>Inspect Dilution Bleed</span>
          <span className="text-zinc-500">({dilution.items.length})</span>
        </span>
        <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover/btn:translate-x-0.5 transition-transform" />
      </button>
    </div>
  );
};

