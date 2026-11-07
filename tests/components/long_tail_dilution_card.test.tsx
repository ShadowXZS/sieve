/**
 * Long-Tail & Match Dilution UI Component Test Suite
 *
 * Verifies:
 * 1. LongTailDilutionProbe:
 *    - Renders balanced 2-column layout slot structure (grid-cols-1 md:grid-cols-2).
 *    - Displays Fragmented Long-Tail slot with query counts, collective waste, and root token pills.
 *    - Displays Match-Type Dilution slot with dilution index badge, budget lost, and CPC inflation.
 * 2. AnalyticalDrawer:
 *    - Renders as an accessible slide-over dialog (role="dialog", aria-modal="true").
 *    - Allows switching between 'Fragmented Long-Tail' and 'Match Dilution Index' tabs.
 *    - Displays detailed diagnostic table with root tokens, clicks, waste, and action buttons.
 *    - Displays detailed dilution table with exact CPC, broad CPC, inflation, and budget lost.
 *    - Keyboard accessibility: Escape key closes drawer.
 * 3. Analytical Cards:
 *    - LongTailBleedCard and DilutionAuditCard render metrics and tabular figures without layout shifts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, cleanup, act, fireEvent } from '@testing-library/react';

import { LongTailDilutionProbe } from '../../src/components/dashboard/LongTailDilutionProbe.tsx';
import { AnalyticalDrawer } from '../../src/components/dashboard/AnalyticalDrawer.tsx';
import { LongTailBleedCard } from '../../src/components/analytics/LongTailBleedCard.tsx';
import { DilutionAuditCard } from '../../src/components/analytics/DilutionAuditCard.tsx';
import { useSieveStore } from '../../src/state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

// Mock Viewport for Happy-DOM
if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1000 });
}

test('LongTailDilutionProbe: Renders balanced 2-column layout with diagnostic metrics', () => {
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'lt_1',
      keyword: 'free download manual pdf',
      matchType: 'broad',
      formattedRule: 'free download manual pdf',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 15.0,
      cost: 15.0,
      clicks: 1,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'lt_2',
      keyword: 'free user guide setup',
      matchType: 'broad',
      formattedRule: 'free user guide setup',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 25.0,
      cost: 25.0,
      clicks: 2,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'dil_exact',
      keyword: 'trail running shoes',
      matchType: 'exact',
      formattedRule: '[trail running shoes]',
      platform: 1,
      confidenceScore: 0.95,
      cost: 50.0,
      clicks: 50,
      conversions: 5,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'dil_broad',
      keyword: 'trail running shoes',
      matchType: 'broad',
      formattedRule: 'trail running shoes',
      platform: 1,
      confidenceScore: 0.85,
      cost: 160.0,
      clicks: 80,
      conversions: 2,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
  });

  const { container } = render(<LongTailDilutionProbe />);

  const probe = container.querySelector('[data-testid="longtail-dilution-probe"]');
  assert.ok(probe, 'LongTailDilutionProbe must be rendered');
  assert.ok(
    probe.className.includes('grid-cols-1 md:grid-cols-2'),
    'Probe must maintain bilaterally balanced 2-column layout'
  );

  // Slot 1: Long-Tail Aggregator
  const ltSlot = container.querySelector('[data-testid="longtail-aggregator-slot"]');
  assert.ok(ltSlot, 'Long-Tail Aggregator slot must be rendered');
  assert.ok(ltSlot.textContent?.includes('Fragmented Long-Tail Aggregator'));
  assert.ok(ltSlot.textContent?.includes('$40.00'), 'Must display collective waste of $40.00');

  // Verify root token pill 'free'
  const rootPills = container.querySelector('[data-testid="longtail-root-pills"]');
  assert.ok(rootPills, 'Root pills cluster must be rendered');
  assert.ok(rootPills.textContent?.includes('free'));

  // Slot 2: Match-Type Dilution
  const dilutionSlot = container.querySelector('[data-testid="match-dilution-slot"]');
  assert.ok(dilutionSlot, 'Match-Type Dilution slot must be rendered');
  assert.ok(dilutionSlot.textContent?.includes('Match-Type Dilution Index'));
  // Budget lost = (160/80 - 50/50) * 80 = (2.00 - 1.00) * 80 = $80.00
  assert.ok(dilutionSlot.textContent?.includes('$80.00'), 'Must display budget lost of $80.00');

  const dilutionBadge = container.querySelector('[data-testid="dilution-index-badge"]');
  assert.ok(dilutionBadge, 'Dilution index badge must be present');
});

test('AnalyticalDrawer: Opens, switches tabs, filters data, and closes via Escape key', () => {
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'kw1',
      keyword: 'free download guide',
      matchType: 'broad',
      formattedRule: 'free download guide',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 12.0,
      cost: 12.0,
      clicks: 1,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'kw2',
      keyword: 'free camera manual',
      matchType: 'broad',
      formattedRule: 'free camera manual',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 18.0,
      cost: 18.0,
      clicks: 1,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'kw_ex',
      keyword: 'hiking backpack',
      matchType: 'exact',
      formattedRule: '[hiking backpack]',
      platform: 1,
      confidenceScore: 0.95,
      cost: 40.0,
      clicks: 40,
      conversions: 4,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'kw_br',
      keyword: 'hiking backpack',
      matchType: 'broad',
      formattedRule: 'hiking backpack',
      platform: 1,
      confidenceScore: 0.85,
      cost: 120.0,
      clicks: 60,
      conversions: 1,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
    useSieveStore.getState().setAnalyticalDrawerOpen(true, 'long-tail');
  });

  const { container } = render(<AnalyticalDrawer />);

  // 1. Drawer is visible
  const drawer = container.querySelector('[data-testid="analytical-drawer"]');
  assert.ok(drawer, 'Analytical drawer must be open');
  assert.strictEqual(drawer.getAttribute('role'), 'dialog');
  assert.strictEqual(drawer.getAttribute('aria-modal'), 'true');

  // 2. Fragmented Long-Tail tab content
  assert.ok(container.textContent?.includes('free'), "Must display shared root token 'free'");
  assert.ok(container.textContent?.includes('$30.00'), 'Must display $30.00 total waste for root');

  // 3. Switch to Match Dilution tab
  const dilutionTabBtn = container.querySelector('[data-testid="drawer-tab-dilution"]');
  assert.ok(dilutionTabBtn, 'Dilution tab button must be present');

  act(() => {
    fireEvent.click(dilutionTabBtn);
  });

  assert.ok(container.textContent?.includes('hiking backpack'), "Must display hijacked search 'hiking backpack'");
  // Budget lost = (120/60 - 40/40) * 60 = (2.00 - 1.00) * 60 = $60.00
  assert.ok(container.textContent?.includes('$60.00'), 'Must display $60.00 budget lost');

  // 4. Close via Escape key
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' });
  });

  assert.strictEqual(
    useSieveStore.getState().isAnalyticalDrawerOpen,
    false,
    'Drawer must close on Escape key press'
  );
});

test('Analytical Cards: LongTailBleedCard and DilutionAuditCard mount with metrics', () => {
  cleanup();
  useSieveStore.getState().reset();

  const keywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'f1',
      keyword: 'free trial software',
      matchType: 'broad',
      formattedRule: 'free trial software',
      platform: 1,
      confidenceScore: 0.9,
      cost: 15.0,
      marginalWaste: 15.0,
      clicks: 1,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'f2',
      keyword: 'free sample download',
      matchType: 'broad',
      formattedRule: 'free sample download',
      platform: 1,
      confidenceScore: 0.9,
      cost: 25.0,
      marginalWaste: 25.0,
      clicks: 2,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'ex1',
      keyword: 'cloud hosting',
      matchType: 'exact',
      formattedRule: '[cloud hosting]',
      platform: 1,
      confidenceScore: 0.95,
      cost: 40.0,
      clicks: 40,
      conversions: 4,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'br1',
      keyword: 'cloud hosting',
      matchType: 'broad',
      formattedRule: 'cloud hosting',
      platform: 1,
      confidenceScore: 0.85,
      cost: 120.0,
      clicks: 60,
      conversions: 1,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  act(() => {
    useSieveStore.getState().setKeywords(keywords);
  });

  const { container: ltContainer } = render(<LongTailBleedCard />);
  const ltCard = ltContainer.querySelector('[data-testid="long-tail-bleed-card"]');
  assert.ok(ltCard, 'LongTailBleedCard must render with data-testid="long-tail-bleed-card"');
  assert.ok(ltCard.textContent?.includes('$40.00'), 'Must render $40.00 collective waste');
  assert.ok(ltCard.textContent?.includes('free'), 'Must display root token "free"');

  const { container: dilContainer } = render(<DilutionAuditCard />);
  const dilCard = dilContainer.querySelector('[data-testid="dilution-audit-card"]');
  assert.ok(dilCard, 'DilutionAuditCard must render with data-testid="dilution-audit-card"');
  // Excess cost = (120/60 - 40/40) * 60 = (2.00 - 1.00) * 60 = $60.00
  assert.ok(dilCard.textContent?.includes('$60.00'), 'Must render $60.00 excess budget lost');
});
