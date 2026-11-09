/**
 * Fragmented Long-Tail Tab Content for Analytical Drawer
 * Physical line ceiling: <= 250 lines.
 */

import React from 'react';
import { Copy, Check } from 'lucide-react';
import type { FragmentedLongTailResult } from '../../../workers/protocol.ts';
import { formatCurrency } from '../../../utils/currency.ts';

export interface LongTailTabContentProps {
  longTail: FragmentedLongTailResult;
  filteredRootTokens: FragmentedLongTailResult['root_tokens'];
  currency: string;
  copiedToken: string | null;
  onCopy: (text: string) => void;
}

export const LongTailTabContent: React.FC<LongTailTabContentProps> = ({
  longTail,
  filteredRootTokens,
  currency,
  copiedToken,
  onCopy,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
      {/* Summary Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
            Long-Tail Queries
          </span>
          <div className="text-lg font-bold font-mono tabular-nums text-zinc-200">
            {longTail.total_long_tail_queries.toLocaleString()}
          </div>
          <span className="text-[10px] text-zinc-500">&le; 2 clicks each</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-rose-400 font-medium">
            Collective Waste
          </span>
          <div className="text-lg font-bold font-mono tabular-nums text-rose-400">
            {formatCurrency(longTail.total_long_tail_waste, currency)}
          </div>
          <span className="text-[10px] text-zinc-500">Non-converting spend</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
            Total Clicks
          </span>
          <div className="text-lg font-bold font-mono tabular-nums text-zinc-200">
            {longTail.total_long_tail_clicks.toLocaleString()}
          </div>
          <span className="text-[10px] text-zinc-500">Long-tail traffic</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
            Shared Roots
          </span>
          <div className="text-lg font-bold font-mono tabular-nums text-emerald-400">
            {longTail.identified_root_tokens_count}
          </div>
          <span className="text-[10px] text-zinc-500">&ge; 2 queries</span>
        </div>
      </div>

      {/* Table of Shared Root Tokens */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/40">
        <div className="grid grid-cols-12 gap-2 px-3 py-2.5 bg-zinc-950 border-b border-zinc-800 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider select-none">
          <div className="col-span-4">Shared Root Token</div>
          <div className="col-span-2 text-center">Queries</div>
          <div className="col-span-2 text-center">Clicks</div>
          <div className="col-span-2 text-right">Waste</div>
          <div className="col-span-2 text-right">Action</div>
        </div>

        {filteredRootTokens.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            No shared root tokens match current criteria.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/40 text-xs font-mono">
            {filteredRootTokens.map((rt) => {
              const isCopied = copiedToken === rt.token;
              return (
                <div
                  key={rt.token}
                  className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 hover:bg-zinc-850/60 transition-colors"
                >
                  <div className="col-span-4 flex items-center gap-1.5 overflow-hidden">
                    <span className="font-semibold text-rose-300 truncate">
                      {rt.token}
                    </span>
                  </div>
                  <div className="col-span-2 text-center tabular-nums text-zinc-300">
                    {rt.query_count}
                  </div>
                  <div className="col-span-2 text-center tabular-nums text-zinc-400">
                    {rt.total_clicks}
                  </div>
                  <div className="col-span-2 text-right tabular-nums font-semibold text-rose-400">
                    {formatCurrency(rt.waste, currency)}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onCopy(`[${rt.token}]`)}
                      title="Copy exact negative rule"
                      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
                    >
                      {isCopied ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>[{rt.token}]</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
