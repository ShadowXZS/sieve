/**
 * Behavioral Unit Tests: Match-Type Dilution & Cannibalization Engine
 *
 * Strict TDD test suite validating IMatchDilutionPort contract implementation.
 * File line ceiling: <= 200 lines.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchDilutionEngine } from './dilution_engine.ts';
import type {
  SearchTermRecord,
  CurrencyMicros,
  ClickCount,
  ImpressionCount,
  QueryString,
  DilutionDetectionConfig,
} from '../types/index.ts';

function createTerm(overrides: Partial<SearchTermRecord>): SearchTermRecord {
  const rawQuery = overrides.rawQuery ?? ('sample query' as QueryString);
  return {
    rawQuery, normalizedQuery: overrides.normalizedQuery ?? rawQuery,
    campaignName: 'Campaign Alpha', adGroupName: 'AdGroup 1', matchType: 'BROAD',
    impressions: 100 as ImpressionCount, clicks: 10 as ClickCount, spendMicros: 20_000_000n as CurrencyMicros,
    conversions: 0, revenueMicros: 0n as CurrencyMicros, averageCpcMicros: 2_000_000n as CurrencyMicros,
    ...overrides,
  };
}

test('Red Test 1: Classifies exact-broad collision as DilutedQueryPair with inflation and budget lost', () => {
  const engine = new MatchDilutionEngine();
  const exactRecord = createTerm({
    rawQuery: 'crm software' as QueryString, adGroupName: 'Exact AG', matchType: 'EXACT',
    clicks: 20 as ClickCount, spendMicros: 40_000_000n as CurrencyMicros, averageCpcMicros: 2_000_000n as CurrencyMicros,
  });
  const broadRecord = createTerm({
    rawQuery: 'crm software' as QueryString, adGroupName: 'Broad AG', matchType: 'BROAD',
    clicks: 50 as ClickCount, spendMicros: 225_000_000n as CurrencyMicros, averageCpcMicros: 4_500_000n as CurrencyMicros,
  });

  const summary = engine.detectDilution([exactRecord, broadRecord]);
  assert.equal(summary.pairs.length, 1);

  const pair = summary.pairs[0];
  assert.equal(pair.exactQuery, 'crm software');
  assert.equal(pair.broadQuery, 'crm software');
  assert.equal(pair.exactCpcMicros, 2_000_000n);
  assert.equal(pair.broadCpcMicros, 4_500_000n);
  assert.equal(pair.cpcInflationRatio, 2.25);
  assert.equal(pair.hijackedClicks, 50);
  assert.equal(pair.budgetLostMicros, 125_000_000n);
  assert.equal(pair.severity, 'CRITICAL');

  assert.equal(engine.identifyHijackedClicks(exactRecord, broadRecord), 50);
  assert.equal(engine.calculateInflationRatio(2_000_000n as CurrencyMicros, 4_500_000n as CurrencyMicros), 2.25);
  assert.equal(engine.calculateLostBudget(2_000_000n as CurrencyMicros, 4_500_000n as CurrencyMicros, 50 as ClickCount), 125_000_000n);
  assert.equal(engine.classifySeverity(2.25), 'CRITICAL');
});

test('Red Test 2: Unbenchmarked broad queries return empty pairs and 0 dilution index without division-by-zero', () => {
  const engine = new MatchDilutionEngine();
  const unbenchmarked = [
    createTerm({
      rawQuery: 'bespoke enterprise platform' as QueryString, matchType: 'BROAD',
      clicks: 30 as ClickCount, spendMicros: 90_000_000n as CurrencyMicros, averageCpcMicros: 3_000_000n as CurrencyMicros,
    }),
  ];

  const summary = engine.detectDilution(unbenchmarked);
  assert.equal(summary.pairs.length, 0);
  assert.equal(summary.dilutionIndexPercent, 0);
  assert.equal(summary.dilutedQueryCount, 0);
  assert.equal(summary.totalBudgetLostMicros, 0n);
  assert.equal(summary.averageInflationRatio, 0);

  const emptySummary = engine.detectDilution([]);
  assert.equal(emptySummary.dilutionIndexPercent, 0);
  assert.equal(emptySummary.dilutedQueryCount, 0);

  assert.equal(engine.calculateInflationRatio(0n as CurrencyMicros, 5_000_000n as CurrencyMicros), 0);
  assert.equal(engine.calculateLostBudget(0n as CurrencyMicros, 5_000_000n as CurrencyMicros, 0 as ClickCount), 0n);
});

test('Red Test 3: Broad CPC less than or equal to exact CPC is not marked as diluted', () => {
  const engine = new MatchDilutionEngine();
  const exact = createTerm({
    rawQuery: 'cloud storage' as QueryString, matchType: 'EXACT',
    clicks: 10 as ClickCount, spendMicros: 50_000_000n as CurrencyMicros, averageCpcMicros: 5_000_000n as CurrencyMicros,
  });
  const cheaperBroad = createTerm({
    rawQuery: 'cloud storage' as QueryString, matchType: 'BROAD',
    clicks: 20 as ClickCount, spendMicros: 60_000_000n as CurrencyMicros, averageCpcMicros: 3_000_000n as CurrencyMicros,
  });
  const equalBroad = createTerm({
    rawQuery: 'cloud storage' as QueryString, matchType: 'PHRASE',
    clicks: 15 as ClickCount, spendMicros: 75_000_000n as CurrencyMicros, averageCpcMicros: 5_000_000n as CurrencyMicros,
  });

  const summary = engine.detectDilution([exact, cheaperBroad, equalBroad]);
  assert.equal(summary.pairs.length, 0);
  assert.equal(summary.dilutedQueryCount, 0);
  assert.equal(summary.totalBudgetLostMicros, 0n);

  assert.equal(engine.calculateLostBudget(5_000_000n as CurrencyMicros, 3_000_000n as CurrencyMicros, 20 as ClickCount), 0n);
  assert.equal(engine.calculateLostBudget(5_000_000n as CurrencyMicros, 5_000_000n as CurrencyMicros, 15 as ClickCount), 0n);
});

test('Red Test 4: DilutionSummary aggregates dilutionIndexPercent, budget lost, query count and weighted inflation', () => {
  const engine = new MatchDilutionEngine();
  const exactBackup = createTerm({ rawQuery: 'cloud backup' as QueryString, matchType: 'EXACT', clicks: 10 as ClickCount, spendMicros: 20_000_000n as CurrencyMicros, averageCpcMicros: 2_000_000n as CurrencyMicros });
  const broadBackup = createTerm({ rawQuery: 'cloud backup' as QueryString, matchType: 'BROAD', clicks: 50 as ClickCount, spendMicros: 200_000_000n as CurrencyMicros, averageCpcMicros: 4_000_000n as CurrencyMicros });
  const exactRecovery = createTerm({ rawQuery: 'data recovery' as QueryString, matchType: 'EXACT', clicks: 10 as ClickCount, spendMicros: 20_000_000n as CurrencyMicros, averageCpcMicros: 2_000_000n as CurrencyMicros });
  const broadRecovery = createTerm({ rawQuery: 'data recovery' as QueryString, matchType: 'BROAD', clicks: 50 as ClickCount, spendMicros: 300_000_000n as CurrencyMicros, averageCpcMicros: 6_000_000n as CurrencyMicros });
  const unrelated = createTerm({ rawQuery: 'general tech news' as QueryString, matchType: 'BROAD', clicks: 100 as ClickCount, spendMicros: 460_000_000n as CurrencyMicros, averageCpcMicros: 4_600_000n as CurrencyMicros });

  const summary = engine.detectDilution([exactBackup, broadBackup, exactRecovery, broadRecovery, unrelated]);
  assert.equal(summary.dilutedQueryCount, 2);
  assert.equal(summary.totalBudgetLostMicros, 300_000_000n);
  assert.equal(summary.totalDilutedClicks, 100);
  assert.equal(summary.totalDilutedSpendMicros, 500_000_000n);
  assert.equal(summary.dilutionIndexPercent, 50.0);
  assert.equal(summary.averageInflationRatio, 2.5);

  const config: DilutionDetectionConfig = {
    minInflationRatio: 2.5,
    minHijackedClicks: 10 as ClickCount,
    minBudgetLostMicros: 150_000_000n as CurrencyMicros,
  };
  const filtered = engine.detectDilution([exactBackup, broadBackup, exactRecovery, broadRecovery, unrelated], config);
  assert.equal(filtered.dilutedQueryCount, 1);
  assert.equal(filtered.pairs[0].broadQuery, 'data recovery');
});

test('Red Test 5: Normalized query matching bridges whitespace, casing, and punctuation across ad groups', () => {
  const engine = new MatchDilutionEngine();
  const exactAlpha = createTerm({
    rawQuery: '[Enterprise - Backup!]' as QueryString,
    adGroupName: 'Alpha Exact Group',
    matchType: 'EXACT',
    clicks: 10 as ClickCount,
    spendMicros: 20_000_000n as CurrencyMicros,
    averageCpcMicros: 2_000_000n as CurrencyMicros,
  });
  const phraseBeta = createTerm({
    rawQuery: '  Enterprise,   Backup  ' as QueryString,
    adGroupName: 'Beta Phrase Group',
    matchType: 'PHRASE',
    clicks: 30 as ClickCount,
    spendMicros: 90_000_000n as CurrencyMicros,
    averageCpcMicros: 3_000_000n as CurrencyMicros,
  });

  const pairs = engine.findDilutedPairs([exactAlpha], [phraseBeta]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].cpcInflationRatio, 1.5);
  assert.equal(pairs[0].budgetLostMicros, 30_000_000n);
  assert.equal(pairs[0].severity, 'SEVERE');
});
