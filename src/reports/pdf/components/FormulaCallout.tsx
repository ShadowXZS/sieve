/**
 * Mathematical Reallocation Formula Callout Box (Phase 12 Overhaul)
 *
 * Implements Adam Wathan & Steve Schoger callout specifications:
 * - 3pt Indigo left accent border (#4f46e5)
 * - Distinct typography for Formula Label, Expression, Substitutions, and Outcome
 * - Zero raw unspaced delimiters ($= forbidden)
 */

import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { executivePdfStyles as styles } from '../styles.ts';
import type { ReallocationModel } from '../../reallocation.ts';
import type { ExecutiveAnalytics } from '../../../utils/executiveAnalytics.ts';
import { formatCurrency, type SupportedCurrency } from '../../../utils/currency.ts';

export interface FormulaCalloutProps {
  reallocation: ReallocationModel;
  analytics: ExecutiveAnalytics;
  currency: SupportedCurrency;
}

export const FormulaCallout: React.FC<FormulaCalloutProps> = ({
  reallocation,
  analytics,
  currency,
}) => {
  const formattedCpa = formatCurrency(reallocation.marginalCPA, currency);
  const incrementalConversions = Math.round(reallocation.incrementalConversions).toLocaleString();

  return (
    <View style={styles.formulaCallout}>
      <View style={styles.formulaHeader}>
        <Text style={styles.formulaTitle}>
          Deterministic Capital Reallocation Model
        </Text>
        <Text style={styles.formulaBadge}>
          Efficiency Formula
        </Text>
      </View>

      <Text style={styles.formulaEquation}>
        Δ Conversions = Recovered Waste / Marginal CPA
      </Text>

      <Text style={styles.formulaSubstitutions}>
        Recovered Waste ({analytics.wasteBleed.formatted}) ÷ Target Marginal CPA ({formattedCpa})
      </Text>

      <Text style={styles.formulaOutcome}>
        = +{incrementalConversions} incremental acquisitions ({analytics.reallocationYield.formattedAnnualizedRecovery} annualized) with zero net budget expansion
      </Text>
    </View>
  );
};
