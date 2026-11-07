/**
 * Executive Analytics Mathematical Invariants & CPA Drag Audit Unit Tests
 *
 * Operating Principles:
 * - Martin Fowler: Refactoring Test Code (Test Independence, Fixture Factories)
 * - Titus Winters et al. (SE at Google): Testing Behavioral Contracts over Implementation Details
 * - Parameterized Data-Driven Matrices
 * - Cooper's Mathematical Predictability: Finite, non-NaN, non-Infinity invariants across all edge states
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateOptimalBidCeiling,
  computeExecutiveAnalytics,
} from '../../src/utils/executiveAnalytics.ts';
import { calculateMarginalWaste } from '../../src/state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';
import type { SieveThresholds, KPISummary } from '../../src/state/useSieveStore.ts';
import { createFinancialFixture, type FinancialTestFixture } from './currency_math.test.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgWasmPath = path.resolve(__dirname, '../../crates/sieve_core/pkg/sieve_core_bg.wasm');
const targetWasmPath = path.resolve(__dirname, '../../target/wasm32-unknown-unknown/release/sieve_core.wasm');

async function loadWasm() {
  let wasmBuffer: Buffer;
  try {
    wasmBuffer = await fs.readFile(pkgWasmPath);
  } catch {
    wasmBuffer = await fs.readFile(targetWasmPath);
  }
  const wasmModule = await WebAssembly.compile(new Uint8Array(wasmBuffer));
  const exports: Record<string, any> = {};
  const imports = {
    './sieve_core_bg.js': {
      __wbindgen_init_externref_table: function () {
        if (exports.__wbindgen_externrefs) {
          exports.__wbindgen_externrefs.set(0, undefined);
          exports.__wbindgen_externrefs.set(1024, undefined);
          exports.__wbindgen_externrefs.set(1025, null);
          exports.__wbindgen_externrefs.set(1026, true);
          exports.__wbindgen_externrefs.set(1027, false);
        }
      },
    },
    wbg: {},
    env: {},
  };
  const instance = await WebAssembly.instantiate(wasmModule, imports);
  Object.assign(exports, instance.exports);
  if (typeof exports.__wbindgen_start === 'function') {
    exports.__wbindgen_start();
  }
  const memory = exports.memory as WebAssembly.Memory;
  return { instance, exports, memory };
}

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

// ============================================================================
// 1. Optimal Bid Ceiling Calculations Across Currencies
// ============================================================================

test('Optimal Bid Ceiling: Calculates diminishing returns boundary across currencies', () => {
  // USD
  const ceilingUSD = calculateOptimalBidCeiling(50, 0.04, [2.1, 2.3], '$');
  assert.ok(Number.isFinite(ceilingUSD));
  assert.ok(ceilingUSD > 0);
  assert.strictEqual(ceilingUSD, 2.5);

  // JPY: zero-decimal integer
  const ceilingJPY = calculateOptimalBidCeiling(5000, 0.04, [210, 230], '¥');
  assert.ok(Number.isInteger(ceilingJPY));
  assert.strictEqual(ceilingJPY, 250);

  // EUR, INR, GBP
  const ceilingEUR = calculateOptimalBidCeiling(40, 0.05, [], '€');
  assert.strictEqual(ceilingEUR, 2.3);

  const ceilingINR = calculateOptimalBidCeiling(2000, 0.03, [], '₹');
  assert.strictEqual(ceilingINR, 69.0);

  const ceilingGBP = calculateOptimalBidCeiling(30, 0.04, [], '£');
  assert.strictEqual(ceilingGBP, 1.38);
});

test('Optimal Bid Ceiling: Mathematical edge cases (Zero, NaN, Infinity protection)', () => {
  assert.strictEqual(calculateOptimalBidCeiling(0, 0.05, [], '$'), 0);
  assert.strictEqual(calculateOptimalBidCeiling(-50, 0.05, [], '$'), 0);
  assert.strictEqual(calculateOptimalBidCeiling(NaN, 0.05, [], '$'), 0);
  assert.strictEqual(calculateOptimalBidCeiling(Infinity, 0.05, [], '$'), 0);
  assert.ok(calculateOptimalBidCeiling(50, NaN, [], '$') > 0);
});

// ============================================================================
// 2. Executive Analytics Tier Calculations
// ============================================================================

test('Executive Analytics: Tier 1 (Rose/Red) Identified Waste Bleed and CPA Drag', () => {
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

  assert.strictEqual(analytics.wasteBleed.amount, 800);
  assert.strictEqual(analytics.wasteBleed.formatted, '$800.00');
  assert.strictEqual(analytics.wasteBleed.candidateCount, 2);
  assert.ok(analytics.wasteBleed.cpaDrag >= 0);
  assert.ok(analytics.wasteBleed.dragRatioPercent > 0);
  assert.strictEqual(analytics.wasteBleed.formattedCpaDrag.startsWith('$'), true);
});

test('Executive Analytics: Tier 2 (Emerald/Green) Safe-List Protected Conversions and Secured Revenue', () => {
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

  assert.strictEqual(analytics.safeListProtection.protectedConversions, 8);
  assert.strictEqual(analytics.safeListProtection.collisionCount, 2);
  assert.strictEqual(analytics.safeListProtection.exactLockedCount, 2);
  assert.strictEqual(analytics.safeListProtection.securedRevenue, 1200);
  assert.strictEqual(analytics.safeListProtection.formattedSecuredRevenue, '$1,200.00');

  // Test JPY zero-decimal formatting
  const analyticsJPY = computeExecutiveAnalytics(mockKeywords, { ...DEFAULT_THRESHOLDS, targetCPA: 5000 }, kpi, '¥');
  assert.strictEqual(analyticsJPY.safeListProtection.securedRevenue, 8 * 15000);
  assert.strictEqual(analyticsJPY.safeListProtection.formattedSecuredRevenue, '¥120,000');
});

test('Executive Analytics: Tier 3 (Amber/Orange) Exploratory High-Risk Clicks and Optimal Bid Ceiling', () => {
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
      clicks: 8,
      conversions: 0,
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

  assert.strictEqual(analytics.exploratoryRisk.highRiskClicks, 8);
  assert.strictEqual(analytics.exploratoryRisk.highRiskSpend, 250);
  assert.strictEqual(analytics.exploratoryRisk.formattedHighRiskSpend, '$250.00');
  assert.ok(analytics.exploratoryRisk.optimalBidCeiling > 0);
  assert.ok(analytics.exploratoryRisk.formattedOptimalBidCeiling.startsWith('$'));
});

test('Executive Analytics: Tier 4 (Indigo/Slate) Capital Reallocation Yield and Recovery', () => {
  const mockKeywords: PersistedNegativeKeyword[] = [];
  const kpi: KPISummary = {
    totalKeywords: 5,
    totalWaste: 1000,
    collisionCount: 0,
    avgConfidence: 0.9,
    exactLockedCount: 0,
  };

  const analytics = computeExecutiveAnalytics(mockKeywords, { ...DEFAULT_THRESHOLDS, targetCPA: 50 }, kpi, '$');

  assert.strictEqual(analytics.reallocationYield.incrementalConversions, 20);
  assert.strictEqual(analytics.reallocationYield.annualizedRecovery, 12000);
  assert.strictEqual(analytics.reallocationYield.formattedAnnualizedRecovery, '$12,000.00');
  assert.ok(analytics.reallocationYield.roasLiftPercent > 0);

  // Test JPY zero-decimal rounding
  const analyticsJPY = computeExecutiveAnalytics(mockKeywords, { ...DEFAULT_THRESHOLDS, targetCPA: 5000 }, { ...kpi, totalWaste: 10000 }, '¥');
  assert.strictEqual(analyticsJPY.reallocationYield.annualizedRecovery, 120000);
  assert.strictEqual(analyticsJPY.reallocationYield.formattedAnnualizedRecovery, '¥120,000');
});

test('Executive Analytics: Spend Waterfall Breakdown cleanly partitions total account spend', () => {
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

  const totalPct = wf.securedPct + wf.exploratoryPct + wf.wastePct;
  assert.ok(Math.abs(totalPct - 100) < 0.2, `Percentages must sum to approximately 100%, got ${totalPct}`);
});

// ============================================================================
// 3. Parameterized Marginal Calculation Matrix (from math_audit.test.ts)
// ============================================================================

interface MathAuditCalculationCase {
  scenario: string;
  fixture: FinancialTestFixture;
  expectedAllowableSpend: number;
  expectedMarginalWaste: number;
  allowableSpendMessage: string;
  wasteMessage: string;
}

const mathAuditCases: MathAuditCalculationCase[] = [
  {
    scenario: 'non-converting traffic (conversions === 0)',
    fixture: createFinancialFixture({ spend: 52.3, conversions: 0, targetCPA: 50.0 }),
    expectedAllowableSpend: 0,
    expectedMarginalWaste: 52.3,
    allowableSpendMessage: 'Allowable spend for 0 conversions must be 0.00',
    wasteMessage: 'When conversions === 0 and spend === 52.30, marginalWaste must be exactly $52.30',
  },
  {
    scenario: 'converting traffic with spend exceeding target CPA ceiling',
    fixture: createFinancialFixture({ spend: 150.0, conversions: 2, targetCPA: 50.0 }),
    expectedAllowableSpend: 100.0,
    expectedMarginalWaste: 50.0,
    allowableSpendMessage: 'When conversions === 2 and targetCPA === 50.00, allowableSpend must be $100.00',
    wasteMessage: 'When spend === 150.00 and allowableSpend === 100.00, marginalWaste must be $50.00',
  },
  {
    scenario: 'profitable traffic operating below target CPA ceiling',
    fixture: createFinancialFixture({ spend: 90.0, conversions: 3, targetCPA: 50.0 }),
    expectedAllowableSpend: 150.0,
    expectedMarginalWaste: 0.0,
    allowableSpendMessage: 'Allowable spend for 3 conversions at $50 target CPA must be $150.00',
    wasteMessage: 'When spend ($90.00) <= allowableSpend ($150.00), marginalWaste must be exactly $0.00',
  },
];

for (const { scenario, fixture, expectedAllowableSpend, expectedMarginalWaste, allowableSpendMessage, wasteMessage } of mathAuditCases) {
  test(`calculateMarginalWaste for ${scenario} -> verifies allowable spend and marginal waste invariants`, () => {
    const computedAllowableSpend = fixture.conversions * fixture.targetCPA;
    assert.strictEqual(computedAllowableSpend, expectedAllowableSpend, allowableSpendMessage);

    const computedWaste = calculateMarginalWaste(fixture.spend, fixture.conversions, fixture.targetCPA);
    assert.strictEqual(computedWaste, expectedMarginalWaste, wasteMessage);
  });
}

// ============================================================================
// 4. Parameterized Division-by-Zero Protection Matrix (from math_audit.test.ts)
// ============================================================================

interface DivisionProtectionCase {
  scenario: string;
  spend: number;
  conversions: number;
  targetCPA: number;
}

const divisionProtectionCases: DivisionProtectionCase[] = [
  { scenario: 'zero conversions and zero spend (conversions === 0, spend === 0)', spend: 0, conversions: 0, targetCPA: 50.0 },
  { scenario: 'zero target CPA (targetCPA === 0)', spend: 100.0, conversions: 2, targetCPA: 0 },
];

for (const { scenario, spend, conversions, targetCPA } of divisionProtectionCases) {
  test(`calculateMarginalWaste under ${scenario} -> outputs finite, non-NaN number`, () => {
    const waste = calculateMarginalWaste(spend, conversions, targetCPA);
    assert.strictEqual(Number.isNaN(waste), false, `marginalWaste must not be NaN for ${scenario}`);
    assert.strictEqual(Number.isFinite(waste), true, `marginalWaste must be finite for ${scenario}`);
  });
}

// ============================================================================
// 5. Rust WebAssembly CPA Drag Protection (from math_audit.test.ts)
// ============================================================================

test('WASM stats_calculate_cpa_drag division-by-zero protection -> returns 0.0 without panic', async () => {
  const { exports } = await loadWasm();
  assert.strictEqual(typeof exports.stats_calculate_cpa_drag, 'function');

  // Allocate 4 bytes for f32 (0.0 target CPA)
  const targetCpaPtr = exports.allocate_buffer(4);
  assert.ok(targetCpaPtr > 0);

  try {
    const targetCpaView = new Float32Array(exports.memory.buffer, targetCpaPtr, 1);
    targetCpaView[0] = 0.0;

    // Call stats_calculate_cpa_drag with 0 clicks, 0 spend, 0 conversions
    const drag = exports.stats_calculate_cpa_drag(0, 0, 0, targetCpaPtr);
    assert.strictEqual(Number.isNaN(drag), false);
    assert.strictEqual(Number.isFinite(drag), true);
    assert.strictEqual(drag, 0.0);
  } finally {
    exports.deallocate_buffer(targetCpaPtr, 4);
  }
});
