/**
 * PDF Vector Table & Formula Callout Styles (Phase 12 Overhaul)
 *
 * Implements Adam Wathan & Steve Schoger table and callout specifications:
 * - Table cell padding (minimum 6pt vertical, 8pt horizontal)
 * - Strict percentage allocation layout
 * - Left accent border (3pt Indigo) formula callout blocks
 */

import {
  CERTIFIED_PDF_FONT,
  EXECUTIVE_COLOR_TOKENS,
  PDF_TYPOGRAPHY,
} from './tokens.ts';

export const tableAndCalloutStyles = {
  section: {
    marginBottom: 11,
  },
  sectionTitle: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    fontSize: PDF_TYPOGRAPHY.fontSize.sectionTitle,
    color: EXECUTIVE_COLOR_TOKENS.neutral.darkSlate,
    marginBottom: 5,
    letterSpacing: -0.2,
  },
  table: {
    borderWidth: 1,
    borderColor: EXECUTIVE_COLOR_TOKENS.neutral.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.tableHeaderBg,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: EXECUTIVE_COLOR_TOKENS.neutral.border,
  },
  tableHeaderCell: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    fontSize: PDF_TYPOGRAPHY.fontSize.tableHeader,
    color: EXECUTIVE_COLOR_TOKENS.neutral.slate600,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: EXECUTIVE_COLOR_TOKENS.neutral.border,
  },
  tableRowEven: {
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.white,
  },
  tableRowOdd: {
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.bg,
  },
  tableCell: {
    fontSize: PDF_TYPOGRAPHY.fontSize.tableBody,
    color: EXECUTIVE_COLOR_TOKENS.neutral.slate700,
  },
  tableCellBold: {
    fontSize: PDF_TYPOGRAPHY.fontSize.tableBody,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    color: EXECUTIVE_COLOR_TOKENS.neutral.darkSlate,
  },
  formulaCallout: {
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.bg,
    borderWidth: 1,
    borderColor: EXECUTIVE_COLOR_TOKENS.neutral.border,
    borderLeftWidth: 3,
    borderLeftColor: EXECUTIVE_COLOR_TOKENS.reallocation.primary,
    borderRadius: 4,
    padding: 8,
    marginBottom: 11,
  },
  formulaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  formulaTitle: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    fontSize: 8.5,
    color: EXECUTIVE_COLOR_TOKENS.neutral.darkSlate,
  },
  formulaBadge: {
    fontSize: 6.5,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    color: EXECUTIVE_COLOR_TOKENS.reallocation.primary,
    backgroundColor: EXECUTIVE_COLOR_TOKENS.reallocation.badgeBg,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    textTransform: 'uppercase',
  },
  formulaEquation: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    fontSize: 8,
    color: EXECUTIVE_COLOR_TOKENS.reallocation.primary,
    marginBottom: 2,
  },
  formulaSubstitutions: {
    fontSize: 7.5,
    color: EXECUTIVE_COLOR_TOKENS.neutral.slate700,
    lineHeight: 1.3,
  },
  formulaOutcome: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    fontSize: 7.5,
    color: EXECUTIVE_COLOR_TOKENS.safeList.primary,
    marginTop: 2,
  },
  reallocBox: {
    flexDirection: 'row',
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.bg,
    borderWidth: 1,
    borderColor: EXECUTIVE_COLOR_TOKENS.neutral.border,
    borderRadius: 4,
    padding: 7,
    marginBottom: 11,
  },
  reallocCol: {
    flex: 1,
    paddingHorizontal: 6,
  },
  reallocRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  reallocLabel: {
    fontSize: 7.5,
    color: EXECUTIVE_COLOR_TOKENS.neutral.textSecondary,
  },
  reallocValue: {
    fontSize: 7.5,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    color: EXECUTIVE_COLOR_TOKENS.neutral.darkSlate,
  },
  calloutBox: {
    padding: 8,
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.bg,
    borderWidth: 1,
    borderColor: EXECUTIVE_COLOR_TOKENS.neutral.border,
    borderRadius: 4,
    marginBottom: 10,
  },
  calloutText: {
    fontSize: 7.5,
    color: EXECUTIVE_COLOR_TOKENS.neutral.slate700,
    lineHeight: 1.35,
  },
  notesBox: {
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.bg,
    borderLeftWidth: 3,
    padding: 7,
    borderRadius: 4,
    marginBottom: 10,
  },
  notesText: {
    fontSize: 7.5,
    color: EXECUTIVE_COLOR_TOKENS.neutral.slate700,
    lineHeight: 1.35,
  },
} as const;
