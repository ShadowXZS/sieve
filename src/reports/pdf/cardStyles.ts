/**
 * PDF Vector Metric Card Styles (Phase 12 Overhaul)
 *
 * Implements Adam Wathan & Steve Schoger metric card patterns:
 * - Isolated title and badge containers preventing text truncation
 * - Multi-tier typography: 15pt bold primary number with dynamic downscaling
 * - Tabular numerals and semantic subtitle indicators
 */

import {
  CERTIFIED_PDF_FONT,
  EXECUTIVE_COLOR_TOKENS,
  PDF_TYPOGRAPHY,
} from './tokens.ts';

export const cardStyles = {
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
    borderRadius: 4,
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
    fontWeight: 'bold',
    marginBottom: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  cardTitleBox: {
    flex: 1,
    marginRight: 4,
  },
  cardLabel: {
    fontSize: PDF_TYPOGRAPHY.fontSize.cardLabel,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },
  pillBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 3,
    fontSize: PDF_TYPOGRAPHY.fontSize.badge,
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
  cardBigNumber: {
    fontSize: PDF_TYPOGRAPHY.fontSize.cardBigNumber,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    marginTop: 2,
    marginBottom: 2,
    lineHeight: 1.2,
  },
  cardBigNumberMedium: {
    fontSize: PDF_TYPOGRAPHY.fontSize.cardBigNumberMedium,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    marginTop: 2,
    marginBottom: 2,
    lineHeight: 1.2,
  },
  cardBigNumberCompact: {
    fontSize: PDF_TYPOGRAPHY.fontSize.cardBigNumberCompact,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    marginTop: 2,
    marginBottom: 2,
    lineHeight: 1.2,
  },
  cardSub: {
    fontSize: PDF_TYPOGRAPHY.fontSize.cardSub,
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    marginTop: 1,
  },
  cardCaption: {
    fontSize: PDF_TYPOGRAPHY.fontSize.caption,
    color: '#64748b',
    marginTop: 1.5,
    lineHeight: 1.25,
  },
} as const;
