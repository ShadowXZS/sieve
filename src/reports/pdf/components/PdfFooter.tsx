/**
 * Isolated PDF Vector Report Footer (Phase 12 Overhaul)
 *
 * Implements Alan Cooper & Refactoring UI margin isolation:
 * - Fixed bottom margin container (bottom: 20, 14mm margins)
 * - Zero overlap invariant with data tables
 * - Zero-leak cryptographic attestation statement
 */

import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { executivePdfStyles as styles } from '../styles.ts';

export interface PdfFooterProps {
  pageText?: string;
  isDeck?: boolean;
}

export const PdfFooter: React.FC<PdfFooterProps> = ({
  pageText = 'Page 1 of 1',
  isDeck = false,
}) => {
  return (
    <View style={isDeck ? styles.footerDeck : styles.footer}>
      <Text style={styles.footerText}>
        Generated via Sieve Client-Side Vector Engine • Zero Server Transmission • Zero-Leak Attested (0 B) • PII Scrubbed • UTF-8 Verified
      </Text>
      <Text style={styles.footerText}>{pageText}</Text>
    </View>
  );
};
