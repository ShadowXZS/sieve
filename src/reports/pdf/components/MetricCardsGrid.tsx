/**
 * Top 4 KPI Metric Cards Grid for Vector PDF Reports (Phase 12 Overhaul)
 *
 * Implements Adam Wathan & Steve Schoger (Refactoring UI) card patterns:
 * - Dynamic font-size scaling: 15pt bold for standard numbers, scaled down for 12+ chars
 * - Isolated title and badge containers preventing text truncation (e.g. "REALLOCATION YIELD")
 * - Tabular numerals, 4pt rounded borders, subtle background tinting
 */

import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { executivePdfStyles as styles, EXECUTIVE_COLOR_TOKENS } from '../styles.ts';
import type { ExecutiveAnalytics } from '../../../utils/executiveAnalytics.ts';
import type { ReallocationModel } from '../../reallocation.ts';
import { formatConversionCount } from '../../../components/pdf/ExecutiveReportPdf.tsx';

export interface MetricCardsGridProps {
  analytics: ExecutiveAnalytics;
  reallocation: ReallocationModel;
  wastePercentage: number;
}

/** Determines dynamic typography styling for primary card big numbers */
export function getBigNumberStyle(formattedValue: string) {
  const len = formattedValue.length;
  if (len > 14) return styles.cardBigNumberCompact; // 11pt
  if (len > 12) return styles.cardBigNumberMedium;  // 13pt
  return styles.cardBigNumber; // 15pt
}

export const MetricCardsGrid: React.FC<MetricCardsGridProps> = ({
  analytics,
  reallocation,
  wastePercentage,
}) => {
  return (
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
          <View style={styles.cardTitleBox}>
            <Text style={[styles.cardLabel, { color: EXECUTIVE_COLOR_TOKENS.wasteBleed.text }]}>
              Identified Waste
            </Text>
          </View>
          <View style={[styles.pillBadge, { backgroundColor: EXECUTIVE_COLOR_TOKENS.wasteBleed.badgeBg }]}>
            <Text style={{ color: EXECUTIVE_COLOR_TOKENS.wasteBleed.text }}>
              {wastePercentage.toFixed(1)}%
            </Text>
          </View>
        </View>
        <Text
          style={[
            styles.cardValue,
            getBigNumberStyle(analytics.wasteBleed.formatted),
            { color: EXECUTIVE_COLOR_TOKENS.wasteBleed.dark },
          ]}
        >
          {analytics.wasteBleed.formatted}
        </Text>
        <Text style={[styles.cardSub, { color: EXECUTIVE_COLOR_TOKENS.wasteBleed.primary }]}>
          CPA Drag: +{analytics.wasteBleed.formattedCpaDrag}
        </Text>
        <Text style={styles.cardCaption}>
          {analytics.wasteBleed.candidateCount.toLocaleString()} non-converting tokens
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
          <View style={styles.cardTitleBox}>
            <Text style={[styles.cardLabel, { color: EXECUTIVE_COLOR_TOKENS.safeList.text }]}>
              Safe-List Protected
            </Text>
          </View>
          <View style={[styles.pillBadge, { backgroundColor: EXECUTIVE_COLOR_TOKENS.safeList.badgeBg }]}>
            <Text style={{ color: EXECUTIVE_COLOR_TOKENS.safeList.dark }}>Secured</Text>
          </View>
        </View>
        <Text
          style={[
            styles.cardValue,
            getBigNumberStyle(`${analytics.safeListProtection.protectedConversions.toLocaleString()} Conv.`),
            { color: EXECUTIVE_COLOR_TOKENS.safeList.dark },
          ]}
        >
          {analytics.safeListProtection.protectedConversions.toLocaleString()} Conv.
        </Text>
        <Text style={[styles.cardSub, { color: EXECUTIVE_COLOR_TOKENS.safeList.primary }]}>
          Secured: {analytics.safeListProtection.formattedSecuredRevenue}
        </Text>
        <Text style={styles.cardCaption}>
          {analytics.safeListProtection.exactLockedCount} exact locks shielding conversions
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
          <View style={styles.cardTitleBox}>
            <Text style={[styles.cardLabel, { color: EXECUTIVE_COLOR_TOKENS.highRisk.text }]}>
              High-Risk Clicks
            </Text>
          </View>
          <View style={[styles.pillBadge, { backgroundColor: EXECUTIVE_COLOR_TOKENS.highRisk.badgeBg }]}>
            <Text style={{ color: EXECUTIVE_COLOR_TOKENS.highRisk.dark }}>Elasticity</Text>
          </View>
        </View>
        <Text
          style={[
            styles.cardValue,
            getBigNumberStyle(`${analytics.exploratoryRisk.highRiskClicks.toLocaleString()} Clicks`),
            { color: EXECUTIVE_COLOR_TOKENS.highRisk.dark },
          ]}
        >
          {analytics.exploratoryRisk.highRiskClicks.toLocaleString()} Clicks
        </Text>
        <Text style={[styles.cardSub, { color: EXECUTIVE_COLOR_TOKENS.highRisk.primary }]}>
          Ceiling: {analytics.exploratoryRisk.formattedOptimalBidCeiling}
        </Text>
        <Text style={styles.cardCaption}>
          Δ: {analytics.exploratoryRisk.formattedBoundaryDelta} boundary spread
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
          <View style={styles.cardTitleBox}>
            <Text style={[styles.cardLabel, { color: EXECUTIVE_COLOR_TOKENS.reallocation.text }]}>
              REALLOCATION YIELD
            </Text>
          </View>
          <View style={[styles.pillBadge, { backgroundColor: EXECUTIVE_COLOR_TOKENS.reallocation.badgeBg }]}>
            <Text style={{ color: EXECUTIVE_COLOR_TOKENS.reallocation.dark }}>Efficiency</Text>
          </View>
        </View>
        <Text
          style={[
            styles.cardValue,
            getBigNumberStyle(`+${formatConversionCount(analytics.reallocationYield.incrementalConversions)} Conv.`),
            { color: EXECUTIVE_COLOR_TOKENS.reallocation.dark },
          ]}
        >
          +{formatConversionCount(analytics.reallocationYield.incrementalConversions)} Conv.
        </Text>
        <Text style={[styles.cardSub, { color: EXECUTIVE_COLOR_TOKENS.reallocation.primary }]}>
          Annual: {analytics.reallocationYield.formattedAnnualizedRecovery}
        </Text>
        <Text style={styles.cardCaption}>
          +{analytics.reallocationYield.roasLiftPercent}% ROAS Lift ({Math.round(reallocation.efficiencyMultiplier * 100) / 100}x)
        </Text>
      </View>
    </View>
  );
};
