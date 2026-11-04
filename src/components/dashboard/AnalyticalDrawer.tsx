/**
 * Analytical Intelligence Drawer Component (Phase 11)
 *
 * Implements the slide-over analytical drawer displaying deep diagnostic breakdowns:
 * 1. Fragmented Long-Tail Tab: shared root tokens across queries with <= 2 clicks
 *    causing collective waste, with sortable metrics and negative rule creation.
 * 2. Match-Type Dilution Tab: queries hijacked by broad/phrase at inflated CPCs
 *    compared to exact match benchmarks.
 *
 * Architectural Invariants:
 * - Color tokens strictly follow Tailwind dark zinc palette (`bg-zinc-950 border-l border-zinc-800`).
 * - Accessible keyboard navigation (Escape to close, role="dialog", aria-modal="true").
 * - High-density tabular numerals (`font-mono tabular-nums`).
 * - Pure functional reactive state integration.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Layers,
  GitBranch,
  Search,
  Copy,
  Check,
  TrendingUp,
  Percent,
} from 'lucide-react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import {
  computeFragmentedLongTail,
  computeMatchTypeDilution,
} from '../../utils/executiveAnalytics.ts';
import { formatCurrency } from '../../utils/currency.ts';
import { copyToClipboard } from '../../formatters/clipboard.ts';

export interface AnalyticalDrawerProps {
  isOpen?: boolean;
  onClose?: () => void;
  initialTab?: 'long-tail' | 'dilution';
}

export const AnalyticalDrawer: React.FC<AnalyticalDrawerProps> = ({
  isOpen: propIsOpen,
  onClose: propOnClose,
  initialTab,
}) => {
  const {
    keywords,
    filteredKeywords,
    thresholds,
    currency,
    longTailResult,
    dilutionResult,
    isAnalyticalDrawerOpen,
    activeAnalyticalTab,
    setAnalyticalDrawerOpen,
    setActiveAnalyticalTab,
  } = useSieveStore();

  const isOpen = propIsOpen !== undefined ? propIsOpen : isAnalyticalDrawerOpen;
  const activeTab = initialTab || activeAnalyticalTab || 'long-tail';

  const [searchTerm, setSearchTerm] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    if (propOnClose) {
      propOnClose();
    } else {
      setAnalyticalDrawerOpen(false);
    }
  };

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

  const dilution = useMemo(() => {
    if (dilutionResult && dilutionResult.diluted_queries_count > 0) {
      return dilutionResult;
    }
    return computeMatchTypeDilution(activeKeywords, currency);
  }, [dilutionResult, activeKeywords, currency]);

  const filteredRootTokens = useMemo(() => {
    if (!searchTerm.trim()) return longTail.root_tokens;
    const term = searchTerm.toLowerCase();
    return longTail.root_tokens.filter((t) => t.token.toLowerCase().includes(term));
  }, [longTail.root_tokens, searchTerm]);

  const filteredDilutedItems = useMemo(() => {
    if (!searchTerm.trim()) return dilution.items;
    const term = searchTerm.toLowerCase();
    return dilution.items.filter((i) => i.query.toLowerCase().includes(term));
  }, [dilution.items, searchTerm]);

  const handleCopy = async (text: string) => {
    await copyToClipboard(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(null), 1500);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Analytical Diagnostic Drawer"
      data-testid="analytical-drawer"
      className="fixed inset-0 z-50 overflow-hidden flex justify-end"
    >
      {/* Backdrop */}
      <div
        data-testid="analytical-drawer-backdrop"
        onClick={handleClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ease-out"
      />

      {/* Slide-over Drawer Panel */}
      <div className="relative w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                Diagnostic Intelligence
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                Phase 11
              </span>
            </div>
            <h2 className="text-base font-bold text-zinc-100 mt-0.5">
              Long-Tail & Match Dilution Workbench
            </h2>
          </div>

          <button
            type="button"
            data-testid="close-analytical-drawer-btn"
            onClick={handleClose}
            aria-label="Close drawer"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher & Search Bar */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center p-1 rounded-lg bg-zinc-900 border border-zinc-800">
            <button
              type="button"
              data-testid="drawer-tab-longtail"
              onClick={() => setActiveAnalyticalTab('long-tail')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'long-tail'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Fragmented Long-Tail</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                {longTail.root_tokens.length}
              </span>
            </button>

            <button
              type="button"
              data-testid="drawer-tab-dilution"
              onClick={() => setActiveAnalyticalTab('dilution')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'dilution'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Match Dilution Index</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                {dilution.items.length}
              </span>
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder={activeTab === 'long-tail' ? 'Filter root tokens...' : 'Filter queries...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-full sm:w-52"
            />
          </div>
        </div>

        {/* Tab 1: Fragmented Long-Tail */}
        {activeTab === 'long-tail' && (
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
                            onClick={() => handleCopy(`[${rt.token}]`)}
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
        )}

        {/* Tab 2: Match-Type Dilution */}
        {activeTab === 'dilution' && (
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
        )}

        {/* Drawer Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <span className="font-mono text-[11px]">
            Sieve Phase 11 Diagnostic Engine
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
          >
            Close Workbench
          </button>
        </div>
      </div>
    </div>
  );
};

