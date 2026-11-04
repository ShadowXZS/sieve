/**
 * PDF Report Configuration & Generation Modal (Phase 6)
 *
 * Provides executive styling controls, organization customization,
 * dynamic capital reallocation adjustments, and client-side vector PDF generation.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  FileText,
  Layers,
  Download,
  Loader2,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import { calculateReallocationModel, formatCurrency } from '../../reports/reallocation.ts';
import { computeExecutiveAnalytics } from '../../utils/executiveAnalytics.ts';
import { AuditOnePager } from '../../reports/pdf/AuditOnePager.tsx';
import { ForensicDeck } from '../../reports/pdf/ForensicDeck.tsx';
import { generatePdfBlob, downloadPdfBlob } from '../../reports/pdf/renderer.ts';
import { SieveLogo } from '../brand/SieveLogo.tsx';

export type ReportType = 'one_pager' | 'forensic_deck';

export interface ReportConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ACCENT_PRESETS = [
  { label: 'Emerald', hex: '#10b981' },
  { label: 'Indigo', hex: '#6366f1' },
  { label: 'Amber', hex: '#f59e0b' },
  { label: 'Rose', hex: '#ec4899' },
  { label: 'Cyan', hex: '#06b6d4' },
];

export const ReportConfigModal: React.FC<ReportConfigModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { filteredKeywords, kpi, thresholds, currency, longTailResult, dilutionResult } = useSieveStore();

  const [reportType, setReportType] = useState<ReportType>('one_pager');
  const [organizationTitle, setOrganizationTitle] = useState('Acme Corp PPC Audit');
  const [accentColor, setAccentColor] = useState('#10b981');
  const [marginalCPA, setMarginalCPA] = useState<number>(thresholds.targetCPA || 50);
  const [notes, setNotes] = useState(
    'Audit recommendations: Apply exact negative match exclusions to prevent margin erosion without cannibalizing high-intent converting terms.'
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync marginal CPA with store threshold
  useEffect(() => {
    if (thresholds.targetCPA) {
      setMarginalCPA(thresholds.targetCPA);
    }
  }, [thresholds.targetCPA]);

  // Keyboard dismissal (Escape)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isGenerating) {
        onClose();
      }
    },
    [onClose, isGenerating]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Dynamic reallocation calculation
  const reallocation = useMemo(() => {
    return calculateReallocationModel({
      recoveredWaste: kpi.totalWaste,
      marginalCPA: marginalCPA > 0 ? marginalCPA : 50,
      baselineSpend: kpi.totalWaste > 0 ? kpi.totalWaste * 5 : 50000,
    });
  }, [kpi.totalWaste, marginalCPA]);

  // Synchronized live executive analytics
  const analytics = useMemo(() => {
    return computeExecutiveAnalytics(filteredKeywords, thresholds, kpi, currency);
  }, [filteredKeywords, thresholds, kpi, currency]);

  // Generate & Download PDF
  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      setErrorMessage(null);

      const topKeywords = [...filteredKeywords].sort(
        (a, b) => (b.marginalWaste || 0) - (a.marginalWaste || 0)
      );

      const reportDate = new Date().toISOString().split('T')[0];

      let docElement: React.ReactElement;
      let filename: string;

      if (reportType === 'one_pager') {
        docElement = React.createElement(AuditOnePager, {
          organizationTitle,
          accentColor,
          notes,
          currencySymbol: currency,
          kpi,
          reallocation,
          topKeywords,
          reportDate,
          analytics,
          thresholds,
        });
        filename = `${organizationTitle.toLowerCase().replace(/\s+/g, '-')}-executive-audit.pdf`;
      } else {
        docElement = React.createElement(ForensicDeck, {
          organizationTitle,
          accentColor,
          notes,
          currencySymbol: currency,
          kpi,
          reallocation,
          keywords: topKeywords,
          reportDate,
          analytics,
          thresholds,
          longTailResult,
          dilutionResult,
        });
        filename = `${organizationTitle.toLowerCase().replace(/\s+/g, '-')}-forensic-deck.pdf`;
      }

      const blob = await generatePdfBlob(docElement);
      downloadPdfBlob(blob, filename);

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to generate vector PDF report.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-opacity duration-150 ease-out"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-transform duration-150 ease-out scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center p-1.5 shrink-0 shadow-inner">
              <SieveLogo
                size="sm"
                alt="Sieve"
                data-testid="report-modal-logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h2 id="report-modal-title" className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                Generate Vector Audit Report
              </h2>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                Zero-Server • 100% Client-Side In-Memory PDF Compilation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            aria-label="Close report modal"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 transition-all duration-150 ease-out disabled:opacity-50 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
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

          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-800 rounded-lg text-red-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/60">
          <div className="text-[11px] text-zinc-500 font-mono">
            Direct browser compilation • 0 bytes dispatched externally
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all duration-150 ease-out active:scale-95 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || isSuccess}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-150 ease-out active:scale-[0.98] disabled:opacity-50 shadow-md shadow-emerald-950/30 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Compiling PDF...
                </>
              ) : isSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  PDF Downloaded!
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download PDF Report
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

