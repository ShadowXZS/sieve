/**
 * Sieve Multi-Currency & Locale Formatter (Phase 9)
 *
 * Architectural Guarantees:
 * 1. Strictly supported currencies: '$', '₹' (INR), '€' (EUR), '¥' (JPY), '£' (GBP).
 * 2. Zero-decimal rounding for JPY ('¥12,450'), standard 2-decimal formatting for '$', '₹', '€', '£'.
 * 3. Zero performance regressions: pure functional transformations utilizing pre-allocated
 *    static Intl.NumberFormat instances to prevent heap allocations in high-throughput render loops.
 * 4. Mathematical safety: Zero division-by-zero, Zero NaN, Zero Infinity.
 */

import { logger } from './logger.ts';

export type SupportedCurrency = '$' | '₹' | '€' | '¥' | '£';

export const SUPPORTED_CURRENCIES: readonly SupportedCurrency[] = ['$', '₹', '€', '¥', '£'] as const;

export const DEFAULT_CURRENCY: SupportedCurrency = '$';

export interface CurrencyMetadata {
  symbol: SupportedCurrency;
  code: 'USD' | 'INR' | 'EUR' | 'JPY' | 'GBP';
  name: string;
  locale: string;
  decimals: number;
}

export const CURRENCY_METADATA: Record<SupportedCurrency, CurrencyMetadata> = {
  '$': { symbol: '$', code: 'USD', name: 'US Dollar', locale: 'en-US', decimals: 2 },
  '₹': { symbol: '₹', code: 'INR', name: 'Indian Rupee', locale: 'en-IN', decimals: 2 },
  '€': { symbol: '€', code: 'EUR', name: 'Euro', locale: 'en-US', decimals: 2 },
  '¥': { symbol: '¥', code: 'JPY', name: 'Japanese Yen', locale: 'ja-JP', decimals: 0 },
  '£': { symbol: '£', code: 'GBP', name: 'British Pound', locale: 'en-GB', decimals: 2 },
};

/**
 * Pre-allocated Intl.NumberFormat singletons.
 * Guarantees zero heap allocation per format call inside React rendering & virtual scrolling loops.
 */
const STANDARD_FORMATTERS: Record<SupportedCurrency, Intl.NumberFormat> = {
  '$': new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  '₹': new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  '€': new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  '¥': new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  '£': new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

const COMPACT_FORMATTERS: Record<SupportedCurrency, Intl.NumberFormat> = {
  '$': new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  '₹': new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  '€': new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  '¥': new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  '£': new Intl.NumberFormat('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
};

/**
 * Normalizes any currency symbol or code to a strictly supported SupportedCurrency.
 */
export function normalizeCurrencySymbol(symbolOrCode?: string): SupportedCurrency {
  if (!symbolOrCode) return DEFAULT_CURRENCY;
  const trimmed = symbolOrCode.trim();
  if (trimmed === '$' || trimmed.toUpperCase() === 'USD') return '$';
  if (trimmed === '₹' || trimmed.toUpperCase() === 'INR') return '₹';
  if (trimmed === '€' || trimmed.toUpperCase() === 'EUR') return '€';
  if (trimmed === '¥' || trimmed === '￥' || trimmed.toUpperCase() === 'JPY') return '¥';
  if (trimmed === '£' || trimmed.toUpperCase() === 'GBP') return '£';
  return DEFAULT_CURRENCY;
}

/**
 * Standardized currency formatter ensuring:
 * - JPY: strictly zero-decimal rounding (e.g. '¥12,450').
 * - $, ₹, €, £: standard 2-decimal formatting with locale-aware groupings (or 0-decimal if compact).
 * - Total NaN & Infinity protection: non-finite values safely formatted as 0.
 * - Zero dynamic object allocations.
 */
export function formatCurrency(
  amount: number,
  currencySymbol: SupportedCurrency | string = '$',
  compact: boolean = false
): string {
  const safeAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  const symbol = normalizeCurrencySymbol(currencySymbol);

  if (symbol === '¥') {
    // Strictly enforce zero-decimal rounding for JPY
    const rounded = Math.round(safeAmount);
    return `¥${COMPACT_FORMATTERS['¥'].format(rounded)}`;
  }

  const formatter = compact ? COMPACT_FORMATTERS[symbol] : STANDARD_FORMATTERS[symbol];
  return `${symbol}${formatter.format(safeAmount)}`;
}

/**
 * Auto-detects currency symbol from CSV headers, preamble rows, or cell contents.
 * Returns null if no currency can be determined with confidence.
 */
export function detectCurrencyFromData(
  input: string | ArrayBuffer | Uint8Array
): SupportedCurrency | null {
  let text = '';
  if (typeof input === 'string') {
    text = input.slice(0, 32768);
  } else {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const slice = bytes.subarray(0, Math.min(bytes.length, 32768));
    try {
      text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
    } catch (err) {
      logger.debug('Currency data decode notice:', err);
      return null;
    }
  }

  if (!text) return null;

  // 1. Check for Indian Rupee (₹, INR, Rs.)
  if (text.includes('₹') || /\b(INR|Rs\.|Rupees?)\b/i.test(text)) {
    return '₹';
  }

  // 2. Check for Euro (€, EUR, Euro)
  if (text.includes('€') || /\b(EUR|Euros?)\b/i.test(text)) {
    return '€';
  }

  // 3. Check for Japanese Yen (¥, ￥, JPY, Yen)
  if (text.includes('¥') || text.includes('￥') || /\b(JPY|Yen)\b/i.test(text)) {
    return '¥';
  }

  // 4. Check for British Pound (£, GBP, Pound)
  if (text.includes('£') || /\b(GBP|Pounds?)\b/i.test(text)) {
    return '£';
  }

  // 5. Check for US Dollar ($ or USD)
  if (text.includes('$') || /\bUSD\b/i.test(text)) {
    return '$';
  }

  return null;
}

