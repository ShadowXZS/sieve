/**
 * Single-Page Executive Client Audit PDF (Phase 12 - High-Fidelity Vector PDF Sync)
 *
 * Compiles a vector-rendered, single-page executive summary directly inside
 * browser memory using @react-pdf/renderer.
 *
 * Features:
 * - 100% Client-Side Vector Synthesis with Zero Network Calls.
 * - Live synchronization with reconciled micro-unit domain metrics.
 * - Eradicates 8.2x hero metric discrepancy by binding Actionable Identified Waste.
 * - Dynamic font-size scaling eliminating metric clipping.
 * - Convex-damped reallocation model callout box (gamma approx 0.75).
 * - Multi-currency UTF-8 TrueType fonts: $, ₹, €, ¥, £.
 *
 * Line ceiling: <= 250 lines.
 */

import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import {
  type KPISummary,
  type SieveThresholds,
  type SieveMetricsMicros,
  fromMicros,
} from '../../state/useSieveStore.ts';
import type { ReallocationModel } from '../reallocation.ts';
import type { PersistedNegativeKeyword } from '../../workers/protocol.ts';
import { formatCurrency, normalizeCurrencySymbol, type SupportedCurrency } from '../../utils/currency.ts';
import { computeExecutiveAnalytics, type ExecutiveAnalytics } from '../../utils/executiveAnalytics.ts';
import { registerPdfFonts } from './fonts/index.ts';
import { executivePdfStyles as styles, EXECUTIVE_COLOR_TOKENS } from './styles.ts';
import { scrubKeywordList, scrubPiiText } from '../../crypto/pii_scrubber.ts';
import { MetricCardsGrid } from './components/MetricCardsGrid.tsx';
import { TopExclusionsTable } from './components/TableComponents.tsx';
import { PdfFooter } from './components/PdfFooter.tsx';

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
  metrics?: SieveMetricsMicros;
}

export const AuditOnePager: React.FC<AuditOnePagerProps> = ({
  organizationTitle = 'Sieve PPC Forensic Audit',
  accentColor = EXECUTIVE_COLOR_TOKENS.safeList.border,
  currencySymbol = '$',
  notes,
  kpi,
  reallocation,
  topKeywords = [],
  reportDate = new Date().toISOString().split('T')[0],
  analytics,
  thresholds,
  redactPii = true,
  metrics,
}) => {
  const activeCurrency: SupportedCurrency = normalizeCurrencySymbol(currencySymbol);

  const effectiveTopKeywords = redactPii ? scrubKeywordList(topKeywords).scrubbed : topKeywords;
  const effectiveNotes = notes && redactPii ? scrubPiiText(notes).scrubbedText : notes;
  const effectiveOrgTitle = organizationTitle && redactPii ? scrubPiiText(organizationTitle).scrubbedText : organizationTitle;

  const rawAnalytics = analytics ?? computeExecutiveAnalytics(
    effectiveTopKeywords,
    thresholds || { targetCPA: reallocation.marginalCPA || 50, minClicks: 10, maxMarginalWaste: 100000, confidenceScore: 0.9 },
    kpi,
    activeCurrency
  );

  const wasteAmount = metrics?.actionableWasteMicros
    ? fromMicros(metrics.actionableWasteMicros)
    : kpi.actionableWasteMicros
    ? fromMicros(kpi.actionableWasteMicros)
    : kpi.totalWasteMicros
    ? fromMicros(kpi.totalWasteMicros)
    : kpi.totalWaste > 0 ? kpi.totalWaste : rawAnalytics.wasteBleed.amount;

  const formattedWaste = formatCurrency(wasteAmount, activeCurrency);
  const cpaDragAmount = metrics?.cpaDragMicros ? fromMicros(metrics.cpaDragMicros) : rawAnalytics.wasteBleed.cpaDrag;
  const totalSpend = metrics?.totalSpendMicros ? fromMicros(metrics.totalSpendMicros) : rawAnalytics.spendWaterfall.totalSpend;
  const securedSpend = metrics?.securedSpendMicros ? fromMicros(metrics.securedSpendMicros) : rawAnalytics.spendWaterfall.securedSpend;
  const exploratorySpend = metrics?.exploratorySpendMicros ? fromMicros(metrics.exploratorySpendMicros) : rawAnalytics.spendWaterfall.exploratorySpend;
  const effectiveWastePct = metrics?.wastePercentage ?? (totalSpend > 0 ? Math.round((wasteAmount / totalSpend) * 1000) / 10 : rawAnalytics.spendWaterfall.wastePct);

  const incrementalConversions = metrics?.incrementalConversions ?? kpi.incrementalConversions ?? (
    reallocation.marginalCPA > 0 && wasteAmount > 0 ? Math.round((wasteAmount / reallocation.marginalCPA) * 0.75) : reallocation.incrementalConversions
  );
  const annualizedRecovery = metrics?.annualizedRecoveryMicros ? fromMicros(metrics.annualizedRecoveryMicros) : wasteAmount * 12;
  const protectedConversions = metrics?.protectedConversions ?? kpi.protectedConversions ?? rawAnalytics.safeListProtection.protectedConversions;
  const securedRevenue = metrics?.securedSpendMicros ? fromMicros(metrics.securedSpendMicros) : rawAnalytics.safeListProtection.securedRevenue;
  const highRiskClicks = metrics?.highRiskClicks ?? kpi.highRiskClicks ?? rawAnalytics.exploratoryRisk.highRiskClicks;
  const optimalBidCeiling = metrics?.optimalBidCeilingMicros ? fromMicros(metrics.optimalBidCeilingMicros) : rawAnalytics.exploratoryRisk.optimalBidCeiling;

  const execAnalytics: ExecutiveAnalytics = {
    ...rawAnalytics,
    wasteBleed: { ...rawAnalytics.wasteBleed, amount: wasteAmount, formatted: formattedWaste, cpaDrag: cpaDragAmount, formattedCpaDrag: formatCurrency(cpaDragAmount, activeCurrency), candidateCount: kpi.totalKeywords || rawAnalytics.wasteBleed.candidateCount },
    safeListProtection: { ...rawAnalytics.safeListProtection, protectedConversions, securedRevenue, formattedSecuredRevenue: formatCurrency(securedRevenue, activeCurrency), collisionCount: kpi.collisionCount ?? rawAnalytics.safeListProtection.collisionCount, exactLockedCount: kpi.exactLockedCount ?? rawAnalytics.safeListProtection.exactLockedCount },
    exploratoryRisk: { ...rawAnalytics.exploratoryRisk, highRiskClicks, optimalBidCeiling, formattedOptimalBidCeiling: formatCurrency(optimalBidCeiling, activeCurrency), highRiskSpend: exploratorySpend, formattedHighRiskSpend: formatCurrency(exploratorySpend, activeCurrency) },
    reallocationYield: { ...rawAnalytics.reallocationYield, incrementalConversions, annualizedRecovery, formattedAnnualizedRecovery: formatCurrency(annualizedRecovery, activeCurrency), roasLiftPercent: metrics?.roasLiftPercent ?? reallocation.roasLiftPercent },
    spendWaterfall: { ...rawAnalytics.spendWaterfall, totalSpend, formattedTotalSpend: formatCurrency(totalSpend, activeCurrency), securedSpend, formattedSecuredSpend: formatCurrency(securedSpend, activeCurrency), wasteSpend: wasteAmount, formattedWasteSpend: formattedWaste, wastePct: effectiveWastePct },
  };

  const baselineConvs = reallocation.projectedConversions - reallocation.incrementalConversions;
  const reconciledReallocation: ReallocationModel = {
    ...reallocation,
    recoveredWaste: wasteAmount,
    incrementalConversions,
    projectedConversions: baselineConvs > 0 ? baselineConvs + incrementalConversions : incrementalConversions,
    conversionLiftPercent: baselineConvs > 0 ? (incrementalConversions / baselineConvs) * 100 : reallocation.conversionLiftPercent,
  };

  const formattedCpa = formatCurrency(reallocation.marginalCPA, activeCurrency);

  return (
    <Document title={`${effectiveOrgTitle} - Executive Audit`} author="Sieve Zero-Server Core">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{effectiveOrgTitle}</Text>
            <Text style={styles.headerSubtitle}>Executive PPC Forensic Audit • Multi-Currency Vector Report</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={[styles.badge, { backgroundColor: accentColor }]}><Text>Validated Audit</Text></View>
            <Text style={styles.dateText}>{reportDate}</Text>
          </View>
        </View>

        <MetricCardsGrid analytics={execAnalytics} reallocation={reconciledReallocation} wastePercentage={effectiveWastePct} />

        <View style={styles.formulaCallout}>
          <View style={styles.formulaHeader}>
            <Text style={styles.formulaTitle}>Deterministic Capital Reallocation Model</Text>
            <Text style={styles.formulaBadge}>Convex Damping (γ ≈ 0.75)</Text>
          </View>
          <Text style={styles.formulaEquation}>Δ Conversions = (Recovered Waste / Target CPA) × γ  [γ ≈ 0.75 Cobb-Douglas Damping]</Text>
          <Text style={styles.formulaSubstitutions}>Recovered Waste ({execAnalytics.wasteBleed.formatted}) ÷ Target Marginal CPA ({formattedCpa}) × 0.75</Text>
          <Text style={styles.formulaOutcome}>= +{Math.round(incrementalConversions).toLocaleString()} incremental acquisitions ({execAnalytics.reallocationYield.formattedAnnualizedRecovery} annualized) with zero net budget expansion</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Deterministic Capital Reallocation Model</Text>
          <View style={styles.reallocBox}>
            <View style={[styles.reallocCol, { borderRightWidth: 1, borderRightColor: EXECUTIVE_COLOR_TOKENS.neutral.border }]}>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Current Account CPA:</Text>
                <Text style={styles.reallocValue}>{formatCurrency(reconciledReallocation.currentCPA, activeCurrency)}</Text>
              </View>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Target Marginal CPA:</Text>
                <Text style={styles.reallocValue}>{formatCurrency(reconciledReallocation.marginalCPA, activeCurrency)}</Text>
              </View>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Projected Account CPA:</Text>
                <Text style={[styles.reallocValue, { color: EXECUTIVE_COLOR_TOKENS.safeList.primary }]}>{formatCurrency(reconciledReallocation.projectedCPA, activeCurrency)}</Text>
              </View>
            </View>
            <View style={styles.reallocCol}>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Current ROAS:</Text>
                <Text style={styles.reallocValue}>{Math.round(reconciledReallocation.currentROAS * 10) / 10}x</Text>
              </View>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Projected ROAS:</Text>
                <Text style={[styles.reallocValue, { color: EXECUTIVE_COLOR_TOKENS.reallocation.primary }]}>{Math.round(reconciledReallocation.projectedROAS * 10) / 10}x</Text>
              </View>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Projected ROAS Lift:</Text>
                <Text style={[styles.reallocValue, { color: EXECUTIVE_COLOR_TOKENS.reallocation.primary }]}>+{Math.round(reconciledReallocation.roasLiftPercent * 10) / 10}%</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Negative Exclusion Targets by Waste</Text>
          <TopExclusionsTable keywords={effectiveTopKeywords} currency={activeCurrency} limit={6} showConfidence={false} />
        </View>

        {effectiveNotes && (
          <View style={[styles.notesBox, { borderLeftColor: accentColor }]}>
            <Text style={[styles.cardLabel, { marginBottom: 2, color: EXECUTIVE_COLOR_TOKENS.neutral.slate700 }]}>Executive Directives & Strategic Scope</Text>
            <Text style={styles.notesText}>{effectiveNotes}</Text>
          </View>
        )}

        <PdfFooter pageText="Page 1 of 1" />
      </Page>
    </Document>
  );
};
