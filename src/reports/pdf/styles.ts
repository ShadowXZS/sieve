/**
 * Executive PDF Vector Report Styles & Semantic Color Tokens (Phase 12 Overhaul)
 *
 * Implements Adam Wathan & Steve Schoger (Refactoring UI) & Alan Cooper (About Face):
 * - Institutional dark navy / slate palette (#0f172a)
 * - Off-white card surfaces (#f8fafc) and subtle border strokes (#e2e8f0)
 * - 4-column balanced metric grid with isolated headers and badge containers
 * - Strict 14mm margins (39.69pt) and bounded typographic hierarchy
 */

import { StyleSheet } from '@react-pdf/renderer';
import {
  CERTIFIED_PDF_FONT,
  EXECUTIVE_COLOR_TOKENS,
  PDF_PAGE_MARGIN,
  PDF_TYPOGRAPHY,
} from './tokens.ts';
import { pageStyles } from './pageStyles.ts';
import { cardStyles } from './cardStyles.ts';
import { tableAndCalloutStyles } from './tableCalloutStyles.ts';

export {
  CERTIFIED_PDF_FONT,
  EXECUTIVE_COLOR_TOKENS,
  PDF_PAGE_MARGIN,
  PDF_TYPOGRAPHY,
};

export const executivePdfStyles = StyleSheet.create({
  ...pageStyles,
  ...cardStyles,
  ...tableAndCalloutStyles,
});
