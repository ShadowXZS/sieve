/**
 * Phase 10 - Executive Analytics Dashboard Test Suite (TDD Red Phase)
 *
 * Asserts:
 * 1. Renders all 4 semantic cards with appropriate styling and formatted active currency symbols.
 * 2. Waste percentage calculation: (Identified Waste / Total Spend) * 100 handles edge cases (e.g., $0 total spend).
 * 3. Spend Waterfall Bar sections sum to exactly 100% width.
 * 4. Bid Elasticity component computes the boundary delta between converting median CPC and non-converting median CPC.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';

import { ExecutiveDashboard } from '../../src/components/dashboard/ExecutiveDashboard.tsx';
import { SpendWaterfallBar } from '../../src/components/dashboard/SpendWaterfallBar.tsx';
import { BidElasticityProbe } from '../../src/components/dashboard/BidElasticityProbe.tsx';
import { useSieveStore } from '../../src/state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

// Viewport mocks for Happy-DOM
if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1000 });
}

test('ExecutiveDashboard: Renders all 4 semantic cards with appropriate styling and formatted active currency symbols', () => {
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'hash_waste_1',
      keyword: 'free cloud trial',
      matchType: 'broad',
      formattedRule: 'free cloud trial',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 1500,
      cost: 1500,
      clicks: 100,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'hash_safe_1',
      keyword: 'enterprise software license',
      matchType: 'exact',
      formattedRule: '[enterprise software license]',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 0,
      cost: 500,
      clicks: 80,
      conversions: 10,
      hasCollision: true,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'hash_risk_1',
      keyword: 'cheap cloud db',
      matchType: 'phrase',
      formattedRule: '"cheap cloud db"',
      platform: 1,
      confidenceScore: 0.82,
      marginalWaste: 200,
      cost: 200,
      clicks: 4,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
    useSieveStore.getState().setCurrency('$', true);
  });

  const { container } = render(<ExecutiveDashboard />);

  // 1. Semantic card 1: Rose/Red (Identified Waste Bleed)
  const wasteCard = container.querySelector('[data-testid="executive-card-waste"]');
  assert.ok(wasteCard, 'Must render Identified Waste semantic card');
  assert.ok(
    wasteCard.className.includes('rose') || wasteCard.innerHTML.includes('rose'),
    'Waste card must apply rose color tokens'
  );
  assert.ok(wasteCard.textContent?.includes('$1,500.00') || wasteCard.textContent?.includes('$1,700.00'), 'Waste card must format value with $');

  // 2. Semantic card 2: Emerald/Green (Safe-List Protected)
  const safeCard = container.querySelector('[data-testid="executive-card-safe"]');
  assert.ok(safeCard, 'Must render Safe-List Protected semantic card');
  assert.ok(
    safeCard.className.includes('emerald') || safeCard.innerHTML.includes('emerald'),
    'Safe card must apply emerald color tokens'
  );
  assert.ok(safeCard.textContent?.includes('Convs') || safeCard.textContent?.includes('Protected'), 'Safe card must indicate protected conversions');

  // 3. Semantic card 3: Amber/Orange (Exploratory Risk / Elasticity)
  const riskCard = container.querySelector('[data-testid="executive-card-risk"]');
  assert.ok(riskCard, 'Must render Exploratory High-Risk semantic card');
  assert.ok(
    riskCard.className.includes('amber') || riskCard.innerHTML.includes('amber'),
    'Risk card must apply amber color tokens'
  );

  // 4. Semantic card 4: Indigo/Slate (Capital Reallocation Yield)
  const yieldCard = container.querySelector('[data-testid="executive-card-yield"]');
  assert.ok(yieldCard, 'Must render Reallocation Yield semantic card');
  assert.ok(
    yieldCard.className.includes('indigo') || yieldCard.innerHTML.includes('indigo'),
    'Yield card must apply indigo color tokens'
  );

  // Switch currency to JPY and verify symbol formatting
  act(() => {
    useSieveStore.getState().setCurrency('¥', true);
  });

  const jpyText = container.textContent || '';
  assert.ok(jpyText.includes('¥'), 'Must format metrics with active JPY symbol ¥');
});

test('ExecutiveDashboard: Waste percentage calculation handles edge cases (e.g. $0 total spend)', () => {
  cleanup();
  useSieveStore.getState().reset();

  // Edge Case 1: Empty dataset ($0 total spend)
  const { container: emptyContainer } = render(<ExecutiveDashboard />);
  const emptyWastePct = emptyContainer.querySelector('[data-testid="waste-percentage-badge"]');
  assert.ok(emptyWastePct, 'Must render waste percentage element even with $0 spend');
  assert.ok(
    emptyWastePct.textContent?.includes('0.0%') || emptyWastePct.textContent?.includes('0%'),
    'Waste percentage must safely evaluate to 0% when total spend is 0, avoiding NaN and Infinity'
  );

  cleanup();

  // Edge Case 2: Defined spend and waste
  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'hash_edge_1',
      keyword: 'wasteful clicks',
      matchType: 'broad',
      formattedRule: 'wasteful clicks',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 400,
      cost: 400,
      clicks: 50,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'hash_edge_2',
      keyword: 'converting clicks',
      matchType: 'exact',
      formattedRule: '[converting clicks]',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 0,
      cost: 600,
      clicks: 60,
      conversions: 12, // 12 * 50 = 600 allowable -> 0 waste
      hasCollision: true,
      createdAt: Date.now(),
    },
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
  });

  const { container: populatedContainer } = render(<ExecutiveDashboard />);
  const populatedPct = populatedContainer.querySelector('[data-testid="waste-percentage-badge"]');
  assert.ok(populatedPct, 'Must render waste percentage badge');
  // Waste = 400, Total Spend = 1000 -> 40.0%
  assert.ok(
    populatedPct.textContent?.includes('40.0%') || populatedPct.textContent?.includes('40%'),
    'Waste percentage must accurately compute (Identified Waste / Total Spend) * 100'
  );
});

test('SpendWaterfallBar: Sections sum to exactly 100% width', () => {
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'wf_1',
      keyword: 'waste candidate',
      matchType: 'broad',
      formattedRule: 'waste candidate',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 350,
      cost: 350,
      clicks: 70,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'wf_2',
      keyword: 'exploratory query',
      matchType: 'phrase',
      formattedRule: '"exploratory query"',
      platform: 1,
      confidenceScore: 0.85,
      marginalWaste: 150,
      cost: 150,
      clicks: 6,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'wf_3',
      keyword: 'safe query',
      matchType: 'exact',
      formattedRule: '[safe query]',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 0,
      cost: 500,
      clicks: 100,
      conversions: 10,
      hasCollision: true,
      createdAt: Date.now(),
    },
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
  });

  const { container } = render(<SpendWaterfallBar />);

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

test('BidElasticityProbe: Computes the boundary delta between converting median CPC and non-converting median CPC', () => {
  cleanup();
  useSieveStore.getState().reset();

  // Converting CPCs:
  // kw1: cost 100, clicks 20 -> CPC 5.0 (converting)
  // kw2: cost 210, clicks 30 -> CPC 7.0 (converting)
  // kw3: cost 270, clicks 30 -> CPC 9.0 (converting)
  // Converting median CPC = 7.0

  // Non-converting CPCs:
  // kw4: cost 60, clicks 30 -> CPC 2.0 (non-converting)
  // kw5: cost 120, clicks 40 -> CPC 3.0 (non-converting)
  // kw6: cost 200, clicks 50 -> CPC 4.0 (non-converting)
  // Non-converting median CPC = 3.0

  // Expected boundary delta = 7.0 - 3.0 = 4.0
  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'c_1',
      keyword: 'conv 1',
      matchType: 'exact',
      formattedRule: '[conv 1]',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 0,
      cost: 100,
      clicks: 20,
      conversions: 2,
      hasCollision: true,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'c_2',
      keyword: 'conv 2',
      matchType: 'exact',
      formattedRule: '[conv 2]',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 0,
      cost: 210,
      clicks: 30,
      conversions: 5,
      hasCollision: true,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'c_3',
      keyword: 'conv 3',
      matchType: 'exact',
      formattedRule: '[conv 3]',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 0,
      cost: 270,
      clicks: 30,
      conversions: 6,
      hasCollision: true,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'nc_1',
      keyword: 'non conv 1',
      matchType: 'broad',
      formattedRule: 'non conv 1',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 60,
      cost: 60,
      clicks: 30,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'nc_2',
      keyword: 'non conv 2',
      matchType: 'broad',
      formattedRule: 'non conv 2',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 120,
      cost: 120,
      clicks: 40,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'nc_3',
      keyword: 'non conv 3',
      matchType: 'broad',
      formattedRule: 'non conv 3',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 200,
      cost: 200,
      clicks: 50,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
  });

  const { container } = render(<BidElasticityProbe />);

  // Assert presence of boundary delta calculation readout
  const deltaElement = container.querySelector('[data-testid="cpc-boundary-delta"]');
  assert.ok(deltaElement, 'BidElasticityProbe must display CPC boundary delta element');
  assert.ok(
    deltaElement.textContent?.includes('4.00') || deltaElement.textContent?.includes('$4.00'),
    `Boundary delta must reflect converting median ($7.00) minus non-converting median ($3.00) = $4.00, got: ${deltaElement.textContent}`
  );

  // Assert converting and non-converting medians are visible
  const convMedian = container.querySelector('[data-testid="converting-median-cpc"]');
  assert.ok(convMedian, 'Must display converting median CPC');
  assert.ok(convMedian.textContent?.includes('7.00') || convMedian.textContent?.includes('$7.00'));

  const nonConvMedian = container.querySelector('[data-testid="non-converting-median-cpc"]');
  assert.ok(nonConvMedian, 'Must display non-converting median CPC');
  assert.ok(nonConvMedian.textContent?.includes('3.00') || nonConvMedian.textContent?.includes('$3.00'));
});

test('ExecutiveDashboard (Refactor & Polish): Uniform card heights and baseline alignment', () => {
  cleanup();
  useSieveStore.getState().reset();

  const { container } = render(<ExecutiveDashboard />);
  const gridContainer = container.firstElementChild as HTMLElement;

  assert.ok(gridContainer.className.includes('grid-cols-2 lg:grid-cols-4'));
  const cards = Array.from(gridContainer.children) as HTMLElement[];
  assert.strictEqual(cards.length, 4);

  // Assert uniform height and flex baseline rhythm across all 4 cards
  cards.forEach((card, idx) => {
    assert.ok(
      card.className.includes('h-full') && card.className.includes('flex flex-col justify-between'),
      `Card ${idx + 1} must enforce matching h-full flex flex-col justify-between for baseline alignment`
    );
  });
});

test('ExecutiveDashboard (Refactor & Polish): Zero text overflow and large amount formatting across all 5 currencies', () => {
  cleanup();
  useSieveStore.getState().reset();

  const largeWasteKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'large_amount_kw',
      keyword: 'large enterprise traffic',
      matchType: 'broad',
      formattedRule: 'large enterprise traffic',
      platform: 1,
      confidenceScore: 0.98,
      marginalWaste: 12500000,
      cost: 12500000,
      clicks: 50000,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  act(() => {
    useSieveStore.getState().updateThresholds({ maxMarginalWaste: 50000000 });
    useSieveStore.getState().setKeywords(largeWasteKeywords);
  });

  const currencies: Array<'$' | '₹' | '€' | '¥' | '£'> = ['$', '₹', '€', '¥', '£'];

  for (const sym of currencies) {
    act(() => {
      useSieveStore.getState().setCurrency(sym, true);
    });

    const { container } = render(<ExecutiveDashboard />);
    const wasteValue = container.querySelector('.text-2xl.font-bold.font-mono.tabular-nums');
    assert.ok(wasteValue, `Must render primary metric for ${sym}`);
    assert.ok(wasteValue.textContent?.includes(sym), `Must format large value with ${sym}`);

    if (sym === '¥') {
      assert.ok(!wasteValue.textContent?.includes('.'), 'JPY must not include decimals on large amounts');
      assert.ok(wasteValue.textContent?.includes('¥12,500,000'));
    } else {
      assert.ok(wasteValue.textContent?.includes('12,500,000.00') || wasteValue.textContent?.includes('1,25,00,000.00'));
    }
    cleanup();
  }
});

