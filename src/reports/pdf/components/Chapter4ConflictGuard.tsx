/**
 * Forensic Deck Chapter 4: Conflict Guard & Safe-List Execution Protocol
 */

import React from 'react';
import { Page, View, Text } from '@react-pdf/renderer';
import { executivePdfStyles as styles, EXECUTIVE_COLOR_TOKENS } from '../styles.ts';
import type { PersistedNegativeKeyword } from '../../../workers/protocol.ts';
import { SafeListConflictsTable } from './DeckTables.tsx';
import { PdfFooter } from './PdfFooter.tsx';

export interface Chapter4Props {
  collisions: PersistedNegativeKeyword[];
}

export const Chapter4ConflictGuard: React.FC<Chapter4Props> = ({ collisions }) => {
  return (
    <Page size="A4" style={styles.deckPage}>
      <View style={styles.headerDeck}>
        <View>
          <Text style={styles.headerCategory}>Forensic Diagnostic Series • Chapter 4</Text>
          <Text style={styles.headerTitleDeck}>Conflict Guard & Safety Protocol</Text>
        </View>
        <Text style={styles.pageNumber}>Page 4 / 4</Text>
      </View>

      <View style={[styles.chapterBanner, { borderLeftColor: EXECUTIVE_COLOR_TOKENS.neutral.pink600 }]}>
        <Text style={styles.chapterTitle}>Safe-List Protection & Execution Roadmap</Text>
        <Text style={styles.chapterSubtitle}>
          Verification that negative keyword exclusion rules do not block active converting queries or brand terms.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Protected Safe-List Conflicts ({collisions.length} Identified)</Text>
        {collisions.length > 0 ? (
          <SafeListConflictsTable collisions={collisions} />
        ) : (
          <View style={styles.calloutBox}>
            <Text style={[styles.calloutText, { color: EXECUTIVE_COLOR_TOKENS.safeList.primary, fontWeight: 'bold' }]}>
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
          <Text style={[styles.calloutText, { marginTop: 3 }]}>
            2. Validate Exact match lock criteria to maintain safe-list integrity across broad keywords.
          </Text>
          <Text style={[styles.calloutText, { marginTop: 3 }]}>
            3. Monitor marginal CPA shifts over a 14-day evaluation window post-implementation.
          </Text>
        </View>
      </View>

      <PdfFooter pageText="4 / 4" isDeck />
    </Page>
  );
};
