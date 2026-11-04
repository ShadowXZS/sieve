/**
 * Single-Page Executive Client Audit PDF (Phase 6)
 *
 * Compiles a vector-rendered, single-page executive summary directly inside
 * browser memory using @react-pdf/renderer.
 *
 * Features:
 * - Dynamic binding: custom organization title, custom hex accent color, custom notes.
 * - Deterministic capital reallocation cards and efficiency multipliers.
 * - Top negative keywords by marginal waste.
 * - 100% zero-server, offline font metrics (Helvetica standard 14).
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

export interface AuditOnePagerProps {
  organizationTitle?: string;
  accentColor?: string;
  currencySymbol?: string;
  notes?: string;
  kpi: KPISummary;
  reallocation: ReallocationModel;
  topKeywords?: PersistedNegativeKeyword[];
  reportDate?: string;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 36,
    color: '#27272a',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: '#e4e4e7',
    paddingBottom: 14,
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    color: '#09090b',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 9,
    color: '#71717a',
    marginTop: 3,
  },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    textTransform: 'uppercase',
  },
  dateText: {
    fontSize: 8,
    color: '#71717a',
    marginTop: 4,
    textAlign: 'right',
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
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginTop: 4,
  },
  cardSub: {
    fontSize: 7.5,
    color: '#10b981',
    marginTop: 2,
    fontFamily: 'Helvetica-Bold',
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: '#09090b',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  section: {
    marginBottom: 16,
  },
  table: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
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
  tableRowEven: {
    backgroundColor: '#ffffff',
  },
  tableRowOdd: {
    backgroundColor: '#f8fafc',
  },
  tableCell: {
    fontSize: 8,
    color: '#334155',
  },
  tableCellMono: {
    fontSize: 8,
    fontFamily: 'Helvetica',
    color: '#0f172a',
  },
  reallocBox: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 10,
    marginBottom: 16,
  },
  reallocCol: {
    flex: 1,
    paddingHorizontal: 6,
  },
  reallocRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2.5,
  },
  reallocLabel: {
    fontSize: 8,
    color: '#64748b',
  },
  reallocValue: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  notesBox: {
    backgroundColor: '#f8fafc',
    borderLeftWidth: 3,
    padding: 8,
    borderRadius: 4,
    marginBottom: 16,
  },
  notesText: {
    fontSize: 8,
    color: '#334155',
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
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

export const AuditOnePager: React.FC<AuditOnePagerProps> = ({
  organizationTitle = 'Sieve PPC Forensic Audit',
  accentColor = '#10b981',
  currencySymbol = '$',
  notes,
  kpi,
  reallocation,
  topKeywords = [],
  reportDate = new Date().toISOString().split('T')[0],
}) => {
  const topList = topKeywords.slice(0, 6);

  const formattedWaste = formatCurrency(kpi.totalWaste || 0, currencySymbol);

  const formattedLift = `+${Math.round(reallocation.conversionLiftPercent * 10) / 10}%`;
  const formattedConvs = `+${Math.round(reallocation.incrementalConversions).toLocaleString()} conv`;

  return (
    <Document title={`${organizationTitle} - Executive Audit`} author="Sieve Zero-Server Core">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{organizationTitle}</Text>
            <Text style={styles.headerSubtitle}>
              Negative Keyword Efficiency & Capital Reallocation Audit
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={[styles.badge, { backgroundColor: accentColor }]}>
              <Text>Validated Audit</Text>
            </View>
            <Text style={styles.dateText}>{reportDate}</Text>
          </View>
        </View>

        {/* Hero KPI Cards */}
        <View style={styles.gridCards}>
          <View style={[styles.card, { borderTopWidth: 2, borderTopColor: accentColor }]}>
            <Text style={styles.cardLabel}>Marginal Waste Recovered</Text>
            <Text style={[styles.cardValue, { color: accentColor }]}>{formattedWaste}</Text>
            <Text style={styles.cardSub}>{kpi.totalKeywords.toLocaleString()} Exclusion Rules</Text>
          </View>

          <View style={[styles.card, { borderTopWidth: 2, borderTopColor: '#6366f1' }]}>
            <Text style={styles.cardLabel}>Projected Conversion Lift</Text>
            <Text style={[styles.cardValue, { color: '#4f46e5' }]}>{formattedLift}</Text>
            <Text style={[styles.cardSub, { color: '#4f46e5' }]}>{formattedConvs}</Text>
          </View>

          <View style={[styles.card, { borderTopWidth: 2, borderTopColor: '#f59e0b' }]}>
            <Text style={styles.cardLabel}>Efficiency Multiplier</Text>
            <Text style={[styles.cardValue, { color: '#d97706' }]}>
              {Math.round(reallocation.efficiencyMultiplier * 100) / 100}x
            </Text>
            <Text style={[styles.cardSub, { color: '#d97706' }]}>
              CPA: {formatCurrency(reallocation.currentCPA, currencySymbol)} → {formatCurrency(reallocation.projectedCPA, currencySymbol)}
            </Text>
          </View>

          <View style={[styles.card, { borderTopWidth: 2, borderTopColor: '#ec4899' }]}>
            <Text style={styles.cardLabel}>Safe-List Conflicts</Text>
            <Text style={[styles.cardValue, { color: '#db2777' }]}>
              {kpi.collisionCount.toLocaleString()} Locked
            </Text>
            <Text style={[styles.cardSub, { color: '#db2777' }]}>
              {kpi.exactLockedCount} Exact Isolated
            </Text>
          </View>
        </View>

        {/* Deterministic Reallocation Model */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Deterministic Capital Reallocation Model</Text>
          <View style={styles.reallocBox}>
            <View style={[styles.reallocCol, { borderRightWidth: 1, borderRightColor: '#e2e8f0' }]}>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Current Account CPA:</Text>
                <Text style={styles.reallocValue}>{formatCurrency(reallocation.currentCPA, currencySymbol)}</Text>
              </View>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Target Marginal CPA:</Text>
                <Text style={styles.reallocValue}>{formatCurrency(reallocation.marginalCPA, currencySymbol)}</Text>
              </View>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Projected Account CPA:</Text>
                <Text style={[styles.reallocValue, { color: accentColor }]}>
                  {formatCurrency(reallocation.projectedCPA, currencySymbol)}
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
                <Text style={[styles.reallocValue, { color: '#4f46e5' }]}>
                  {Math.round(reallocation.projectedROAS * 10) / 10}x
                </Text>
              </View>
              <View style={styles.reallocRow}>
                <Text style={styles.reallocLabel}>Projected ROAS Lift:</Text>
                <Text style={[styles.reallocValue, { color: '#4f46e5' }]}>
                  +{Math.round(reallocation.roasLiftPercent * 10) / 10}%
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Top Bleeding Waste Queries */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Negative Exclusion Targets by Waste</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Search Term Query</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>Match Type</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Clicks</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1.4, textAlign: 'right' }]}>Marginal Waste</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1.2, textAlign: 'center' }]}>Safety</Text>
            </View>

            {topList.map((kw, idx) => (
              <View
                key={kw.sha256Hash || kw.id || idx}
                style={[styles.tableRow, idx % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd]}
              >
                <Text style={[styles.tableCellMono, { flex: 3 }]}>
                  {kw.keyword}
                </Text>
                <Text style={[styles.tableCell, { flex: 1.2, textTransform: 'uppercase' }]}>
                  {kw.matchType}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>
                  {(kw.clicks || 0).toLocaleString()}
                </Text>
                <Text style={[styles.tableCell, { flex: 1.4, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                  {formatCurrency(kw.marginalWaste || 0, currencySymbol)}
                </Text>
                <Text
                  style={[
                    styles.tableCell,
                    {
                      flex: 1.2,
                      textAlign: 'center',
                      fontFamily: 'Helvetica-Bold',
                      color: kw.hasCollision ? '#db2777' : '#10b981',
                    },
                  ]}
                >
                  {kw.hasCollision ? 'Collision Guard' : 'Safe'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Custom Strategic Notes */}
        {notes && (
          <View style={[styles.notesBox, { borderLeftColor: accentColor }]}>
            <Text style={[styles.cardLabel, { marginBottom: 3 }]}>Executive Notes & Strategic Next Steps</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generated securely via Sieve Client-Side Vector Engine • Zero Server Transmission
          </Text>
          <Text style={styles.footerText}>Page 1 of 1</Text>
        </View>
      </Page>
    </Document>
  );
};
