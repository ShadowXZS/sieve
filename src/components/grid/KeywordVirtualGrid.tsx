/**
 * High-Performance Virtualized Keyword Exploration Grid
 *
 * Employs @tanstack/react-virtual to sustain 60/120 FPS rendering across 250,000+
 * computed exclusion records. Bounded DOM node ceiling under 120 elements during
 * continuous scrolling.
 */

import React, { useRef, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSieveStore } from '../../state/useSieveStore.ts';
import { CollisionBadge } from '../badges/CollisionBadge.tsx';
import { ExportModal } from '../export/ExportModal.tsx';
import { ReportConfigModal } from '../reports/ReportConfigModal.tsx';
import { copyToClipboard } from '../../formatters/clipboard.ts';
import type { PersistedNegativeKeyword } from '../../workers/protocol.ts';
import { Search, Copy, Check, Download, FileText } from 'lucide-react';

export interface KeywordVirtualGridProps {
  className?: string;
}

export const KeywordVirtualGrid: React.FC<KeywordVirtualGridProps> = ({ className = '' }) => {
  const { filteredKeywords, selectedKeyword, setSelectedKeyword } = useSieveStore();
  const parentRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Fast client search query filter
  const displayedItems = useMemo(() => {
    if (!searchTerm.trim()) return filteredKeywords;
    const term = searchTerm.toLowerCase();
    return filteredKeywords.filter(
      (k) =>
        k.keyword.toLowerCase().includes(term) ||
        k.formattedRule.toLowerCase().includes(term)
    );
  }, [filteredKeywords, searchTerm]);

  const rowVirtualizer = useVirtualizer({
    count: displayedItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
    initialRect: { width: 1000, height: 600 },
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const handleCopyRule = async (rule: string, hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(rule);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1500);
  };

  const getMatchTypeStyle = (matchType: 'broad' | 'phrase' | 'exact') => {
    switch (matchType) {
      case 'exact':
        return 'bg-purple-950/60 text-purple-300 border-purple-800/50';
      case 'phrase':
        return 'bg-blue-950/60 text-blue-300 border-blue-800/50';
      case 'broad':
      default:
        return 'bg-zinc-800/80 text-zinc-300 border-zinc-700/60';
    }
  };

  return (
    <div
      className={`flex flex-col h-full w-full rounded-xl bg-zinc-900/60 border border-zinc-800 shadow-xl overflow-hidden backdrop-blur-sm ${className}`}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-zinc-800 bg-zinc-950/40">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search negative rules..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-1 focus:ring-offset-zinc-950 transition-all duration-150 ease-out w-64"
            />
          </div>
          <span className="text-xs text-zinc-400 font-mono tabular-nums">
            {displayedItems.length.toLocaleString()} of {filteredKeywords.length.toLocaleString()}{' '}
            qualifying rules
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all duration-150 ease-out active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            Generate PDF Report
          </button>

          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-150 ease-out active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 shadow-sm shadow-emerald-950/40"
          >
            <Download className="w-3.5 h-3.5" />
            Export Negative Rules
          </button>
        </div>
      </div>

      {/* Grid Table Columns Header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-zinc-950/70 border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider shrink-0 select-none">
        <div className="col-span-4 flex items-center gap-1">Negative Keyword Rule</div>
        <div className="col-span-2">Match Type</div>
        <div className="col-span-2">Confidence Score</div>
        <div className="col-span-2">Marginal Waste</div>
        <div className="col-span-2 text-right">Conflict Guard</div>
      </div>

      {/* Virtualized Container */}
      <div
        ref={parentRef}
        role="region"
        aria-label="Virtualized Keyword Grid"
        tabIndex={0}
        className="flex-1 overflow-y-auto outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/50"
        style={{ minHeight: '400px' }}
      >
        {displayedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-500 text-xs">
            No keywords match the current threshold or search criteria.
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualRow) => {
              const kw = displayedItems[virtualRow.index];
              if (!kw) return null;

              const isSelected = selectedKeyword?.sha256Hash === kw.sha256Hash;
              const isCopied = copiedHash === kw.sha256Hash;

              return (
                <div
                  key={kw.sha256Hash || virtualRow.key}
                  data-testid="virtual-grid-row"
                  role="row"
                  tabIndex={0}
                  onClick={() => setSelectedKeyword(kw)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedKeyword(kw);
                    }
                  }}
                  className={`h-12 grid grid-cols-12 gap-2 items-center px-4 text-xs font-mono transition-colors duration-150 ease-out cursor-pointer border-b border-zinc-800/40 select-text outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/70 focus-visible:ring-inset ${
                    isSelected
                      ? 'bg-emerald-950/30 text-emerald-200'
                      : 'hover:bg-zinc-850/60 text-zinc-300'
                  }`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {/* Formatted Rule / Keyword */}
                  <div className="col-span-4 flex items-center gap-2 overflow-hidden">
                    <button
                      type="button"
                      aria-label="Copy rule"
                      onClick={(e) => handleCopyRule(kw.formattedRule, kw.sha256Hash, e)}
                      className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all duration-150 ease-out active:scale-90 outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 shrink-0"
                    >
                      {isCopied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <span className="truncate font-semibold text-zinc-100" title={kw.formattedRule}>
                      {kw.formattedRule}
                    </span>
                  </div>

                  {/* Match Type */}
                  <div className="col-span-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase border transition-colors duration-150 ease-out ${getMatchTypeStyle(
                        kw.matchType
                      )}`}
                    >
                      {kw.matchType}
                    </span>
                  </div>

                  {/* Confidence Score */}
                  <div className="col-span-2 flex items-center gap-1.5">
                    <div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden shrink-0">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-150 ease-out"
                        style={{ width: `${Math.round(kw.confidenceScore * 100)}%` }}
                      />
                    </div>
                    <span className="text-zinc-200 font-mono tabular-nums text-[11px] min-w-10">
                      {(kw.confidenceScore * 100).toFixed(1)}%
                    </span>
                  </div>

                  {/* Marginal Waste */}
                  <div className="col-span-2 font-mono tabular-nums text-rose-400 font-semibold">
                    ${(kw.marginalWaste || 0).toFixed(2)}
                  </div>

                  {/* Conflict Guard Badge */}
                  <div className="col-span-2 flex justify-end">
                    <CollisionBadge keyword={kw} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Multi-Platform Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        keywords={displayedItems}
      />

      {/* Vector PDF Report Modal */}
      <ReportConfigModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
      />
    </div>
  );
};

