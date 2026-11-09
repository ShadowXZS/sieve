/**
 * Multi-Platform Negative Keyword Export Definition Modal
 *
 * Mounts directly to document.body via createPortal to break out of
 * virtual grid container overflow: hidden.
 * Physical line ceiling: <= 250 lines.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { PersistedNegativeKeyword } from '../../workers/protocol.ts';
import {
  formatGoogleAdsEditorTSV,
  formatAmazonBulkUploadCSV,
  copyToClipboard,
} from '../../formatters/clipboard.ts';
import { generateGoogleAdsScript } from '../../formatters/scripts.ts';
import { filterKeywordsByPresets } from '../../presets/dictionaries.ts';
import { SieveLogo } from '../brand/SieveLogo.tsx';
import { X, Copy, Check, Download } from 'lucide-react';
import { scrubKeywordList } from '../../crypto/pii_scrubber.ts';
import {
  ExportPreviewSection,
  type ExportFormat,
} from './ExportPreviewSection.tsx';

export type { ExportFormat };

export interface ExportDefModalProps {
  isOpen: boolean;
  onClose: () => void;
  keywords?: PersistedNegativeKeyword[];
  children?: React.ReactNode;
  [key: string]: unknown;
}

export const ExportDefModal: React.FC<ExportDefModalProps> = ({
  isOpen,
  onClose,
  keywords = [],
  children,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('google_editor');
  const [activePresets, setActivePresets] = useState<string[]>([]);
  const [isPiiScrubbed, setIsPiiScrubbed] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string>('');

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const eligibleKeywords = useMemo(() => {
    if (activePresets.length === 0) return keywords;
    return filterKeywordsByPresets(keywords, activePresets);
  }, [keywords, activePresets]);

  const { scrubbedKeywords, piiStats } = useMemo(() => {
    if (!isPiiScrubbed) {
      return { scrubbedKeywords: eligibleKeywords, piiStats: null };
    }
    const { scrubbed, stats } = scrubKeywordList(eligibleKeywords);
    return { scrubbedKeywords: scrubbed, piiStats: stats };
  }, [eligibleKeywords, isPiiScrubbed]);

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
    const formatMap: Record<ExportFormat, { filename: string; mimeType: string }> = {
      google_editor: { filename: 'sieve-google-ads-editor.tsv', mimeType: 'text/tab-separated-values' },
      amazon_csv: { filename: 'sieve-amazon-ppc-negatives.csv', mimeType: 'text/csv' },
      google_script: { filename: 'sieve-google-ads-script.js', mimeType: 'application/javascript' },
      plain_text: { filename: 'sieve-negative-keywords.txt', mimeType: 'text/plain' },
    };

    const { filename, mimeType } = formatMap[selectedFormat] || formatMap.plain_text;
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

  const modalMarkup = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        className="relative z-10 w-full max-w-4xl max-h-[85vh] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {children ?? (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center p-1.5 shrink-0 shadow-inner">
                  <SieveLogo size="sm" alt="Sieve" data-testid="export-modal-logo" className="w-full h-full object-contain" />
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

            <ExportPreviewSection
              selectedFormat={selectedFormat}
              onSelectFormat={setSelectedFormat}
              activePresets={activePresets}
              onTogglePreset={togglePreset}
              onClearPresets={() => setActivePresets([])}
              isPiiScrubbed={isPiiScrubbed}
              onTogglePii={() => setIsPiiScrubbed((prev) => !prev)}
              piiStats={piiStats}
              exportPayload={exportPayload}
            />

            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/60 shrink-0">
              <div className="text-xs text-emerald-400 font-mono">
                {copyFeedback}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-150 ease-out active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 shadow-sm shadow-emerald-950/40"
                >
                  {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {isCopied ? 'Copied Payload' : 'Copy to Clipboard'}
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
          </>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalMarkup, document.body)
    : modalMarkup;
};

export const ExportModal = ExportDefModal;
