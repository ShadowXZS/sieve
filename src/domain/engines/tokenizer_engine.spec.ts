/**
 * Behavioral Unit Tests: N-Gram Tokenizer & Intent Classification Engine
 *
 * Strict TDD test suite validating INgramTokenizerPort contract implementation.
 * File line ceiling: <= 200 lines.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { NgramTokenizerEngine } from './tokenizer_engine.ts';
import type {
  QueryString,
  TokenString,
  ClickCount,
  SearchTermRecord,
  CurrencyMicros,
  ImpressionCount,
} from '../types/index.ts';

function createTerm(overrides: Partial<SearchTermRecord>): SearchTermRecord {
  return {
    rawQuery: 'sample query' as QueryString,
    normalizedQuery: 'sample query' as QueryString,
    campaignName: 'Campaign A',
    adGroupName: 'AdGroup 1',
    matchType: 'BROAD',
    impressions: 50 as ImpressionCount,
    clicks: 1 as ClickCount,
    spendMicros: 5_000_000n as CurrencyMicros,
    conversions: 0,
    revenueMicros: 0n as CurrencyMicros,
    averageCpcMicros: 5_000_000n as CurrencyMicros,
    ...overrides,
  };
}

test('Test 1: Decomposes search queries into unigrams and bigrams ignoring punctuation & casing', () => {
  const engine = new NgramTokenizerEngine();
  const query = 'Enterprise, Cloud - Backup! Tools' as QueryString;

  const unigramsAndBigrams = engine.tokenize(query, { minDegree: 1, maxDegree: 2 });
  assert.deepEqual(unigramsAndBigrams, [
    'enterprise',
    'cloud',
    'backup',
    'tools',
    'enterprise cloud',
    'cloud backup',
    'backup tools',
  ]);

  const defaultUnigrams = engine.tokenize(query);
  assert.deepEqual(defaultUnigrams, ['enterprise', 'cloud', 'backup', 'tools']);
});

test('Test 2: Syntactic stopword filtering retains root tokens and excludes prepositions/conjunctions', () => {
  const engine = new NgramTokenizerEngine();
  const terms = [
    createTerm({
      rawQuery: 'Software with backup for teams' as QueryString,
      normalizedQuery: 'software with backup for teams' as QueryString,
      clicks: 1 as ClickCount,
      spendMicros: 15_000_000n as CurrencyMicros,
    }),
  ];

  const bleedRoots = engine.topBleedRoots(terms);
  const rootTokens = bleedRoots.map((r) => r.tokenText);

  assert.ok(rootTokens.includes('software' as TokenString));
  assert.ok(rootTokens.includes('backup' as TokenString));
  assert.ok(rootTokens.includes('teams' as TokenString));
  assert.ok(!rootTokens.includes('with' as TokenString));
  assert.ok(!rootTokens.includes('for' as TokenString));

  const masked = engine.applyStopwordMask([
    'software' as TokenString,
    'with' as TokenString,
    'backup' as TokenString,
    'for' as TokenString,
    'teams' as TokenString,
  ]);
  assert.deepEqual(masked, ['software', 'backup', 'teams']);
});

test('Test 3: Sub-click aggregation rolls up queries <= 2 clicks into shared root tokens without precision loss', () => {
  const engine = new NgramTokenizerEngine();
  const terms = [
    createTerm({
      rawQuery: 'cloud backup software' as QueryString,
      normalizedQuery: 'cloud backup software' as QueryString,
      clicks: 1 as ClickCount,
      spendMicros: 12_500_000n as CurrencyMicros,
      conversions: 0,
    }),
    createTerm({
      rawQuery: 'fast cloud backup' as QueryString,
      normalizedQuery: 'fast cloud backup' as QueryString,
      clicks: 2 as ClickCount,
      spendMicros: 25_500_000n as CurrencyMicros,
      conversions: 0,
    }),
    createTerm({
      rawQuery: 'cloud enterprise backup' as QueryString,
      normalizedQuery: 'cloud enterprise backup' as QueryString,
      clicks: 5 as ClickCount, // High clicks, not sub-click
      spendMicros: 100_000_000n as CurrencyMicros,
      conversions: 1,
    }),
  ];

  const aggregated = engine.aggregateTokens(terms);
  const backupMetric = aggregated.find((m) => m.tokenText === 'backup');

  assert.ok(backupMetric);
  assert.equal(backupMetric.occurrences, 3);
  assert.equal(backupMetric.subClickQueriesCount, 2);
  assert.equal(backupMetric.totalClicks, 8);
  assert.equal(backupMetric.totalSpendMicros, 138_000_000n);
  assert.equal(backupMetric.conversions, 1);
  assert.equal(backupMetric.averageCpcMicros, 17_250_000n);
});

test('Test 4: Wilson score interval calculation verifies statistical confidence bounds', () => {
  const engine = new NgramTokenizerEngine();

  // 100 trials, 0 successes: upper bound ~ 3.7% with z=1.96
  const zeroConv = engine.calculateWilsonScore(100, 0, 1.96);
  assert.equal(zeroConv.lowerBound, 0.0);
  assert.ok(Math.abs(zeroConv.upperBound - 3.8416 / 103.8416) < 1e-6);

  // 100 trials, 10 successes: interval should span around 10%
  const tenConv = engine.calculateWilsonScore(100, 10, 1.96);
  assert.ok(tenConv.lowerBound > 0.05 && tenConv.lowerBound < 0.08);
  assert.ok(tenConv.upperBound > 0.14 && tenConv.upperBound < 0.18);

  // Zero trials boundary condition
  const zeroTrials = engine.calculateWilsonScore(0, 0);
  assert.equal(zeroTrials.lowerBound, 0.0);
  assert.equal(zeroTrials.upperBound, 1.0);
});

test('Test 5: Semantic classification categorizes tokens by linguistic commercial intent', () => {
  const engine = new NgramTokenizerEngine({ knownBrands: ['sieve', 'salesforce'] });

  assert.equal(engine.classifyToken('tutorial' as TokenString), 'INFORMATIONAL');
  assert.equal(engine.classifyToken('how to' as TokenString), 'INFORMATIONAL');
  assert.equal(engine.classifyToken('jobs' as TokenString), 'EMPLOYMENT');
  assert.equal(engine.classifyToken('salary' as TokenString), 'EMPLOYMENT');
  assert.equal(engine.classifyToken('buy' as TokenString), 'COMMERCIAL');
  assert.equal(engine.classifyToken('pricing' as TokenString), 'COMMERCIAL');
  assert.equal(engine.classifyToken('sieve' as TokenString), 'BRAND');
  assert.equal(engine.classifyToken('salesforce' as TokenString), 'BRAND');
  assert.equal(engine.classifyToken('with' as TokenString), 'SYNTACTIC_STOPWORD');
  assert.equal(engine.classifyToken('and' as TokenString), 'SYNTACTIC_STOPWORD');
});

test('Verification: Syntactic stopwords are strictly barred from topBleedRoots', () => {
  const engine = new NgramTokenizerEngine();
  const prohibited = ['and', 'with', 'for', 'in', 'to', 'at', 'by', 'from', 'a', 'an', 'the'];

  const terms = prohibited.map((word) =>
    createTerm({
      rawQuery: `${word} cloud` as QueryString,
      normalizedQuery: `${word} cloud` as QueryString,
      clicks: 1 as ClickCount,
      spendMicros: 10_000_000n as CurrencyMicros,
    })
  );

  const bleedRoots = engine.topBleedRoots(terms);
  const emittedTokens = new Set(bleedRoots.map((r) => r.tokenText));

  for (const stopword of prohibited) {
    assert.equal(
      emittedTokens.has(stopword as TokenString),
      false,
      `Prohibited stopword "${stopword}" was emitted in topBleedRoots`
    );
  }
  assert.ok(emittedTokens.has('cloud' as TokenString));
});
