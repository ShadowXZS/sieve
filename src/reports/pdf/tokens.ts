/**
 * Executive PDF Design Tokens & Typography Scale
 *
 * Implements Adam Wathan & Steve Schoger (Refactoring UI) design tokens:
 * - Institutional Dark Navy/Slate palette
 * - Semantic indicators: Rose (Waste), Emerald (Safe), Amber (Risk), Indigo (Reallocation)
 * - Exact 14mm page margins (39.69pt)
 * - Typographic discipline: bounded font sizes, strict line-height multipliers
 */

export const CERTIFIED_PDF_FONT = 'DejaVuSans';

/** Exact 14mm margin in PDF points (14mm * 72 / 25.4) */
export const PDF_PAGE_MARGIN = 39.69;

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
    textSecondary: '#64748b',
    textMuted: '#94a3b8',
    border: '#e2e8f0',
    bg: '#f8fafc',
    tableHeaderBg: '#f1f5f9',
    white: '#ffffff',
    dark: '#09090b',
    darkSlate: '#0f172a',
    slate600: '#475569',
    slate700: '#334155',
    zinc200: '#e4e4e7',
    pink600: '#db2777',
  },
} as const;

export const PDF_TYPOGRAPHY = {
  leading: {
    tight: 1.15,
    normal: 1.25,
    relaxed: 1.35,
  },
  fontSize: {
    docTitle: 18,
    docTitleDeck: 16,
    sectionTitle: 12,
    cardBigNumber: 15,
    cardBigNumberMedium: 13,
    cardBigNumberCompact: 11,
    tableBody: 8.5,
    tableHeader: 8,
    cardSub: 7.5,
    cardLabel: 7.5,
    caption: 7,
    badge: 6.5,
    footer: 6.5,
  },
} as const;
