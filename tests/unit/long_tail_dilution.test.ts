/**
 * Phase 11 TDD Test Suite: Long-Tail & Match Dilution
 *
 * Mandatory Assertions:
 * 1. Ingestion of 1,000 queries each with 1 click and $3 spend (total $3,000)
 *    sharing the root token "free" aggregates into a single high-priority waste candidate ($3,000 waste).
 * 2. Dilution index accurately isolates queries matching exact keywords and computes
 *    excess cost: sum((Broad CPC - Exact CPC) * Clicks).
 * 3. Component integration tests for LongTailBleedCard and DilutionAuditCard with
 *    matching padding, semantic tiers, and tabular figures.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';

import { LongTailBleedCard } from '../../src/components/analytics/LongTailBleedCard.tsx';
import { DilutionAuditCard } from '../../src/components/analytics/DilutionAuditCard.tsx';
import {
  computeFragmentedLongTail,
  computeMatchTypeDilution,
} from '../../src/utils/executiveAnalytics.ts';
import { useSieveStore } from '../../src/state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

test('TDD Red Phase: Ingestion of 1,000 queries each with 1 click and $3 spend sharing "free" aggregates into $3,000 waste candidate', () => {
  cleanup();
  useSieveStore.getState().reset();

  // Generate 1,000 fragmented long-tail queries each with 1 click and $3 spend
  // Queries share the root token "free": "free download 1", "free sample 2", etc.
  const keywords: PersistedNegativeKeyword[] = [];
  for (let i = 0; i < 1000; i++) {
    keywords.push({
      sha256Hash: `hash_free_${i}`,
      keyword: `free query variation ${i}`,
      matchType: 'broad',
      formattedRule: `free query variation ${i}`,
      platform: 1,
      confidenceScore: 0.9,
      cost: 3.0,
      marginalWaste: 3.0,
      clicks: 1,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now() - i * 10,
    });
  }

  // Add 1 high-volume query (50 clicks) which must NOT be treated as long-tail
  keywords.push({
    sha256Hash: 'high_vol_converting',
    keyword: 'enterprise converting license',
    matchType: 'exact',
    formattedRule: '[enterprise converting license]',
    platform: 1,
    confidenceScore: 0.95,
    cost: 150.0,
    marginalWaste: 0,
    clicks: 50,
    conversions: 5,
    hasCollision: false,
    createdAt: Date.now(),
  });

  const result = computeFragmentedLongTail(keywords, 50, '$');

  // Verify total long-tail queries and collective spend
  assert.strictEqual(result.total_long_tail_queries, 1000, 'Must record exactly 1,000 long-tail queries');
  assert.strictEqual(result.total_long_tail_clicks, 1000, 'Must record exactly 1,000 clicks');
  assert.strictEqual(result.total_long_tail_waste, 3000.0, 'Must record exactly $3,000.00 total waste');

  // Root token "free" must aggregate all 1,000 queries into a single high-priority waste candidate ($3,000 waste)
  const freeToken = result.root_tokens.find((t) => t.token === 'free');
  assert.ok(freeToken, 'Root token "free" must be identified');
  assert.strictEqual(freeToken.query_count, 1000, 'Root token "free" must aggregate all 1,000 queries');
  assert.strictEqual(freeToken.total_clicks, 1000, 'Root token "free" must aggregate 1,000 clicks');
  assert.strictEqual(freeToken.waste, 3000.0, 'Root token "free" must aggregate $3,000.00 in waste');
});

test('TDD Red Phase: Dilution index accurately isolates queries matching exact keywords and computes excess cost', () => {
  cleanup();
  useSieveStore.getState().reset();

  const keywords: PersistedNegativeKeyword[] = [
    // 1. Exact benchmark for "running shoes": CPC = $1.20 (50 clicks, $60 cost)
    {
      sha256Hash: 'exact_running_shoes',
      keyword: 'running shoes',
      matchType: 'exact',
      formattedRule: '[running shoes]',
      platform: 1,
      confidenceScore: 0.95,
      cost: 60.0,
      clicks: 50,
      conversions: 5,
      hasCollision: false,
      createdAt: Date.now(),
    },
    // Broad match capturing "running shoes" at $2.50 CPC (80 clicks, $200 cost)
    // Excess cost = (2.50 - 1.20) * 80 = $104.00
    {
      sha256Hash: 'broad_running_shoes',
      keyword: 'running shoes',
      matchType: 'broad',
      formattedRule: 'running shoes',
      platform: 1,
      confidenceScore: 0.85,
      cost: 200.0,
      clicks: 80,
      conversions: 2,
      hasCollision: false,
      createdAt: Date.now(),
    },
    // 2. Exact benchmark for "winter coat": CPC = $2.00 (40 clicks, $80 cost)
    {
      sha256Hash: 'exact_winter_coat',
      keyword: 'winter coat',
      matchType: 'exact',
      formattedRule: '[winter coat]',
      platform: 1,
      confidenceScore: 0.92,
      cost: 80.0,
      clicks: 40,
      conversions: 4,
      hasCollision: false,
      createdAt: Date.now(),
    },
    // Broad match capturing "winter coat" at $3.50 CPC (60 clicks, $210 cost)
    // Excess cost = (3.50 - 2.00) * 60 = $90.00
    {
      sha256Hash: 'broad_winter_coat',
      keyword: 'winter coat',
      matchType: 'broad',
      formattedRule: 'winter coat',
      platform: 1,
      confidenceScore: 0.8,
      cost: 210.0,
      clicks: 60,
      conversions: 1,
      hasCollision: false,
      createdAt: Date.now(),
    },
    // 3. Broad query matching "thermal gloves" without exact benchmark -> NOT diluted
    {
      sha256Hash: 'broad_thermal_gloves',
      keyword: 'thermal gloves',
      matchType: 'broad',
      formattedRule: 'thermal gloves',
      platform: 1,
      confidenceScore: 0.7,
      cost: 50.0,
      clicks: 25,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  const result = computeMatchTypeDilution(keywords, '$');

  // Sum of excess cost: $104.00 + $90.00 = $194.00
  assert.strictEqual(result.diluted_queries_count, 2, 'Exactly 2 diluted queries must be isolated');
  assert.strictEqual(result.total_diluted_clicks, 140, 'Total diluted clicks = 80 + 60 = 140');
  assert.strictEqual(result.budget_lost, 194.0, 'Excess cost sum must equal $194.00');

  const runningShoes = result.items.find((i) => i.query === 'running shoes');
  assert.ok(runningShoes, '"running shoes" must be isolated as diluted');
  assert.strictEqual(runningShoes.exact_cpc, 1.2);
  assert.strictEqual(runningShoes.broad_cpc, 2.5);
  assert.strictEqual(runningShoes.budget_lost, 104.0);
  assert.strictEqual(runningShoes.cpc_inflation_ratio, 2.08);

  const winterCoat = result.items.find((i) => i.query === 'winter coat');
  assert.ok(winterCoat, '"winter coat" must be isolated as diluted');
  assert.strictEqual(winterCoat.exact_cpc, 2.0);
  assert.strictEqual(winterCoat.broad_cpc, 3.5);
  assert.strictEqual(winterCoat.budget_lost, 90.0);
  assert.strictEqual(winterCoat.cpc_inflation_ratio, 1.75);
});

test('TDD Red Phase: LongTailBleedCard and DilutionAuditCard render UI metrics with tabular figures', () => {
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

  // Test LongTailBleedCard rendering
  const { container: ltContainer } = render(React.createElement(LongTailBleedCard, null));
  const ltCard = ltContainer.querySelector('[data-testid="long-tail-bleed-card"]');
  assert.ok(ltCard, 'LongTailBleedCard must render with data-testid="long-tail-bleed-card"');
  assert.ok(ltCard.textContent?.includes('$40.00'), 'Must render $40.00 collective waste');
  assert.ok(ltCard.textContent?.includes('free'), 'Must display root token "free"');

  // Test DilutionAuditCard rendering
  const { container: dilContainer } = render(React.createElement(DilutionAuditCard, null));
  const dilCard = dilContainer.querySelector('[data-testid="dilution-audit-card"]');
  assert.ok(dilCard, 'DilutionAuditCard must render with data-testid="dilution-audit-card"');
  // Excess cost = (120/60 - 40/40) * 60 = (2.00 - 1.00) * 60 = $60.00
  assert.ok(dilCard.textContent?.includes('$60.00'), 'Must render $60.00 excess budget lost');
});
