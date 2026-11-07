/**
 * Single-Page Executive Client Audit PDF (Phase 12 - High-Fidelity Vector PDF Sync)
 *
 * Compiles a vector-rendered, single-page executive summary directly inside
 * browser memory using @react-pdf/renderer.
 *
 * Features:
 * - 100% Client-Side Vector Synthesis with Zero Network Calls.
 * - Live synchronization with Executive Dashboard 4-tier semantic sections.
 * - Dynamic big number font-size scaling eliminating metric clipping.
 * - Mathematical reallocation model callout box with distinct formula elements.
 * - Complete UTF-8 glyph embedding for multi-currency symbols: $, ₹, €, ¥, £.
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
} from '@react-pdf/renderer';
import type { KPISummary, SieveThresholds } from '../../state/useSieveStore.ts';
import type { ReallocationModel } from '../reallocation.ts';
import type { PersistedNegativeKeyword } from '../../workers/protocol.ts';
import { formatCurrency, normalizeCurrencySymbol, type SupportedCurrency } from '../../utils/currency.ts';
import { computeExecutiveAnalytics, type ExecutiveAnalytics } from '../../utils/executiveAnalytics.ts';
import { registerPdfFonts } from './fonts/index.ts';
import { executivePdfStyles as styles, EXECUTIVE_COLOR_TOKENS } from './styles.ts';
import { scrubKeywordList, scrubPiiText } from '../../crypto/pii_scrubber.ts';
import { MetricCardsGrid } from './components/MetricCardsGrid.tsx';
import { FormulaCallout } from './components/FormulaCallout.tsx';
import { TopExclusionsTable } from './components/TableComponents.tsx';
import { PdfFooter } from './components/PdfFooter.tsx';

// Ensure offline UTF-8 TrueType fonts are registered
registerPdfFonts();

export interface AuditOnePagerProps {
  organizationTitle?: string;
  accentColor?: string;
  currencySymbol?: string;
  notes?: string;
  kpi: KPISummary;
  reallocation: ReallocationModel;
  topKeywords?: PersistedNegativeKeyword[];
  reportDate?: string;
  analytics?: ExecutiveAnalytics;
  thresholds?: SieveThresholds;
  redactPii?: boolean;
  zeroLeakAttestationHash?: string;
}

export const AuditOnePager: React.FC<AuditOnePagerProps> = ({
  organizationTitle = 'Sieve PPC Forensic Audit',
  accentColor = '#10b981',
  currencySymbol = '$',
  notes,
  kpi,
  reallocation,
  topKeywords = [],
  reportDate = new Date().toISOString().split('T')[0],
  analytics,
  thresholds,
  redactPii = true,
}) => {
  const activeCurrency: SupportedCurrency = normalizeCurrencySymbol(currencySymbol);

  // Apply Client-Side PII Scrubber prior to document synthesis
  const effectiveTopKeywords = redactPii ? scrubKeywordList(topKeywords).scrubbed : topKeywords;
  const effectiveNotes = notes && redactPii ? scrubPiiText(notes).scrubbedText : notes;
  const effectiveOrgTitle = organizationTitle && redactPii ? scrubPiiText(organizationTitle).scrubbedText : organizationTitle;

  // Compute or reuse executive analytics (pure functional, zero React hook overhead)
  const execAnalytics =
    analytics ??
    computeExecutiveAnalytics(
      effectiveTopKeywords,
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

  return (
    <Document title={`${effectiveOrgTitle} - Executive Audit`} author="Sieve Zero-Server Core">
      <Page size="A4" style={styles.page}>
        {/* Document Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{effectiveOrgTitle}</Text>
            <Text style={styles.headerSubtitle}>
              Executive PPC Forensic Audit • Multi-Currency Vector Report
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={[styles.badge, { backgroundColor: accentColor }]}>
              <Text>Validated Audit</Text>
            </View>
            <Text style={styles.dateText}>{reportDate}</Text>
          </View>
        </View>

        {/* Live Executive Dashboard Sync: 4 Color-Coded Semantic Sections */}
        <MetricCardsGrid
          analytics={execAnalytics}
          reallocation={reallocation}
          wastePercentage={wastePercentage}
        />

        {/* Styled Reallocation Equation Callout Box */}
        <FormulaCallout
          reallocation={reallocation}
          analytics={execAnalytics}
          currency={activeCurrency}
        />

        {/* Deterministic Reallocation Model Balance Sheet */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Deterministic Capital Reallocation Model</Text>
          <View style={styles.reallocBox}>
            <View style={[styles.reallocCol, { borderRightWidth: 1, borderRightColor: '#e2e8f0' }]}>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Current Account CPA:</Text>
                <Text style={styles.reallocValue}>{formatCurrency(reallocation.currentCPA, activeCurrency)}</Text>
              </View>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Target Marginal CPA:</Text>
                <Text style={styles.reallocValue}>{formatCurrency(reallocation.marginalCPA, activeCurrency)}</Text>
              </View>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Projected Account CPA:</Text>
                <Text style={[styles.reallocValue, { color: EXECUTIVE_COLOR_TOKENS.safeList.primary }]}>
                  {formatCurrency(reallocation.projectedCPA, activeCurrency)}
                </Text>
              </View>
            </View>

            <View style={styles.reallocCol}>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Current ROAS:</Text>
                <Text style={styles.reallocValue}>{Math.round(reallocation.currentROAS * 10) / 10}x</Text>
              </View>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Projected ROAS:</Text>
                <Text style={[styles.reallocValue, { color: EXECUTIVE_COLOR_TOKENS.reallocation.primary }]}>
                  {Math.round(reallocation.projectedROAS * 10) / 10}x
                </Text>
              </View>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Projected ROAS Lift:</Text>
                <Text style={[styles.reallocValue, { color: EXECUTIVE_COLOR_TOKENS.reallocation.primary }]}>
                  +{Math.round(reallocation.roasLiftPercent * 10) / 10}%
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Top Bleeding Waste Queries Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Negative Exclusion Targets by Waste</Text>
          <TopExclusionsTable
            keywords={effectiveTopKeywords}
            currency={activeCurrency}
            limit={6}
            showConfidence={false}
          />
        </View>

        {/* Custom Strategic Notes */}
        {effectiveNotes && (
          <View style={[styles.notesBox, { borderLeftColor: accentColor }]}>
            <Text style={[styles.cardLabel, { marginBottom: 2, color: '#334155' }]}>
              Executive Directives & Strategic Scope
            </Text>
            <Text style={styles.notesText}>{effectiveNotes}</Text>
          </View>
        )}

        {/* Isolated Footer */}
        <PdfFooter pageText="Page 1 of 1" />
      </Page>
    </Document>
  );
};
