/**
 * SIEVE Domain Core: Primitive Branded Types & Micro-Unit Signatures
 *
 * Provides nominal branding to enforce type safety across domain primitives,
 * preventing accidental cross-assignment of semantically distinct strings and numbers.
 * Eliminates IEEE-754 precision drift by establishing integer micro-units for currency.
 */

declare const __currencyMicrosBrand: unique symbol;
declare const __clickCountBrand: unique symbol;
declare const __impressionCountBrand: unique symbol;
declare const __queryStringBrand: unique symbol;
declare const __campaignIdBrand: unique symbol;
declare const __adGroupIdBrand: unique symbol;
declare const __tokenStringBrand: unique symbol;
declare const __conversionCountBrand: unique symbol;

/**
 * Nominal branded currency value represented in integer micro-units
 * (1,000,000 micros = 1.00 standard currency unit).
 * Eliminates IEEE-754 floating-point drift in ad spend and financial accounting.
 */
export type CurrencyMicros = bigint & { readonly __brand: typeof __currencyMicrosBrand };

/**
 * Nominal branded type representing a discrete count of search ad clicks.
 */
export type ClickCount = number & { readonly __brand: typeof __clickCountBrand };

/**
 * Nominal branded type representing a discrete count of ad impressions.
 */
export type ImpressionCount = number & { readonly __brand: typeof __impressionCountBrand };

/**
 * Nominal branded string representing an ad search query (raw or normalized).
 */
export type QueryString = string & { readonly __brand: typeof __queryStringBrand };

/**
 * Nominal branded string representing an advertising campaign identifier.
 */
export type CampaignId = string & { readonly __brand: typeof __campaignIdBrand };

/**
 * Nominal branded string representing an advertising ad group identifier.
 */
export type AdGroupId = string & { readonly __brand: typeof __adGroupIdBrand };

/**
 * Nominal branded string representing an individual parsed token or n-gram component.
 */
export type TokenString = string & { readonly __brand: typeof __tokenStringBrand };

/**
 * Nominal branded number representing conversion counts, supporting fractional attribution.
 */
export type ConversionCount = number & { readonly __brand: typeof __conversionCountBrand };

/**
 * Generic branded type helper for nominal tagging.
 */
declare const __genericBrand: unique symbol;
export type Branded<TValue, TTag extends string> = TValue & {
  readonly [__genericBrand]: TTag;
};

/**
 * Fixed conversion scale constant type representing 1,000,000 micro-units per base currency unit.
 */
export type MicroScale = 1_000_000n;

/**
 * Safely converts numerical values, currency strings, or BigInt amounts into micro-unit `CurrencyMicros`.
 * Eliminates IEEE-754 precision drift and prevents RangeError during BigInt conversion
 * by safely rounding floating-point amounts to the nearest integer before invoking BigInt().
 *
 * Invariants:
 * - NEVER pass a raw floating-point number directly to BigInt(). Always wrap with Math.round().
 * - When parsing strings like "175.5285", parse as float, scale to micros, round, and then cast:
 *   BigInt(Math.round(parseFloat(cleanString || "0") * 1_000_000))
 * - Supports negative numbers, zero, NaN (fallback to 0n), and edge cases cleanly.
 */
export function toCurrencyMicros(val: number | string | bigint | null | undefined): CurrencyMicros {
  if (val === null || val === undefined) return 0n as CurrencyMicros;
  if (typeof val === 'bigint') return val as CurrencyMicros;
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || Number.isNaN(val) || val === 0) return 0n as CurrencyMicros;
    return BigInt(Math.round(val * 1_000_000)) as CurrencyMicros;
  }
  const rawStr = String(val).trim();
  if (!rawStr || rawStr === '--' || rawStr === '-') return 0n as CurrencyMicros;

  const isNegative = rawStr.includes('-') || (rawStr.includes('(') && rawStr.includes(')'));
  const cleanString = rawStr.replace(/[$€£¥₹,"'()\s-]/g, '');
  if (!cleanString) return 0n as CurrencyMicros;

  const parsed = parseFloat(cleanString);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed === 0) return 0n as CurrencyMicros;

  const micros = BigInt(Math.round(parsed * 1_000_000));
  return (isNegative && micros > 0n ? -micros : micros) as CurrencyMicros;
}

/**
 * Converts `CurrencyMicros` back to standard floating-point units.
 */
export function fromCurrencyMicros(micros: CurrencyMicros): number {
  return Number(micros) / 1_000_000;
}

/**
 * Conversion utility type signature to quantize a standard decimal number into `CurrencyMicros`.
 */
export type ToMicrosFn = (amount: number) => CurrencyMicros;

/**
 * Conversion utility type signature to convert `CurrencyMicros` back to standard floating-point units.
 */
export type FromMicrosFn = (micros: CurrencyMicros) => number;

/**
 * Conversion utility type signature to serialize `CurrencyMicros` to a string for IPC or wire transport.
 */
export type SerializeMicrosFn = (micros: CurrencyMicros) => string;

/**
 * Conversion utility type signature to deserialize string or bigint representations into `CurrencyMicros`.
 */
export type DeserializeMicrosFn = (input: string | number | bigint) => CurrencyMicros;

/**
 * Utility type to extract the underlying primitive type from a branded nominal type.
 */
export type ExtractPrimitive<T> = T extends number & { readonly __brand: unknown }
  ? number
  : T extends string & { readonly __brand: unknown }
    ? string
    : T extends bigint & { readonly __brand: unknown }
      ? bigint
      : T;
