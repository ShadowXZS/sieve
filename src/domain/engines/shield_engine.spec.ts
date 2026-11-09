/**
 * Behavioral Unit Tests: Conversion Shield & Negative Rule Staging Engine
 *
 * Strict TDD test suite validating IConversionShieldPort contract implementation.
 * File line ceiling: <= 200 lines.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversionShieldEngine } from './shield_engine.ts';
import type {
  SearchTermRecord,
  CurrencyMicros,
  ClickCount,
  ImpressionCount,
  QueryString,
  SafeListTerm,
} from '../types/index.ts';

function createTerm(overrides: Partial<SearchTermRecord>): SearchTermRecord {
  const rawQuery = overrides.rawQuery ?? ('sample query' as QueryString);
  return {
    rawQuery,
    normalizedQuery: overrides.normalizedQuery ?? (rawQuery.toLowerCase() as QueryString),
    campaignName: 'Test Campaign',
    adGroupName: 'Test AdGroup',
    matchType: 'BROAD',
    impressions: 100 as ImpressionCount,
    clicks: 5 as ClickCount,
    spendMicros: 25_000_000n as CurrencyMicros,
    conversions: 0,
    revenueMicros: 0n as CurrencyMicros,
    averageCpcMicros: 5_000_000n as CurrencyMicros,
    ...overrides,
  };
}

test('Red Test 1: Given a query with conversions > 0, verify it is registered in Safe-List index and never emitted as negative candidate', () => {
  const engine = new ConversionShieldEngine();
  const convertingTerm = createTerm({
    rawQuery: 'enterprise crm software' as QueryString,
    conversions: 3,
    clicks: 15 as ClickCount,
    spendMicros: 30_000_000n as CurrencyMicros,
    revenueMicros: 150_000_000n as CurrencyMicros,
  });

  const rules = engine.emitQualifiedNegativeCandidates([convertingTerm], 20_000_000n as CurrencyMicros);
  assert.equal(rules.length, 0);

  const safeList = engine.getSafeListTerms();
  assert.equal(safeList.length, 1);
  assert.equal(safeList[0].query, 'enterprise crm software');
  assert.equal(safeList[0].conversions, 3);
});

test('Red Test 2: Given non-converting queries with clicks < minClicks threshold or spend = $0.00, verify they are filtered out', () => {
  const engine = new ConversionShieldEngine({ minNonConvertingClicks: 4 });
  const lowClickTerm = createTerm({
    rawQuery: 'cheap crm' as QueryString,
    clicks: 2 as ClickCount,
    spendMicros: 10_000_000n as CurrencyMicros,
    conversions: 0,
  });
  const zeroSpendTerm = createTerm({
    rawQuery: 'free crm demo' as QueryString,
    clicks: 10 as ClickCount,
    spendMicros: 0n as CurrencyMicros,
    conversions: 0,
  });

  const rules = engine.emitQualifiedNegativeCandidates([lowClickTerm, zeroSpendTerm], 15_000_000n as CurrencyMicros);
  assert.equal(rules.length, 0);
});

test('Red Test 3: Given a high-spend non-converting query that shares intent/tokens with safe-list term, assert EXACT bracket lock directive', () => {
  const engine = new ConversionShieldEngine();
  const safeTerm: SafeListTerm = {
    query: 'orbitly' as QueryString,
    conversions: 5,
    securedRevenueMicros: 500_000_000n as CurrencyMicros,
    createdAtMs: Date.now(),
  };
  engine.registerSafeListTerms([safeTerm]);

  const collidingTerm = createTerm({
    rawQuery: 'orbitly cancel subscription' as QueryString,
    clicks: 12 as ClickCount,
    spendMicros: 45_000_000n as CurrencyMicros,
    conversions: 0,
  });

  const rules = engine.emitQualifiedNegativeCandidates([collidingTerm], 10_000_000n as CurrencyMicros);
  assert.equal(rules.length, 1);
  const rule = rules[0];
  assert.equal(rule.recommendedMatchType, 'EXACT');
  assert.equal(rule.candidateTerm, '[orbitly cancel subscription]');
  assert.equal(rule.verdict, 'EXACT_BRACKET_LOCK');
  assert.ok(rule.collidingSafeTerms?.includes('orbitly' as QueryString));
});

test('Red Test 4: Given an isolated negative token, verify it qualifies as single-token BROAD exclusion', () => {
  const engine = new ConversionShieldEngine();
  const wasteToken = createTerm({
    rawQuery: 'torrent' as QueryString,
    clicks: 5 as ClickCount,
    spendMicros: 50_000_000n as CurrencyMicros,
    conversions: 0,
  });

  const rules = engine.emitQualifiedNegativeCandidates([wasteToken], 10_000_000n as CurrencyMicros);
  assert.equal(rules.length, 1);
  const rule = rules[0];
  assert.equal(rule.recommendedMatchType, 'BROAD');
  assert.equal(rule.candidateTerm, 'torrent');
  assert.equal(rule.verdict, 'SAFE_EXCLUSION');
});

test('Red Test 5: Given a 7-word search query, verify engine rejects BROAD match assignment, forcing PHRASE or EXACT containment', () => {
  const engine = new ConversionShieldEngine();
  const multiWordTerm = createTerm({
    rawQuery: 'can email marketing platform handle schools and colleges' as QueryString,
    clicks: 8 as ClickCount,
    spendMicros: 60_000_000n as CurrencyMicros,
    conversions: 0,
  });

  const rules = engine.emitQualifiedNegativeCandidates([multiWordTerm], 10_000_000n as CurrencyMicros);
  assert.equal(rules.length, 1);
  const rule = rules[0];
  assert.notEqual(rule.recommendedMatchType, 'BROAD');
  assert.ok(rule.recommendedMatchType === 'PHRASE' || rule.recommendedMatchType === 'EXACT');
  assert.equal(rule.verdict, 'SAFE_EXCLUSION');
});

test('Red Test 6: Collision evaluation and batch collision detection returns correct verdict and conflicting terms', () => {
  const engine = new ConversionShieldEngine();
  engine.registerSafeListTerms([{
    query: 'saas platform' as QueryString,
    conversions: 4,
    securedRevenueMicros: 200_000_000n as CurrencyMicros,
    createdAtMs: Date.now(),
  }]);

  const exactEval = engine.evaluateCollision('saas platform' as QueryString);
  assert.equal(exactEval.verdict, 'SAFE_LIST_CONVERSION');

  const collidingEval = engine.evaluateCollision('best saas platform cracked' as QueryString);
  assert.equal(collidingEval.verdict, 'EXACT_BRACKET_LOCK');
  assert.equal(collidingEval.recommendedMatchType, 'EXACT');

  const safeEval = engine.evaluateCollision('unrelated junk query' as QueryString);
  assert.equal(safeEval.verdict, 'SAFE_EXCLUSION');

  const batch = engine.evaluateBatchCollisions(['saas platform' as QueryString, 'unrelated junk query' as QueryString]);
  assert.equal(batch.length, 2);
  assert.equal(batch[0].verdict, 'SAFE_LIST_CONVERSION');
  assert.equal(batch[1].verdict, 'SAFE_EXCLUSION');
});

test('Red Test 7: Enforces bracket lock fallback and computes deterministic SHA-256 fingerprint', () => {
  const engine = new ConversionShieldEngine();
  const fallback = engine.enforceBracketLockFallback(
    'orbitly login' as QueryString,
    ['orbitly' as QueryString],
    15_000_000n as CurrencyMicros
  );
  assert.equal(fallback.candidateTerm, '[orbitly login]');
  assert.equal(fallback.recommendedMatchType, 'EXACT');
  assert.equal(fallback.verdict, 'EXACT_BRACKET_LOCK');
  assert.equal(fallback.marginalWasteMicros, 15_000_000n);

  const fp1 = engine.computeRuleFingerprint('orbitly login' as QueryString, 'EXACT', 'ACCOUNT');
  const fp2 = engine.computeRuleFingerprint('orbitly login' as QueryString, 'EXACT', 'ACCOUNT');
  assert.equal(typeof fp1, 'string');
  assert.equal(fp1.length, 64);
  assert.equal(fp1, fp2);
});
