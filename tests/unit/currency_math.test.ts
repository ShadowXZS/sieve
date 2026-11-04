/**
 * Currency Mathematics & Financial Invariant Unit Test Suite (Phase: Red -> Green)
 *
 * Verifies:
 * 1. Multi-currency formatting:
 *    - formatCurrency(1450.5, '$') === "$1,450.50"
 *    - formatCurrency(1450.5, '₹') === "₹1,450.50"
 *    - formatCurrency(1450.5, '€') === "€1,450.50"
 *    - formatCurrency(1450.5, '£') === "£1,450.50"
 *    - formatCurrency(1450.5, '¥') === "¥1,451" (zero-decimal rounding)
 * 2. Strict Marginal Waste financial invariants:
 *    - Cost $100.00, Conversions 0 -> Marginal Waste = $100.00
 *    - Cost $200.00, Conversions 2, Target CPA $50.00 -> Marginal Waste = $100.00
 *    - Cost $80.00, Conversions 2, Target CPA $50.00 -> Marginal Waste = $0.00
 * 3. Header auto-detection:
 *    - "Cost (EUR)" -> "€"
 *    - "Spend ($)" -> "$"
 *    - "Cost (INR)" -> "₹"
 *    - "Impressions, Clicks, Spend (£)" -> "£"
 * 4. CurrencySelector header component mounts and supports symbol switching.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, cleanup, fireEvent, act } from '@testing-library/react';

import { formatCurrency, detectCurrencyFromData } from '../../src/utils/currency.ts';
import { calculateMarginalWaste, useSieveStore } from '../../src/state/useSieveStore.ts';
import { CurrencySelector } from '../../src/components/brand/CurrencySelector.tsx';

test('Currency Formatting: Exactly matches specified symbols and precision', () => {
  assert.strictEqual(formatCurrency(1450.5, '$'), '$1,450.50');
  assert.strictEqual(formatCurrency(1450.5, '₹'), '₹1,450.50');
  assert.strictEqual(formatCurrency(1450.5, '€'), '€1,450.50');
  assert.strictEqual(formatCurrency(1450.5, '£'), '£1,450.50');
  assert.strictEqual(formatCurrency(1450.5, '¥'), '¥1,451');
});

test('Marginal Waste Invariants: Edge condition spend and conversion modeling', () => {
  // Edge 1: Non-converting term (Cost $100.00, Conversions 0) -> Marginal Waste = $100.00
  const nonConverting = calculateMarginalWaste(100.0, 0, 50.0);
  assert.strictEqual(nonConverting, 100.0, 'Non-converting terms must classify 100% of spend as marginal waste');

  // Edge 2: Inefficient converting term (Cost $200.00, Conversions 2, Target CPA $50.00) -> Marginal Waste = $100.00
  // Allowable Spend = 2 * 50.00 = 100.00; Waste = 200.00 - 100.00 = 100.00
  const inefficient = calculateMarginalWaste(200.0, 2, 50.0);
  assert.strictEqual(inefficient, 100.0, 'Allowable spend deduction must leave exactly $100.00 marginal waste');

  // Edge 3: Profitable converting term (Cost $80.00, Conversions 2, Target CPA $50.00) -> Marginal Waste = $0.00
  // Allowable Spend = 2 * 50.00 = 100.00; Waste = Math.max(0, 80.00 - 100.00) = 0.00
  const profitable = calculateMarginalWaste(80.0, 2, 50.0);
  assert.strictEqual(profitable, 0.0, 'Profitable traffic below target CPA must yield exactly $0.00 waste');
});

test('Header Auto-Detection: Sniffs headers and platforms accurately', () => {
  assert.strictEqual(detectCurrencyFromData('Campaign,AdGroup,Cost (EUR),Conversions'), '€');
  assert.strictEqual(detectCurrencyFromData('Keyword,Clicks,Spend ($),Impressions'), '$');
  assert.strictEqual(detectCurrencyFromData('Search Query,Cost (INR),Conversions,Revenue'), '₹');
  assert.strictEqual(detectCurrencyFromData('Impressions, Clicks, Spend (£), Sales'), '£');
});

test('CurrencySelector Component: Renders in header and allows switching active currency', () => {
  cleanup();
  useSieveStore.getState().reset();
  assert.strictEqual(useSieveStore.getState().currency, '$');

  const { container } = render(React.createElement(CurrencySelector));
  const eurButton = container.querySelector('[data-testid="currency-toggle-€"]') as HTMLButtonElement;
  assert.ok(eurButton, 'CurrencySelector must render button for €');

  act(() => {
    fireEvent.click(eurButton);
  });

  assert.strictEqual(useSieveStore.getState().currency, '€');
  assert.strictEqual(useSieveStore.getState().isCurrencyManual, true);
});
