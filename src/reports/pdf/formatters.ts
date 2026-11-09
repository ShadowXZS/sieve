/**
 * PDF Reporting Formatters
 * Pure functions for numerical, currency, and count formatting across PDF reports.
 * Physical line ceiling: <= 250 lines.
 */

/**
 * Rounds conversion counts to integer strings with comma formatting (e.g., 1052243.1 -> "1,052,243").
 */
export function formatConversionCount(val: number): string {
  if (val == null || !Number.isFinite(val)) return '0';
  return Math.round(val).toLocaleString('en-US');
}

export const formatPdfConversions = formatConversionCount;
export const formatConversions = formatConversionCount;
