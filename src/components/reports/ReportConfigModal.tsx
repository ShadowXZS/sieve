/**
 * PDF Report Configuration & Generation Modal (Phase 6)
 *
 * Provides executive styling controls, organization customization,
 * dynamic capital reallocation adjustments, and client-side vector PDF generation.
 * Physical line ceiling: <= 250 lines.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Loader2, CheckCircle2 } from 'lucide-react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import { calculateReallocationModel } from '../../reports/reallocation.ts';
import { computeExecutiveAnalytics } from '../../utils/executiveAnalytics.ts';
import { AuditOnePager } from '../../reports/pdf/AuditOnePager.tsx';
import { ForensicDeck } from '../../reports/pdf/ForensicDeck.tsx';
import { generatePdfBlob, downloadPdfBlob } from '../../reports/pdf/renderer.ts';
import { SieveLogo } from '../brand/SieveLogo.tsx';
import {
  ReportSettingsForm,
  type ReportType,
  ACCENT_PRESETS,
} from './ReportSettingsForm.tsx';

export type { ReportType };
export { ACCENT_PRESETS };

export interface ReportConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReportConfigModal: React.FC<ReportConfigModalProps> = ({ isOpen, onClose }) => {
  const { filteredKeywords, kpi, thresholds, currency, longTailResult, dilutionResult } = useSieveStore();

  const [reportType, setReportType] = useState<ReportType>('one_pager');
  const [organizationTitle, setOrganizationTitle] = useState('Acme Corp PPC Audit');
  const [accentColor, setAccentColor] = useState(ACCENT_PRESETS[0].hex);
  const [marginalCPA, setMarginalCPA] = useState<number>(thresholds.targetCPA || 50);
  const [redactPii, setRedactPii] = useState<boolean>(true);
  const [notes, setNotes] = useState(
    'Audit recommendations: Apply exact negative match exclusions to prevent margin erosion without cannibalizing high-intent converting terms.'
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (thresholds.targetCPA) setMarginalCPA(thresholds.targetCPA);
  }, [thresholds.targetCPA]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isGenerating) onClose();
    },
    [onClose, isGenerating]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const reallocation = useMemo(() => {
    return calculateReallocationModel({
      recoveredWaste: kpi.totalWaste,
      marginalCPA: marginalCPA > 0 ? marginalCPA : 50,
      baselineSpend: kpi.totalWaste > 0 ? kpi.totalWaste * 5 : 50000,
    });
  }, [kpi.totalWaste, marginalCPA]);

  const analytics = useMemo(() => {
    return computeExecutiveAnalytics(filteredKeywords, thresholds, kpi, currency);
  }, [filteredKeywords, thresholds, kpi, currency]);

  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      setErrorMessage(null);

      const topKeywords = [...filteredKeywords].sort(
        (a, b) => (b.marginalWaste || 0) - (a.marginalWaste || 0)
      );
      const reportDate = new Date().toISOString().split('T')[0];
      const baseSlug = organizationTitle.toLowerCase().replace(/\s+/g, '-');

      const docElement = reportType === 'one_pager'
        ? React.createElement(AuditOnePager, {
            organizationTitle, accentColor, notes, currencySymbol: currency,
            kpi, reallocation, topKeywords, reportDate, analytics, thresholds, redactPii,
          })
        : React.createElement(ForensicDeck, {
            organizationTitle, accentColor, notes, currencySymbol: currency,
            kpi, reallocation, keywords: topKeywords, reportDate, analytics, thresholds,
            longTailResult: longTailResult ?? undefined,
            dilutionResult: dilutionResult ?? undefined, redactPii,
          });

      const filename = `${baseSlug}-${reportType === 'one_pager' ? 'executive-audit' : 'forensic-deck'}.pdf`;
      const blob = await generatePdfBlob(docElement);
      downloadPdfBlob(blob, filename);

      setIsSuccess(true);
      setTimeout(() => { setIsSuccess(false); onClose(); }, 1200);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate vector PDF report.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto transition-opacity duration-150 ease-out"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-transform duration-150 ease-out scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center p-1.5 shrink-0 shadow-inner">
              <SieveLogo size="sm" alt="Sieve" data-testid="report-modal-logo" className="w-full h-full object-contain" />
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

        <ReportSettingsForm
          reportType={reportType} setReportType={setReportType}
          organizationTitle={organizationTitle} setOrganizationTitle={setOrganizationTitle}
          accentColor={accentColor} setAccentColor={setAccentColor}
          marginalCPA={marginalCPA} setMarginalCPA={setMarginalCPA}
          notes={notes} setNotes={setNotes}
          redactPii={redactPii} setRedactPii={setRedactPii}
          reallocation={reallocation} kpi={kpi} currency={currency} errorMessage={errorMessage}
        />

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

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
