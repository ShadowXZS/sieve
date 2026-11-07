/**
 * Long-Tail & Match Dilution Analytical Engine Unit Tests
 *
 * Operating Principles:
 * - Martin Fowler: Refactoring Test Code (Test Independence, Fixture Factories)
 * - Titus Winters et al. (SE at Google): Testing Behavioral Contracts over Implementation Details
 * - Cooper's Predictable Metrics: Long-Tail queries <= 2 clicks aggregated by root tokens
 *
 * Verifies:
 * 1. Fragmented Long-Tail Aggregator:
 *    - Ingestion of 1,000 queries each with 1 click and $3 spend sharing "free" aggregates into $3,000 waste candidate.
 *    - Groups queries with <= 2 clicks, excludes queries with > 2 clicks.
 *    - Extracts shared root tokens (query_count >= 2) with total clicks and waste.
 *    - Preserves multi-currency precision (JPY zero-decimals).
 * 2. Match-Type Dilution Index:
 *    - Matches normalized token hashes.
 *    - Accurately isolates broad queries matching exact keywords and computes excess cost: sum((Broad CPC - Exact CPC) * Clicks).
 *    - Sub-10ms evaluation benchmark.
 *    - Gracefully handles zero dilution and unbenchmarked broad searches.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeFragmentedLongTail,
  computeMatchTypeDilution,
} from '../../src/utils/executiveAnalytics.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

test('Fragmented Long-Tail Aggregator: 1,000 queries each with 1 click and $3 spend sharing "free" aggregates into $3,000 waste', () => {
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

  // 1 high-volume query (50 clicks) which must NOT be treated as long-tail
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

  assert.strictEqual(result.total_long_tail_queries, 1000, 'Must record exactly 1,000 long-tail queries');
  assert.strictEqual(result.total_long_tail_clicks, 1000, 'Must record exactly 1,000 clicks');
  assert.strictEqual(result.total_long_tail_waste, 3000.0, 'Must record exactly $3,000.00 total waste');

  const freeToken = result.root_tokens.find((t) => t.token === 'free');
  assert.ok(freeToken, 'Root token "free" must be identified');
  assert.strictEqual(freeToken.query_count, 1000);
  assert.strictEqual(freeToken.total_clicks, 1000);
  assert.strictEqual(freeToken.waste, 3000.0);
});

test('Fragmented Long-Tail Aggregator: Groups shared root tokens across queries with <= 2 clicks and preserves JPY rounding', () => {
  const keywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'h1',
      keyword: 'free download manual pdf',
      matchType: 'broad',
      formattedRule: 'free download manual pdf',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 6.0,
      cost: 6.0,
      clicks: 1,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'h2',
      keyword: 'nikon camera manual free',
      matchType: 'broad',
      formattedRule: 'nikon camera manual free',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 10.0,
      cost: 10.0,
      clicks: 2,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'h3',
      keyword: 'free user guide setup',
      matchType: 'broad',
      formattedRule: 'free user guide setup',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 8.0,
      cost: 8.0,
      clicks: 1,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'h4',
      keyword: 'high traffic converting camera',
      matchType: 'phrase',
      formattedRule: '"high traffic converting camera"',
      platform: 1,
      confidenceScore: 0.8,
      marginalWaste: 0,
      cost: 120.0,
      clicks: 40, // > 2 clicks -> must be excluded from long-tail
      conversions: 3,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  const result = computeFragmentedLongTail(keywords, 50, '$');

  assert.strictEqual(result.total_long_tail_queries, 3, 'Must count exactly 3 long-tail queries');
  assert.strictEqual(result.total_long_tail_clicks, 4, 'Must sum 1 + 2 + 1 = 4 clicks');
  assert.strictEqual(result.total_long_tail_waste, 24.0, 'Must sum 6 + 10 + 8 = $24.00 collective waste');

  const freeToken = result.root_tokens.find((t) => t.token === 'free');
  assert.ok(freeToken);
  assert.strictEqual(freeToken.query_count, 3);
  assert.strictEqual(freeToken.total_clicks, 4);
  assert.strictEqual(freeToken.waste, 24.0);

  const manualToken = result.root_tokens.find((t) => t.token === 'manual');
  assert.ok(manualToken);
  assert.strictEqual(manualToken.query_count, 2);
  assert.strictEqual(manualToken.total_clicks, 3);
  assert.strictEqual(manualToken.waste, 16.0);

  // Test JPY zero-decimal precision
  const jpyKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'jpy_1',
      keyword: 'free guide 1',
      matchType: 'broad',
      formattedRule: 'free guide 1',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 1250.6,
      cost: 1250.6,
      clicks: 1,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'jpy_2',
      keyword: 'free guide 2',
      matchType: 'broad',
      formattedRule: 'free guide 2',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 1250.6,
      cost: 1250.6,
      clicks: 1,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  const jpyResult = computeFragmentedLongTail(jpyKeywords, 5000, '¥');
  assert.strictEqual(jpyResult.total_long_tail_waste, 2501);
});

test('Match-Type Dilution Index: Isolates queries matching exact keywords and computes excess cost', () => {
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
  ];

  const t0 = performance.now();
  const result = computeMatchTypeDilution(keywords, '$');
  const durationMs = performance.now() - t0;

  assert.ok(durationMs < 10, `Dilution index evaluation took ${durationMs.toFixed(3)}ms (must be < 10ms)`);
  assert.strictEqual(result.diluted_queries_count, 2, 'Must identify exactly 2 diluted queries');
  assert.strictEqual(result.budget_lost, 194.0, 'Total budget lost must be 104 + 90 = $194.00');

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

test('Match-Type Dilution Index: Gracefully handles zero dilution and unbenchmarked searches', () => {
  const keywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'only_broad',
      keyword: 'standalone query without exact match',
      matchType: 'broad',
      formattedRule: 'standalone query without exact match',
      platform: 1,
      confidenceScore: 0.9,
      cost: 50.0,
      clicks: 25,
      conversions: 1,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  const result = computeMatchTypeDilution(keywords, '$');
  assert.strictEqual(result.diluted_queries_count, 0);
  assert.strictEqual(result.budget_lost, 0);
  assert.strictEqual(result.dilution_index, 0);
  assert.strictEqual(result.items.length, 0);
});
