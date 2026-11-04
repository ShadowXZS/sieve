/**
 * Multi-Platform Negative Keyword Export Modal (Phase 5)
 *
 * Provides instant clipboard formatting and downloadable exports for:
 * 1. Google Ads Editor (TSV bulk paste format)
 * 2. Amazon Advertising PPC (Bulk negative CSV)
 * 3. Google Ads Script (Self-contained automation JS)
 * 4. Plain Text Rule Lines
 *
 * Includes intent preset filtering, keyboard dismissal (Escape), and 150ms spring transitions.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { PersistedNegativeKeyword } from '../../workers/protocol.ts';
import {
  formatGoogleAdsEditorTSV,
  formatAmazonBulkUploadCSV,
  copyToClipboard,
} from '../../formatters/clipboard.ts';
import { generateGoogleAdsScript } from '../../formatters/scripts.ts';
import {
  INTENT_PRESETS,
  filterKeywordsByPresets,
} from '../../presets/dictionaries.ts';
import { SieveLogo } from '../brand/SieveLogo.tsx';
import {
  X,
  Copy,
  Check,
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  Filter,
  ShieldCheck,
} from 'lucide-react';
import { scrubKeywordList } from '../../crypto/pii_scrubber.ts';

export type ExportFormat = 'google_editor' | 'amazon_csv' | 'google_script' | 'plain_text';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  keywords: PersistedNegativeKeyword[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  keywords,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('google_editor');
  const [activePresets, setActivePresets] = useState<string[]>([]);
  const [isPiiScrubbed, setIsPiiScrubbed] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string>('');

  // Handle keyboard dismissal (Escape)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Apply Intent Presets if selected
  const eligibleKeywords = useMemo(() => {
    if (activePresets.length === 0) return keywords;
    return filterKeywordsByPresets(keywords, activePresets);
  }, [keywords, activePresets]);

  // Client-Side PII Scrubber prior to export
  const { scrubbedKeywords, piiStats } = useMemo(() => {
    if (!isPiiScrubbed) {
      return { scrubbedKeywords: eligibleKeywords, piiStats: null };
    }
    const { scrubbed, stats } = scrubKeywordList(eligibleKeywords);
    return { scrubbedKeywords: scrubbed, piiStats: stats };
  }, [eligibleKeywords, isPiiScrubbed]);

  // Generate payload according to selected platform format
  const exportPayload = useMemo(() => {
    switch (selectedFormat) {
      case 'google_editor':
        return formatGoogleAdsEditorTSV(scrubbedKeywords);
      case 'amazon_csv':
        return formatAmazonBulkUploadCSV(scrubbedKeywords);
      case 'google_script':
        return generateGoogleAdsScript(scrubbedKeywords);
      case 'plain_text':
      default:
        return scrubbedKeywords.map((k) => k.formattedRule).join('\n');
    }
  }, [selectedFormat, scrubbedKeywords]);

  const togglePreset = (id: string) => {
    setActivePresets((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(exportPayload);
    if (success) {
      setIsCopied(true);
      setCopyFeedback(`Copied ${eligibleKeywords.length} rules!`);
      setTimeout(() => {
        setIsCopied(false);
        setCopyFeedback('');
      }, 2000);
    }
  };

  const handleDownload = () => {
    let filename = 'sieve-negative-rules';
    let mimeType = 'text/plain';

    switch (selectedFormat) {
      case 'google_editor':
        filename = 'sieve-google-ads-editor.tsv';
        mimeType = 'text/tab-separated-values';
        break;
      case 'amazon_csv':
        filename = 'sieve-amazon-ppc-negatives.csv';
        mimeType = 'text/csv';
        break;
      case 'google_script':
        filename = 'sieve-google-ads-script.js';
        mimeType = 'application/javascript';
        break;
      case 'plain_text':
      default:
        filename = 'sieve-negative-keywords.txt';
        mimeType = 'text/plain';
        break;
    }

    const blob = new Blob([exportPayload], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-opacity duration-150 ease-out"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-transform duration-150 ease-out scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center p-1.5 shrink-0 shadow-inner">
              <SieveLogo
                size="sm"
                alt="Sieve"
                data-testid="export-modal-logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h2 id="export-modal-title" className="text-base font-semibold text-zinc-100">
                Export Negative Keyword Rules
              </h2>
              <p className="text-xs text-zinc-400 font-mono tabular-nums mt-0.5">
                Target {eligibleKeywords.length.toLocaleString()} rules across multi-platform formats
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 transition-all duration-150 ease-out active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selector Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 bg-zinc-950/30 border-b border-zinc-800/80">
          <button
            type="button"
            onClick={() => setSelectedFormat('google_editor')}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 transition-all duration-150 ease-out active:scale-[0.98] ${
              selectedFormat === 'google_editor'
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="text-left">
              <div className="font-semibold">Google Ads Editor</div>
              <div className="text-[10px] text-zinc-500 font-mono">TSV Direct Paste</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedFormat('amazon_csv')}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 transition-all duration-150 ease-out active:scale-[0.98] ${
              selectedFormat === 'amazon_csv'
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-left">
              <div className="font-semibold">Amazon PPC</div>
              <div className="text-[10px] text-zinc-500 font-mono">Bulk CSV File</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedFormat('google_script')}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 transition-all duration-150 ease-out active:scale-[0.98] ${
              selectedFormat === 'google_script'
                ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300'
                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <FileCode className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="text-left">
              <div className="font-semibold">Google Script</div>
              <div className="text-[10px] text-zinc-500 font-mono">Standalone JS</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedFormat('plain_text')}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 transition-all duration-150 ease-out active:scale-[0.98] ${
              selectedFormat === 'plain_text'
                ? 'bg-zinc-700/60 border-zinc-500 text-zinc-200'
                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
            <div className="text-left">
              <div className="font-semibold">Plain Rules</div>
              <div className="text-[10px] text-zinc-500 font-mono">Newline Separated</div>
            </div>
          </button>
        </div>

        {/* Intent Presets & Privacy Toolbar */}
        <div className="px-6 py-2.5 bg-zinc-950/40 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-400 font-medium">Intent Presets:</span>
            {Object.values(INTENT_PRESETS).map((preset) => {
              const isSelected = activePresets.includes(preset.id);
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => togglePreset(preset.id)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 transition-all duration-150 ease-out active:scale-95 border ${
                    isSelected
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
                      : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50 hover:bg-zinc-800 hover:text-zinc-300'
                  }`}
                >
                  {preset.name.split(' ')[0]}
                </button>
              );
            })}
            {activePresets.length > 0 && (
              <button
                type="button"
                onClick={() => setActivePresets([])}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 underline font-mono transition-colors duration-150 ml-1"
              >
                Clear
              </button>
            )}
          </div>

          {/* Client-Side PII Scrubber Toggle */}
          <button
            type="button"
            data-testid="export-pii-toggle"
            onClick={() => setIsPiiScrubbed((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono transition-all duration-150 border outline-none active:scale-95 ${
              isPiiScrubbed
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900/80'
                : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
            title="Toggle client-side redaction of emails, phone numbers, cards, SSNs, and IPs prior to export"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>PII Scrubber: {isPiiScrubbed ? 'Redacted' : 'Raw'}</span>
            {piiStats && piiStats.redactedTokens > 0 && isPiiScrubbed && (
              <span className="px-1 py-0.2 rounded text-[10px] bg-emerald-900/90 text-emerald-200 border border-emerald-700/60 font-semibold">
                {piiStats.redactedTokens}
              </span>
            )}
          </button>
        </div>

        {/* Payload Preview Body */}
        <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Payload Preview</span>
            <span className="font-mono tabular-nums text-[11px]">
              {exportPayload.length.toLocaleString()} characters •{' '}
              {exportPayload.split('\n').length.toLocaleString()} lines
            </span>
          </div>

          <div className="flex-1 overflow-auto bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-[11px] text-zinc-300 selection:bg-emerald-500/40 whitespace-pre">
            {exportPayload.slice(0, 15000)}
            {exportPayload.length > 15000 && '\n\n... (preview truncated to first 15,000 characters)'}
          </div>
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/60">
          <div className="text-xs text-emerald-400 font-mono">
            {copyFeedback}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-150 ease-out active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 shadow-sm shadow-emerald-950/40"
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied Payload
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy to Clipboard
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all duration-150 ease-out active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
            >
              <Download className="w-4 h-4" />
              Download File
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

