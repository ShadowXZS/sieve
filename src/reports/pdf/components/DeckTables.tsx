/**
 * Forensic Deck Chapter Diagnostic Tables (Phase 12 Overhaul)
 *
 * Implements strict percentage allocations summing to 100% and 6pt/8pt cell padding:
 * - Spend Waterfall Table (35% + 20% + 15% + 30% = 100%)
 * - Marginal Reinvestment Table (40% + 20% + 20% + 20% = 100%)
 * - Safe-List Conflicts Table (38% + 42% + 20% = 100%)
 */

import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { executivePdfStyles as styles, EXECUTIVE_COLOR_TOKENS } from '../styles.ts';
import type { ReallocationModel } from '../../reallocation.ts';
import type { ExecutiveAnalytics } from '../../../utils/executiveAnalytics.ts';
import type { PersistedNegativeKeyword } from '../../../workers/protocol.ts';
import { formatCurrency, type SupportedCurrency } from '../../../utils/currency.ts';

export const SpendWaterfallTable: React.FC<{
  analytics: ExecutiveAnalytics;
}> = ({ analytics }) => (
  <View style={styles.table}>
    <View style={styles.tableHeader}>
      <Text style={[styles.tableHeaderCell, { width: '35%' }]}>Allocation Tier</Text>
      <Text style={[styles.tableHeaderCell, { width: '20%', textAlign: 'right' }]}>Allocated Spend</Text>
      <Text style={[styles.tableHeaderCell, { width: '15%', textAlign: 'right' }]}>Share (%)</Text>
      <Text style={[styles.tableHeaderCell, { width: '30%' }]}>Semantic Classification</Text>
    </View>

    <View style={styles.tableRow}>
      <Text style={[styles.tableCellBold, { width: '35%', color: EXECUTIVE_COLOR_TOKENS.safeList.primary }]}>
        Secured / Safe-List
      </Text>
      <Text style={[styles.tableCell, { width: '20%', textAlign: 'right' }]}>
        {analytics.spendWaterfall.formattedSecuredSpend}
      </Text>
      <Text style={[styles.tableCellBold, { width: '15%', textAlign: 'right' }]}>
        {analytics.spendWaterfall.securedPct}%
      </Text>
      <Text style={[styles.tableCell, { width: '30%' }]}>Protected converting queries</Text>
    </View>

    <View style={[styles.tableRow, styles.tableRowOdd]}>
      <Text style={[styles.tableCellBold, { width: '35%', color: EXECUTIVE_COLOR_TOKENS.highRisk.primary }]}>
        Exploratory High-Risk
      </Text>
      <Text style={[styles.tableCell, { width: '20%', textAlign: 'right' }]}>
        {analytics.spendWaterfall.formattedExploratorySpend}
      </Text>
      <Text style={[styles.tableCellBold, { width: '15%', textAlign: 'right' }]}>
        {analytics.spendWaterfall.exploratoryPct}%
      </Text>
      <Text style={[styles.tableCell, { width: '30%' }]}>Clicks above optimal bid ceiling</Text>
    </View>

    <View style={styles.tableRow}>
      <Text style={[styles.tableCellBold, { width: '35%', color: EXECUTIVE_COLOR_TOKENS.wasteBleed.primary }]}>
        Identified Waste Bleed
      </Text>
      <Text style={[styles.tableCell, { width: '20%', textAlign: 'right' }]}>
        {analytics.spendWaterfall.formattedWasteSpend}
      </Text>
      <Text style={[styles.tableCellBold, { width: '15%', textAlign: 'right' }]}>
        {analytics.spendWaterfall.wastePct}%
      </Text>
      <Text style={[styles.tableCell, { width: '30%' }]}>Zero-conversion non-profitable drag</Text>
    </View>
  </View>
);

export const ReinvestmentTable: React.FC<{
  reallocation: ReallocationModel;
  currency: SupportedCurrency;
}> = ({ reallocation, currency }) => {
  const cpaDelta = Math.round(
    ((reallocation.currentCPA - reallocation.projectedCPA) / Math.max(1, reallocation.currentCPA)) * 1000
  ) / 10;
  const baselineConversions = Math.round(reallocation.projectedConversions - reallocation.incrementalConversions);

  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, { width: '40%' }]}>Performance Metric</Text>
        <Text style={[styles.tableHeaderCell, { width: '20%', textAlign: 'right' }]}>Baseline</Text>
        <Text style={[styles.tableHeaderCell, { width: '20%', textAlign: 'right' }]}>Projected</Text>
        <Text style={[styles.tableHeaderCell, { width: '20%', textAlign: 'right' }]}>Delta (%)</Text>
      </View>

      <View style={styles.tableRow}>
        <Text style={[styles.tableCellBold, { width: '40%' }]}>Acquisition Cost (CPA)</Text>
        <Text style={[styles.tableCell, { width: '20%', textAlign: 'right' }]}>
          {formatCurrency(reallocation.currentCPA, currency)}
        </Text>
        <Text style={[styles.tableCellBold, { width: '20%', textAlign: 'right', color: EXECUTIVE_COLOR_TOKENS.safeList.primary }]}>
          {formatCurrency(reallocation.projectedCPA, currency)}
        </Text>
        <Text style={[styles.tableCellBold, { width: '20%', textAlign: 'right', color: EXECUTIVE_COLOR_TOKENS.safeList.primary }]}>
          -{cpaDelta}%
        </Text>
      </View>

      <View style={[styles.tableRow, styles.tableRowOdd]}>
        <Text style={[styles.tableCellBold, { width: '40%' }]}>Total Conversions</Text>
        <Text style={[styles.tableCell, { width: '20%', textAlign: 'right' }]}>
          {baselineConversions.toLocaleString()}
        </Text>
        <Text style={[styles.tableCellBold, { width: '20%', textAlign: 'right', color: EXECUTIVE_COLOR_TOKENS.reallocation.primary }]}>
          {Math.round(reallocation.projectedConversions).toLocaleString()}
        </Text>
        <Text style={[styles.tableCellBold, { width: '20%', textAlign: 'right', color: EXECUTIVE_COLOR_TOKENS.reallocation.primary }]}>
          +{Math.round(reallocation.conversionLiftPercent * 10) / 10}%
        </Text>
      </View>

      <View style={styles.tableRow}>
        <Text style={[styles.tableCellBold, { width: '40%' }]}>Return on Ad Spend (ROAS)</Text>
        <Text style={[styles.tableCell, { width: '20%', textAlign: 'right' }]}>
          {Math.round(reallocation.currentROAS * 100) / 100}x
        </Text>
        <Text style={[styles.tableCellBold, { width: '20%', textAlign: 'right', color: EXECUTIVE_COLOR_TOKENS.highRisk.primary }]}>
          {Math.round(reallocation.projectedROAS * 100) / 100}x
        </Text>
        <Text style={[styles.tableCellBold, { width: '20%', textAlign: 'right', color: EXECUTIVE_COLOR_TOKENS.highRisk.primary }]}>
          +{Math.round(reallocation.roasLiftPercent * 10) / 10}%
        </Text>
      </View>
    </View>
  );
};

export const SafeListConflictsTable: React.FC<{
  collisions: PersistedNegativeKeyword[];
}> = ({ collisions }) => (
  <View style={styles.table}>
    <View style={styles.tableHeader}>
      <Text style={[styles.tableHeaderCell, { width: '38%' }]}>Excluded Term</Text>
      <Text style={[styles.tableHeaderCell, { width: '42%' }]}>Converting Collision Shielded</Text>
      <Text style={[styles.tableHeaderCell, { width: '20%', textAlign: 'center' }]}>Action</Text>
    </View>
    {collisions.map((c, i) => (
      <View key={c.sha256Hash || c.id || i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowOdd : styles.tableRowEven]}>
        <Text style={[styles.tableCellBold, { width: '38%' }]}>{c.keyword}</Text>
        <Text style={[styles.tableCell, { width: '42%', color: EXECUTIVE_COLOR_TOKENS.safeList.primary }]}>
          {c.collidingTerm || (c.collidingSafeTerms && c.collidingSafeTerms[0]) || 'Active Converting Query'}
        </Text>
        <Text style={[styles.tableCellBold, { width: '20%', textAlign: 'center', color: '#db2777' }]}>
          Exact Lock
        </Text>
      </View>
    ))}
  </View>
);
