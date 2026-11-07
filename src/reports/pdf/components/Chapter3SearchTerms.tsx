/**
 * Forensic Deck Chapter 3: Search Term Diagnostics, Bid Elasticity & Dilution
 */

import React from 'react';
import { Page, View, Text } from '@react-pdf/renderer';
import { executivePdfStyles as styles, EXECUTIVE_COLOR_TOKENS } from '../styles.ts';
import type {
  PersistedNegativeKeyword,
  FragmentedLongTailResult,
  MatchTypeDilutionResult,
} from '../../../workers/protocol.ts';
import type { ExecutiveAnalytics } from '../../../utils/executiveAnalytics.ts';
import { formatCurrency, type SupportedCurrency } from '../../../utils/currency.ts';
import { TopExclusionsTable } from './TableComponents.tsx';
import { PdfFooter } from './PdfFooter.tsx';

export interface Chapter3Props {
  keywords: PersistedNegativeKeyword[];
  analytics: ExecutiveAnalytics;
  currency: SupportedCurrency;
  longTail: FragmentedLongTailResult;
  dilution: MatchTypeDilutionResult;
}

export const Chapter3SearchTerms: React.FC<Chapter3Props> = ({
  keywords,
  analytics,
  currency,
  longTail,
  dilution,
}) => {
  return (
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

      <View style={[styles.calloutBox, { borderLeftWidth: 3, borderLeftColor: EXECUTIVE_COLOR_TOKENS.highRisk.border }]}>
        <Text style={[styles.cardLabel, { color: EXECUTIVE_COLOR_TOKENS.highRisk.text }]}>Bid Elasticity Diagnostics</Text>
        <Text style={[styles.calloutText, { marginTop: 3 }]}>
          • Optimal Bid Ceiling: {analytics.exploratoryRisk.formattedOptimalBidCeiling} (Zone: {analytics.exploratoryRisk.elasticityZone.toUpperCase()})
        </Text>
        <Text style={[styles.calloutText, { marginTop: 2 }]}>
          • Converting Median CPC: {analytics.exploratoryRisk.formattedConvertingMedianCPC} vs Non-Converting Median CPC: {analytics.exploratoryRisk.formattedNonConvertingMedianCPC}
        </Text>
        <Text style={[styles.calloutText, { marginTop: 2 }]}>
          • Boundary Spread Delta (Δ): {analytics.exploratoryRisk.formattedBoundaryDelta} across {analytics.exploratoryRisk.highRiskClicks.toLocaleString()} exploratory clicks.
        </Text>
      </View>

      <View style={[styles.calloutBox, { borderLeftWidth: 3, borderLeftColor: EXECUTIVE_COLOR_TOKENS.reallocation.border }]}>
        <Text style={[styles.cardLabel, { color: EXECUTIVE_COLOR_TOKENS.reallocation.text }]}>Match-Type Dilution & Fragmented Long-Tail</Text>
        <Text style={[styles.calloutText, { marginTop: 3 }]}>
          • Match-Type Dilution Index: {Math.round(dilution.dilution_index * 100)}% (Budget Lost: {formatCurrency(dilution.budget_lost, currency)} across {dilution.diluted_queries_count} diluted queries).
        </Text>
        <Text style={[styles.calloutText, { marginTop: 2 }]}>
          • Fragmented Long-Tail Aggregator: {longTail.identified_root_tokens_count} root tokens causing {formatCurrency(longTail.total_long_tail_waste, currency)} collective waste across {longTail.total_long_tail_queries} queries (≤ 2 clicks).
        </Text>
      </View>

      <TopExclusionsTable
        keywords={keywords}
        currency={currency}
        limit={8}
        showConfidence={true}
      />

      <PdfFooter pageText="3 / 4" isDeck />
    </Page>
  );
};
