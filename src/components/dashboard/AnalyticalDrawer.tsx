/**
 * Analytical Intelligence Drawer Component (Phase 11)
 *
 * Implements the slide-over analytical drawer displaying deep diagnostic breakdowns:
 * 1. Fragmented Long-Tail Tab: shared root tokens across queries with <= 2 clicks
 * 2. Match-Type Dilution Tab: queries hijacked by broad/phrase at inflated CPCs
 * Physical line ceiling: <= 250 lines.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { X, Layers, GitBranch, Search } from 'lucide-react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import {
  computeFragmentedLongTail,
  computeMatchTypeDilution,
} from '../../utils/executiveAnalytics.ts';
import { copyToClipboard } from '../../formatters/clipboard.ts';
import { LongTailTabContent } from './drawer/LongTailTabContent.tsx';
import { DilutionTabContent } from './drawer/DilutionTabContent.tsx';

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    if (propOnClose) propOnClose();
    else setAnalyticalDrawerOpen(false);
  };

  const activeKeywords = useMemo(
    () => (filteredKeywords.length > 0 ? filteredKeywords : keywords),
    [filteredKeywords, keywords]
  );

  const longTail = useMemo(() => {
    if (longTailResult && longTailResult.total_long_tail_queries > 0) return longTailResult;
    return computeFragmentedLongTail(activeKeywords, thresholds.targetCPA, currency);
  }, [longTailResult, activeKeywords, thresholds.targetCPA, currency]);

  const dilution = useMemo(() => {
    if (dilutionResult && dilutionResult.diluted_queries_count > 0) return dilutionResult;
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
      <div
        data-testid="analytical-drawer-backdrop"
        onClick={handleClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ease-out"
      />

      <div className="relative w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
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

        {activeTab === 'long-tail' && (
          <LongTailTabContent
            longTail={longTail}
            filteredRootTokens={filteredRootTokens}
            currency={currency}
            copiedToken={copiedToken}
            onCopy={handleCopy}
          />
        )}

        {activeTab === 'dilution' && (
          <DilutionTabContent
            dilution={dilution}
            filteredDilutedItems={filteredDilutedItems}
            currency={currency}
          />
        )}

        <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <span className="font-mono text-[11px]">Sieve Phase 11 Diagnostic Engine</span>
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
