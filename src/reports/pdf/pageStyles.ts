/**
 * PDF Vector Page & Header Layout Styles (Phase 12 Overhaul)
 *
 * Implements page structure, document headers, chapter banners, and footers:
 * - 14mm margins all around (39.69pt)
 * - Institutional headers with badge indicators
 * - Dedicated footer containers sitting in bottom margin
 */

import {
  CERTIFIED_PDF_FONT,
  EXECUTIVE_COLOR_TOKENS,
  PDF_PAGE_MARGIN,
  PDF_TYPOGRAPHY,
} from './tokens.ts';

export const pageStyles = {
  page: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontSize: PDF_TYPOGRAPHY.fontSize.tableBody,
    paddingTop: PDF_PAGE_MARGIN,
    paddingBottom: PDF_PAGE_MARGIN,
    paddingHorizontal: PDF_PAGE_MARGIN,
    color: EXECUTIVE_COLOR_TOKENS.neutral.text,
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.white,
  },
  deckPage: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontSize: PDF_TYPOGRAPHY.fontSize.tableBody,
    paddingTop: PDF_PAGE_MARGIN,
    paddingBottom: PDF_PAGE_MARGIN,
    paddingHorizontal: PDF_PAGE_MARGIN,
    color: EXECUTIVE_COLOR_TOKENS.neutral.text,
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: EXECUTIVE_COLOR_TOKENS.neutral.zinc200,
    paddingBottom: 10,
    marginBottom: 12,
  },
  headerDeck: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: EXECUTIVE_COLOR_TOKENS.neutral.zinc200,
    paddingBottom: 10,
    marginBottom: 14,
  },
  headerTitle: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    fontSize: PDF_TYPOGRAPHY.fontSize.docTitle,
    color: EXECUTIVE_COLOR_TOKENS.neutral.darkSlate,
    letterSpacing: -0.3,
  },
  headerTitleDeck: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    fontSize: PDF_TYPOGRAPHY.fontSize.docTitleDeck,
    color: EXECUTIVE_COLOR_TOKENS.neutral.darkSlate,
  },
  headerSubtitle: {
    fontSize: 8.5,
    color: EXECUTIVE_COLOR_TOKENS.neutral.textSecondary,
    marginTop: 2,
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
    padding: 9,
    borderRadius: 4,
    marginBottom: 12,
    backgroundColor: EXECUTIVE_COLOR_TOKENS.neutral.bg,
    borderLeftWidth: 3.5,
  },
  chapterTitle: {
    fontFamily: CERTIFIED_PDF_FONT,
    fontWeight: 'bold',
    fontSize: 11.5,
    color: EXECUTIVE_COLOR_TOKENS.neutral.darkSlate,
    marginBottom: 2,
  },
  chapterSubtitle: {
    fontSize: 8,
    color: EXECUTIVE_COLOR_TOKENS.neutral.slate600,
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
  footer: {
    position: 'absolute',
    bottom: 20,
    left: PDF_PAGE_MARGIN,
    right: PDF_PAGE_MARGIN,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: EXECUTIVE_COLOR_TOKENS.neutral.zinc200,
    paddingTop: 6,
  },
  footerDeck: {
    position: 'absolute',
    bottom: 20,
    left: PDF_PAGE_MARGIN,
    right: PDF_PAGE_MARGIN,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: EXECUTIVE_COLOR_TOKENS.neutral.zinc200,
    paddingTop: 6,
  },
  footerText: {
    fontSize: PDF_TYPOGRAPHY.fontSize.footer,
    color: EXECUTIVE_COLOR_TOKENS.neutral.textMuted,
  },
} as const;
