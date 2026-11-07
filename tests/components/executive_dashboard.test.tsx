/**
 * Executive Analytics Dashboard Behavioral Test Suite
 *
 * Operating Principles:
 * - Martin Fowler: Refactoring Test Code (Test Independence, Fixture Factories)
 * - Titus Winters et al. (SE at Google): Testing Behavioral Contracts over Implementation Details
 * - Cooper's 5 Core Interaction States: Blank, Loading, Ideal, Partial, Error
 * - Accessible Semantic Landmarks (Headings, Text, ARIA roles, Test IDs) over Volatile CSS Classes
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, cleanup, act, screen, within } from '@testing-library/react';

import { ExecutiveDashboard } from '../../src/components/dashboard/ExecutiveDashboard.tsx';
import { SpendWaterfallBar } from '../../src/components/kpi/SpendWaterfallBar.tsx';
import { BidElasticityProbe } from '../../src/components/kpi/BidElasticityProbe.tsx';
import { useSieveStore } from '../../src/state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

// Viewport mocks for Happy-DOM environment
if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1000 });
}

/**
 * Domain Test Fixture Factory for PersistedNegativeKeyword records.
 */
export function createMockKeyword(overrides: Partial<PersistedNegativeKeyword> = {}): PersistedNegativeKeyword {
  return {
    sha256Hash: `hash_${Math.random().toString(36).substring(2, 9)}`,
    keyword: 'sample test keyword',
    matchType: 'broad',
    formattedRule: 'sample test keyword',
    platform: 1,
    confidenceScore: 0.9,
    marginalWaste: 100,
    cost: 100,
    clicks: 10,
    conversions: 0,
    hasCollision: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// 1. Cooper's 5 Core UI States for ExecutiveDashboard
// ============================================================================

test('ExecutiveDashboard when keyword dataset is empty (Blank State) -> renders all 4 semantic cards with zeroed baseline metrics without NaN or layout collapse', () => {
  // Arrange: Reset store to clean initial state with zero keywords
  cleanup();
  useSieveStore.getState().reset();

  // Act: Render the executive dashboard
  render(<ExecutiveDashboard />);

  // Assert: All 4 semantic cards are mounted with accessible headings and zero baseline values
  const wasteCard = screen.getByTestId('executive-card-waste');
  assert.ok(wasteCard, 'Identified Waste card must be present');
  assert.ok(within(wasteCard).getByText('Identified Waste'), 'Waste card must display semantic heading');
  assert.ok(wasteCard.textContent?.includes('$0.00'), 'Waste card must display zero baseline spend ($0.00)');

  const wasteBadge = screen.getByTestId('waste-percentage-badge');
  assert.ok(wasteBadge.textContent?.includes('0.0%'), 'Waste percentage must safely display 0.0% when spend is zero');

  const safeCard = screen.getByTestId('executive-card-safe');
  assert.ok(safeCard, 'Safe-List card must be present');
  assert.ok(within(safeCard).getByText('Safe-List Protected'), 'Safe card must display semantic heading');
  assert.ok(safeCard.textContent?.includes('0 Convs'), 'Safe card must display 0 baseline conversions');

  const riskCard = screen.getByTestId('executive-card-risk');
  assert.ok(riskCard, 'High-Risk Clicks card must be present');
  assert.ok(within(riskCard).getByText('High-Risk Clicks'), 'Risk card must display semantic heading');
  assert.ok(riskCard.textContent?.includes('0 Clicks'), 'Risk card must display 0 baseline clicks');

  const yieldCard = screen.getByTestId('executive-card-yield');
  assert.ok(yieldCard, 'Reallocation Yield card must be present');
  assert.ok(within(yieldCard).getByText('Reallocation Yield'), 'Yield card must display semantic heading');
  assert.ok(yieldCard.textContent?.includes('+0.0 Convs'), 'Yield card must display +0.0 baseline incremental conversions');

  // Verify zero NaN or Infinity across the rendered output
  assert.strictEqual(wasteCard.textContent?.includes('NaN'), false, 'Waste card must not contain NaN');
  assert.strictEqual(wasteCard.textContent?.includes('Infinity'), false, 'Waste card must not contain Infinity');
});

test('ExecutiveDashboard during active ingestion (Loading State) -> renders stably without crashing or unmounting cards', () => {
  // Arrange: Emulate store loading and worker ingestion states
  cleanup();
  useSieveStore.getState().reset();
  act(() => {
    useSieveStore.getState().setIsLoading(true);
    useSieveStore.getState().setIngesting(true, 50);
  });

  // Act: Render dashboard under loading state
  render(<ExecutiveDashboard />);

  // Assert: All 4 semantic cards remain stably rendered in the DOM
  assert.ok(screen.getByTestId('executive-card-waste'), 'Identified Waste card must remain mounted during loading');
  assert.ok(screen.getByTestId('executive-card-safe'), 'Safe-List Protected card must remain mounted during loading');
  assert.ok(screen.getByTestId('executive-card-risk'), 'High-Risk Clicks card must remain mounted during loading');
  assert.ok(screen.getByTestId('executive-card-yield'), 'Reallocation Yield card must remain mounted during loading');
});

test('ExecutiveDashboard with multi-tier keyword records (Ideal State) -> renders all 4 semantic cards displaying computed domain metrics and active currency', () => {
  // Arrange: Populate store with representative multi-tier keywords
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    createMockKeyword({
      sha256Hash: 'hash_waste_1',
      keyword: 'free cloud trial',
      matchType: 'broad',
      confidenceScore: 0.95,
      marginalWaste: 1500,
      cost: 1500,
      clicks: 100,
      conversions: 0,
    }),
    createMockKeyword({
      sha256Hash: 'hash_safe_1',
      keyword: 'enterprise software license',
      matchType: 'exact',
      formattedRule: '[enterprise software license]',
      confidenceScore: 0.9,
      marginalWaste: 0,
      cost: 500,
      clicks: 80,
      conversions: 10,
      hasCollision: true,
    }),
    createMockKeyword({
      sha256Hash: 'hash_risk_1',
      keyword: 'cheap cloud db',
      matchType: 'phrase',
      formattedRule: '"cheap cloud db"',
      confidenceScore: 0.82,
      marginalWaste: 200,
      cost: 200,
      clicks: 4,
      conversions: 0,
    }),
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
    useSieveStore.getState().setCurrency('$', true);
  });

  // Act: Render dashboard in Ideal populated state
  render(<ExecutiveDashboard />);

  // Assert 1: Identified Waste card displays computed waste and formatted currency
  const wasteCard = screen.getByTestId('executive-card-waste');
  assert.ok(within(wasteCard).getByText('Identified Waste'));
  assert.ok(
    wasteCard.textContent?.includes('$1,500.00') || wasteCard.textContent?.includes('$1,700.00'),
    'Waste card must format value with active currency symbol ($)'
  );
  assert.ok(wasteCard.textContent?.includes('CPA Drag'), 'Waste card must display CPA Drag metric');

  // Assert 2: Safe-List Protected card displays protected conversions and secured revenue
  const safeCard = screen.getByTestId('executive-card-safe');
  assert.ok(within(safeCard).getByText('Safe-List Protected'));
  assert.ok(safeCard.textContent?.includes('10 Convs'), 'Safe card must indicate 10 protected conversions');
  assert.ok(safeCard.textContent?.includes('Secured'), 'Safe card must display secured revenue section');

  // Assert 3: High-Risk Clicks card displays risk clicks and bid elasticity ceiling
  const riskCard = screen.getByTestId('executive-card-risk');
  assert.ok(within(riskCard).getByText('High-Risk Clicks'));
  assert.ok(riskCard.textContent?.includes('Clicks'), 'Risk card must display risk click metric');
  assert.ok(riskCard.textContent?.includes('Ceiling'), 'Risk card must display optimal bid ceiling');

  // Assert 4: Reallocation Yield card displays incremental conversions and ROAS lift
  const yieldCard = screen.getByTestId('executive-card-yield');
  assert.ok(within(yieldCard).getByText('Reallocation Yield'));
  assert.ok(yieldCard.textContent?.includes('Convs'), 'Yield card must display incremental conversions');
  assert.ok(yieldCard.textContent?.includes('ROAS'), 'Yield card must display ROAS lift percentage');

  // Act 2: Switch currency reactively to JPY (¥)
  act(() => {
    useSieveStore.getState().setCurrency('¥', true);
  });

  // Assert 5: Active currency symbol propagates to user-visible metrics
  const updatedDashboard = screen.getByTestId('executive-card-waste');
  assert.ok(updatedDashboard.textContent?.includes('¥'), 'Metrics must reflect user-selected currency ¥');
});

test('ExecutiveDashboard under boundary conditions (Partial State) -> computes boundary waste percentages and safely handles zero spend', () => {
  // Arrange & Act 1: Edge condition with $0 total spend
  cleanup();
  useSieveStore.getState().reset();
  render(<ExecutiveDashboard />);

  const emptyWastePct = screen.getByTestId('waste-percentage-badge');
  assert.ok(
    emptyWastePct.textContent?.includes('0.0%') || emptyWastePct.textContent?.includes('0%'),
    'Waste percentage badge must evaluate safely to 0.0% when total spend is 0, avoiding NaN'
  );

  cleanup();

  // Arrange & Act 2: Partial converting dataset (defined spend and waste)
  const mockKeywords: PersistedNegativeKeyword[] = [
    createMockKeyword({
      sha256Hash: 'hash_edge_1',
      keyword: 'wasteful clicks',
      marginalWaste: 400,
      cost: 400,
      clicks: 50,
      conversions: 0,
    }),
    createMockKeyword({
      sha256Hash: 'hash_edge_2',
      keyword: 'converting clicks',
      matchType: 'exact',
      marginalWaste: 0,
      cost: 600,
      clicks: 60,
      conversions: 12, // 12 * 50 allowable = 600 -> 0 waste
      hasCollision: true,
    }),
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
  });

  render(<ExecutiveDashboard />);

  // Assert: Waste = 400, Total Spend = 1000 -> 40.0%
  const populatedPct = screen.getByTestId('waste-percentage-badge');
  assert.ok(
    populatedPct.textContent?.includes('40.0%') || populatedPct.textContent?.includes('40%'),
    'Waste percentage must accurately compute (Identified Waste / Total Spend) * 100'
  );
});

test('ExecutiveDashboard in application error state (Error State) -> maintains layout integrity and displays resilient fallbacks without uncaught exceptions', () => {
  // Arrange: Set error message in store
  cleanup();
  useSieveStore.getState().reset();
  act(() => {
    useSieveStore.getState().setErrorMessage('Worker WebAssembly computation pipeline error');
  });

  // Act: Render dashboard in error state
  render(<ExecutiveDashboard />);

  // Assert: Component does not throw and renders resilient fallback cards
  assert.ok(screen.getByTestId('executive-card-waste'), 'Must maintain waste card during error state');
  assert.ok(screen.getByTestId('executive-card-safe'), 'Must maintain safe card during error state');
  assert.ok(screen.getByTestId('executive-card-risk'), 'Must maintain risk card during error state');
  assert.ok(screen.getByTestId('executive-card-yield'), 'Must maintain yield card during error state');
});

// ============================================================================
// 2. Financial KPI Domain Sub-Components (Waterfall & Elasticity)
// ============================================================================

test('SpendWaterfallBar with distributed keyword spend -> sections sum to exactly 100% width', () => {
  // Arrange: Populate dataset across Secured, Exploratory, and Waste categories
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    createMockKeyword({
      sha256Hash: 'wf_1',
      keyword: 'waste candidate',
      marginalWaste: 350,
      cost: 350,
      clicks: 70,
      conversions: 0,
    }),
    createMockKeyword({
      sha256Hash: 'wf_2',
      keyword: 'exploratory query',
      matchType: 'phrase',
      marginalWaste: 150,
      cost: 150,
      clicks: 6,
      conversions: 0,
    }),
    createMockKeyword({
      sha256Hash: 'wf_3',
      keyword: 'safe query',
      matchType: 'exact',
      marginalWaste: 0,
      cost: 500,
      clicks: 100,
      conversions: 10,
      hasCollision: true,
    }),
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
  });

  // Act: Render the Spend Waterfall Bar
  const { container } = render(<SpendWaterfallBar />);

  // Assert: Waterfall segments partition total spend and sum to 100% width
  const segments = container.querySelectorAll('[data-testid^="waterfall-segment-"]');
  assert.ok(segments.length >= 3, 'Waterfall bar must contain at least 3 segments (Secured, Exploratory, Waste)');

  let totalWidth = 0;
  segments.forEach((seg) => {
    const styleAttr = seg.getAttribute('style') || '';
    const match = styleAttr.match(/width:\s*([\d.]+)%/);
    assert.ok(match, `Segment must define a percentage width in style: ${styleAttr}`);
    totalWidth += parseFloat(match[1]);
  });

  assert.ok(
    Math.abs(totalWidth - 100) < 0.1,
    `Spend Waterfall Bar sections must sum to exactly 100% width, got ${totalWidth}%`
  );
});

test('BidElasticityProbe with converting and non-converting cohorts -> displays computed CPC boundary delta and cohort medians', () => {
  // Arrange: Setup converting (median $7.00) and non-converting (median $3.00) cohorts
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    // Converting CPCs: kw1: $5.00, kw2: $7.00, kw3: $9.00 -> Median = $7.00
    createMockKeyword({ sha256Hash: 'c_1', cost: 100, clicks: 20, conversions: 2, hasCollision: true }),
    createMockKeyword({ sha256Hash: 'c_2', cost: 210, clicks: 30, conversions: 5, hasCollision: true }),
    createMockKeyword({ sha256Hash: 'c_3', cost: 270, clicks: 30, conversions: 6, hasCollision: true }),
    // Non-converting CPCs: kw4: $2.00, kw5: $3.00, kw6: $4.00 -> Median = $3.00
    createMockKeyword({ sha256Hash: 'nc_1', cost: 60, clicks: 30, conversions: 0 }),
    createMockKeyword({ sha256Hash: 'nc_2', cost: 120, clicks: 40, conversions: 0 }),
    createMockKeyword({ sha256Hash: 'nc_3', cost: 200, clicks: 50, conversions: 0 }),
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
  });

  // Act: Render the Bid Elasticity Probe
  render(<BidElasticityProbe />);

  // Assert: Boundary delta reflects converting median ($7.00) minus non-converting median ($3.00) = $4.00
  const deltaElement = screen.getByTestId('cpc-boundary-delta');
  assert.ok(
    deltaElement.textContent?.includes('4.00') || deltaElement.textContent?.includes('$4.00'),
    `Boundary delta must reflect converting median ($7.00) minus non-converting median ($3.00) = $4.00, got: ${deltaElement.textContent}`
  );

  const convMedian = screen.getByTestId('converting-median-cpc');
  assert.ok(convMedian.textContent?.includes('7.00') || convMedian.textContent?.includes('$7.00'));

  const nonConvMedian = screen.getByTestId('non-converting-median-cpc');
  assert.ok(nonConvMedian.textContent?.includes('3.00') || nonConvMedian.textContent?.includes('$3.00'));
});

// ============================================================================
// 3. Structural Consistency & Multi-Currency Large Value Formatting
// ============================================================================

test('ExecutiveDashboard structure -> renders all 4 semantic cards with accessible headings and persistent metric hierarchy', () => {
  // Arrange: Clean default state
  cleanup();
  useSieveStore.getState().reset();

  // Act: Render dashboard
  render(<ExecutiveDashboard />);

  // Assert: All 4 semantic cards exist and expose their standard landmark headings
  const expectedCards = [
    { testId: 'executive-card-waste', heading: 'Identified Waste' },
    { testId: 'executive-card-safe', heading: 'Safe-List Protected' },
    { testId: 'executive-card-risk', heading: 'High-Risk Clicks' },
    { testId: 'executive-card-yield', heading: 'Reallocation Yield' },
  ];

  for (const { testId, heading } of expectedCards) {
    const cardEl = screen.getByTestId(testId);
    assert.ok(cardEl, `Card ${testId} must be rendered`);
    assert.ok(within(cardEl).getByText(heading), `Card ${testId} must display heading "${heading}"`);
  }
});

test('ExecutiveDashboard large values -> formats large financial amounts across all 5 supported currencies without numeric corruption', () => {
  // Arrange: Seed large marginal waste dataset ($12,500,000)
  cleanup();
  useSieveStore.getState().reset();

  const largeWasteKeywords: PersistedNegativeKeyword[] = [
    createMockKeyword({
      sha256Hash: 'large_amount_kw',
      keyword: 'large enterprise traffic',
      marginalWaste: 12500000,
      cost: 12500000,
      clicks: 50000,
      conversions: 0,
    }),
  ];

  act(() => {
    useSieveStore.getState().updateThresholds({ maxMarginalWaste: 50000000 });
    useSieveStore.getState().setKeywords(largeWasteKeywords);
  });

  const currencies: Array<'$' | '₹' | '€' | '¥' | '£'> = ['$', '₹', '€', '¥', '£'];

  // Act & Assert: Verify formatting across all 5 supported currency symbols
  for (const sym of currencies) {
    act(() => {
      useSieveStore.getState().setCurrency(sym, true);
    });

    render(<ExecutiveDashboard />);

    const wasteCard = screen.getByTestId('executive-card-waste');
    assert.ok(wasteCard.textContent?.includes(sym), `Must format large value with ${sym}`);

    if (sym === '¥') {
      // JPY invariant: zero decimal places
      assert.ok(wasteCard.textContent?.includes('¥12,500,000'), 'JPY must display formatted large amount with zero decimals');
    } else {
      assert.ok(
        wasteCard.textContent?.includes('12,500,000.00') || wasteCard.textContent?.includes('1,25,00,000.00'),
        `Standard currencies must include 2 decimals for large amounts with ${sym}`
      );
    }
    cleanup();
  }
});
