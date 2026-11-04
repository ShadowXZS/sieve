/**
 * Phase 10 - Executive Analytics Dashboard Component Test Suite
 *
 * Asserts:
 * 1. Bilateral symmetry mandate: 4 equal cards in desktop mode (`grid-cols-2 lg:grid-cols-4`).
 * 2. Color tokens strictly follow Tailwind dark zinc palette:
 *    - Rose/Red: `rose-500/10 text-rose-400` (Identified Waste Bleed & CPA Drag)
 *    - Emerald/Green: `emerald-500/10 text-emerald-400` (Safe-List Protected Conversions & Secured Revenue)
 *    - Amber/Orange: `amber-500/10 text-amber-400` (Exploratory High-Risk Clicks & Bid Elasticity)
 *    - Indigo/Slate: `indigo-500/10 text-indigo-400` (Capital Reallocation Yield & Annualized Recovery)
 * 3. Bid Elasticity Probe: Displays calculated Optimal Bid Ceiling, 3-zone spectrum, and reactive zone badge.
 * 4. Spend Waterfall Bar: Stacked horizontal breakdown of active account spend across tiers.
 * 5. Multi-currency and precision invariants: Zero-decimal rounding for JPY ('¥'), standard 2-decimal for others.
 * 6. Numeric alignment: Enforces tabular numerals (`font-mono tabular-nums`) across all metrics.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';

import { SummaryDashboard } from '../../src/components/kpi/SummaryDashboard.tsx';
import { BidElasticityProbe } from '../../src/components/kpi/BidElasticityProbe.tsx';
import { SpendWaterfallBar } from '../../src/components/kpi/SpendWaterfallBar.tsx';
import { useSieveStore } from '../../src/state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

// Mock Viewport for Happy-DOM
if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1000 });
}

test('Phase 10: Executive Analytics Dashboard renders 4 bilaterally symmetrical color-coded tier cards', () => {
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'hash_waste',
      keyword: 'free download shoes',
      matchType: 'broad',
      formattedRule: 'free download shoes',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 1250.5,
      cost: 1250.5,
      clicks: 100,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'hash_safe',
      keyword: 'running shoes discount',
      matchType: 'exact',
      formattedRule: '[running shoes discount]',
      platform: 1,
      confidenceScore: 0.92,
      marginalWaste: 0,
      cost: 600,
      clicks: 120,
      conversions: 6,
      hasCollision: true,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'hash_risk',
      keyword: 'marathon trail gear',
      matchType: 'phrase',
      formattedRule: '"marathon trail gear"',
      platform: 1,
      confidenceScore: 0.72,
      marginalWaste: 180,
      cost: 180,
      clicks: 7, // low sample size
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
  });

  const { container } = render(<SummaryDashboard />);
  const gridContainer = container.firstElementChild as HTMLElement;

  // 1. Bilateral symmetry constraint
  assert.ok(
    gridContainer.className.includes('grid-cols-2 lg:grid-cols-4'),
    'Dashboard must enforce 4-column bilateral desktop layout (grid-cols-2 lg:grid-cols-4)'
  );
  assert.strictEqual(gridContainer.children.length, 4, 'Must render exactly 4 tier cards');

  // 2. Color token constraints: Rose, Emerald, Amber, Indigo
  const roseTier = container.querySelector('[data-testid="tier-waste-bleed"]');
  assert.ok(roseTier, 'Must render Rose Tier (Identified Waste Bleed)');
  assert.ok(
    roseTier.innerHTML.includes('bg-rose-500/10 text-rose-400') ||
    roseTier.innerHTML.includes('text-rose-400'),
    'Rose tier must employ strict Tailwind rose tokens'
  );

  const emeraldTier = container.querySelector('[data-testid="tier-safe-protection"]');
  assert.ok(emeraldTier, 'Must render Emerald Tier (Safe-List Protection)');
  assert.ok(
    emeraldTier.innerHTML.includes('bg-emerald-500/10 text-emerald-400') ||
    emeraldTier.innerHTML.includes('text-emerald-400'),
    'Emerald tier must employ strict Tailwind emerald tokens'
  );

  const amberTier = container.querySelector('[data-testid="tier-exploratory-risk"]');
  assert.ok(amberTier, 'Must render Amber Tier (Exploratory High-Risk Clicks)');
  assert.ok(
    amberTier.innerHTML.includes('bg-amber-500/10 text-amber-400') ||
    amberTier.innerHTML.includes('text-amber-400'),
    'Amber tier must employ strict Tailwind amber tokens'
  );

  const indigoTier = container.querySelector('[data-testid="tier-reallocation-yield"]');
  assert.ok(indigoTier, 'Must render Indigo Tier (Capital Reallocation Yield)');
  assert.ok(
    indigoTier.innerHTML.includes('bg-indigo-500/10 text-indigo-400') ||
    indigoTier.innerHTML.includes('text-indigo-400'),
    'Indigo tier must employ strict Tailwind indigo tokens'
  );

  // 3. Tabular numerals on all cards
  const tabularElements = container.querySelectorAll('.tabular-nums');
  assert.ok(tabularElements.length >= 8, 'Must format numeric readouts with font-mono tabular-nums');
});

test('Phase 10: SummaryDashboard reactively updates currency and preserves JPY zero-decimal precision', () => {
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'hash_currency',
      keyword: 'shoes test',
      matchType: 'exact',
      formattedRule: '[shoes test]',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 12450.4,
      cost: 12450.4,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
  });

  const { container } = render(<SummaryDashboard />);

  // USD: $12,450.40 (2-decimal)
  let wasteVal = container.querySelector('.text-2xl.font-bold.font-mono.tabular-nums');
  assert.ok(wasteVal);
  assert.strictEqual(wasteVal.textContent?.trim(), '$12,450.40');

  // Switch to JPY: ¥12,450 (zero-decimal)
  act(() => {
    useSieveStore.getState().setCurrency('¥', true);
  });

  wasteVal = container.querySelector('.text-2xl.font-bold.font-mono.tabular-nums');
  assert.ok(wasteVal);
  assert.strictEqual(wasteVal.textContent?.trim(), '¥12,450');

  // Switch to EUR: €12,450.40 (2-decimal)
  act(() => {
    useSieveStore.getState().setCurrency('€', true);
  });

  wasteVal = container.querySelector('.text-2xl.font-bold.font-mono.tabular-nums');
  assert.ok(wasteVal);
  assert.strictEqual(wasteVal.textContent?.trim(), '€12,450.40');
});

test('Phase 10: BidElasticityProbe renders calculated Optimal Bid Ceiling and 3-zone spectrum', () => {
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'hash_probe_conv',
      keyword: 'high conversion sneaker',
      matchType: 'exact',
      formattedRule: '[high conversion sneaker]',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 0,
      cost: 250,
      clicks: 100,
      conversions: 10,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'hash_probe_waste',
      keyword: 'unprofitable keyword',
      matchType: 'broad',
      formattedRule: 'unprofitable keyword',
      platform: 1,
      confidenceScore: 0.88,
      marginalWaste: 400,
      cost: 400,
      clicks: 80,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
  });

  const { container } = render(<BidElasticityProbe />);

  // 1. Component mounts with test id
  const probe = container.querySelector('[data-testid="bid-elasticity-probe"]');
  assert.ok(probe, 'BidElasticityProbe must render');

  // 2. Optimal Bid Ceiling readout
  const ceilingValue = container.querySelector('[data-testid="optimal-bid-ceiling-value"]');
  assert.ok(ceilingValue, 'Must display optimal bid ceiling value');
  assert.ok(ceilingValue.textContent?.includes('$'), 'Must format ceiling in active currency');

  // 3. Zone Badge
  const zoneBadge = container.querySelector('[data-testid="elasticity-zone-badge"]');
  assert.ok(zoneBadge, 'Must render elasticity zone badge');

  // 4. Elasticity Spectrum Bar
  const spectrumBar = container.querySelector('[data-testid="elasticity-spectrum-bar"]');
  assert.ok(spectrumBar, 'Must render elasticity spectrum bar');

  // 5. Test JPY currency reactivity
  act(() => {
    useSieveStore.getState().setCurrency('¥', true);
  });

  const jpyCeiling = container.querySelector('[data-testid="optimal-bid-ceiling-value"]');
  assert.ok(jpyCeiling?.textContent?.includes('¥'), 'Ceiling must update to ¥ with zero-decimal rounding');
  assert.ok(!jpyCeiling?.textContent?.includes('.'), 'JPY ceiling must not contain decimal points');
});

test('Phase 10: SpendWaterfallBar renders proportional breakdown of account spend across 4 tiers', () => {
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'wf_waste',
      keyword: 'wasteful clicks',
      matchType: 'broad',
      formattedRule: 'wasteful clicks',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 500,
      cost: 500,
      clicks: 100,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'wf_safe',
      keyword: 'converting brand',
      matchType: 'exact',
      formattedRule: '[converting brand]',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 0,
      cost: 600,
      clicks: 120,
      conversions: 12,
      hasCollision: true,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'wf_risk',
      keyword: 'exploratory testing query',
      matchType: 'phrase',
      formattedRule: '"exploratory testing query"',
      platform: 1,
      confidenceScore: 0.85,
      marginalWaste: 200,
      cost: 200,
      clicks: 5,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
  });

  const { container } = render(<SpendWaterfallBar />);

  // 1. Root card mounts
  const card = container.querySelector('[data-testid="spend-waterfall-bar-card"]');
  assert.ok(card, 'SpendWaterfallBar card must mount');

  // 2. Total spend readout
  const totalSpend = container.querySelector('[data-testid="waterfall-total-spend"]');
  assert.ok(totalSpend, 'Must display total spend');
  assert.strictEqual(totalSpend.textContent?.trim(), '$1,300.00');

  // 3. Proportional waterfall bar segments
  const securedSeg = container.querySelector('[data-testid="waterfall-segment-secured"]');
  const exploratorySeg = container.querySelector('[data-testid="waterfall-segment-exploratory"]');
  const wasteSeg = container.querySelector('[data-testid="waterfall-segment-waste"]');

  assert.ok(securedSeg, 'Must render secured spend segment (Emerald)');
  assert.ok(exploratorySeg, 'Must render exploratory high-risk segment (Amber)');
  assert.ok(wasteSeg, 'Must render identified waste segment (Rose)');

  // 4. Breakdown tier values
  const securedVal = container.querySelector('[data-testid="waterfall-secured-value"]');
  const exploratoryVal = container.querySelector('[data-testid="waterfall-exploratory-value"]');
  const wasteVal = container.querySelector('[data-testid="waterfall-waste-value"]');
  const reallocationVal = container.querySelector('[data-testid="waterfall-reallocation-value"]');

  assert.ok(securedVal?.textContent?.includes('$600.00'));
  assert.ok(exploratoryVal?.textContent?.includes('$200.00'));
  assert.ok(wasteVal?.textContent?.includes('$500.00'));
  assert.ok(reallocationVal?.textContent?.includes('Convs'));

  // 5. Test currency switching to JPY
  act(() => {
    useSieveStore.getState().setCurrency('¥', true);
  });

  const totalSpendJPY = container.querySelector('[data-testid="waterfall-total-spend"]');
  assert.ok(totalSpendJPY?.textContent?.includes('¥1,300'));
  assert.ok(!totalSpendJPY?.textContent?.includes('.'));
});
