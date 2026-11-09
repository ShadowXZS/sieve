/**
 * Vector PDF Table Layout Components (Phase 12 Overhaul)
 *
 * Implements Adam Wathan & Steve Schoger table specifications:
 * - Strict percentage column widths summing to 100%
 * - Explicit cell padding (min 6pt vertical, 8pt horizontal)
 * - Subtle alternate row shading and crisp #e2e8f0 border strokes
 */

import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { executivePdfStyles as styles, EXECUTIVE_COLOR_TOKENS } from '../styles.ts';
import type { PersistedNegativeKeyword } from '../../../workers/protocol.ts';
import { formatCurrency, type SupportedCurrency } from '../../../utils/currency.ts';

export interface TopExclusionsTableProps {
  keywords: PersistedNegativeKeyword[];
  currency: SupportedCurrency;
  limit?: number;
  showConfidence?: boolean;
}

export const TopExclusionsTable: React.FC<TopExclusionsTableProps> = ({
  keywords,
  currency,
  limit = 6,
  showConfidence = false,
}) => {
  const displayList = keywords.slice(0, limit);

  return (
    <View style={styles.table}>
      {/* Table Header: 34% + 14% + 16% + 20% + 16% = 100% */}
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, { width: '34%' }]}>Search Term Query</Text>
        <Text style={[styles.tableHeaderCell, { width: '14%' }]}>Match Type</Text>
        <Text style={[styles.tableHeaderCell, { width: '16%', textAlign: 'right' }]}>Clicks</Text>
        <Text style={[styles.tableHeaderCell, { width: '20%', textAlign: 'right' }]}>Marginal Waste</Text>
        <Text style={[styles.tableHeaderCell, { width: '16%', textAlign: 'center' }]}>
          {showConfidence ? 'Confidence' : 'Safety'}
        </Text>
      </View>

      {displayList.map((kw, idx) => {
        const isEven = idx % 2 === 0;
        return (
          <View
            key={kw.sha256Hash || kw.id || idx}
            style={[styles.tableRow, isEven ? styles.tableRowEven : styles.tableRowOdd]}
          >
            <Text style={[styles.tableCellBold, { width: '34%' }]}>
              {kw.keyword}
            </Text>
            <Text style={[styles.tableCell, { width: '14%', textTransform: 'uppercase' }]}>
              {kw.matchType}
            </Text>
            <Text style={[styles.tableCell, { width: '16%', textAlign: 'right' }]}>
              {(kw.clicks || 0).toLocaleString()}
            </Text>
            <Text
              style={[
                styles.tableCellBold,
                { width: '20%', textAlign: 'right', color: EXECUTIVE_COLOR_TOKENS.wasteBleed.primary },
              ]}
            >
              {formatCurrency(kw.marginalWaste || 0, currency)}
            </Text>
            <Text
              style={[
                styles.tableCellBold,
                {
                  width: '16%',
                  textAlign: 'center',
                  color: showConfidence
                    ? EXECUTIVE_COLOR_TOKENS.neutral.slate700
                    : kw.hasCollision
                    ? EXECUTIVE_COLOR_TOKENS.neutral.pink600
                    : EXECUTIVE_COLOR_TOKENS.safeList.primary,
                },
              ]}
            >
              {showConfidence
                ? `${Math.round((kw.confidenceScore || 0) * 100)}%`
                : kw.hasCollision
                ? 'Locked Exact'
                : 'Safe'}
            </Text>
          </View>
        );
      })}
    </View>
  );
};
