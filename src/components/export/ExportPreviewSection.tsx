/**
 * Export Preview & Format Selector Section
 * Handles format switching, intent preset filtering, PII toggle, and text preview.
 * Physical line ceiling: <= 250 lines.
 */

import React from 'react';
import {
  FileCode,
  FileSpreadsheet,
  FileText,
  Filter,
  ShieldCheck,
} from 'lucide-react';
import { INTENT_PRESETS } from '../../presets/dictionaries.ts';
import type { PiiScrubStats } from '../../crypto/pii_scrubber.ts';

export type ExportFormat = 'google_editor' | 'amazon_csv' | 'google_script' | 'plain_text';

export interface ExportPreviewSectionProps {
  selectedFormat: ExportFormat;
  onSelectFormat: (format: ExportFormat) => void;
  activePresets: string[];
  onTogglePreset: (id: string) => void;
  onClearPresets: () => void;
  isPiiScrubbed: boolean;
  onTogglePii: () => void;
  piiStats: PiiScrubStats | null;
  exportPayload: string;
}

export const ExportPreviewSection: React.FC<ExportPreviewSectionProps> = ({
  selectedFormat,
  onSelectFormat,
  activePresets,
  onTogglePreset,
  onClearPresets,
  isPiiScrubbed,
  onTogglePii,
  piiStats,
  exportPayload,
}) => {
  return (
    <>
      {/* Format Selector Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 bg-zinc-950/30 border-b border-zinc-800/80 shrink-0">
        <button
          type="button"
          onClick={() => onSelectFormat('google_editor')}
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
          onClick={() => onSelectFormat('amazon_csv')}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 transition-all duration-150 ease-out active:scale-[0.98] ${
            selectedFormat === 'amazon_csv'
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
              : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="text-left">
            <div className="font-semibold">Amazon PPC</div>
            <div className="text-[10px] text-zinc-500 font-mono">Bulk Upload CSV</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelectFormat('google_script')}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 transition-all duration-150 ease-out active:scale-[0.98] ${
            selectedFormat === 'google_script'
              ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300'
              : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
        >
          <FileCode className="w-4 h-4 text-indigo-400 shrink-0" />
          <div className="text-left">
            <div className="font-semibold">Google Script</div>
            <div className="text-[10px] text-zinc-500 font-mono">Automation JS</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelectFormat('plain_text')}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 transition-all duration-150 ease-out active:scale-[0.98] ${
            selectedFormat === 'plain_text'
              ? 'bg-zinc-700/30 border-zinc-600 text-zinc-200'
              : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
        >
          <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
          <div className="text-left">
            <div className="font-semibold">Plain Text</div>
            <div className="text-[10px] text-zinc-500 font-mono">Formatted Rules</div>
          </div>
        </button>
      </div>

      {/* Presets and Filter Bar */}
      <div className="px-6 py-3 border-b border-zinc-800/80 bg-zinc-950/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="text-xs font-medium text-zinc-400">Filter Presets:</span>
          <div className="flex flex-wrap gap-1.5">
            {Object.values(INTENT_PRESETS).map((preset) => {
              const isSelected = activePresets.includes(preset.id);
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onTogglePreset(preset.id)}
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
                onClick={onClearPresets}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 underline font-mono transition-colors duration-150 ml-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Client-Side PII Scrubber Toggle */}
        <button
          type="button"
          data-testid="export-pii-toggle"
          onClick={onTogglePii}
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
    </>
  );
};
