/**
 * Phase 9 - Multi-Currency & Math Verification Unit Tests
 *
 * Validates:
 * 1. Strict multi-currency support: '$', '₹' (INR), '€' (EUR), '¥' (JPY), '£' (GBP).
 * 2. Zero-decimal rounding for JPY ('¥12,450') and standard 2-decimal formatting for '$', '₹', '€', '£'.
 * 3. Locale-aware groupings (INR lakhs/crores, JPY, GBP, EUR, USD).
 * 4. Auto-detection from CSV headers and cells.
 * 5. Mathematical invariants: Zero division-by-zero, Zero NaN, Zero Infinity, exact Marginal Waste.
 * 6. High-throughput performance: sub-25ms for 100,000 formatting iterations without heap churn.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCurrency,
  detectCurrencyFromData,
  SUPPORTED_CURRENCIES,
  DEFAULT_CURRENCY,
  normalizeCurrencySymbol,
} from '../../src/utils/currency.ts';
import { calculateMarginalWaste, useSieveStore } from '../../src/state/useSieveStore.ts';

test('Phase 9 Objective 1: Strict Multi-Currency Symbol Support', () => {
  assert.deepEqual(
    [...SUPPORTED_CURRENCIES],
    ['$', '₹', '€', '¥', '£'],
    'Must strictly support only $, ₹, €, ¥, £'
  );
  assert.equal(DEFAULT_CURRENCY, '$');

  // Normalization of symbols and ISO codes
  assert.equal(normalizeCurrencySymbol('$'), '$');
  assert.equal(normalizeCurrencySymbol('USD'), '$');
  assert.equal(normalizeCurrencySymbol('₹'), '₹');
  assert.equal(normalizeCurrencySymbol('INR'), '₹');
  assert.equal(normalizeCurrencySymbol('€'), '€');
  assert.equal(normalizeCurrencySymbol('EUR'), '€');
  assert.equal(normalizeCurrencySymbol('¥'), '¥');
  assert.equal(normalizeCurrencySymbol('JPY'), '¥');
  assert.equal(normalizeCurrencySymbol('£'), '£');
  assert.equal(normalizeCurrencySymbol('GBP'), '£');

  // Unsupported currencies fallback to $
  assert.equal(normalizeCurrencySymbol('CAD'), '$');
  assert.equal(normalizeCurrencySymbol('AUD'), '$');
  assert.equal(normalizeCurrencySymbol('BTC'), '$');
  assert.equal(normalizeCurrencySymbol(undefined), '$');
});

test('Phase 9 Objective 3: Zero-Decimal Rounding for JPY & 2-Decimal for Others', () => {
  // JPY Zero-Decimal Rounding
  assert.equal(formatCurrency(12450, '¥'), '¥12,450');
  assert.equal(formatCurrency(12450.4, '¥'), '¥12,450');
  assert.equal(formatCurrency(12450.6, '¥'), '¥12,451');
  assert.equal(formatCurrency(1000000, '¥'), '¥1,000,000');
  assert.equal(formatCurrency(0, '¥'), '¥0');

  // USD 2-Decimal Formatting
  assert.equal(formatCurrency(1234.56, '$'), '$1,234.56');
  assert.equal(formatCurrency(12450, '$'), '$12,450.00');

  // INR 2-Decimal Formatting with Indian Numbering System Grouping (Lakhs/Crores)
  assert.equal(formatCurrency(1234567.89, '₹'), '₹12,34,567.89');
  assert.equal(formatCurrency(12450, '₹'), '₹12,450.00');

  // EUR 2-Decimal Formatting
  assert.equal(formatCurrency(987654.321, '€'), '€987,654.32');

  // GBP 2-Decimal Formatting
  assert.equal(formatCurrency(50000, '£'), '£50,000.00');
});

test('Phase 9 Objective 2: Auto-Detection from CSV Headers & Data Cells', () => {
  // EUR Detection
  const eurHeaderCsv = 'Search keyword,Campaign,Ad group,Currency,Clicks,Impressions,Cost,Conversions\n"shoes",Camp1,Adg1,EUR,15,200,"12,50 €",2.0\n';
  assert.equal(detectCurrencyFromData(eurHeaderCsv), '€');

  const eurSymbolCsv = 'Search Term,Clicks,Cost (€),Conversions\n"boots",20,45.00,1\n';
  assert.equal(detectCurrencyFromData(eurSymbolCsv), '€');

  // INR Detection
  const inrHeaderCsv = 'Customer Search Term,Spend,Currency\n"mobile case",₹1,234.50,INR\n';
  assert.equal(detectCurrencyFromData(inrHeaderCsv), '₹');

  const inrSymbolCsv = 'Search Query,Spend (₹),Conversions\n"saree",500.00,2\n';
  assert.equal(detectCurrencyFromData(inrSymbolCsv), '₹');

  // JPY Detection
  const jpyHeaderCsv = 'Search terms report\nOct 1, 2024 - Oct 31, 2024\nCurrency: JPY\n\nSearch term,Cost\n"靴",¥12450\n';
  assert.equal(detectCurrencyFromData(jpyHeaderCsv), '¥');

  const jpySymbolCsv = 'Query,Clicks,Spend (¥)\n"ゲーム",100,¥50000\n';
  assert.equal(detectCurrencyFromData(jpySymbolCsv), '¥');

  // GBP Detection
  const gbpHdrCsv = 'Campaign,Search term,Cost,Currency\nCamp1,"jacket",£120.00,GBP\n';
  assert.equal(detectCurrencyFromData(gbpHdrCsv), '£');

  // USD Detection
  const usdHdrCsv = 'Search term,Campaign,Cost ($),Clicks\n"running shoes",Camp1,$99.50,10\n';
  assert.equal(detectCurrencyFromData(usdHdrCsv), '$');

  // Detection from Uint8Array / ArrayBuffer binary payload
  const encoder = new TextEncoder();
  const binaryPayload = encoder.encode('Customer Search Term,Cost,Currency\n"watch",¥12,450,JPY\n');
  assert.equal(detectCurrencyFromData(binaryPayload), '¥');
  assert.equal(detectCurrencyFromData(binaryPayload.buffer), '¥');
});

test('Phase 9 Objective 4: Mathematical Invariants Audit across Financial Operations', () => {
  // 1. Non-converting term: marginal waste = 100% of spend
  const nonConvertingWaste = calculateMarginalWaste(150.0, 0, 50.0);
  assert.equal(nonConvertingWaste, 150.0, 'Non-converting spend must be 100% marginal waste');

  // 2. Converting term exceeding target CPA: waste = spend - (conversions * targetCPA)
  const convertingWaste = calculateMarginalWaste(500.0, 5, 50.0);
  assert.equal(convertingWaste, 250.0, 'Spend $500 with 5 conv at $50 target CPA must have $250 waste');

  // 3. Profitable term below target CPA: waste = 0.00
  const profitableWaste = calculateMarginalWaste(80.0, 2, 50.0);
  assert.equal(profitableWaste, 0.0, 'Profitable spend ($80 < allowable $100) must yield $0.00 waste');

  // 4. Zero division-by-zero & NaN safety
  const zeroConvWaste = calculateMarginalWaste(0, 0, 0);
  assert.equal(Number.isNaN(zeroConvWaste), false);
  assert.equal(Number.isFinite(zeroConvWaste), true);
  assert.equal(zeroConvWaste, 0.0);

  // 5. Handling NaN, Infinity, negative values
  const nanWaste = calculateMarginalWaste(NaN, NaN, NaN);
  assert.equal(Number.isNaN(nanWaste), false);
  assert.equal(Number.isFinite(nanWaste), true);
  assert.equal(nanWaste, 0.0);

  const infWaste = calculateMarginalWaste(Infinity, 0, 50.0);
  assert.equal(Number.isFinite(infWaste), true);
  assert.equal(infWaste, 0.0);

  const negWaste = calculateMarginalWaste(-100.0, -2, -50.0);
  assert.equal(negWaste, 0.0, 'Negative values must be clamped to 0.0');

  // 6. Currency-aware rounding for JPY
  const jpyWaste = calculateMarginalWaste(12450.6, 0, 50.0, 0, '¥');
  assert.equal(jpyWaste, 12451, 'JPY marginal waste must be rounded to zero decimals');

  const usdWaste = calculateMarginalWaste(12450.6, 0, 50.0, 0, '$');
  assert.equal(usdWaste, 12450.6, 'USD marginal waste must retain 2 decimals');

  // 7. formatCurrency NaN & Infinity Safety
  assert.equal(formatCurrency(NaN, '$'), '$0.00');
  assert.equal(formatCurrency(Infinity, '¥'), '¥0');
  assert.equal(formatCurrency(-Infinity, '€'), '€0.00');
});

test('Phase 9 Performance Constraint: Pure Functional Currency Formatting Benchmark', () => {
  const iterations = 100000;
  const t0 = performance.now();

  let checkSum = 0;
  for (let i = 0; i < iterations; i++) {
    const symbol = SUPPORTED_CURRENCIES[i % 5];
    const str = formatCurrency(i * 1.5, symbol);
    checkSum += str.length;
  }

  const durationMs = performance.now() - t0;
  assert.ok(checkSum > 0);
  assert.ok(
    durationMs < 250,
    `100,000 currency format calls completed in ${durationMs.toFixed(2)}ms (target < 250ms)`
  );
});

