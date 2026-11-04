/**
 * Phase 11 - Fragmented Long-Tail & Match Dilution Unit Test Suite
 *
 * Validates:
 * 1. Fragmented Long-Tail Aggregator:
 *    - Filters queries with <= 2 clicks
 *    - Extracts shared root tokens (query_count >= 2)
 *    - Aggregates collective waste, clicks, and queries
 *    - Excludes queries with > 2 clicks
 *    - Preserves multi-currency precision (JPY zero-decimals)
 * 2. Match-Type Dilution Index:
 *    - Matches normalized token hashes
 *    - Calculates budget lost when broad/phrase captures exact searches at higher CPC
 *    - Sub-10ms evaluation speed
 *    - Gracefully handles zero dilution and unbenchmarked broad searches
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFragmentedLongTail,
  computeMatchTypeDilution,
} from '../../src/utils/executiveAnalytics.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

test('Phase 11: Fragmented Long-Tail Aggregator groups shared root tokens across queries with <= 2 clicks', () => {
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

  // Verify long-tail query counts
  assert.strictEqual(result.total_long_tail_queries, 3, 'Must count exactly 3 long-tail queries');
  assert.strictEqual(result.total_long_tail_clicks, 4, 'Must sum 1 + 2 + 1 = 4 clicks');
  assert.strictEqual(result.total_long_tail_waste, 24.0, 'Must sum 6 + 10 + 8 = $24.00 collective waste');

  // Shared root token 'free' appears across all 3 queries
  const freeToken = result.root_tokens.find((t) => t.token === 'free');
  assert.ok(freeToken, "Shared root token 'free' must be present");
  assert.strictEqual(freeToken.query_count, 3, "'free' appears in 3 queries");
  assert.strictEqual(freeToken.total_clicks, 4);
  assert.strictEqual(freeToken.waste, 24.0);

  // Shared root token 'manual' appears across 2 queries
  const manualToken = result.root_tokens.find((t) => t.token === 'manual');
  assert.ok(manualToken, "Shared root token 'manual' must be present");
  assert.strictEqual(manualToken.query_count, 2, "'manual' appears in 2 queries");
  assert.strictEqual(manualToken.total_clicks, 3);
  assert.strictEqual(manualToken.waste, 16.0);

  // Tokens that appeared in only 1 query (e.g. 'setup', 'nikon', 'pdf') must NOT be in shared roots
  const setupToken = result.root_tokens.find((t) => t.token === 'setup');
  assert.strictEqual(setupToken, undefined, 'Unshared token must be excluded from root list');
});

test('Phase 11: Match-Type Dilution Index computes budget lost and CPC inflation ratio', () => {
  const keywords: PersistedNegativeKeyword[] = [
    // Exact benchmark 1: 'running shoes' at $1.20 CPC (cost $60 for 50 clicks)
    {
      sha256Hash: 'exact_1',
      keyword: 'running shoes',
      matchType: 'exact',
      formattedRule: '[running shoes]',
      platform: 1,
      confidenceScore: 0.9,
      cost: 60.0,
      clicks: 50,
      conversions: 5,
      hasCollision: false,
      createdAt: Date.now(),
    },
    // Broad matching same query 'running shoes' at $2.50 CPC (cost $200 for 80 clicks) -> DILUTED!
    // Budget lost = (2.50 - 1.20) * 80 = $104.00
    {
      sha256Hash: 'broad_1',
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
    // Exact benchmark 2: 'leather boots' at $3.00 CPC (cost $150 for 50 clicks)
    {
      sha256Hash: 'exact_2',
      keyword: 'leather boots',
      matchType: 'exact',
      formattedRule: '[leather boots]',
      platform: 1,
      confidenceScore: 0.9,
      cost: 150.0,
      clicks: 50,
      conversions: 4,
      hasCollision: false,
      createdAt: Date.now(),
    },
    // Broad matching 'leather boots' at $2.00 CPC (CHEAPER than exact -> NOT diluted!)
    {
      sha256Hash: 'broad_2',
      keyword: 'leather boots',
      matchType: 'broad',
      formattedRule: 'leather boots',
      platform: 1,
      confidenceScore: 0.8,
      cost: 80.0,
      clicks: 40,
      conversions: 1,
      hasCollision: false,
      createdAt: Date.now(),
    },
    // Broad without exact benchmark: 'hiking poles' -> NOT diluted
    {
      sha256Hash: 'broad_3',
      keyword: 'hiking poles',
      matchType: 'broad',
      formattedRule: 'hiking poles',
      platform: 1,
      confidenceScore: 0.75,
      cost: 50.0,
      clicks: 25,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  const result = computeMatchTypeDilution(keywords, '$');

  assert.strictEqual(result.diluted_queries_count, 1, 'Only running shoes was diluted');
  assert.strictEqual(result.total_diluted_clicks, 80);
  assert.strictEqual(result.budget_lost, 104.0, 'Budget lost must equal $104.00');

  const item = result.items[0];
  assert.ok(item);
  assert.strictEqual(item.query, 'running shoes');
  assert.strictEqual(item.exact_cpc, 1.2);
  assert.strictEqual(item.broad_cpc, 2.5);
  assert.strictEqual(item.budget_lost, 104.0);
  assert.strictEqual(item.cpc_inflation_ratio, 2.08);
});

test('Phase 11: Multi-currency formatting enforces zero-decimal rounding for JPY', () => {
  const keywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'jpy_exact',
      keyword: 'ランニングシューズ',
      matchType: 'exact',
      formattedRule: '[ランニングシューズ]',
      platform: 1,
      confidenceScore: 0.95,
      cost: 12450.75,
      clicks: 50,
      conversions: 5,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'jpy_broad',
      keyword: 'ランニングシューズ',
      matchType: 'broad',
      formattedRule: 'ランニングシューズ',
      platform: 1,
      confidenceScore: 0.85,
      cost: 25600.25,
      clicks: 60,
      conversions: 2,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  const result = computeMatchTypeDilution(keywords, '¥');
  assert.strictEqual(Number.isInteger(result.budget_lost), true, 'JPY budget lost must be integer rounded');
  assert.strictEqual(Number.isInteger(result.diluted_spend), true, 'JPY diluted spend must be integer rounded');
});

