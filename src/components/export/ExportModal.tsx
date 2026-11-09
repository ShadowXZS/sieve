/**
 * Multi-Platform Negative Keyword Export Modal
 * Connects Google Ads Editor (TSV) and Amazon Bulk (CSV) engines with platform constraint validation.
 * File line ceiling: <= 250 lines.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { PersistedNegativeKeyword } from '../../workers/protocol.ts';
import {
  generateGoogleAdsEditorTsv, generateAmazonBulkCsv, generatePlainTextRules,
  validatePlatformConstraints, createGoogleAdsBlob, createAmazonBulkBlob, downloadPlatformExport,
} from '../../formatters/platform_exporters.ts';
import { copyToClipboard } from '../../formatters/clipboard.ts';
import { generateGoogleAdsScript } from '../../formatters/scripts.ts';
import { INTENT_PRESETS, filterKeywordsByPresets } from '../../presets/dictionaries.ts';
import { SieveLogo } from '../brand/SieveLogo.tsx';
import { scrubKeywordList } from '../../crypto/pii_scrubber.ts';
import { X, Copy, Check, Download, FileCode, FileSpreadsheet, FileText, Filter, ShieldCheck, AlertTriangle } from 'lucide-react';

export type ExportFormat = 'google_editor' | 'amazon_csv' | 'google_script' | 'plain_text';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  keywords?: PersistedNegativeKeyword[];
  children?: React.ReactNode;
  [key: string]: unknown;
}
export type ExportDefModalProps = ExportModalProps;

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, keywords = [], children }) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('google_editor');
  const [activePresets, setActivePresets] = useState<string[]>([]);
  const [isPiiScrubbed, setIsPiiScrubbed] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('');

  const handleKeyDown = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const eligibleKeywords = useMemo(() =>
    activePresets.length === 0 ? keywords : filterKeywordsByPresets(keywords, activePresets),
    [keywords, activePresets]
  );

  const normalizedKeywords = useMemo(() => eligibleKeywords.map((k) => {
    const r = k as unknown as Record<string, unknown>;
    const term = (r.query ?? r.keyword ?? r.term ?? r.text ?? r.candidateTerm ?? '') as string;
    return { ...k, keyword: k.keyword || term, ...(r.query ? { query: term } : {}) } as unknown as PersistedNegativeKeyword;
  }), [eligibleKeywords]);

  const { scrubbedKeywords, piiStats } = useMemo(() => {
    if (!isPiiScrubbed) return { scrubbedKeywords: normalizedKeywords, piiStats: null };
    const { scrubbed, stats } = scrubKeywordList(normalizedKeywords);
    const synchronized = scrubbed.map((item) => {
      const r = item as unknown as Record<string, unknown>;
      return (r.query ? { ...item, query: item.keyword } : item) as PersistedNegativeKeyword;
    });
    return { scrubbedKeywords: synchronized, piiStats: stats };
  }, [normalizedKeywords, isPiiScrubbed]);

  const validation = useMemo(() => validatePlatformConstraints(scrubbedKeywords), [scrubbedKeywords]);

  const exportPayload = useMemo(() => {
    switch (selectedFormat) {
      case 'google_editor': return generateGoogleAdsEditorTsv(scrubbedKeywords);
      case 'amazon_csv': return generateAmazonBulkCsv(scrubbedKeywords);
      case 'google_script': return generateGoogleAdsScript(scrubbedKeywords);
      case 'plain_text':
      default: return generatePlainTextRules(scrubbedKeywords);
    }
  }, [selectedFormat, scrubbedKeywords]);

  const payloadLineCount = useMemo(() => exportPayload ? exportPayload.split('\n').length : 0, [exportPayload]);

  const previewText = useMemo(() => {
    const totalCount = Math.max(eligibleKeywords.length, payloadLineCount);
    if (totalCount > 10000) {
      const lines = exportPayload ? exportPayload.split('\n') : [];
      return `${lines.slice(0, 500).join('\n')}\n\nShowing preview of first 500 of ${totalCount.toLocaleString()} rules... Full dataset included in Copy/Download`;
    }
    return exportPayload.length > 15000
      ? `${exportPayload.slice(0, 15000)}\n\n... (preview truncated to first 15,000 characters)`
      : exportPayload;
  }, [exportPayload, eligibleKeywords.length, payloadLineCount]);

  const handleCopy = async () => {
    if (await copyToClipboard(exportPayload)) {
      setIsCopied(true);
      setCopyFeedback(`Copied ${eligibleKeywords.length} rules!`);
      setTimeout(() => { setIsCopied(false); setCopyFeedback(''); }, 2000);
    }
  };

  const handleDownload = () => {
    const formatMap: Record<ExportFormat, { blob: () => Blob; name: string }> = {
      google_editor: { blob: () => createGoogleAdsBlob(exportPayload), name: 'sieve-google-ads-editor.tsv' },
      amazon_csv: { blob: () => createAmazonBulkBlob(exportPayload), name: 'sieve-amazon-ppc-negatives.csv' },
      google_script: { blob: () => new Blob([exportPayload], { type: 'application/javascript;charset=utf-8' }), name: 'sieve-google-ads-script.js' },
      plain_text: { blob: () => new Blob([exportPayload], { type: 'text/plain;charset=utf-8' }), name: 'sieve-negative-rules.txt' },
    };
    const target = formatMap[selectedFormat] || formatMap.plain_text;
    downloadPlatformExport(target.blob(), target.name);
  };

  if (!isOpen) return null;

  const content = (
    <div role="dialog" aria-modal="true" aria-labelledby="export-modal-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-4xl max-h-[85vh] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {children ?? (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center p-1.5 shrink-0 shadow-inner">
                  <SieveLogo size="sm" alt="Sieve" data-testid="export-modal-logo" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h2 id="export-modal-title" className="text-base font-semibold text-zinc-100">Export Negative Keyword Rules</h2>
                  <p className="text-xs text-zinc-400 font-mono tabular-nums mt-0.5">Target {eligibleKeywords.length.toLocaleString()} rules across multi-platform formats</p>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close export modal" className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Platform Constraint Validation Badges */}
            {(validation.hasLengthExceeded || validation.hasCapacityExceeded) && (
              <div className="px-6 py-2 bg-amber-950/50 border-b border-amber-800/60 flex flex-wrap items-center gap-3 text-xs text-amber-200 shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-semibold">Platform Constraint Warnings:</span>
                {validation.hasLengthExceeded && (
                  <span className="px-2 py-0.5 rounded bg-red-900/80 text-red-200 border border-red-700/60 font-mono text-[11px]" data-testid="constraint-badge-length">LENGTH_EXCEEDED: &gt;80 characters</span>
                )}
                {validation.hasCapacityExceeded && (
                  <span className="px-2 py-0.5 rounded bg-amber-900/80 text-amber-200 border border-amber-700/60 font-mono text-[11px]" data-testid="constraint-badge-capacity">LIST_CAPACITY_EXCEEDED: Exceeds platform ceiling</span>
                )}
              </div>
            )}

            {/* Format Selector */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 bg-zinc-950/30 border-b border-zinc-800/80 shrink-0">
              {[
                { id: 'google_editor', label: 'Google Ads Editor', sub: 'TSV Direct Paste', icon: FileSpreadsheet },
                { id: 'amazon_csv', label: 'Amazon PPC', sub: 'Bulk Upload CSV', icon: FileSpreadsheet },
                { id: 'google_script', label: 'Google Script', sub: 'Automation JS', icon: FileCode },
                { id: 'plain_text', label: 'Plain Text', sub: 'Formatted Rules', icon: FileText },
              ].map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setSelectedFormat(fmt.id as ExportFormat)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border transition-all active:scale-[0.98] ${
                    selectedFormat === fmt.id
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <fmt.icon className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="text-left">
                    <div className="font-semibold">{fmt.label}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">{fmt.sub}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Filter Presets and PII Bar */}
            <div className="px-6 py-2.5 border-b border-zinc-800/80 bg-zinc-950/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="text-xs font-medium text-zinc-400">Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.values(INTENT_PRESETS).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActivePresets((prev) => prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id])}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-all ${
                        activePresets.includes(p.id) ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60' : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50'
                      }`}
                    >
                      {p.name.split(' ')[0]}
                    </button>
                  ))}
                  {activePresets.length > 0 && (
                    <button type="button" onClick={() => setActivePresets([])} className="text-[11px] text-zinc-500 hover:text-zinc-300 underline font-mono ml-1">Clear</button>
                  )}
                </div>
              </div>

              <button
                type="button"
                data-testid="export-pii-toggle"
                onClick={() => setIsPiiScrubbed((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono border transition-all ${
                  isPiiScrubbed ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60' : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50'
                }`}
                title="Toggle client-side redaction of sensitive tokens"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>PII Scrubber: {isPiiScrubbed ? 'Redacted' : 'Raw'}</span>
                {piiStats && piiStats.redactedTokens > 0 && isPiiScrubbed && (
                  <span className="px-1 rounded text-[10px] bg-emerald-900 text-emerald-200 border border-emerald-700 font-semibold">{piiStats.redactedTokens}</span>
                )}
              </button>
            </div>

            {/* Preview */}
            <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Payload Preview</span>
                <span className="font-mono tabular-nums text-[11px]">{exportPayload.length.toLocaleString()} characters • {payloadLineCount.toLocaleString()} lines</span>
              </div>
              <div className="flex-1 overflow-auto bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-[11px] text-zinc-300 whitespace-pre">
                {previewText}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/60 shrink-0">
              <div className="text-xs text-emerald-400 font-mono">{copyFeedback}</div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={handleCopy} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-[0.98]">
                  {isCopied ? <><Check className="w-4 h-4" /> Copied Payload</> : <><Copy className="w-4 h-4" /> Copy to Clipboard</>}
                </button>
                <button type="button" onClick={handleDownload} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all active:scale-[0.98]">
                  <Download className="w-4 h-4" /> Download File
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

export const ExportDefModal = ExportModal;
