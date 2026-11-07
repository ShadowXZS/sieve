/**
 * Forensic Deck Chapter 2: Capital Reallocation Model & Waterfall
 */

import React from 'react';
import { Page, View, Text } from '@react-pdf/renderer';
import { executivePdfStyles as styles, EXECUTIVE_COLOR_TOKENS } from '../styles.ts';
import type { ReallocationModel } from '../../reallocation.ts';
import type { ExecutiveAnalytics } from '../../../utils/executiveAnalytics.ts';
import type { SupportedCurrency } from '../../../utils/currency.ts';
import { ReinvestmentTable, SpendWaterfallTable } from './DeckTables.tsx';
import { FormulaCallout } from './FormulaCallout.tsx';
import { PdfFooter } from './PdfFooter.tsx';

export interface Chapter2Props {
  reallocation: ReallocationModel;
  analytics: ExecutiveAnalytics;
  currency: SupportedCurrency;
}

export const Chapter2Reallocation: React.FC<Chapter2Props> = ({
  reallocation,
  analytics,
  currency,
}) => {
  return (
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

      <ReinvestmentTable reallocation={reallocation} currency={currency} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spend Waterfall Allocation Breakdown</Text>
        <SpendWaterfallTable analytics={analytics} />
      </View>

      <FormulaCallout
        reallocation={reallocation}
        analytics={analytics}
        currency={currency}
      />

      <PdfFooter pageText="2 / 4" isDeck />
    </Page>
  );
};
