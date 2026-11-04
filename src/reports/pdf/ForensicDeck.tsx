/**
 * Multi-Page Forensic Account Audit Deck PDF (Phase 6)
 *
 * Compiles a vector-rendered, multi-page comprehensive account forensic audit
 * directly inside browser memory using @react-pdf/renderer.
 *
 * Diagnostics Chapters:
 * 1. Executive Summary & Capital Recovery Matrix
 * 2. Capital Reallocation Modeling & Sensitivity Projection
 * 3. Search Term Forensic Targets & Cost Dispersion
 * 4. Conflict Guard, Safe-List Integrity & Execution Protocol
 *
 * 100% Zero-Server, fully offline font metrics (Helvetica standard 14).
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import type { KPISummary } from '../../state/useSieveStore.ts';
import { type ReallocationModel, formatCurrency } from '../reallocation.ts';
import type { PersistedNegativeKeyword } from '../../workers/protocol.ts';

export interface ForensicDeckProps {
  organizationTitle?: string;
  accentColor?: string;
  currencySymbol?: string;
  notes?: string;
  kpi: KPISummary;
  reallocation: ReallocationModel;
  keywords?: PersistedNegativeKeyword[];
  reportDate?: string;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 40,
    color: '#27272a',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#e4e4e7',
    paddingBottom: 12,
    marginBottom: 20,
  },
  headerTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 16,
    color: '#09090b',
  },
  headerCategory: {
    fontSize: 8,
    color: '#71717a',
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  pageNumber: {
    fontSize: 8,
    color: '#94a3b8',
    fontFamily: 'Helvetica-Bold',
  },
  chapterBanner: {
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
    backgroundColor: '#f8fafc',
    borderLeftWidth: 4,
  },
  chapterTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 13,
    color: '#09090b',
    marginBottom: 3,
  },
  chapterSubtitle: {
    fontSize: 8.5,
    color: '#475569',
    lineHeight: 1.3,
  },
  gridCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  card: {
    flex: 1,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardLabel: {
    fontSize: 7.5,
    color: '#64748b',
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
  },
  cardValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginTop: 4,
  },
  cardSub: {
    fontSize: 7.5,
    marginTop: 2,
    fontFamily: 'Helvetica-Bold',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: '#09090b',
    marginBottom: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tableHeaderCell: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: '#475569',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tableCell: {
    fontSize: 8,
    color: '#334155',
  },
  tableCellBold: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  calloutBox: {
    padding: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    marginBottom: 14,
  },
  calloutText: {
    fontSize: 8,
    color: '#334155',
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e4e4e7',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7,
    color: '#94a3b8',
  },
});

export const ForensicDeck: React.FC<ForensicDeckProps> = ({
  organizationTitle = 'Forensic Account Audit Deck',
  accentColor = '#6366f1',
  currencySymbol = '$',
  notes,
  kpi,
  reallocation,
  keywords = [],
  reportDate = new Date().toISOString().split('T')[0],
}) => {
  const formattedWaste = formatCurrency(kpi.totalWaste || 0, currencySymbol);

  const top10Keywords = keywords.slice(0, 10);
  const collisions = keywords.filter((k) => k.hasCollision).slice(0, 5);

  return (
    <Document title={`${organizationTitle} - Forensic Deck`} author="Sieve Zero-Server Core">
      {/* Page 1: Executive Summary */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerCategory}>Forensic Diagnostic Series • Chapter 1</Text>
            <Text style={styles.headerTitle}>{organizationTitle}</Text>
          </View>
          <Text style={styles.pageNumber}>Page 1 / 4</Text>
        </View>

        <View style={[styles.chapterBanner, { borderLeftColor: accentColor }]}>
          <Text style={styles.chapterTitle}>Executive Summary & Capital Recovery</Text>
          <Text style={styles.chapterSubtitle}>
            High-precision algorithmic negative keyword synthesis identifying non-converting search queries,
            preventing margin drag, and establishing baseline reallocation opportunities.
          </Text>
        </View>

        {/* Hero KPI Cards */}
        <View style={styles.gridCards}>
          <View style={[styles.card, { borderTopWidth: 2, borderTopColor: accentColor }]}>
            <Text style={styles.cardLabel}>Recoverable Waste</Text>
            <Text style={[styles.cardValue, { color: accentColor }]}>{formattedWaste}</Text>
            <Text style={[styles.cardSub, { color: '#64748b' }]}>
              {kpi.totalKeywords.toLocaleString()} Exclusion Rules
            </Text>
          </View>

          <View style={[styles.card, { borderTopWidth: 2, borderTopColor: '#10b981' }]}>
            <Text style={styles.cardLabel}>Projected Conv. Lift</Text>
            <Text style={[styles.cardValue, { color: '#059669' }]}>
              +{Math.round(reallocation.conversionLiftPercent * 10) / 10}%
            </Text>
            <Text style={[styles.cardSub, { color: '#059669' }]}>
              +{Math.round(reallocation.incrementalConversions).toLocaleString()} Conversions
            </Text>
          </View>

          <View style={[styles.card, { borderTopWidth: 2, borderTopColor: '#f59e0b' }]}>
            <Text style={styles.cardLabel}>Capital Efficiency</Text>
            <Text style={[styles.cardValue, { color: '#d97706' }]}>
              {Math.round(reallocation.efficiencyMultiplier * 100) / 100}x
            </Text>
            <Text style={[styles.cardSub, { color: '#d97706' }]}>
              ROAS +{Math.round(reallocation.roasLiftPercent * 10) / 10}%
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Health & Quality Diagnostics</Text>
          <View style={styles.calloutBox}>
            <Text style={styles.calloutText}>
              • Average Bayesian Confidence Score: {Math.round(kpi.avgConfidence * 100)}% statistical significance.
            </Text>
            <Text style={[styles.calloutText, { marginTop: 4 }]}>
              • Safe-List Collisions Detected: {kpi.collisionCount.toLocaleString()} high-intent terms protected from accidental blocking.
            </Text>
            <Text style={[styles.calloutText, { marginTop: 4 }]}>
              • Exact Match Isolation: {kpi.exactLockedCount} rules locked to exact bracket format to shield broad match queries.
            </Text>
          </View>
        </View>

        {notes && (
          <View style={[styles.calloutBox, { borderLeftWidth: 3, borderLeftColor: accentColor }]}>
            <Text style={styles.cardLabel}>Audit Scope & Directives</Text>
            <Text style={[styles.calloutText, { marginTop: 3 }]}>{notes}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generated via Sieve Client-Side Vector Engine • Confidential Client Report • {reportDate}
          </Text>
          <Text style={styles.footerText}>1 / 4</Text>
        </View>
      </Page>

      {/* Page 2: Capital Reallocation Model */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerCategory}>Forensic Diagnostic Series • Chapter 2</Text>
            <Text style={styles.headerTitle}>Capital Reallocation Model</Text>
          </View>
          <Text style={styles.pageNumber}>Page 2 / 4</Text>
        </View>

        <View style={[styles.chapterBanner, { borderLeftColor: '#10b981' }]}>
          <Text style={styles.chapterTitle}>Marginal Acquisition Cost Reinvestment</Text>
          <Text style={styles.chapterSubtitle}>
            Modeling performance when recovered waste budget is redirected into campaigns operating at target marginal CPA.
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
              {formatCurrency(reallocation.currentCPA, currencySymbol)}
            </Text>
            <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right', color: '#059669' }]}>
              {formatCurrency(reallocation.projectedCPA, currencySymbol)}
            </Text>
            <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right', color: '#059669' }]}>
              -{Math.round(((reallocation.currentCPA - reallocation.projectedCPA) / reallocation.currentCPA) * 1000) / 10}%
            </Text>
          </View>

          <View style={[styles.tableRow, { backgroundColor: '#f8fafc' }]}>
            <Text style={[styles.tableCellBold, { flex: 2.5 }]}>Total Conversions</Text>
            <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right' }]}>
              {Math.round(reallocation.projectedConversions - reallocation.incrementalConversions).toLocaleString()}
            </Text>
            <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right', color: '#4f46e5' }]}>
              {Math.round(reallocation.projectedConversions).toLocaleString()}
            </Text>
            <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right', color: '#4f46e5' }]}>
              +{Math.round(reallocation.conversionLiftPercent * 10) / 10}%
            </Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tableCellBold, { flex: 2.5 }]}>Return on Ad Spend (ROAS)</Text>
            <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right' }]}>
              {Math.round(reallocation.currentROAS * 100) / 100}x
            </Text>
            <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right', color: '#d97706' }]}>
              {Math.round(reallocation.projectedROAS * 100) / 100}x
            </Text>
            <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right', color: '#d97706' }]}>
              +{Math.round(reallocation.roasLiftPercent * 10) / 10}%
            </Text>
          </View>
        </View>

        <View style={styles.calloutBox}>
          <Text style={styles.cardLabel}>Deterministic Equation Model</Text>
          <Text style={[styles.calloutText, { marginTop: 4 }]}>
            ΔConversions = Recovered Waste ({formattedWaste}) ÷ Marginal CPA ({formatCurrency(reallocation.marginalCPA, currencySymbol)})
            = {Math.round(reallocation.incrementalConversions).toLocaleString()} incremental acquisitions with zero net budget expansion.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generated via Sieve Client-Side Vector Engine • Confidential Client Report • {reportDate}
          </Text>
          <Text style={styles.footerText}>2 / 4</Text>
        </View>
      </Page>

      {/* Page 3: Search Term Diagnostics */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerCategory}>Forensic Diagnostic Series • Chapter 3</Text>
            <Text style={styles.headerTitle}>Search Term Forensic Targets</Text>
          </View>
          <Text style={styles.pageNumber}>Page 3 / 4</Text>
        </View>

        <View style={[styles.chapterBanner, { borderLeftColor: '#f59e0b' }]}>
          <Text style={styles.chapterTitle}>High-Waste Search Query Dispersion</Text>
          <Text style={styles.chapterSubtitle}>
            Specific search terms with high clicks and zero conversion velocity draining account resources.
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

          {top10Keywords.map((kw, idx) => (
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
              <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right' }]}>
                {formatCurrency(kw.marginalWaste || 0, currencySymbol)}
              </Text>
              <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'center' }]}>
                {Math.round((kw.confidenceScore || 0) * 100)}%
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generated via Sieve Client-Side Vector Engine • Confidential Client Report • {reportDate}
          </Text>
          <Text style={styles.footerText}>3 / 4</Text>
        </View>
      </Page>

      {/* Page 4: Conflict Guard & Safe-List Audit */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerCategory}>Forensic Diagnostic Series • Chapter 4</Text>
            <Text style={styles.headerTitle}>Conflict Guard & Safety Protocol</Text>
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
                  <Text style={[styles.tableCell, { flex: 3, color: '#059669' }]}>
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
              <Text style={[styles.calloutText, { color: '#059669', fontFamily: 'Helvetica-Bold' }]}>
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
            <Text style={[styles.calloutText, { marginTop: 4 }]}>
              2. Validate Exact match lock criteria to maintain safe-list integrity.
            </Text>
            <Text style={[styles.calloutText, { marginTop: 4 }]}>
              3. Monitor marginal CPA shifts over a 14-day evaluation window post-implementation.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generated via Sieve Client-Side Vector Engine • Confidential Client Report • {reportDate}
          </Text>
          <Text style={styles.footerText}>4 / 4</Text>
        </View>
      </Page>
    </Document>
  );
};
