/**
 * Negative Keyword Staging Grid
 * TanStack Virtual table with reactive slicing, scope controls, and Cooper's 5 States.
 */
import React, { useRef, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSieveStore, type SieveState } from '../../state/useSieveStore.ts';
import { formatCurrency } from '../../utils/currency.ts';
import { CollisionBadge } from '../badges/CollisionBadge.tsx';
import { ExportDefModal } from '../export/ExportDefModal.tsx';
import { ReportConfigModal } from '../reports/ReportConfigModal.tsx';
import { copyToClipboard } from '../../formatters/clipboard.ts';
import { Search, Copy, Check, Download, FileText, AlertTriangle, Loader2 } from 'lucide-react';
import type { PersistedNegativeKeyword } from '../../workers/protocol.ts';
import type { ExclusionTargetLevel } from '../../domain/types/shield.ts';

const ROW_HEIGHT = 48;

export function selectQualifiedNegativeRules(state: Partial<SieveState>): PersistedNegativeKeyword[] {
  if (Array.isArray((state as any)?.qualifiedNegativeRules)) return (state as any).qualifiedNegativeRules;
  const source = state.keywords && state.keywords.length > 0 ? state.keywords : (state.filteredKeywords ?? []);
  const minClicks = state.thresholds?.minClicks ?? 1;
  const minConf = state.thresholds?.confidenceScore ?? state.thresholds?.minConfidence ?? 0.8;
  const maxWaste = state.thresholds?.maxMarginalWaste ?? 100000;

  return source.filter((k) => {
    const waste = k.marginalWaste ?? 0;
    if (waste <= 0 || (k.cost !== undefined && k.cost <= 0)) return false;
    if (k.clicks !== undefined && (k.clicks <= 0 || k.clicks < minClicks)) return false;
    if ((k.confidenceScore ?? 0) < minConf || waste > maxWaste) return false;
    return true;
  });
}

const getMatchTypeStyle = (m: 'broad' | 'phrase' | 'exact'): string =>
  m === 'exact' ? 'bg-purple-950/60 text-purple-300 border-purple-800/50' : m === 'phrase' ? 'bg-blue-950/60 text-blue-300 border-blue-800/50' : 'bg-zinc-800/80 text-zinc-300 border-zinc-700/60';

const cycleMatch = (c: 'broad' | 'phrase' | 'exact'): 'broad' | 'phrase' | 'exact' => (c === 'broad' ? 'phrase' : c === 'phrase' ? 'exact' : 'broad');

const formatRuleStr = (q: string, m: 'broad' | 'phrase' | 'exact'): string => {
  const clean = q.replace(/[\[\]"]/g, '').trim();
  return m === 'exact' ? `[${clean}]` : m === 'phrase' ? `"${clean}"` : clean;
};

const getScope = (kw: PersistedNegativeKeyword): ExclusionTargetLevel =>
  (kw as any).targetLevel ?? (typeof kw.scope === 'string' ? (kw.scope as ExclusionTargetLevel) : (kw.adGroupId || kw.scope?.adGroup ? 'AD_GROUP' : kw.campaignId || kw.scope?.campaign || kw.firstSeenCampaign ? 'CAMPAIGN' : 'ACCOUNT'));

export const KeywordVirtualGrid: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { keywords, filteredKeywords, thresholds, selectedKeyword, setSelectedKeyword, currency, isLoading, isIngesting, errorMessage, setKeywords } = useSieveStore();
  const parentRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());

  const storeQualified = useSieveStore((s) => (s as any).qualifiedNegativeRules);
  const qualifiedRules = useMemo(() => Array.isArray(storeQualified) ? storeQualified : selectQualifiedNegativeRules({ keywords, filteredKeywords, thresholds }), [storeQualified, keywords, filteredKeywords, thresholds]);

  const displayedItems = useMemo(() => {
    if (!searchTerm.trim()) return qualifiedRules;
    const t = searchTerm.toLowerCase();
    return qualifiedRules.filter((k) => k.keyword.toLowerCase().includes(t) || (k.formattedRule?.toLowerCase().includes(t)));
  }, [qualifiedRules, searchTerm]);

  const totalCandidateCount = keywords.length > 0 ? keywords.length : qualifiedRules.length;
  const rowVirtualizer = useVirtualizer({
    count: displayedItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    initialRect: { width: 1000, height: 600 },
  });

  const handleCopy = async (rule: string, hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(rule);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1500);
  };

  const handleScopeChange = (kw: PersistedNegativeKeyword, targetLevel: ExclusionTargetLevel) => {
    const list = keywords.length > 0 ? keywords : filteredKeywords;
    setKeywords(list.map((k) => (k.sha256Hash === kw.sha256Hash ? ({ ...k, targetLevel } as PersistedNegativeKeyword) : k)));
  };

  const handleCycleMatchType = (kw: PersistedNegativeKeyword) => {
    const nextType = cycleMatch(kw.matchType);
    const list = keywords.length > 0 ? keywords : filteredKeywords;
    setKeywords(list.map((k) => (k.sha256Hash === kw.sha256Hash ? { ...k, matchType: nextType, formattedRule: formatRuleStr(k.keyword, nextType) } : k)));
  };

  const handleBulkToggle = () => {
    const list = keywords.length > 0 ? keywords : filteredKeywords;
    setKeywords(list.map((k) => selectedHashes.has(k.sha256Hash) ? { ...k, matchType: cycleMatch(k.matchType), formattedRule: formatRuleStr(k.keyword, cycleMatch(k.matchType)) } : k));
  };

  const handleBulkDismiss = () => {
    const list = keywords.length > 0 ? keywords : filteredKeywords;
    setKeywords(list.filter((k) => !selectedHashes.has(k.sha256Hash)));
    setSelectedHashes(new Set());
  };

  const isAllSelected = displayedItems.length > 0 && displayedItems.every((k) => selectedHashes.has(k.sha256Hash));
  const toggleSelectAll = () => setSelectedHashes(isAllSelected ? new Set() : new Set(displayedItems.map((k) => k.sha256Hash)));

  return (
    <div data-testid="virtual-grid-container" className={`virtual-grid-container flex flex-col h-full w-full rounded-xl bg-zinc-900/60 border border-zinc-800 shadow-xl overflow-hidden backdrop-blur-sm ${className}`} style={{ contain: 'content' }}>
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-zinc-800 bg-zinc-950/40">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input type="text" placeholder="Search negative rules..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-64" />
          </div>
          <span className="text-xs text-zinc-400 font-mono tabular-nums">
            {displayedItems.length.toLocaleString()} of {totalCandidateCount.toLocaleString()} qualifying rules
          </span>
          {displayedItems.length > 0 && displayedItems.length < 5 && (
            <span data-testid="grid-partial-badge" className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium font-mono">Partial Sample ({displayedItems.length})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setIsReportModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all active:scale-[0.98]">
            <FileText className="w-3.5 h-3.5 text-indigo-400" /> Generate PDF Report
          </button>
          <button type="button" onClick={() => setIsExportModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-[0.98] shadow-sm">
            <Download className="w-3.5 h-3.5" /> Export Negative Rules
          </button>
        </div>
      </div>

      {errorMessage && (
        <div data-testid="grid-error-banner" className="m-3 p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" /> <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-zinc-950/70 border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider shrink-0 select-none items-center">
        <div className="col-span-4 flex items-center gap-2">
          <input type="checkbox" aria-label="Select all qualifying rules" checked={isAllSelected} onChange={toggleSelectAll} className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 accent-emerald-500 cursor-pointer" />
          <span>Negative Keyword Rule</span>
        </div>
        <div className="col-span-2">Scope Level</div>
        <div className="col-span-1">Match Type</div>
        <div className="col-span-2">Confidence Score</div>
        <div className="col-span-1">Marginal Waste</div>
        <div className="col-span-2 text-right">Conflict Guard</div>
      </div>

      <div ref={parentRef} role="region" aria-label="Virtualized Keyword Grid" tabIndex={0} className="virtual-grid-viewport flex-1 overflow-y-auto outline-none" style={{ minHeight: '400px', contain: 'content', willChange: 'transform', transform: 'translateZ(0)' }}>
        {isLoading || isIngesting ? (
          <div data-testid="grid-loading-state" className="flex flex-col items-center justify-center h-64 text-zinc-400 text-xs gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" /> <span>Analyzing and filtering exclusion candidates...</span>
          </div>
        ) : displayedItems.length === 0 ? (
          <div data-testid="grid-empty-state" className="flex flex-col items-center justify-center h-64 text-zinc-500 text-xs">
            No keywords match the current threshold or search criteria.
          </div>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const kw = displayedItems[virtualRow.index];
              if (!kw) return null;
              const isSelected = selectedKeyword?.sha256Hash === kw.sha256Hash;
              const isChecked = selectedHashes.has(kw.sha256Hash);
              const rule = kw.formattedRule || formatRuleStr(kw.keyword, kw.matchType);
              return (
                <div key={kw.sha256Hash || virtualRow.key} data-testid="virtual-grid-row" role="row" tabIndex={0} onClick={() => setSelectedKeyword(kw)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedKeyword(kw); } }} className={`h-12 grid grid-cols-12 gap-2 items-center px-4 text-xs font-mono transition-colors duration-150 ease-out cursor-pointer border-b border-zinc-800/40 select-text outline-none ${isSelected ? 'bg-emerald-950/30 text-emerald-200' : 'hover:bg-zinc-850/60 text-zinc-300'}`} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${ROW_HEIGHT}px`, transform: `translateY(${virtualRow.start}px)`, contain: 'strict' }}>
                  <div className="col-span-4 flex items-center gap-2 overflow-hidden">
                    <input type="checkbox" aria-label={`Select rule ${kw.keyword}`} checked={isChecked} onClick={(e) => e.stopPropagation()} onChange={(e) => { e.stopPropagation(); setSelectedHashes((prev) => { const n = new Set(prev); if (n.has(kw.sha256Hash)) n.delete(kw.sha256Hash); else n.add(kw.sha256Hash); return n; }); }} className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 accent-emerald-500 cursor-pointer shrink-0" />
                    <button type="button" aria-label="Copy rule" onClick={(e) => handleCopy(rule, kw.sha256Hash, e)} className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 shrink-0">
                      {copiedHash === kw.sha256Hash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <span className="truncate font-semibold text-zinc-100" title={rule}>{rule}</span>
                  </div>
                  <div className="col-span-2">
                    <select aria-label={`Scope for ${kw.keyword}`} value={getScope(kw)} onClick={(e) => e.stopPropagation()} onChange={(e) => { e.stopPropagation(); handleScopeChange(kw, e.target.value as ExclusionTargetLevel); }} className="text-[10px] font-sans font-medium px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 outline-none cursor-pointer focus:ring-1 focus:ring-emerald-500">
                      <option value="ACCOUNT">Account</option>
                      <option value="CAMPAIGN">Campaign</option>
                      <option value="AD_GROUP">Ad Group</option>
                    </select>
                  </div>
                  <div className="col-span-1">
                    <button type="button" aria-label={`Toggle match type for ${kw.keyword}`} onClick={(e) => { e.stopPropagation(); handleCycleMatchType(kw); }} className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase border transition-colors cursor-pointer hover:opacity-80 active:scale-95 ${getMatchTypeStyle(kw.matchType)}`}>
                      {kw.matchType}
                    </button>
                  </div>
                  <div className="col-span-2 flex items-center gap-1.5">
                    <div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.round(kw.confidenceScore * 100)}%` }} />
                    </div>
                    <span className="text-zinc-200 font-mono tabular-nums text-[11px] min-w-10">{(kw.confidenceScore * 100).toFixed(1)}%</span>
                  </div>
                  <div className="col-span-1 font-mono tabular-nums text-rose-400 font-semibold truncate">
                    {formatCurrency(kw.marginalWaste || 0, currency)}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <CollisionBadge keyword={kw} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedHashes.size > 0 && (
        <div data-testid="staging-actions-bar" className="sticky bottom-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2.5 bg-zinc-950/95 border-t border-zinc-800 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-300 font-semibold tabular-nums">{selectedHashes.size} selected</span>
            <button type="button" onClick={() => setSelectedHashes(new Set())} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">Clear</button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" data-testid="bulk-toggle-match-type" onClick={handleBulkToggle} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors">Toggle Match Type</button>
            <button type="button" data-testid="bulk-dismiss" onClick={handleBulkDismiss} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 transition-colors">Dismiss Selected</button>
            <button type="button" data-testid="bulk-approve" onClick={() => setIsExportModalOpen(true)} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm">Export Selected</button>
          </div>
        </div>
      )}

      <ExportDefModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} keywords={selectedHashes.size > 0 ? displayedItems.filter((k) => selectedHashes.has(k.sha256Hash)) : displayedItems} />
      <ReportConfigModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} />
    </div>
  );
};
