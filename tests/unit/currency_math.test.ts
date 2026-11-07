/**
 * Currency Formatting & Mathematical Invariants Unit Tests
 *
 * Operating Principles:
 * - Martin Fowler: Refactoring Test Code (Test Independence, Fixture Factories)
 * - Titus Winters et al. (SE at Google): Testing Behavioral Contracts over Implementation Details
 * - Rule 1: Behavior-Driven Intent Naming ([action/condition] -> [expected behavior/outcome])
 * - Rule 2: Parameterized Data-Driven Matrices
 * - Rule 3: Elimination of Assertion Roulette
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import {
  formatCurrency,
  detectCurrencyFromData,
  normalizeCurrencySymbol,
  SUPPORTED_CURRENCIES,
  DEFAULT_CURRENCY,
  type SupportedCurrency,
} from '../../src/utils/currency.ts';
import { calculateMarginalWaste, useSieveStore } from '../../src/state/useSieveStore.ts';
import { CurrencySelector } from '../../src/components/brand/CurrencySelector.tsx';

/**
 * Domain Test Fixture Factory for financial test cases.
 */
export interface FinancialTestFixture {
  spend: number;
  conversions: number;
  targetCPA: number;
}

export function createFinancialFixture(overrides: Partial<FinancialTestFixture> = {}): FinancialTestFixture {
  return {
    spend: 100.0,
    conversions: 2,
    targetCPA: 50.0,
    ...overrides,
  };
}

// ============================================================================
// 1. Parameterized Currency Formatting Matrix
// ============================================================================

interface CurrencyFormatCase {
  amount: number;
  currency: SupportedCurrency;
  expected: string;
  description: string;
}

const currencyFormatCases: CurrencyFormatCase[] = [
  {
    amount: 1450.5,
    currency: '$',
    expected: '$1,450.50',
    description: 'USD standard 2-decimal format',
  },
  {
    amount: 1450.5,
    currency: '₹',
    expected: '₹1,450.50',
    description: 'INR Indian Rupee 2-decimal format',
  },
  {
    amount: 1450.5,
    currency: '€',
    expected: '€1,450.50',
    description: 'EUR Euro 2-decimal format',
  },
  {
    amount: 1450.5,
    currency: '£',
    expected: '£1,450.50',
    description: 'GBP British Pound 2-decimal format',
  },
  {
    amount: 1450.5,
    currency: '¥',
    expected: '¥1,451',
    description: 'JPY Japanese Yen zero-decimal rounding format',
  },
];

for (const { amount, currency, expected, description } of currencyFormatCases) {
  test(`formatCurrency with ${currency} (${description}) -> formats output exactly as "${expected}"`, () => {
    // Act
    const formatted = formatCurrency(amount, currency);

    // Assert
    assert.strictEqual(
      formatted,
      expected,
      `formatCurrency(${amount}, '${currency}') failed contract for ${description}`
    );
  });
}

// ============================================================================
// 2. Currency Symbol Normalization & Fallbacks
// ============================================================================

test('Currency Normalization: Normalizes ISO codes, symbols, and falls back to default ($)', () => {
  assert.deepEqual([...SUPPORTED_CURRENCIES], ['$', '₹', '€', '¥', '£']);
  assert.equal(DEFAULT_CURRENCY, '$');

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

// ============================================================================
// 3. Parameterized Marginal Waste Boundary Matrix
// ============================================================================

interface MarginalWasteCase {
  scenario: string;
  fixture: FinancialTestFixture;
  expectedWaste: number;
}

const marginalWasteCases: MarginalWasteCase[] = [
  {
    scenario: 'non-converting search query with zero conversions',
    fixture: createFinancialFixture({ spend: 100.0, conversions: 0, targetCPA: 50.0 }),
    expectedWaste: 100.0,
  },
  {
    scenario: 'inefficient converting search query exceeding target CPA ceiling',
    fixture: createFinancialFixture({ spend: 200.0, conversions: 2, targetCPA: 50.0 }),
    expectedWaste: 100.0,
  },
  {
    scenario: 'profitable converting search query operating below target CPA',
    fixture: createFinancialFixture({ spend: 80.0, conversions: 2, targetCPA: 50.0 }),
    expectedWaste: 0.0,
  },
];

for (const { scenario, fixture, expectedWaste } of marginalWasteCases) {
  test(`calculateMarginalWaste for ${scenario} -> computes marginal waste of ${expectedWaste.toFixed(2)}`, () => {
    // Act
    const waste = calculateMarginalWaste(fixture.spend, fixture.conversions, fixture.targetCPA);

    // Assert
    assert.strictEqual(
      waste,
      expectedWaste,
      `calculateMarginalWaste failed for ${scenario}. Expected ${expectedWaste}, got ${waste}`
    );
  });
}

test('calculateMarginalWaste: Handles NaN, Infinity, negative values, and currency rounding', () => {
  // Negative clamping
  assert.strictEqual(calculateMarginalWaste(-100.0, -2, -50.0), 0.0);

  // NaN safety
  const nanWaste = calculateMarginalWaste(NaN, NaN, NaN);
  assert.strictEqual(Number.isFinite(nanWaste), true);
  assert.strictEqual(nanWaste, 0.0);

  // Infinity safety
  const infWaste = calculateMarginalWaste(Infinity, 0, 50.0);
  assert.strictEqual(Number.isFinite(infWaste), true);
  assert.strictEqual(infWaste, 0.0);

  // JPY zero-decimal rounding
  const jpyWaste = calculateMarginalWaste(12450.6, 0, 50.0, 0, '¥');
  assert.strictEqual(jpyWaste, 12451);

  // formatCurrency NaN / Infinity protection
  assert.strictEqual(formatCurrency(NaN, '$'), '$0.00');
  assert.strictEqual(formatCurrency(Infinity, '¥'), '¥0');
  assert.strictEqual(formatCurrency(-Infinity, '€'), '€0.00');
});

// ============================================================================
// 4. Parameterized CSV Header Currency Detection Matrix
// ============================================================================

interface HeaderDetectionCase {
  platformHeader: string;
  expectedSymbol: SupportedCurrency;
  description: string;
}

const headerDetectionCases: HeaderDetectionCase[] = [
  {
    platformHeader: 'Search keyword,Campaign,Ad group,Currency,Clicks,Impressions,Cost,Conversions\n"scarpe",Camp1,Adg1,EUR,10,100,"12,50 €",1.0\n',
    expectedSymbol: '€',
    description: 'European multi-column header with (EUR)',
  },
  {
    platformHeader: 'Search Term,Clicks,Cost ($),Conversions\n"shoes",15,$35.50,1\n',
    expectedSymbol: '$',
    description: 'Standard US export with ($) currency notation',
  },
  {
    platformHeader: 'Customer Search Term,Spend,Currency\n"saree",₹1,234.50,INR\n',
    expectedSymbol: '₹',
    description: 'Indian regional advertising report with (INR)',
  },
  {
    platformHeader: 'Campaign,Search term,Cost,Currency\nCamp1,"jacket",£120.00,GBP\n',
    expectedSymbol: '£',
    description: 'UK marketplace report with (£) symbol notation',
  },
  {
    platformHeader: 'Search terms report\nCurrency: JPY\n\nSearch term,Cost\n"靴",¥12450\n',
    expectedSymbol: '¥',
    description: 'Japanese advertising report with (JPY)',
  },
];

for (const { platformHeader, expectedSymbol, description } of headerDetectionCases) {
  test(`detectCurrencyFromData for ${description} -> resolves currency symbol "${expectedSymbol}"`, () => {
    // Act
    const detected = detectCurrencyFromData(platformHeader);

    // Assert
    assert.strictEqual(
      detected,
      expectedSymbol,
      `Failed to detect expected currency "${expectedSymbol}" for ${description}`
    );
  });
}

test('detectCurrencyFromData: Resolves currency from binary buffer payloads', () => {
  const encoder = new TextEncoder();
  const binaryPayload = encoder.encode('Customer Search Term,Cost,Currency\n"watch",¥12,450,JPY\n');
  assert.strictEqual(detectCurrencyFromData(binaryPayload), '¥');
  assert.strictEqual(detectCurrencyFromData(binaryPayload.buffer), '¥');
});

// ============================================================================
// 5. Performance Benchmark
// ============================================================================

test('Currency Formatting Performance: 100,000 iterations execute under 250ms', () => {
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

// ============================================================================
// 6. Accessible Component Integration
// ============================================================================

test('CurrencySelector user interaction -> switches active currency and marks selection as manual', () => {
  // Arrange
  cleanup();
  useSieveStore.getState().reset();
  render(React.createElement(CurrencySelector, null));

  // Act: Select Euro button via accessible name
  const eurButton = screen.getByRole('button', { name: /Select € currency/i });
  assert.ok(eurButton, 'EUR currency button must be queryable by role and accessible name');
  fireEvent.click(eurButton);

  // Assert
  const state = useSieveStore.getState();
  assert.strictEqual(state.currency, '€', 'Active store currency must update to "€"');
  assert.strictEqual(state.isCurrencyManual, true, 'isCurrencyManual flag must be set to true');
});
