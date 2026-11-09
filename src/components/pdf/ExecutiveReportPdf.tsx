/**
 * Executive Report PDF Vector Component & Layout Styles (Phase 12 Polish)
 *
 * Implements high-fidelity vector PDF KPI card styles with dynamic flex sizing,
 * calibrated typography invariants, and integer conversion count formatting
 * ensuring no floating-point decimal suffixes (.1, .4).
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { CERTIFIED_PDF_FONT, EXECUTIVE_COLOR_TOKENS } from '../../reports/pdf/styles.ts';
import { registerPdfFonts } from '../../reports/pdf/fonts/index.ts';

// Register offline TrueType fonts
registerPdfFonts();

import {
  formatConversionCount,
  formatPdfConversions,
  formatConversions,
} from '../../reports/pdf/formatters.ts';

export { formatConversionCount, formatPdfConversions, formatConversions };

export const CARD_4_TITLE = 'REALLOCATION YIELD';

export const styles = StyleSheet.create({
  page: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontSize: 8.5,
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 32,
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.white,
  },
  gridCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    marginHorizontal: 3,
    padding: 7,
    borderRadius: 4,
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.bg,
    borderWidth: 1,
    borderColor: EXECUTIVE_COLOR_TOKENS.neutral.border,
  },
  kpiCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  kpiTitle: {
    fontSize: 7.5,
    fontWeight: 'bold',
    letterSpacing: 0.2,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 12.5,
    fontWeight: 'heavy',
    marginBottom: 2,
  },
  kpiSub: {
    fontSize: 7,
    marginBottom: 2,
  },
  kpiCaption: {
    fontSize: 6.5,
    color: EXECUTIVE_COLOR_TOKENS.neutral.textMuted,
  },
});

export interface ExecutiveReportPdfProps {
  organizationTitle?: string;
  wasteBleedFormatted?: string;
  wastePercentage?: number;
  wasteTokenCount?: number;
  cpaDragFormatted?: string;
  protectedConversions?: number;
  securedRevenueFormatted?: string;
  exactLockedCount?: number;
  highRiskClicks?: number;
  optimalBidCeilingFormatted?: string;
  boundaryDeltaFormatted?: string;
  incrementalConversions?: number;
  annualizedRecoveryFormatted?: string;
  roasLiftPercent?: number;
  efficiencyMultiplier?: number;
}

export const ExecutiveReportPdf: React.FC<ExecutiveReportPdfProps> = ({
  organizationTitle = 'Executive PPC Forensic Audit',
  wasteBleedFormatted = '$0',
  wastePercentage = 0,
  wasteTokenCount = 0,
  cpaDragFormatted = '$0.00',
  protectedConversions = 0,
  securedRevenueFormatted = '$0',
  exactLockedCount = 0,
  highRiskClicks = 0,
  optimalBidCeilingFormatted = '$0.00',
  boundaryDeltaFormatted = '$0.00',
  incrementalConversions = 0,
  annualizedRecoveryFormatted = '$0',
  roasLiftPercent = 0,
  efficiencyMultiplier = 1.0,
}) => {
  return (
    <Document title={`${organizationTitle} - Executive Report`} author="Sieve Zero-Server Core">
      <Page size="A4" style={styles.page}>
        <View style={styles.gridCards}>
          {/* Card 1: Waste Bleed */}
          <View
            style={[
              styles.kpiCard,
              {
                borderTopWidth: 2.5,
                borderTopColor: EXECUTIVE_COLOR_TOKENS.wasteBleed.border,
                backgroundColor: EXECUTIVE_COLOR_TOKENS.wasteBleed.bg,
              },
            ]}
          >
            <View style={styles.kpiCardHeader}>
              <Text style={[styles.kpiTitle, { color: EXECUTIVE_COLOR_TOKENS.wasteBleed.text }]}>
                IDENTIFIED WASTE
              </Text>
            </View>
            <Text style={[styles.kpiValue, { color: EXECUTIVE_COLOR_TOKENS.wasteBleed.dark }]}>
              {wasteBleedFormatted}
            </Text>
            <Text style={[styles.kpiSub, { color: EXECUTIVE_COLOR_TOKENS.wasteBleed.primary }]}>
              CPA Drag: +{cpaDragFormatted}
            </Text>
            <Text style={styles.kpiCaption}>
              {formatConversionCount(wasteTokenCount)} non-converting tokens
            </Text>
          </View>

          {/* Card 2: Safe-List Protected */}
          <View
            style={[
              styles.kpiCard,
              {
                borderTopWidth: 2.5,
                borderTopColor: EXECUTIVE_COLOR_TOKENS.safeList.border,
                backgroundColor: EXECUTIVE_COLOR_TOKENS.safeList.bg,
              },
            ]}
          >
            <View style={styles.kpiCardHeader}>
              <Text style={[styles.kpiTitle, { color: EXECUTIVE_COLOR_TOKENS.safeList.text }]}>
                SAFE-LIST PROTECTED
              </Text>
            </View>
            <Text style={[styles.kpiValue, { color: EXECUTIVE_COLOR_TOKENS.safeList.dark }]}>
              {formatConversionCount(protectedConversions)} Conv.
            </Text>
            <Text style={[styles.kpiSub, { color: EXECUTIVE_COLOR_TOKENS.safeList.primary }]}>
              Secured: {securedRevenueFormatted}
            </Text>
            <Text style={styles.kpiCaption}>
              {exactLockedCount} exact locks shielding conversions
            </Text>
          </View>

          {/* Card 3: High-Risk Clicks */}
          <View
            style={[
              styles.kpiCard,
              {
                borderTopWidth: 2.5,
                borderTopColor: EXECUTIVE_COLOR_TOKENS.highRisk.border,
                backgroundColor: EXECUTIVE_COLOR_TOKENS.highRisk.bg,
              },
            ]}
          >
            <View style={styles.kpiCardHeader}>
              <Text style={[styles.kpiTitle, { color: EXECUTIVE_COLOR_TOKENS.highRisk.text }]}>
                HIGH-RISK CLICKS
              </Text>
            </View>
            <Text style={[styles.kpiValue, { color: EXECUTIVE_COLOR_TOKENS.highRisk.dark }]}>
              {formatConversionCount(highRiskClicks)} Clicks
            </Text>
            <Text style={[styles.kpiSub, { color: EXECUTIVE_COLOR_TOKENS.highRisk.primary }]}>
              Ceiling: {optimalBidCeilingFormatted}
            </Text>
            <Text style={styles.kpiCaption}>
              Δ: {boundaryDeltaFormatted} boundary spread
            </Text>
          </View>

          {/* Card 4: Reallocation Yield */}
          <View
            style={[
              styles.kpiCard,
              {
                borderTopWidth: 2.5,
                borderTopColor: EXECUTIVE_COLOR_TOKENS.reallocation.border,
                backgroundColor: EXECUTIVE_COLOR_TOKENS.reallocation.bg,
              },
            ]}
          >
            <View style={styles.kpiCardHeader}>
              <Text style={[styles.kpiTitle, { color: EXECUTIVE_COLOR_TOKENS.reallocation.text }]}>
                {CARD_4_TITLE}
              </Text>
            </View>
            <Text style={[styles.kpiValue, { color: EXECUTIVE_COLOR_TOKENS.reallocation.dark }]}>
              +{formatConversionCount(incrementalConversions)} Conv.
            </Text>
            <Text style={[styles.kpiSub, { color: EXECUTIVE_COLOR_TOKENS.reallocation.primary }]}>
              Annual: {annualizedRecoveryFormatted}
            </Text>
            <Text style={styles.kpiCaption}>
              +{roasLiftPercent}% ROAS Lift ({Math.round(efficiencyMultiplier * 100) / 100}x)
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};

export const AuditPdfPage = ExecutiveReportPdf;
