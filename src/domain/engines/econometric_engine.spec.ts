/**
 * Behavioral Unit Tests: Econometric & Bid Elasticity Engine
 *
 * Strict TDD test suite validating IEconometricEnginePort contract implementation.
 * File line ceiling: <= 200 lines.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EconometricEngine } from './econometric_engine.ts';
import type {
  SearchTermRecord,
  CurrencyMicros,
  ClickCount,
  ImpressionCount,
  QueryString,
} from '../types/index.ts';

function createTerm(overrides: Partial<SearchTermRecord>): SearchTermRecord {
  const rawQuery = overrides.rawQuery ?? ('sample query' as QueryString);
  return {
    rawQuery,
    normalizedQuery: overrides.normalizedQuery ?? rawQuery,
    campaignName: 'Campaign Alpha',
    adGroupName: 'AdGroup 1',
    matchType: 'BROAD',
    impressions: 100 as ImpressionCount,
    clicks: 10 as ClickCount,
    spendMicros: 20_000_000n as CurrencyMicros,
    conversions: 0,
    revenueMicros: 0n as CurrencyMicros,
    averageCpcMicros: 2_000_000n as CurrencyMicros,
    ...overrides,
  };
}

test('Red Test 1: Break-even ceiling computed from CVR and Target CPA keeps converting traffic unchoked', () => {
  const engine = new EconometricEngine();
  const targetCpa = 50_000_000n as CurrencyMicros; // $50.00
  const cvr = 0.10; // 10%
  const ceiling = engine.computeBreakEvenBidCeiling(cvr, targetCpa);
  assert.equal(ceiling, 5_000_000n); // $5.00 break-even ceiling, not $1.50

  const convertingTerm = createTerm({
    clicks: 10 as ClickCount,
    spendMicros: 49_600_000n as CurrencyMicros,
    averageCpcMicros: 4_960_000n as CurrencyMicros, // $4.96
    conversions: 2,
  });
  const nonConvertingTerm = createTerm({
    clicks: 10 as ClickCount,
    spendMicros: 21_300_000n as CurrencyMicros,
    averageCpcMicros: 2_130_000n as CurrencyMicros, // $2.13
    conversions: 0,
  });

  const spectrum = engine.mapElasticitySpectrum([convertingTerm, nonConvertingTerm], targetCpa);
  assert.equal(spectrum.convertingMedianCpcMicros, 4_960_000n);
  assert.equal(spectrum.nonConvertingMedianCpcMicros, 2_130_000n);
  assert.equal(spectrum.cpcBoundaryDeltaMicros, 2_830_000n); // $4.96 - $2.13 = $2.83
  assert.equal(spectrum.optimalBidCeilingMicros, 5_000_000n);
  assert.ok(spectrum.convertingMedianCpcMicros <= spectrum.optimalBidCeilingMicros);
});

test('Red Test 2: Classify auction clicks into PROFITABLE, DIMINISHING, and DEAD_ZONE', () => {
  const engine = new EconometricEngine();
  const optimalCeiling = 5_000_000n as CurrencyMicros; // $5.00
  const breakEvenBoundary = 7_500_000n as CurrencyMicros; // $7.50 (1.5x)

  assert.equal(engine.classifyElasticityZone(4_000_000n as CurrencyMicros, optimalCeiling), 'PROFITABLE');
  assert.equal(engine.classifyElasticityZone(5_000_000n as CurrencyMicros, optimalCeiling), 'PROFITABLE');
  assert.equal(engine.classifyElasticityZone(6_000_000n as CurrencyMicros, optimalCeiling, breakEvenBoundary), 'DIMINISHING');
  assert.equal(engine.classifyElasticityZone(7_500_000n as CurrencyMicros, optimalCeiling, breakEvenBoundary), 'DIMINISHING');
  assert.equal(engine.classifyElasticityZone(8_000_000n as CurrencyMicros, optimalCeiling, breakEvenBoundary), 'DEAD_ZONE');
  assert.equal(engine.classifyElasticityZone(10_000_000n as CurrencyMicros, optimalCeiling), 'DEAD_ZONE');
});

test('Red Test 3: Convex reallocation yield damps linear conversion inflation via Cobb-Douglas gamma', () => {
  const engine = new EconometricEngine();
  const recoveredWaste = 2_375_590_850_000n as CurrencyMicros; // $2,375,590.85
  const targetCpa = 50_000_000n as CurrencyMicros; // $50.00
  const baselineSpend = 10_000_000_000_000n as CurrencyMicros;
  const baselineConversions = 100_000;

  const yieldModel = engine.computeConvexReallocationYield(
    recoveredWaste,
    baselineSpend,
    baselineConversions,
    targetCpa,
    { gammaDamping: 0.75 }
  );

  assert.equal(yieldModel.incrementalConversions, 35633);
  assert.notEqual(yieldModel.incrementalConversions, 47511);
  assert.equal(yieldModel.projectedConversions, 135633);
  assert.equal(yieldModel.elasticityCoefficient, 0.75);
});

test('Red Test 4: Calculate projected account CPA, baseline ROAS, and projected ROAS lift', () => {
  const engine = new EconometricEngine();
  const recoveredWaste = 10_000_000_000n as CurrencyMicros; // $10,000
  const baselineSpend = 100_000_000_000n as CurrencyMicros; // $100,000
  const baselineConversions = 1000;
  const targetCpa = 50_000_000n as CurrencyMicros; // $50.00

  const result = engine.computeConvexReallocationYield(
    recoveredWaste,
    baselineSpend,
    baselineConversions,
    targetCpa,
    { gammaDamping: 0.75, annualizationMultiplier: 12 }
  );

  assert.equal(result.incrementalConversions, 150);
  assert.equal(result.projectedConversions, 1150);
  assert.equal(result.projectedRoasLift, 0.15);
  assert.equal(result.efficiencyMultiplier, 1.15);
  assert.equal(result.annualizedRecoveryMicros, 120_000_000_000n);
});

test('Red Test 5: Verify edge cases (0 conversions, 0 spend, Target CPA 0) handle without NaN or panic', () => {
  const engine = new EconometricEngine();
  const zeroMicros = 0n as CurrencyMicros;

  assert.equal(engine.computeBreakEvenBidCeiling(0, zeroMicros), 0n);
  assert.equal(engine.computeBreakEvenBidCeiling(0.15, zeroMicros), 0n);
  assert.equal(engine.computeBreakEvenBidCeiling(0, 50_000_000n as CurrencyMicros), 0n);

  const emptySpectrum = engine.mapElasticitySpectrum([]);
  assert.equal(emptySpectrum.convertingMedianCpcMicros, 0n);
  assert.equal(emptySpectrum.nonConvertingMedianCpcMicros, 0n);
  assert.equal(emptySpectrum.cpcBoundaryDeltaMicros, 0n);
  assert.equal(emptySpectrum.optimalBidCeilingMicros, 0n);
  assert.equal(emptySpectrum.elasticityZone, 'PROFITABLE');

  const zeroYield = engine.computeConvexReallocationYield(zeroMicros, zeroMicros, 0, zeroMicros);
  assert.equal(zeroYield.incrementalConversions, 0);
  assert.equal(zeroYield.projectedConversions, 0);
  assert.equal(zeroYield.projectedRoasLift, 0);
  assert.equal(zeroYield.efficiencyMultiplier, 1.0);
  assert.equal(zeroYield.annualizedRecoveryMicros, 0n);
  assert.ok(!Number.isNaN(zeroYield.projectedRoasLift));

  const waterfall = engine.computeSpendWaterfall([], zeroMicros);
  assert.equal(waterfall.totalSpendMicros, 0n);
  assert.equal(waterfall.wasteSpendMicros, 0n);
  assert.equal(waterfall.securedSpendMicros, 0n);
  assert.equal(waterfall.exploratorySpendMicros, 0n);

  assert.equal(engine.classifyElasticityZone(zeroMicros, zeroMicros), 'PROFITABLE');
});

test('Spend Waterfall: Decomposes spend across secured, exploratory, and waste tiers', () => {
  const engine = new EconometricEngine();
  const targetCpa = 50_000_000n as CurrencyMicros;

  const converting = createTerm({
    conversions: 1,
    spendMicros: 40_000_000n as CurrencyMicros,
  });
  const convertingOver = createTerm({
    conversions: 1,
    spendMicros: 70_000_000n as CurrencyMicros,
  });
  const nonConvertingLow = createTerm({
    conversions: 0,
    spendMicros: 20_000_000n as CurrencyMicros,
  });
  const nonConvertingHigh = createTerm({
    conversions: 0,
    spendMicros: 80_000_000n as CurrencyMicros,
  });

  const waterfall = engine.computeSpendWaterfall(
    [converting, convertingOver, nonConvertingLow, nonConvertingHigh],
    targetCpa
  );
  assert.equal(waterfall.securedSpendMicros, 90_000_000n);
  assert.equal(waterfall.wasteSpendMicros, 100_000_000n);
  assert.equal(waterfall.exploratorySpendMicros, 20_000_000n);
  assert.equal(waterfall.totalSpendMicros, 210_000_000n);
});
