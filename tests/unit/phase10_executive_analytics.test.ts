/**
 * Phase 10 - Executive Analytics Mathematical Invariants & Unit Tests
 *
 * Asserts:
 * 1. Tier 1 (Rose/Red): Identified Waste Bleed and CPA Drag math.
 * 2. Tier 2 (Emerald/Green): Safe-List Protected Conversions and Secured Revenue math.
 * 3. Tier 3 (Amber/Orange): Exploratory High-Risk Clicks and Optimal Bid Ceiling math.
 * 4. Tier 4 (Indigo/Slate): Capital Reallocation Yield and Annualized Recovery math.
 * 5. Spend Waterfall Breakdown: Clean partitioning of spend across tiers, percentage sum validation.
 * 6. Multi-currency and precision invariants: Zero-decimal rounding for JPY ('¥'), standard 2-decimal for others.
 * 7. Mathematical safety: Zero division-by-zero, Zero NaN, Zero Infinity across all edge cases.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateOptimalBidCeiling,
  computeExecutiveAnalytics,
} from '../../src/utils/executiveAnalytics.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';
import type { SieveThresholds, KPISummary } from '../../src/state/useSieveStore.ts';
import type { SupportedCurrency } from '../../src/utils/currency.ts';

const DEFAULT_THRESHOLDS: SieveThresholds = {
  confidenceScore: 0.8,
  maxMarginalWaste: 100000,
  minClicks: 5,
  targetCPA: 50,
};

const DEFAULT_KPI: KPISummary = {
  totalKeywords: 10,
  totalWaste: 1250.5,
  collisionCount: 3,
  avgConfidence: 0.92,
  exactLockedCount: 2,
};

test('Phase 10: Optimal Bid Ceiling calculates diminishing returns boundary across currencies', () => {
  // Test USD: standard 2 decimals
  const ceilingUSD = calculateOptimalBidCeiling(50, 0.04, [2.1, 2.3], '$');
  assert.ok(Number.isFinite(ceilingUSD), 'Ceiling must be finite');
  assert.ok(ceilingUSD > 0, 'Ceiling must be positive');
  assert.strictEqual(ceilingUSD, 2.5, 'Ceiling should be min(max converting CPC * 1.1, breakeven * 1.25)');

  // Test JPY: strictly zero-decimal rounding
  const ceilingJPY = calculateOptimalBidCeiling(5000, 0.04, [210, 230], '¥');
  assert.ok(Number.isInteger(ceilingJPY), 'JPY ceiling must be an integer (zero-decimal rounding)');
  assert.strictEqual(ceilingJPY, 250, 'JPY ceiling correctly rounded to nearest integer');

  // Test GBP, EUR, INR
  const ceilingEUR = calculateOptimalBidCeiling(40, 0.05, [], '€');
  assert.strictEqual(ceilingEUR, 2.3, 'Ceiling without prior converting CPC uses TargetCPA * CVR * 1.15');

  const ceilingINR = calculateOptimalBidCeiling(2000, 0.03, [], '₹');
  assert.strictEqual(ceilingINR, 69.0, 'INR ceiling computed with 2 decimals');

  const ceilingGBP = calculateOptimalBidCeiling(30, 0.04, [], '£');
  assert.strictEqual(ceilingGBP, 1.38, 'GBP ceiling computed with 2 decimals');
});

test('Phase 10: Optimal Bid Ceiling mathematical edge cases (Zero, NaN, Infinity protection)', () => {
  // Target CPA = 0 -> ceiling must be 0
  assert.strictEqual(calculateOptimalBidCeiling(0, 0.05, [], '$'), 0);
  assert.strictEqual(calculateOptimalBidCeiling(-50, 0.05, [], '$'), 0);

  // NaN / non-finite inputs gracefully handled
  assert.strictEqual(calculateOptimalBidCeiling(NaN, 0.05, [], '$'), 0);
  assert.strictEqual(calculateOptimalBidCeiling(Infinity, 0.05, [], '$'), 0);
  assert.ok(calculateOptimalBidCeiling(50, NaN, [], '$') > 0, 'Fallback CVR used for NaN CVR');
});

test('Phase 10 Tier 1 (Rose/Red): Identified Waste Bleed and CPA Drag calculations', () => {
  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'kw1',
      keyword: 'free shoes online',
      matchType: 'broad',
      formattedRule: 'free shoes online',
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
      sha256Hash: 'kw2',
      keyword: 'cheap shoes discount',
      matchType: 'phrase',
      formattedRule: '"cheap shoes discount"',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 300,
      cost: 400,
      clicks: 80,
      conversions: 2,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  const kpi: KPISummary = {
    totalKeywords: 2,
    totalWaste: 800,
    collisionCount: 0,
    avgConfidence: 0.925,
    exactLockedCount: 0,
  };

  const analytics = computeExecutiveAnalytics(mockKeywords, DEFAULT_THRESHOLDS, kpi, '$');

  // Verify Tier 1 metrics
  assert.strictEqual(analytics.wasteBleed.amount, 800);
  assert.strictEqual(analytics.wasteBleed.formatted, '$800.00');
  assert.strictEqual(analytics.wasteBleed.candidateCount, 2);
  assert.ok(analytics.wasteBleed.cpaDrag >= 0, 'CPA Drag must be non-negative');
  assert.ok(analytics.wasteBleed.dragRatioPercent > 0, 'Drag ratio percent must be positive');
  assert.strictEqual(analytics.wasteBleed.formattedCpaDrag.startsWith('$'), true);
});

test('Phase 10 Tier 2 (Emerald/Green): Safe-List Protected Conversions and Secured Revenue', () => {
  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'kw_safe_1',
      keyword: 'running shoes brand',
      matchType: 'exact',
      formattedRule: '[running shoes brand]',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 50,
      cost: 300,
      clicks: 50,
      conversions: 5,
      hasCollision: true,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'kw_safe_2',
      keyword: 'marathon shoes sale',
      matchType: 'exact',
      formattedRule: '[marathon shoes sale]',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 0,
      cost: 200,
      clicks: 40,
      conversions: 3,
      hasCollision: true,
      createdAt: Date.now(),
    },
  ];

  const kpi: KPISummary = {
    totalKeywords: 2,
    totalWaste: 50,
    collisionCount: 2,
    avgConfidence: 0.925,
    exactLockedCount: 2,
  };

  const analytics = computeExecutiveAnalytics(mockKeywords, { ...DEFAULT_THRESHOLDS, targetCPA: 50 }, kpi, '$');

  // Verify Tier 2 metrics
  // Protected conversions = 5 + 3 = 8
  assert.strictEqual(analytics.safeListProtection.protectedConversions, 8);
  assert.strictEqual(analytics.safeListProtection.collisionCount, 2);
  assert.strictEqual(analytics.safeListProtection.exactLockedCount, 2);
  // Secured revenue = 8 * (50 * 3) = 8 * 150 = 1200
  assert.strictEqual(analytics.safeListProtection.securedRevenue, 1200);
  assert.strictEqual(analytics.safeListProtection.formattedSecuredRevenue, '$1,200.00');

  // Test JPY zero-decimal formatting
  const analyticsJPY = computeExecutiveAnalytics(mockKeywords, { ...DEFAULT_THRESHOLDS, targetCPA: 5000 }, kpi, '¥');
  assert.strictEqual(analyticsJPY.safeListProtection.securedRevenue, 8 * 15000); // 120,000
  assert.strictEqual(analyticsJPY.safeListProtection.formattedSecuredRevenue, '¥120,000');
});

test('Phase 10 Tier 3 (Amber/Orange): Exploratory High-Risk Clicks and Optimal Bid Ceiling', () => {
  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'kw_high_risk',
      keyword: 'custom luxury shoes',
      matchType: 'broad',
      formattedRule: 'custom luxury shoes',
      platform: 1,
      confidenceScore: 0.75,
      marginalWaste: 250,
      cost: 250,
      clicks: 8, // Low sample size (< 10)
      conversions: 0, // Unproven
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  const kpi: KPISummary = {
    totalKeywords: 1,
    totalWaste: 250,
    collisionCount: 0,
    avgConfidence: 0.75,
    exactLockedCount: 0,
  };

  const analytics = computeExecutiveAnalytics(mockKeywords, { ...DEFAULT_THRESHOLDS, targetCPA: 50 }, kpi, '$');

  // High-risk clicks = 8, high-risk spend = 250
  assert.strictEqual(analytics.exploratoryRisk.highRiskClicks, 8);
  assert.strictEqual(analytics.exploratoryRisk.highRiskSpend, 250);
  assert.strictEqual(analytics.exploratoryRisk.formattedHighRiskSpend, '$250.00');
  assert.ok(analytics.exploratoryRisk.optimalBidCeiling > 0);
  assert.ok(analytics.exploratoryRisk.formattedOptimalBidCeiling.startsWith('$'));
});

test('Phase 10 Tier 4 (Indigo/Slate): Capital Reallocation Yield and Annualized Recovery', () => {
  const mockKeywords: PersistedNegativeKeyword[] = [];
  const kpi: KPISummary = {
    totalKeywords: 5,
    totalWaste: 1000,
    collisionCount: 0,
    avgConfidence: 0.9,
    exactLockedCount: 0,
  };

  const analytics = computeExecutiveAnalytics(mockKeywords, { ...DEFAULT_THRESHOLDS, targetCPA: 50 }, kpi, '$');

  // Incremental conversions = 1000 / 50 = 20
  assert.strictEqual(analytics.reallocationYield.incrementalConversions, 20);
  // Annualized recovery = 1000 * 12 = 12000
  assert.strictEqual(analytics.reallocationYield.annualizedRecovery, 12000);
  assert.strictEqual(analytics.reallocationYield.formattedAnnualizedRecovery, '$12,000.00');
  assert.ok(analytics.reallocationYield.roasLiftPercent > 0);

  // Test JPY zero-decimal rounding
  const analyticsJPY = computeExecutiveAnalytics(mockKeywords, { ...DEFAULT_THRESHOLDS, targetCPA: 5000 }, { ...kpi, totalWaste: 10000 }, '¥');
  assert.strictEqual(analyticsJPY.reallocationYield.annualizedRecovery, 120000);
  assert.strictEqual(analyticsJPY.reallocationYield.formattedAnnualizedRecovery, '¥120,000');
});

test('Phase 10 Spend Waterfall Breakdown: Proportions cleanly partition total account spend', () => {
  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'kw_waste',
      keyword: 'waste term',
      matchType: 'broad',
      formattedRule: 'waste term',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 400,
      cost: 400,
      clicks: 100,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'kw_exploratory',
      keyword: 'exploratory term',
      matchType: 'phrase',
      formattedRule: '"exploratory term"',
      platform: 1,
      confidenceScore: 0.7,
      marginalWaste: 150,
      cost: 150,
      clicks: 6,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
    {
      sha256Hash: 'kw_secured',
      keyword: 'converting safe term',
      matchType: 'exact',
      formattedRule: '[converting safe term]',
      platform: 1,
      confidenceScore: 0.9,
      marginalWaste: 0,
      cost: 450,
      clicks: 90,
      conversions: 9,
      hasCollision: true,
      createdAt: Date.now(),
    },
  ];

  const kpi: KPISummary = {
    totalKeywords: 3,
    totalWaste: 400,
    collisionCount: 1,
    avgConfidence: 0.85,
    exactLockedCount: 1,
  };

  const analytics = computeExecutiveAnalytics(mockKeywords, DEFAULT_THRESHOLDS, kpi, '$');
  const wf = analytics.spendWaterfall;

  assert.strictEqual(wf.totalSpend, 1000);
  assert.strictEqual(wf.wasteSpend, 400);
  assert.strictEqual(wf.exploratorySpend, 150);
  assert.strictEqual(wf.securedSpend, 450);

  // Percentages sum to 100%
  const totalPct = wf.securedPct + wf.exploratoryPct + wf.wastePct;
  assert.ok(Math.abs(totalPct - 100) < 0.2, `Percentages must sum to approximately 100%, got ${totalPct}`);
});
