/**
 * Executive PDF Vector Report Styles & Semantic Color Tokens (Phase 12)
 *
 * Implements shared typography, responsive layout metrics, and color tokens
 * matching the live Executive Analytics Dashboard and Tailwind zinc/semantic tiers:
 * 1. Waste Bleed (Rose / Red)
 * 2. Safe-List Protected (Emerald / Green)
 * 3. High-Risk Clicks & Bid Elasticity (Amber / Orange)
 * 4. Reallocation Yield (Indigo / Slate)
 *
 * Font Invariants:
 * - Certified offline font: 'DejaVuSans' (UTF-8 multi-currency certified)
 * - Zero external network font requests
 */

import { StyleSheet } from '@react-pdf/renderer';

export const CERTIFIED_PDF_FONT = 'DejaVuSans';

export const EXECUTIVE_COLOR_TOKENS = {
  wasteBleed: {
    primary: '#e11d48',
    dark: '#9f1239',
    border: '#f43f5e',
    bg: '#fff1f2',
    badgeBg: '#fecdd3',
    text: '#be123c',
  },
  safeList: {
    primary: '#059669',
    dark: '#065f46',
    border: '#10b981',
    bg: '#ecfdf5',
    badgeBg: '#a7f3d0',
    text: '#047857',
  },
  highRisk: {
    primary: '#d97706',
    dark: '#92400e',
    border: '#f59e0b',
    bg: '#fffbeb',
    badgeBg: '#fde68a',
    text: '#b45309',
  },
  reallocation: {
    primary: '#4f46e5',
    dark: '#3730a3',
    border: '#6366f1',
    bg: '#eef2ff',
    badgeBg: '#c7d2fe',
    text: '#4338ca',
  },
  neutral: {
    text: '#27272a',
    textSecondary: '#71717a',
    textMuted: '#94a3b8',
    border: '#e2e8f0',
    bg: '#f8fafc',
    white: '#ffffff',
    dark: '#09090b',
  },
} as const;

export const executivePdfStyles = StyleSheet.create({
  page: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontSize: 8.5,
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 32,
    color: EXECUTIVE_COLOR_TOKENS.neutral.text,
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.white,
  },
  deckPage: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontSize: 8.5,
    paddingTop: 32,
    paddingBottom: 36,
    paddingHorizontal: 36,
    color: EXECUTIVE_COLOR_TOKENS.neutral.text,
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: '#e4e4e7',
    paddingBottom: 12,
    marginBottom: 14,
  },
  headerDeck: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#e4e4e7',
    paddingBottom: 10,
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    fontSize: 17,
    color: EXECUTIVE_COLOR_TOKENS.neutral.dark,
    letterSpacing: -0.3,
  },
  headerTitleDeck: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    fontSize: 15,
    color: EXECUTIVE_COLOR_TOKENS.neutral.dark,
  },
  headerSubtitle: {
    fontSize: 8.5,
    color: EXECUTIVE_COLOR_TOKENS.neutral.textSecondary,
    marginTop: 3,
  },
  headerCategory: {
    fontSize: 7.5,
    color: EXECUTIVE_COLOR_TOKENS.neutral.textSecondary,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  pageNumber: {
    fontSize: 7.5,
    color: EXECUTIVE_COLOR_TOKENS.neutral.textMuted,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
  },
  chapterBanner: {
    padding: 10,
    borderRadius: 6,
    marginBottom: 14,
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.bg,
    borderLeftWidth: 4,
  },
  chapterTitle: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    fontSize: 12,
    color: EXECUTIVE_COLOR_TOKENS.neutral.dark,
    marginBottom: 2,
  },
  chapterSubtitle: {
    fontSize: 8,
    color: '#475569',
    lineHeight: 1.3,
  },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontSize: 7.5,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    color: EXECUTIVE_COLOR_TOKENS.neutral.white,
    textTransform: 'uppercase',
  },
  dateText: {
    fontSize: 7.5,
    color: EXECUTIVE_COLOR_TOKENS.neutral.textSecondary,
    marginTop: 4,
    textAlign: 'right',
  },
  gridCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 6,
  },
  card: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'column',
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.bg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: EXECUTIVE_COLOR_TOKENS.neutral.border,
  },
  kpiCard: {
    flex: 1,
    marginHorizontal: 3,
    padding: 7,
    borderRadius: 4,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  kpiTitle: {
    fontSize: 7.5,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    letterSpacing: 0.2,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 12.5,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'heavy',
    marginBottom: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: 6.5,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  pillBadge: {
    paddingHorizontal: 3.5,
    paddingVertical: 1,
    borderRadius: 3,
    fontSize: 6,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
  },
  cardValue: {
    fontSize: 12.5,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    marginTop: 2,
    marginBottom: 2,
    lineHeight: 1.2,
  },
  cardSub: {
    fontSize: 6.5,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
  },
  cardCaption: {
    fontSize: 6,
    color: '#64748b',
    marginTop: 1.5,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    fontSize: 10,
    color: EXECUTIVE_COLOR_TOKENS.neutral.dark,
    marginBottom: 6,
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
    backgroundColor: '#f1f5f9',
    paddingVertical: 4.5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: EXECUTIVE_COLOR_TOKENS.neutral.border,
  },
  tableHeaderCell: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    fontSize: 7,
    color: '#475569',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tableRowEven: {
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.white,
  },
  tableRowOdd: {
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.bg,
  },
  tableCell: {
    fontSize: 7.5,
    color: '#334155',
  },
  tableCellBold: {
    fontSize: 7.5,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  reallocBox: {
    flexDirection: 'row',
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.bg,
    borderWidth: 1,
    borderColor: EXECUTIVE_COLOR_TOKENS.neutral.border,
    borderRadius: 6,
    padding: 8,
    marginBottom: 14,
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
    color: '#64748b',
  },
  reallocValue: {
    fontSize: 7.5,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  calloutBox: {
    padding: 8,
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.bg,
    borderWidth: 1,
    borderColor: EXECUTIVE_COLOR_TOKENS.neutral.border,
    borderRadius: 6,
    marginBottom: 12,
  },
  calloutText: {
    fontSize: 7.5,
    color: '#334155',
    lineHeight: 1.35,
  },
  notesBox: {
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.bg,
    borderLeftWidth: 3,
    padding: 7,
    borderRadius: 4,
    marginBottom: 12,
  },
  notesText: {
    fontSize: 7.5,
    color: '#334155',
    lineHeight: 1.35,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e4e4e7',
    paddingTop: 6,
  },
  footerDeck: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e4e4e7',
    paddingTop: 6,
  },
  footerText: {
    fontSize: 6.5,
    color: EXECUTIVE_COLOR_TOKENS.neutral.textMuted,
  },
});

