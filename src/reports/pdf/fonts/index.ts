/**
 * PDF Vector Font Registration Engine (Phase 12)
 *
 * Implements client-side font embedding for @react-pdf/renderer:
 * 1. Zero network calls: fonts embedded completely in-memory via data URIs.
 * 2. Complete multi-currency UTF-8 glyph support: $, ₹ (INR), € (EUR), ¥ (JPY), £ (GBP).
 * 3. Full typographic hierarchy: normal (400) and bold (700) weights.
 */

import { Font } from '@react-pdf/renderer';
import { dejavuSansRegularBase64, dejavuSansBoldBase64 } from './dejavuFontData.ts';
import { logger } from '../../../utils/logger.ts';

let isRegistered = false;

/**
 * Registers offline TrueType DejaVuSans fonts with @react-pdf/renderer.
 *
 * Invariants:
 * 1. Zero network calls: loaded directly from embedded memory strings via data: URI.
 * 2. UTF-8 support: Full glyph rendering for multi-currency symbols ($, ₹, €, ¥, £).
 * 3. Idempotent: Registers font families only once per runtime session.
 */
export function registerPdfFonts(): void {
  if (isRegistered) return;

  try {
    // Prevent awkward word hyphens (e.g. "Con- vs") across all vector PDF text
    Font.registerHyphenationCallback((word) => [word]);

    Font.register({
      family: 'DejaVuSans',
      fonts: [
        {
          src: `data:font/truetype;charset=utf-8;base64,${dejavuSansRegularBase64}`,
          fontWeight: 'normal',
        },
        {
          src: `data:font/truetype;charset=utf-8;base64,${dejavuSansBoldBase64}`,
          fontWeight: 'bold',
        },
      ],
    });

    // Also register DejaVuSans-Bold as an explicit family alias for direct references
    Font.register({
      family: 'DejaVuSans-Bold',
      src: `data:font/truetype;charset=utf-8;base64,${dejavuSansBoldBase64}`,
    });

    isRegistered = true;
  } catch (err) {
    // If already registered or in mock test environment, continue safely
    logger.debug('PDF font registration notice:', err);
  }
}

// Auto-register upon module load
registerPdfFonts();

