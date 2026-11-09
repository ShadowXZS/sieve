/**
 * Match-Type Dilution Tab Content for Analytical Drawer
 * Physical line ceiling: <= 250 lines.
 */

import React from 'react';
import type { MatchTypeDilutionResult } from '../../../workers/protocol.ts';
import { formatCurrency } from '../../../utils/currency.ts';

export interface DilutionTabContentProps {
  dilution: MatchTypeDilutionResult;
  filteredDilutedItems: MatchTypeDilutionResult['items'];
  currency: string;
}

export const DilutionTabContent: React.FC<DilutionTabContentProps> = ({
  dilution,
  filteredDilutedItems,
  currency,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
      {/* Summary Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-amber-400 font-medium">
            Dilution Index
          </span>
          <div className="text-lg font-bold font-mono tabular-nums text-amber-400">
            {(dilution.dilution_index * 100).toFixed(1)}%
          </div>
          <span className="text-[10px] text-zinc-500">Spend diluted</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-rose-400 font-medium">
            Budget Lost
          </span>
          <div className="text-lg font-bold font-mono tabular-nums text-rose-400">
            {formatCurrency(dilution.budget_lost, currency)}
          </div>
          <span className="text-[10px] text-zinc-500">CPC premium paid</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
            Diluted Queries
          </span>
          <div className="text-lg font-bold font-mono tabular-nums text-zinc-200">
            {dilution.diluted_queries_count}
          </div>
          <span className="text-[10px] text-zinc-500">Exact searches hijacked</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
            Avg CPC Inflation
          </span>
          <div className="text-lg font-bold font-mono tabular-nums text-rose-400">
            {dilution.average_cpc_inflation.toFixed(2)}x
          </div>
          <span className="text-[10px] text-zinc-500">Broad vs Exact CPC</span>
        </div>
      </div>

      {/* Table of Diluted Queries */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/40">
        <div className="grid grid-cols-12 gap-2 px-3 py-2.5 bg-zinc-950 border-b border-zinc-800 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider select-none">
          <div className="col-span-4">Hijacked Search Query</div>
          <div className="col-span-2 text-center">Exact CPC</div>
          <div className="col-span-2 text-center">Broad CPC</div>
          <div className="col-span-2 text-center">Inflation</div>
          <div className="col-span-2 text-right">Budget Lost</div>
        </div>

        {filteredDilutedItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            No match dilution detected in active traffic.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/40 text-xs font-mono">
            {filteredDilutedItems.map((item) => (
              <div
                key={item.query}
                className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 hover:bg-zinc-850/60 transition-colors"
              >
                <div className="col-span-4 font-semibold text-zinc-200 truncate" title={item.query}>
                  {item.query}
                </div>
                <div className="col-span-2 text-center tabular-nums text-emerald-400">
                  {formatCurrency(item.exact_cpc, currency)}
                </div>
                <div className="col-span-2 text-center tabular-nums text-amber-400">
                  {formatCurrency(item.broad_cpc, currency)}
                </div>
                <div className="col-span-2 text-center tabular-nums text-rose-400 font-semibold">
                  {item.cpc_inflation_ratio.toFixed(2)}x
                </div>
                <div className="col-span-2 text-right tabular-nums font-bold text-rose-400">
                  -{formatCurrency(item.budget_lost, currency)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
