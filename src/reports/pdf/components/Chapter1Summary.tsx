/**
 * Forensic Deck Chapter 1: Executive Summary & Performance Matrix
 */

import React from 'react';
import { Page, View, Text } from '@react-pdf/renderer';
import { executivePdfStyles as styles } from '../styles.ts';
import type { KPISummary } from '../../../state/useSieveStore.ts';
import type { ReallocationModel } from '../../reallocation.ts';
import type { ExecutiveAnalytics } from '../../../utils/executiveAnalytics.ts';
import { MetricCardsGrid } from './MetricCardsGrid.tsx';
import { PdfFooter } from './PdfFooter.tsx';

export interface Chapter1Props {
  organizationTitle: string;
  accentColor: string;
  notes?: string;
  kpi: KPISummary;
  reallocation: ReallocationModel;
  analytics: ExecutiveAnalytics;
  wastePercentage: number;
}

export const Chapter1Summary: React.FC<Chapter1Props> = ({
  organizationTitle,
  accentColor,
  notes,
  kpi,
  reallocation,
  analytics,
  wastePercentage,
}) => {
  return (
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
          High-precision negative keyword synthesis identifying non-converting search queries,
          preventing margin drag, and synchronizing with live Executive Dashboard performance tiers.
        </Text>
      </View>

      <MetricCardsGrid
        analytics={analytics}
        reallocation={reallocation}
        wastePercentage={wastePercentage}
      />

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
            • Account Spend Waterfall: {analytics.spendWaterfall.formattedTotalSpend} Total Spend ({analytics.spendWaterfall.securedPct}% Secured, {analytics.spendWaterfall.exploratoryPct}% Exploratory, {analytics.spendWaterfall.wastePct}% Waste Bleed).
          </Text>
        </View>
      </View>

      {notes && (
        <View style={[styles.calloutBox, { borderLeftWidth: 3, borderLeftColor: accentColor }]}>
          <Text style={[styles.cardLabel, { color: '#334155' }]}>Audit Scope & Directives</Text>
          <Text style={[styles.calloutText, { marginTop: 3 }]}>{notes}</Text>
        </View>
      )}

      <PdfFooter pageText="1 / 4" isDeck />
    </Page>
  );
};
