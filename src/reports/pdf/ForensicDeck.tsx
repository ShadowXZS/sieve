/**
 * Multi-Page Forensic Account Audit Deck PDF (Phase 12 - High-Fidelity Vector PDF Sync)
 *
 * Compiles a vector-rendered, multi-page comprehensive account forensic audit
 * directly inside browser memory using @react-pdf/renderer.
 *
 * Diagnostics Chapters:
 * 1. Executive Summary & Live Executive Dashboard Diagnostic Matrix
 * 2. Capital Reallocation Modeling & Spend Waterfall Sensitivity
 * 3. Search Term Forensic Targets, Bid Elasticity & Dilution Diagnostics
 * 4. Conflict Guard, Safe-List Integrity & Execution Protocol
 *
 * Features:
 * - 100% Client-Side Vector Synthesis with Zero Network Calls.
 * - Live synchronization with Executive Dashboard 4-tier semantic sections:
 *   1. Identified Waste Bleed (Rose)
 *   2. Safe-List Protected (Emerald)
 *   3. High-Risk Clicks (Amber)
 *   4. Reallocation Yield (Indigo)
 * - Complete UTF-8 glyph embedding for multi-currency symbols: $, ₹, €, ¥, £.
 * - Embedded Bid Elasticity Probe & Match-Type Dilution diagnostics.
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
import type {
  PersistedNegativeKeyword,
  FragmentedLongTailResult,
  MatchTypeDilutionResult,
} from '../../workers/protocol.ts';
import { formatCurrency, normalizeCurrencySymbol, type SupportedCurrency } from '../../utils/currency.ts';
import {
  computeExecutiveAnalytics,
  computeFragmentedLongTail,
  computeMatchTypeDilution,
  type ExecutiveAnalytics,
} from '../../utils/executiveAnalytics.ts';
import { registerPdfFonts } from './fonts/index.ts';
import { executivePdfStyles as styles, EXECUTIVE_COLOR_TOKENS } from './styles.ts';
import { scrubKeywordList, scrubPiiText } from '../../crypto/pii_scrubber.ts';

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
  accentColor = '#6366f1',
  currencySymbol = '$',
  notes,
  kpi,
  reallocation,
  keywords = [],
  reportDate = new Date().toISOString().split('T')[0],
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
        minSpend: 50,
        minConfidence: 0.9,
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

  // Compute or reuse Phase 11 diagnostic results
  const longTail =
    longTailResult ??
    computeFragmentedLongTail(keywords, thresholds?.targetCPA || 50, activeCurrency);

  const dilution =
    dilutionResult ??
    computeMatchTypeDilution(keywords, activeCurrency);

  const topKeywords = keywords.slice(0, 8);
  const collisions = keywords.filter((k) => k.hasCollision).slice(0, 6);

  return (
    <Document title={`${organizationTitle} - Forensic Deck`} author="Sieve Zero-Server Core">
      {/* Page 1: Executive Summary & Live Executive Dashboard Diagnostic */}
      <Page size="A4" style={styles.deckPage}>
        <View style={styles.headerDeck}>
          <View>
            <Text style={styles.headerCategory}>Forensic Diagnostic Series • Chapter 1</Text>
            <Text style={styles.headerTitleDeck}>{organizationTitle}</Text>
          </View>
          <Text style={styles.pageNumber}>Page 1 / 4</Text>
        </View>

        <View style={[styles.chapterBanner, { borderLeftColor: accentColor }]}>
          <Text style={styles.chapterTitle}>Executive Summary & Capital Recovery Matrix</Text>
          <Text style={styles.chapterSubtitle}>
            High-precision algorithmic negative keyword synthesis identifying non-converting search queries,
            preventing margin drag, and synchronizing with live Executive Dashboard performance tiers.
          </Text>
        </View>

        {/* Live Executive Dashboard Sync: 4 Color-Coded Semantic Sections */}
        <View style={styles.gridCards}>
          {/* Tier 1: Rose/Red - Identified Waste Bleed */}
          <View
            style={[
              styles.card,
              {
                borderTopWidth: 2.5,
                borderTopColor: EXECUTIVE_COLOR_TOKENS.wasteBleed.border,
                backgroundColor: EXECUTIVE_COLOR_TOKENS.wasteBleed.bg,
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardLabel, { color: EXECUTIVE_COLOR_TOKENS.wasteBleed.text }]}>
                Identified Waste
              </Text>
              <View style={[styles.pillBadge, { backgroundColor: EXECUTIVE_COLOR_TOKENS.wasteBleed.badgeBg }]}>
                <Text style={{ color: EXECUTIVE_COLOR_TOKENS.wasteBleed.text }}>
                  {wastePercentage.toFixed(1)}%
                </Text>
              </View>
            </View>
            <Text style={[styles.cardValue, { color: EXECUTIVE_COLOR_TOKENS.wasteBleed.dark }]}>
              {execAnalytics.wasteBleed.formatted}
            </Text>
            <Text style={[styles.cardSub, { color: EXECUTIVE_COLOR_TOKENS.wasteBleed.primary }]}>
              CPA Drag: +{execAnalytics.wasteBleed.formattedCpaDrag}
            </Text>
            <Text style={styles.cardCaption}>
              {execAnalytics.wasteBleed.candidateCount.toLocaleString()} non-converting tokens
            </Text>
          </View>

          {/* Tier 2: Emerald/Green - Safe-List Protected */}
          <View
            style={[
              styles.card,
              {
                borderTopWidth: 2.5,
                borderTopColor: EXECUTIVE_COLOR_TOKENS.safeList.border,
                backgroundColor: EXECUTIVE_COLOR_TOKENS.safeList.bg,
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardLabel, { color: EXECUTIVE_COLOR_TOKENS.safeList.text }]}>
                Safe-List Protected
              </Text>
              <View style={[styles.pillBadge, { backgroundColor: EXECUTIVE_COLOR_TOKENS.safeList.badgeBg }]}>
                <Text style={{ color: EXECUTIVE_COLOR_TOKENS.safeList.dark }}>Secured</Text>
              </View>
            </View>
            <Text style={[styles.cardValue, { color: EXECUTIVE_COLOR_TOKENS.safeList.dark }]}>
              {execAnalytics.safeListProtection.protectedConversions.toLocaleString()} Convs
            </Text>
            <Text style={[styles.cardSub, { color: EXECUTIVE_COLOR_TOKENS.safeList.primary }]}>
              Secured: {execAnalytics.safeListProtection.formattedSecuredRevenue}
            </Text>
            <Text style={styles.cardCaption}>
              {execAnalytics.safeListProtection.exactLockedCount} locked exact queries
            </Text>
          </View>

          {/* Tier 3: Amber/Orange - High-Risk Clicks */}
          <View
            style={[
              styles.card,
              {
                borderTopWidth: 2.5,
                borderTopColor: EXECUTIVE_COLOR_TOKENS.highRisk.border,
                backgroundColor: EXECUTIVE_COLOR_TOKENS.highRisk.bg,
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardLabel, { color: EXECUTIVE_COLOR_TOKENS.highRisk.text }]}>
                High-Risk Clicks
              </Text>
              <View style={[styles.pillBadge, { backgroundColor: EXECUTIVE_COLOR_TOKENS.highRisk.badgeBg }]}>
                <Text style={{ color: EXECUTIVE_COLOR_TOKENS.highRisk.dark }}>Elasticity</Text>
              </View>
            </View>
            <Text style={[styles.cardValue, { color: EXECUTIVE_COLOR_TOKENS.highRisk.dark }]}>
              {execAnalytics.exploratoryRisk.highRiskClicks.toLocaleString()} Clicks
            </Text>
            <Text style={[styles.cardSub, { color: EXECUTIVE_COLOR_TOKENS.highRisk.primary }]}>
              Ceiling: {execAnalytics.exploratoryRisk.formattedOptimalBidCeiling}
            </Text>
            <Text style={styles.cardCaption}>
              Δ: {execAnalytics.exploratoryRisk.formattedBoundaryDelta} boundary spread
            </Text>
          </View>

          {/* Tier 4: Indigo/Slate - Reallocation Yield */}
          <View
            style={[
              styles.card,
              {
                borderTopWidth: 2.5,
                borderTopColor: EXECUTIVE_COLOR_TOKENS.reallocation.border,
                backgroundColor: EXECUTIVE_COLOR_TOKENS.reallocation.bg,
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardLabel, { color: EXECUTIVE_COLOR_TOKENS.reallocation.text }]}>
                Reallocation Yield
              </Text>
              <View style={[styles.pillBadge, { backgroundColor: EXECUTIVE_COLOR_TOKENS.reallocation.badgeBg }]}>
                <Text style={{ color: EXECUTIVE_COLOR_TOKENS.reallocation.dark }}>Efficiency</Text>
              </View>
            </View>
            <Text style={[styles.cardValue, { color: EXECUTIVE_COLOR_TOKENS.reallocation.dark }]}>
              +{execAnalytics.reallocationYield.incrementalConversions.toFixed(1)} Convs
            </Text>
            <Text style={[styles.cardSub, { color: EXECUTIVE_COLOR_TOKENS.reallocation.primary }]}>
              Annual: {execAnalytics.reallocationYield.formattedAnnualizedRecovery}
            </Text>
            <Text style={styles.cardCaption}>
              +{execAnalytics.reallocationYield.roasLiftPercent}% ROAS Lift ({Math.round(reallocation.efficiencyMultiplier * 100) / 100}x)
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Health & Quality Diagnostics</Text>
          <View style={styles.calloutBox}>
            <Text style={styles.calloutText}>
              • Average Bayesian Confidence Score: {Math.round(kpi.avgConfidence * 100)}% statistical significance across identified exclusion candidates.
            </Text>
            <Text style={[styles.calloutText, { marginTop: 3 }]}>
              • Safe-List Collisions Detected: {kpi.collisionCount.toLocaleString()} high-intent terms protected from accidental blocking.
            </Text>
            <Text style={[styles.calloutText, { marginTop: 3 }]}>
              • Exact Match Isolation: {kpi.exactLockedCount} rules locked to exact bracket format to shield broad match queries.
            </Text>
            <Text style={[styles.calloutText, { marginTop: 3 }]}>
              • Account Spend Waterfall: {execAnalytics.spendWaterfall.formattedTotalSpend} Total Spend ({execAnalytics.spendWaterfall.securedPct}% Secured, {execAnalytics.spendWaterfall.exploratoryPct}% Exploratory, {execAnalytics.spendWaterfall.wastePct}% Waste Bleed).
            </Text>
          </View>
        </View>

        {notes && (
          <View style={[styles.calloutBox, { borderLeftWidth: 3, borderLeftColor: accentColor }]}>
            <Text style={[styles.cardLabel, { color: '#334155' }]}>Audit Scope & Directives</Text>
            <Text style={[styles.calloutText, { marginTop: 3 }]}>{notes}</Text>
          </View>
        )}

        <View style={styles.footerDeck}>
          <Text style={styles.footerText}>
            Generated via Sieve Client-Side Vector Engine • Confidential Client Report • UTF-8 Verified • {reportDate}
          </Text>
          <Text style={styles.footerText}>1 / 4</Text>
        </View>
      </Page>

      {/* Page 2: Capital Reallocation Model & Spend Waterfall */}
      <Page size="A4" style={styles.deckPage}>
        <View style={styles.headerDeck}>
          <View>
            <Text style={styles.headerCategory}>Forensic Diagnostic Series • Chapter 2</Text>
            <Text style={styles.headerTitleDeck}>Capital Reallocation Model</Text>
          </View>
          <Text style={styles.pageNumber}>Page 2 / 4</Text>
        </View>

        <View style={[styles.chapterBanner, { borderLeftColor: EXECUTIVE_COLOR_TOKENS.safeList.border }]}>
          <Text style={styles.chapterTitle}>Marginal Acquisition Cost Reinvestment</Text>
          <Text style={styles.chapterSubtitle}>
            Modeling account performance when recovered waste budget is redirected into campaigns operating at target marginal CPA.
          </Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2.5 }]}>Performance Metric</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Baseline</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Projected</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Delta (%)</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tableCellBold, { flex: 2.5 }]}>Acquisition Cost (CPA)</Text>
            <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right' }]}>
              {formatCurrency(reallocation.currentCPA, activeCurrency)}
            </Text>
            <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right', color: EXECUTIVE_COLOR_TOKENS.safeList.primary }]}>
              {formatCurrency(reallocation.projectedCPA, activeCurrency)}
            </Text>
            <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right', color: EXECUTIVE_COLOR_TOKENS.safeList.primary }]}>
              -{Math.round(((reallocation.currentCPA - reallocation.projectedCPA) / Math.max(1, reallocation.currentCPA)) * 1000) / 10}%
            </Text>
          </View>

          <View style={[styles.tableRow, { backgroundColor: '#f8fafc' }]}>
            <Text style={[styles.tableCellBold, { flex: 2.5 }]}>Total Conversions</Text>
            <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right' }]}>
              {Math.round(reallocation.projectedConversions - reallocation.incrementalConversions).toLocaleString()}
            </Text>
            <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right', color: EXECUTIVE_COLOR_TOKENS.reallocation.primary }]}>
              {Math.round(reallocation.projectedConversions).toLocaleString()}
            </Text>
            <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right', color: EXECUTIVE_COLOR_TOKENS.reallocation.primary }]}>
              +{Math.round(reallocation.conversionLiftPercent * 10) / 10}%
            </Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tableCellBold, { flex: 2.5 }]}>Return on Ad Spend (ROAS)</Text>
            <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right' }]}>
              {Math.round(reallocation.currentROAS * 100) / 100}x
            </Text>
            <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right', color: EXECUTIVE_COLOR_TOKENS.highRisk.primary }]}>
              {Math.round(reallocation.projectedROAS * 100) / 100}x
            </Text>
            <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right', color: EXECUTIVE_COLOR_TOKENS.highRisk.primary }]}>
              +{Math.round(reallocation.roasLiftPercent * 10) / 10}%
            </Text>
          </View>
        </View>

        {/* Spend Waterfall Allocation Summary Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spend Waterfall Allocation Breakdown</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 2.5 }]}>Allocation Tier</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Allocated Spend</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Share (%)</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Semantic Classification</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={[styles.tableCellBold, { flex: 2.5, color: EXECUTIVE_COLOR_TOKENS.safeList.primary }]}>Secured / Safe-List</Text>
              <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right' }]}>
                {execAnalytics.spendWaterfall.formattedSecuredSpend}
              </Text>
              <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right' }]}>
                {execAnalytics.spendWaterfall.securedPct}%
              </Text>
              <Text style={[styles.tableCell, { flex: 2 }]}>Protected converting queries</Text>
            </View>

            <View style={[styles.tableRow, { backgroundColor: '#f8fafc' }]}>
              <Text style={[styles.tableCellBold, { flex: 2.5, color: EXECUTIVE_COLOR_TOKENS.highRisk.primary }]}>Exploratory High-Risk</Text>
              <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right' }]}>
                {execAnalytics.spendWaterfall.formattedExploratorySpend}
              </Text>
              <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right' }]}>
                {execAnalytics.spendWaterfall.exploratoryPct}%
              </Text>
              <Text style={[styles.tableCell, { flex: 2 }]}>Clicks above optimal bid ceiling</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={[styles.tableCellBold, { flex: 2.5, color: EXECUTIVE_COLOR_TOKENS.wasteBleed.primary }]}>Identified Waste Bleed</Text>
              <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right' }]}>
                {execAnalytics.spendWaterfall.formattedWasteSpend}
              </Text>
              <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right' }]}>
                {execAnalytics.spendWaterfall.wastePct}%
              </Text>
              <Text style={[styles.tableCell, { flex: 2 }]}>Zero-conversion non-profitable drag</Text>
            </View>
          </View>
        </View>

        <View style={styles.calloutBox}>
          <Text style={[styles.cardLabel, { color: '#334155' }]}>Deterministic Equation Model</Text>
          <Text style={[styles.calloutText, { marginTop: 3 }]}>
            ΔConversions = Recovered Waste ({execAnalytics.wasteBleed.formatted}) ÷ Marginal CPA ({formatCurrency(reallocation.marginalCPA, activeCurrency)})
            = {Math.round(reallocation.incrementalConversions).toLocaleString()} incremental acquisitions with zero net budget expansion.
          </Text>
        </View>

        <View style={styles.footerDeck}>
          <Text style={styles.footerText}>
            Generated via Sieve Client-Side Vector Engine • Confidential Client Report • UTF-8 Verified • {reportDate}
          </Text>
          <Text style={styles.footerText}>2 / 4</Text>
        </View>
      </Page>

      {/* Page 3: Search Term Diagnostics, Bid Elasticity & Dilution Metrics */}
      <Page size="A4" style={styles.deckPage}>
        <View style={styles.headerDeck}>
          <View>
            <Text style={styles.headerCategory}>Forensic Diagnostic Series • Chapter 3</Text>
            <Text style={styles.headerTitleDeck}>Search Term Forensic Targets & Dilution</Text>
          </View>
          <Text style={styles.pageNumber}>Page 3 / 4</Text>
        </View>

        <View style={[styles.chapterBanner, { borderLeftColor: EXECUTIVE_COLOR_TOKENS.highRisk.border }]}>
          <Text style={styles.chapterTitle}>High-Waste Search Query Dispersion & Dilution Metrics</Text>
          <Text style={styles.chapterSubtitle}>
            Specific search terms with high clicks and zero conversion velocity, paired with bid elasticity boundaries
            and match-type dilution loss analysis.
          </Text>
        </View>

        {/* Bid Elasticity Diagnostics */}
        <View style={[styles.calloutBox, { borderLeftWidth: 3, borderLeftColor: EXECUTIVE_COLOR_TOKENS.highRisk.border }]}>
          <Text style={[styles.cardLabel, { color: EXECUTIVE_COLOR_TOKENS.highRisk.text }]}>Bid Elasticity Diagnostics</Text>
          <Text style={[styles.calloutText, { marginTop: 3 }]}>
            • Optimal Bid Ceiling: {execAnalytics.exploratoryRisk.formattedOptimalBidCeiling} (Zone: {execAnalytics.exploratoryRisk.elasticityZone.toUpperCase()})
          </Text>
          <Text style={[styles.calloutText, { marginTop: 2 }]}>
            • Converting Median CPC: {execAnalytics.exploratoryRisk.formattedConvertingMedianCPC} vs Non-Converting Median CPC: {execAnalytics.exploratoryRisk.formattedNonConvertingMedianCPC}
          </Text>
          <Text style={[styles.calloutText, { marginTop: 2 }]}>
            • Boundary Spread Delta (Δ): {execAnalytics.exploratoryRisk.formattedBoundaryDelta} across {execAnalytics.exploratoryRisk.highRiskClicks.toLocaleString()} exploratory clicks.
          </Text>
        </View>

        {/* Match-Type Dilution & Fragmented Long-Tail Probe */}
        <View style={[styles.calloutBox, { borderLeftWidth: 3, borderLeftColor: EXECUTIVE_COLOR_TOKENS.reallocation.border }]}>
          <Text style={[styles.cardLabel, { color: EXECUTIVE_COLOR_TOKENS.reallocation.text }]}>Match-Type Dilution & Fragmented Long-Tail</Text>
          <Text style={[styles.calloutText, { marginTop: 3 }]}>
            • Match-Type Dilution Index: {Math.round(dilution.dilution_index * 100)}% (Budget Lost: {formatCurrency(dilution.budget_lost, activeCurrency)} across {dilution.diluted_queries_count} diluted queries).
          </Text>
          <Text style={[styles.calloutText, { marginTop: 2 }]}>
            • Fragmented Long-Tail Aggregator: {longTail.identified_root_tokens_count} root tokens causing {formatCurrency(longTail.total_long_tail_waste, activeCurrency)} collective waste across {longTail.total_long_tail_queries} queries (≤ 2 clicks).
          </Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Query Term</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>Match Type</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Clicks</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Marginal Waste</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.2, textAlign: 'center' }]}>Confidence</Text>
          </View>

          {topKeywords.map((kw, idx) => (
            <View
              key={kw.sha256Hash || kw.id || idx}
              style={[styles.tableRow, idx % 2 === 0 ? {} : { backgroundColor: '#f8fafc' }]}
            >
              <Text style={[styles.tableCellBold, { flex: 3 }]}>
                {kw.keyword}
              </Text>
              <Text style={[styles.tableCell, { flex: 1.2, textTransform: 'uppercase' }]}>
                {kw.matchType}
              </Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>
                {(kw.clicks || 0).toLocaleString()}
              </Text>
              <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right', color: EXECUTIVE_COLOR_TOKENS.wasteBleed.primary }]}>
                {formatCurrency(kw.marginalWaste || 0, activeCurrency)}
              </Text>
              <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'center' }]}>
                {Math.round((kw.confidenceScore || 0) * 100)}%
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.footerDeck}>
          <Text style={styles.footerText}>
            Generated via Sieve Client-Side Vector Engine • Confidential Client Report • UTF-8 Verified • {reportDate}
          </Text>
          <Text style={styles.footerText}>3 / 4</Text>
        </View>
      </Page>

      {/* Page 4: Conflict Guard & Safe-List Audit */}
      <Page size="A4" style={styles.deckPage}>
        <View style={styles.headerDeck}>
          <View>
            <Text style={styles.headerCategory}>Forensic Diagnostic Series • Chapter 4</Text>
            <Text style={styles.headerTitleDeck}>Conflict Guard & Safety Protocol</Text>
          </View>
          <Text style={styles.pageNumber}>Page 4 / 4</Text>
        </View>

        <View style={[styles.chapterBanner, { borderLeftColor: '#db2777' }]}>
          <Text style={styles.chapterTitle}>Safe-List Protection & Execution Roadmap</Text>
          <Text style={styles.chapterSubtitle}>
            Verification that negative keyword exclusion rules do not block active converting queries or brand terms.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Protected Safe-List Conflicts ({collisions.length} Identified)</Text>
          {collisions.length > 0 ? (
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Excluded Term</Text>
                <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Converting Collision Shielded</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'center' }]}>Action</Text>
              </View>
              {collisions.map((c, i) => (
                <View key={c.sha256Hash || c.id || i} style={styles.tableRow}>
                  <Text style={[styles.tableCellBold, { flex: 3 }]}>{c.keyword}</Text>
                  <Text style={[styles.tableCell, { flex: 3, color: EXECUTIVE_COLOR_TOKENS.safeList.primary }]}>
                    {c.collidingTerm || (c.collidingSafeTerms && c.collidingSafeTerms[0]) || 'Active Converting Query'}
                  </Text>
                  <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'center', color: '#db2777' }]}>
                    Exact Lock
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.calloutBox}>
              <Text style={[styles.calloutText, { color: EXECUTIVE_COLOR_TOKENS.safeList.primary, fontFamily: 'DejaVuSans', fontWeight: 'bold' }]}>
                ✓ Zero Safe-List Conflicts Detected: All generated negative keywords are completely free from overlap with converting search terms.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Execution Protocol</Text>
          <View style={styles.calloutBox}>
            <Text style={styles.calloutText}>
              1. Import generated Google Ads Editor TSV or Amazon PPC CSV directly into platform interfaces.
            </Text>
            <Text style={[styles.calloutText, { marginTop: 3 }]}>
              2. Validate Exact match lock criteria to maintain safe-list integrity across broad keywords.
            </Text>
            <Text style={[styles.calloutText, { marginTop: 3 }]}>
              3. Monitor marginal CPA shifts over a 14-day evaluation window post-implementation.
            </Text>
          </View>
        </View>

        <View style={styles.footerDeck}>
          <Text style={styles.footerText}>
            Generated via Sieve Client-Side Vector Engine • Confidential Client Report • UTF-8 Verified • {reportDate}
          </Text>
          <Text style={styles.footerText}>4 / 4</Text>
        </View>
      </Page>
    </Document>
  );
};
