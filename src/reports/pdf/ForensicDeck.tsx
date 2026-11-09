/**
 * Multi-Page Forensic Account Audit Deck PDF (Phase 12 - High-Fidelity Vector PDF Sync)
 *
 * Compiles a vector-rendered, 4-page comprehensive account forensic audit
 * directly inside browser memory using @react-pdf/renderer.
 *
 * Diagnostics Chapters:
 * 1. Executive Summary & Live Executive Dashboard Diagnostic Matrix
 * 2. Capital Reallocation Modeling & Spend Waterfall Sensitivity
 * 3. Search Term Forensic Targets, Bid Elasticity & Dilution Diagnostics
 * 4. Conflict Guard, Safe-List Integrity & Execution Protocol
 */

import React from 'react';
import { Document } from '@react-pdf/renderer';
import type { KPISummary, SieveThresholds } from '../../state/useSieveStore.ts';
import type { ReallocationModel } from '../reallocation.ts';
import type {
  PersistedNegativeKeyword,
  FragmentedLongTailResult,
  MatchTypeDilutionResult,
} from '../../workers/protocol.ts';
import { normalizeCurrencySymbol, type SupportedCurrency } from '../../utils/currency.ts';
import {
  computeExecutiveAnalytics,
  computeFragmentedLongTail,
  computeMatchTypeDilution,
  type ExecutiveAnalytics,
} from '../../utils/executiveAnalytics.ts';
import { registerPdfFonts } from './fonts/index.ts';
import { EXECUTIVE_COLOR_TOKENS } from './tokens.ts';
import { scrubKeywordList, scrubPiiText } from '../../crypto/pii_scrubber.ts';
import { Chapter1Summary } from './components/Chapter1Summary.tsx';
import { Chapter2Reallocation } from './components/Chapter2Reallocation.tsx';
import { Chapter3SearchTerms } from './components/Chapter3SearchTerms.tsx';
import { Chapter4ConflictGuard } from './components/Chapter4ConflictGuard.tsx';

// Ensure offline UTF-8 TrueType fonts are registered
registerPdfFonts();

export interface ForensicDeckProps {
  organizationTitle?: string;
  accentColor?: string;
  currencySymbol?: string;
  notes?: string;
  kpi: KPISummary;
  reallocation: ReallocationModel;
  keywords?: PersistedNegativeKeyword[];
  reportDate?: string;
  analytics?: ExecutiveAnalytics;
  thresholds?: SieveThresholds;
  longTailResult?: FragmentedLongTailResult;
  dilutionResult?: MatchTypeDilutionResult;
  redactPii?: boolean;
}

export const ForensicDeck: React.FC<ForensicDeckProps> = ({
  organizationTitle = 'Forensic Account Audit Deck',
  accentColor = EXECUTIVE_COLOR_TOKENS.reallocation.border,
  currencySymbol = '$',
  notes,
  kpi,
  reallocation,
  keywords = [],
  analytics,
  thresholds,
  longTailResult,
  dilutionResult,
  redactPii = true,
}) => {
  const activeCurrency: SupportedCurrency = normalizeCurrencySymbol(currencySymbol);

  // Apply Client-Side PII Scrubber prior to document synthesis
  const effectiveKeywords = redactPii ? scrubKeywordList(keywords).scrubbed : keywords;
  const effectiveNotes = notes && redactPii ? scrubPiiText(notes).scrubbedText : notes;
  const effectiveOrgTitle = organizationTitle && redactPii ? scrubPiiText(organizationTitle).scrubbedText : organizationTitle;

  // Compute or reuse executive analytics (pure functional, zero React hook overhead)
  const execAnalytics =
    analytics ??
    computeExecutiveAnalytics(
      effectiveKeywords,
      thresholds || {
        targetCPA: reallocation.marginalCPA || 50,
        minClicks: 10,
        maxMarginalWaste: 100000,
        confidenceScore: 0.9,
      },
      kpi,
      activeCurrency
    );

  const waste = execAnalytics.wasteBleed.amount;
  const spend = execAnalytics.spendWaterfall.totalSpend;
  const wastePercentage =
    spend <= 0 || !Number.isFinite(spend)
      ? 0.0
      : Math.min(100.0, Math.max(0.0, Math.round((waste / spend) * 1000) / 10));

  // Compute or reuse diagnostic metrics
  const longTail =
    longTailResult ??
    computeFragmentedLongTail(effectiveKeywords, thresholds?.targetCPA || 50, activeCurrency);

  const dilution =
    dilutionResult ??
    computeMatchTypeDilution(effectiveKeywords, activeCurrency);

  const collisions = effectiveKeywords.filter((k) => k.hasCollision).slice(0, 6);

  return (
    <Document title={`${effectiveOrgTitle} - Forensic Deck`} author="Sieve Zero-Server Core">
      {/* Chapter 1: Executive Summary */}
      <Chapter1Summary
        organizationTitle={effectiveOrgTitle}
        accentColor={accentColor}
        notes={effectiveNotes}
        kpi={kpi}
        reallocation={reallocation}
        analytics={execAnalytics}
        wastePercentage={wastePercentage}
      />

      {/* Chapter 2: Capital Reallocation Model */}
      <Chapter2Reallocation
        reallocation={reallocation}
        analytics={execAnalytics}
        currency={activeCurrency}
      />

      {/* Chapter 3: Search Term Diagnostics */}
      <Chapter3SearchTerms
        keywords={effectiveKeywords}
        analytics={execAnalytics}
        currency={activeCurrency}
        longTail={longTail}
        dilution={dilution}
      />

      {/* Chapter 4: Conflict Guard & Safe-List Protocol */}
      <Chapter4ConflictGuard collisions={collisions} />
    </Document>
  );
};
