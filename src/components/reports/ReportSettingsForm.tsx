/**
 * PDF Report Settings Form Component
 * Executive controls for layout, organization title, accent color, and reallocation parameters.
 * Physical line ceiling: <= 250 lines.
 */

import React from 'react';
import { FileText, Layers, TrendingUp, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ReallocationModel } from '../../reports/reallocation.ts';
import { formatCurrency } from '../../reports/reallocation.ts';
import type { KPISummary } from '../../state/useSieveStore.ts';
import { EXECUTIVE_COLOR_TOKENS } from '../../reports/pdf/tokens.ts';

export type ReportType = 'one_pager' | 'forensic_deck';

export const ACCENT_PRESETS = [
  { label: 'Emerald', hex: EXECUTIVE_COLOR_TOKENS.safeList.border },
  { label: 'Indigo', hex: EXECUTIVE_COLOR_TOKENS.reallocation.border },
  { label: 'Amber', hex: EXECUTIVE_COLOR_TOKENS.highRisk.border },
  { label: 'Rose', hex: '#ec4899' },
  { label: 'Cyan', hex: '#06b6d4' },
];

export interface ReportSettingsFormProps {
  reportType: ReportType;
  setReportType: (type: ReportType) => void;
  organizationTitle: string;
  setOrganizationTitle: (title: string) => void;
  accentColor: string;
  setAccentColor: (color: string) => void;
  marginalCPA: number;
  setMarginalCPA: (cpa: number) => void;
  notes: string;
  setNotes: (notes: string) => void;
  redactPii: boolean;
  setRedactPii: (redact: boolean) => void;
  reallocation: ReallocationModel;
  kpi: KPISummary;
  currency: string;
  errorMessage: string | null;
}

export const ReportSettingsForm: React.FC<ReportSettingsFormProps> = ({
  reportType,
  setReportType,
  organizationTitle,
  setOrganizationTitle,
  accentColor,
  setAccentColor,
  marginalCPA,
  setMarginalCPA,
  notes,
  setNotes,
  redactPii,
  setRedactPii,
  reallocation,
  kpi,
  currency,
  errorMessage,
}) => {
  return (
    <div className="p-6 overflow-y-auto space-y-5 text-xs text-zinc-300">
      {/* Report Type Selector */}
      <div>
        <label className="block text-xs font-medium text-zinc-300 mb-2">Report Layout</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setReportType('one_pager')}
            className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
              reportType === 'one_pager'
                ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300'
                : 'bg-zinc-800/40 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-zinc-100">Executive One-Pager</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Single-page C-suite audit summary, hero KPIs, top waste terms, and reallocation model.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setReportType('forensic_deck')}
            className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
              reportType === 'forensic_deck'
                ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-300'
                : 'bg-zinc-800/40 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-zinc-100">Forensic Diagnostic Deck</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                4-page comprehensive diagnostic audit covering search term dispersion, collisions, and safety.
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Organization Title & Accent Color */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="org-title" className="block text-xs font-medium text-zinc-300 mb-1.5">
            Client / Organization Title
          </label>
          <input
            id="org-title"
            type="text"
            value={organizationTitle}
            onChange={(e) => setOrganizationTitle(e.target.value)}
            placeholder="e.g. Acme Corp PPC Audit"
            className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-1.5">
            Accent Theme Color
          </label>
          <div className="flex items-center gap-2">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                onClick={() => setAccentColor(preset.hex)}
                style={{ backgroundColor: preset.hex }}
                title={preset.label}
                className={`w-7 h-7 rounded-full border-2 transition-transform ${
                  accentColor === preset.hex
                    ? 'border-white scale-110 shadow-lg'
                    : 'border-transparent hover:scale-105'
                }`}
              />
            ))}
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="w-7 h-7 bg-transparent cursor-pointer rounded overflow-hidden"
              title="Custom Color"
            />
          </div>
        </div>
      </div>

      {/* Target Marginal CPA & Dynamic Reallocation Preview */}
      <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Capital Reallocation Parameters
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400">Historical Marginal CPA:</span>
            <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5">
              <span className="text-zinc-400 mr-1 font-mono">{currency}</span>
              <input
                type="number"
                min="1"
                step="1"
                value={marginalCPA}
                onChange={(e) => setMarginalCPA(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 bg-transparent text-zinc-100 font-mono text-xs focus:outline-none text-right"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800/80">
          <div className="p-2 bg-zinc-900/60 rounded border border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase font-mono">Waste Recovered</div>
            <div className="text-sm font-semibold text-emerald-400 mt-0.5 font-mono tabular-nums">
              {formatCurrency(kpi.totalWaste || 0, currency, true)}
            </div>
          </div>
          <div className="p-2 bg-zinc-900/60 rounded border border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase font-mono">Projected Conv. Lift</div>
            <div className="text-sm font-semibold text-indigo-400 mt-0.5 font-mono tabular-nums">
              +{Math.round(reallocation.conversionLiftPercent * 10) / 10}%
            </div>
          </div>
          <div className="p-2 bg-zinc-900/60 rounded border border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase font-mono">Efficiency Multiplier</div>
            <div className="text-sm font-semibold text-amber-400 mt-0.5 font-mono tabular-nums">
              {Math.round(reallocation.efficiencyMultiplier * 100) / 100}x
            </div>
          </div>
        </div>
      </div>

      {/* Executive Notes */}
      <div>
        <label htmlFor="exec-notes" className="block text-xs font-medium text-zinc-300 mb-1.5">
          Custom Strategic Notes & Directives
        </label>
        <textarea
          id="exec-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add client-facing strategic recommendations..."
          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 resize-none font-sans"
        />
      </div>

      {/* Privacy & Zero-Leak Redaction Control */}
      <div className="p-3 bg-zinc-950 border border-emerald-900/40 rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <span className="text-xs font-semibold text-zinc-200 block">
              Client-Side PII Scrubbing
            </span>
            <span className="text-[11px] text-zinc-400 block">
              Redact emails, phone numbers, and IDs from search terms prior to PDF synthesis.
            </span>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            data-testid="report-pii-scrub-toggle"
            checked={redactPii}
            onChange={(e) => setRedactPii(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600" />
        </label>
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-950/40 border border-red-800 rounded-lg text-red-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          {errorMessage}
        </div>
      )}
    </div>
  );
};
