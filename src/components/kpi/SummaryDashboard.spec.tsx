/**
 * SummaryDashboard and SpendWaterfall Coherence Specification
 * Verifies mathematical unification between Hero Metric cards and Spend Waterfall breakdown,
 * eliminating the 8.2x metric discrepancy across Cooper's 5 UI States.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, cleanup, act, screen } from '@testing-library/react';
import { SummaryDashboard } from './SummaryDashboard.tsx';
import { SpendWaterfallBar } from './SpendWaterfallBar.tsx';
import { useSieveStore } from '../../state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from '../../workers/protocol.ts';

if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1000 });
}

function makeKeyword(overrides: Partial<PersistedNegativeKeyword> = {}): PersistedNegativeKeyword {
  return {
    sha256Hash: `hash_${Math.random().toString(36).substring(2, 8)}`,
    keyword: 'sample query', matchType: 'broad', platform: 1, confidenceScore: 0.9,
    marginalWaste: 100, cost: 100, clicks: 10, conversions: 0, hasCollision: false, createdAt: Date.now(),
    ...overrides,
  };
}

test('Metric Coherence Invariant: Reconciles $2.375M Actionable Waste and eliminates 8.2x discrepancy with Spend Waterfall', () => {
  cleanup();
  useSieveStore.getState().reset();

  // Benchmark dataset: Secured $25.8M (516k convs * $50 targetCPA), Actionable Waste $2,375,590.85, Gross Volume $19,708,287.86
  const benchmarkKeywords: PersistedNegativeKeyword[] = [
    makeKeyword({ sha256Hash: 'sec_1', keyword: 'secured brand query', matchType: 'exact', cost: 25_800_000, conversions: 516_000, clicks: 500_000, hasCollision: true }),
    makeKeyword({ sha256Hash: 'wst_1', keyword: 'zero conv waste bleed', matchType: 'broad', cost: 2_375_590.85, conversions: 0, clicks: 70_000 }),
    makeKeyword({ sha256Hash: 'vol_1', keyword: 'filter matched volume term', matchType: 'phrase', cost: 17_332_697.01, conversions: 0, clicks: 120_000, confidenceScore: 0.70 }),
  ];

  act(() => {
    useSieveStore.getState().updateThresholds({ maxMarginalWaste: 100_000_000 });
    useSieveStore.getState().setKeywords(benchmarkKeywords);
    useSieveStore.getState().setCurrency('$', true);
  });

  const { container } = render(
    <div>
      <SummaryDashboard />
      <SpendWaterfallBar />
    </div>
  );

  // 1. Hero Card 1 Actionable Waste readout
  const heroCard = container.querySelector('[data-testid="tier-waste-bleed"]');
  assert.ok(heroCard, 'Actionable Waste hero card must be mounted');
  const heroWasteVal = heroCard.querySelector('.text-2xl.font-bold.font-mono.tabular-nums');
  assert.ok(heroWasteVal, 'Hero waste amount must be rendered in tabular numerals');
  assert.equal(heroWasteVal.textContent?.trim(), '$2,375,590.85', 'Hero Card must display actionable zero-conversion waste ($2,375,590.85)');

  // 2. Spend Waterfall Waste Tier readout
  const waterfallWasteVal = container.querySelector('[data-testid="waterfall-waste-value"]');
  assert.ok(waterfallWasteVal, 'Waterfall waste value readout must be mounted');
  assert.equal(waterfallWasteVal.textContent?.trim(), '$2,375,590.85', 'Waterfall Waste tier must display identical $2,375,590.85 amount');

  // Coherence assertion: Hero Card and Waterfall Waste tier match exactly to the penny
  assert.equal(heroWasteVal.textContent?.trim(), waterfallWasteVal.textContent?.trim(), '8.2x discrepancy eliminated: Hero Card and Waterfall must match exactly');

  // 3. Gross matched volume labeled distinctly
  const matchedVolumeReadout = container.querySelector('[data-testid="matched-volume-readout"]');
  assert.ok(matchedVolumeReadout, 'Filter matched volume must be labeled distinctly from actionable waste');
  assert.ok(matchedVolumeReadout.textContent?.includes('Total Filter-Matched Volume: $19,708,287.86'), 'Must display $19.7M distinctly as Total Filter-Matched Volume');

  // 4. Waterfall segments sum to exactly 100% width
  const segments = container.querySelectorAll('[data-testid^="waterfall-segment-"]');
  assert.equal(segments.length, 3, 'Must render all 3 spend segments (Secured, Exploratory, Waste)');
  let totalWidth = 0;
  segments.forEach((seg) => {
    const match = (seg.getAttribute('style') || '').match(/width:\s*([\d.]+)%/);
    assert.ok(match, 'Segment must have width percentage');
    totalWidth += parseFloat(match[1]);
  });
  assert.ok(Math.abs(totalWidth - 100) < 0.1, `Spend Waterfall segments must sum to exactly 100% width, got ${totalWidth}%`);

  // 5. Card 2 Safe-List Protected ($25.8M secured)
  const safeCard = container.querySelector('[data-testid="tier-safe-protection"]');
  assert.ok(safeCard?.textContent?.includes('$25,800,000.00'), 'Safe card must display secured revenue ($25.8M)');

  // 6. Card 4 Reallocation Yield (+35,633 conversions)
  const yieldCard = container.querySelector('[data-testid="tier-reallocation-yield"]');
  assert.ok(yieldCard?.textContent?.includes('+35,633 Convs'), 'Reallocation yield must reflect Cobb-Douglas gamma damped lift (+35,633 Convs)');
});

test('Cooper State 1 (Blank/Empty): Prompts CSV upload and displays baseline metrics without NaN', () => {
  cleanup();
  useSieveStore.getState().reset();
  render(<SummaryDashboard />);

  const blankBanner = screen.getByTestId('dashboard-blank-banner');
  assert.ok(blankBanner.textContent?.includes('Upload search term CSV report'), 'Must display CSV upload prompt in blank state');

  const heroCard = screen.getByTestId('tier-waste-bleed');
  assert.ok(heroCard.textContent?.includes('$0.00'), 'Blank waste must display $0.00');
  assert.ok(!heroCard.textContent?.includes('NaN'), 'Blank waste must not contain NaN');
});

test('Cooper State 2 (Loading/Progress): Displays worker progress HUD and maintains stable cards', () => {
  cleanup();
  useSieveStore.getState().reset();
  act(() => {
    useSieveStore.getState().setIsLoading(true);
    useSieveStore.getState().setIngesting(true, 75);
  });
  render(<SummaryDashboard />);

  const loadingHud = screen.getByTestId('dashboard-loading-hud');
  assert.ok(loadingHud, 'Loading progress HUD must be visible');
  assert.ok(loadingHud.textContent?.includes('75%'), 'Progress HUD must display ingestion percentage');

  // Verify all 4 cards remain stably mounted
  assert.ok(screen.getByTestId('tier-waste-bleed'));
  assert.ok(screen.getByTestId('tier-safe-protection'));
  assert.ok(screen.getByTestId('tier-exploratory-risk'));
  assert.ok(screen.getByTestId('tier-reallocation-yield'));
});

test('Cooper State 3 (Ideal/Populated): Formats micro-units cleanly with reactive currency switching', () => {
  cleanup();
  useSieveStore.getState().reset();
  const keywords = [
    makeKeyword({ sha256Hash: 'id_1', cost: 12450.4, conversions: 0 }),
    makeKeyword({ sha256Hash: 'id_2', cost: 5000, conversions: 100, hasCollision: true }),
    makeKeyword({ sha256Hash: 'id_3', cost: 20, clicks: 2, conversions: 0 }),
    makeKeyword({ sha256Hash: 'id_4', cost: 30, clicks: 3, conversions: 0 }),
    makeKeyword({ sha256Hash: 'id_5', cost: 40, clicks: 4, conversions: 0 }),
  ];

  act(() => {
    useSieveStore.getState().setKeywords(keywords);
    useSieveStore.getState().setCurrency('$', true);
  });
  render(<SummaryDashboard />);

  const wasteCard = screen.getByTestId('tier-waste-bleed');
  assert.ok(wasteCard.textContent?.includes('$12,450.40'), 'Must format USD with 2 decimal precision');

  // Reactively switch currency to Japanese Yen (¥)
  act(() => {
    useSieveStore.getState().setCurrency('¥', true);
  });
  assert.ok(wasteCard.textContent?.includes('¥12,450'), 'Must enforce JPY zero-decimal rounding');
});

test('Cooper State 4 (Partial): Identifies single-campaign minimal sample with partial badge', () => {
  cleanup();
  useSieveStore.getState().reset();
  const minimal = [
    makeKeyword({ sha256Hash: 'p_1', cost: 300, clicks: 10, conversions: 0 }),
    makeKeyword({ sha256Hash: 'p_2', cost: 200, clicks: 5, conversions: 1, hasCollision: true }),
  ];

  act(() => {
    useSieveStore.getState().setKeywords(minimal);
  });
  render(<SummaryDashboard />);

  const partialBadge = screen.getByTestId('dashboard-partial-badge');
  assert.ok(partialBadge, 'Partial data badge must be present for small query samples (<5)');
});

test('Cooper State 5 (Error): Renders non-destructive alert banner and maintains layout integrity', () => {
  cleanup();
  useSieveStore.getState().reset();
  act(() => {
    useSieveStore.getState().setErrorMessage('Corrupt CSV input: missing spend header');
  });
  render(<SummaryDashboard />);

  const errorBanner = screen.getByTestId('dashboard-error-banner');
  assert.ok(errorBanner.textContent?.includes('missing spend header'), 'Error alert must display failure message');

  // Verify cards maintain resilient fallback presentation
  assert.ok(screen.getByTestId('tier-waste-bleed'));
  assert.ok(screen.getByTestId('tier-safe-protection'));
  assert.ok(screen.getByTestId('tier-exploratory-risk'));
  assert.ok(screen.getByTestId('tier-reallocation-yield'));
});

test('Spend Waterfall & High-Risk Clicks: Decomposes exploratory spend ($221,591.30 / 32,581 clicks) summing to exactly $28,397,182.15', () => {
  cleanup();
  useSieveStore.getState().reset();

  const datasetKeywords: PersistedNegativeKeyword[] = [
    makeKeyword({ sha256Hash: 'sec_1', keyword: 'secured brand query', matchType: 'exact', cost: 25_800_000, conversions: 516_000, clicks: 10_000_000, hasCollision: true }),
    makeKeyword({ sha256Hash: 'wst_1', keyword: 'zero conv waste bleed', matchType: 'broad', cost: 2_375_590.85, conversions: 0, clicks: 70_000, confidenceScore: 0.95 }),
    makeKeyword({ sha256Hash: 'risk_1', keyword: 'high risk exploratory query', matchType: 'phrase', cost: 221_591.30, conversions: 0, clicks: 32_581, confidenceScore: 0.85 }),
  ];

  act(() => {
    useSieveStore.getState().updateThresholds({ maxMarginalWaste: 100_000_000, targetCPA: 50 });
    useSieveStore.getState().setKeywords(datasetKeywords);
    useSieveStore.getState().setCurrency('$', true);
  });

  const { container } = render(
    <div>
      <SummaryDashboard />
      <SpendWaterfallBar />
    </div>
  );

  // 1. High-Risk Clicks card detects 32,581 clicks
  const riskCard = container.querySelector('[data-testid="tier-exploratory-risk"]');
  assert.ok(riskCard?.textContent?.includes('32,581 Clicks'), 'High-Risk Clicks card must detect 32,581 clicks');
  assert.ok(riskCard?.textContent?.includes('$221,591.30'), 'High-Risk card must display non-zero $221,591.30 exploratory spend');

  // 2. Spend Waterfall displays non-zero dollar amount and percentage for Exploratory Spend
  const waterfallExploratory = container.querySelector('[data-testid="waterfall-exploratory-value"]');
  assert.equal(waterfallExploratory?.textContent?.trim(), '$221,591.30', 'Spend Waterfall Exploratory tier must show $221,591.30');

  // 3. Total analyzed spend equals exactly $28,397,182.15
  const totalSpendEl = container.querySelector('[data-testid="waterfall-total-spend"]');
  assert.equal(totalSpendEl?.textContent?.trim(), '$28,397,182.15', 'Total analyzed spend must display $28,397,182.15');

  // 4. Protected spend does not swallow exploratory spend ($25,800,000.00, not $26,021,591.30)
  const securedVal = container.querySelector('[data-testid="waterfall-secured-value"]');
  assert.equal(securedVal?.textContent?.trim(), '$25,800,000.00', 'Protected spend must be $25.8M, not swallowing exploratory spend');

  // 5. Identified waste matches $2,375,590.85
  const wasteVal = container.querySelector('[data-testid="waterfall-waste-value"]');
  assert.equal(wasteVal?.textContent?.trim(), '$2,375,590.85', 'Waste tier must show $2,375,590.85');

  // 6. Conservation of spend: Three tiers sum to exactly 100.0% width
  const segments = container.querySelectorAll('[data-testid^="waterfall-segment-"]');
  let totalWidth = 0;
  segments.forEach((seg) => {
    const match = (seg.getAttribute('style') || '').match(/width:\s*([\d.]+)%/);
    assert.ok(match, 'Segment must have width percentage');
    totalWidth += parseFloat(match[1]);
  });
  assert.ok(Math.abs(totalWidth - 100.0) < 0.1, `Waterfall segments must sum to exactly 100.0%, got ${totalWidth}%`);
});
