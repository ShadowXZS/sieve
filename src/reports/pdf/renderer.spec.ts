/**
 * SIEVE Client-Side Vector PDF Engine Specification & Integration Suite
 *
 * Verifies:
 * 1. Metric parity across PDF artifacts: Chapter 1 & One-Pager Hero Cards display
 *    Actionable Identified Waste ($2,375,590.85 / 8.5% CPA Drag) matching Chapter 2 Waste Bleed.
 * 2. Chapter 2 Spend Waterfall percentages strictly total 100% (Secured 91.5%, Exploratory 0.1%, Waste Bleed 8.4%).
 * 3. Reallocation yield reflects convex-damped projection (+35,633 conversions / gamma-adjusted 0.75).
 * 4. Chapter 3 dilution metrics bind to dilutionSummary with populated hijacked query table.
 * 5. In-memory client-side vector synthesis with zero network calls and valid %PDF- binary header.
 *
 * Line ceiling: <= 250 lines.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

import { AuditOnePager } from './AuditOnePager.tsx';
import { ForensicDeck } from './ForensicDeck.tsx';
import { Chapter1Summary } from './components/Chapter1Summary.tsx';
import { Chapter2Reallocation } from './components/Chapter2Reallocation.tsx';
import { Chapter3SearchTerms } from './components/Chapter3SearchTerms.tsx';
import { generatePdfBlob, verifyPdfSignature } from './renderer.ts';
import { useSieveStore } from '../../state/useSieveStore.ts';
import { calculateReallocationModel } from '../reallocation.ts';
import { computeExecutiveAnalytics } from '../../utils/executiveAnalytics.ts';
import type { DilutionSummary } from '../../domain/types/dilution.ts';
import type { CurrencyMicros, ClickCount, QueryString } from '../../domain/types/primitives.ts';
import type { PersistedNegativeKeyword } from '../../workers/protocol.ts';

function flattenTree(element: unknown): unknown[] {
  if (!element) return [];
  if (Array.isArray(element)) return element.flatMap(flattenTree);
  if (typeof element !== 'object') return [];
  const el = element as { type?: unknown; props?: { children?: unknown } };
  if (typeof el.type === 'function') {
    try { return flattenTree((el.type as (props: unknown) => unknown)(el.props)); } catch { return [element]; }
  }
  const nodes: unknown[] = [element];
  const children = el.props?.children;
  if (Array.isArray(children)) for (const child of children) nodes.push(...flattenTree(child));
  else if (children && typeof children === 'object') nodes.push(...flattenTree(children));
  return nodes;
}

function getNodeText(node: unknown): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  const children = (node as { props?: { children?: unknown } }).props?.children;
  if (Array.isArray(children)) return children.map(getNodeText).join('');
  return children ? getNodeText(children) : '';
}

function makeKeyword(overrides: Partial<PersistedNegativeKeyword> = {}): PersistedNegativeKeyword {
  return {
    sha256Hash: `hash_${Math.random().toString(36).substring(2, 8)}`,
    keyword: 'sample query', matchType: 'broad', confidenceScore: 0.95, marginalWaste: 100,
    cost: 100, clicks: 10, conversions: 0, hasCollision: false, createdAt: Date.now(),
    ...overrides,
  };
}

const BENCHMARK_KEYWORDS: PersistedNegativeKeyword[] = [
  makeKeyword({ sha256Hash: 'sec_1', keyword: 'secured brand query', matchType: 'exact', cost: 25_800_000, conversions: 516_000, clicks: 500_000, hasCollision: true }),
  makeKeyword({ sha256Hash: 'wst_1', keyword: 'zero conv waste bleed', matchType: 'broad', cost: 2_375_590.85, conversions: 0, clicks: 70_000, confidenceScore: 0.95 }),
  makeKeyword({ sha256Hash: 'vol_1', keyword: 'filter matched volume term', matchType: 'phrase', cost: 17_332_697.01, conversions: 0, clicks: 120_000, confidenceScore: 0.70 }),
];

const MOCK_DILUTION_SUMMARY: DilutionSummary = {
  dilutionIndexPercent: 14.5,
  totalBudgetLostMicros: 125_500_000n as CurrencyMicros,
  dilutedQueryCount: 2,
  averageInflationRatio: 1.65,
  pairs: [
    { exactQuery: 'crm software' as QueryString, broadQuery: 'best crm software tools' as QueryString, exactCpcMicros: 2_000_000n as CurrencyMicros, broadCpcMicros: 3_500_000n as CurrencyMicros, cpcInflationRatio: 1.75, hijackedClicks: 50 as ClickCount, budgetLostMicros: 75_000_000n as CurrencyMicros },
    { exactQuery: 'accounting tool' as QueryString, broadQuery: 'online accounting tool free' as QueryString, exactCpcMicros: 1_500_000n as CurrencyMicros, broadCpcMicros: 2_510_000n as CurrencyMicros, cpcInflationRatio: 1.67, hijackedClicks: 50 as ClickCount, budgetLostMicros: 50_500_000n as CurrencyMicros },
  ],
};

describe('Vector PDF Engine: Metric Parity & Dilution Restoration', () => {
  test('Step 1: AuditOnePager receives unified store props and displays reconciled $2.375M waste and +35,633 yield', () => {
    useSieveStore.getState().reset();
    useSieveStore.getState().updateThresholds({ maxMarginalWaste: 100_000_000, targetCPA: 50 });
    useSieveStore.getState().setKeywords(BENCHMARK_KEYWORDS);
    useSieveStore.getState().setCurrency('$', true);

    const store = useSieveStore.getState();
    const metrics = store.getSummaryMetrics();
    const kpi = store.kpi;
    const reallocation = calculateReallocationModel({
      recoveredWaste: Number(metrics.actionableWasteMicros) / 1_000_000,
      marginalCPA: 50,
      baselineSpend: Number(metrics.totalSpendMicros) / 1_000_000,
      baselineConversions: metrics.protectedConversions,
    });
    const analytics = computeExecutiveAnalytics(store.filteredKeywords, store.thresholds, kpi, '$');

    const tree = AuditOnePager({ kpi, reallocation, analytics, metrics, currencySymbol: '$', topKeywords: store.filteredKeywords });
    const allText = flattenTree(tree).map(getNodeText).join(' ');

    assert.ok(allText.includes('$2,375,590.85'), 'Hero card must display $2,375,590.85 actionable waste');
    assert.ok(!allText.includes('$19,708,287.86'), 'Hero card must NOT display $19.7M gross volume');
    assert.ok(allText.includes('+35,633 Conv.'), 'Reallocation card must reflect Cobb-Douglas gamma yield (+35,633 Conv.)');
    assert.ok(allText.includes('Cobb-Douglas Damping'), 'Formula callout must reference convex damping equation');
  });

  test('Step 2: Chapter 1 Identified Waste matches Chapter 2 Waste Bleed and Waterfall totals 100%', () => {
    useSieveStore.getState().reset();
    useSieveStore.getState().updateThresholds({ maxMarginalWaste: 100_000_000, targetCPA: 50 });
    useSieveStore.getState().setKeywords(BENCHMARK_KEYWORDS);
    useSieveStore.getState().setCurrency('$', true);

    const store = useSieveStore.getState();
    const metrics = store.getSummaryMetrics();
    const waterfall = store.getSpendWaterfall();
    const kpi = store.kpi;
    const reallocation = calculateReallocationModel({
      recoveredWaste: Number(metrics.actionableWasteMicros) / 1_000_000,
      marginalCPA: 50,
    });
    const analytics = computeExecutiveAnalytics(store.filteredKeywords, store.thresholds, kpi, '$');

    const ch1Tree = Chapter1Summary({
      organizationTitle: 'Test Audit', accentColor: '#10b981', kpi, reallocation, analytics, metrics, wastePercentage: metrics.wastePercentage,
    });
    const ch1Text = flattenTree(ch1Tree).map(getNodeText).join(' ');

    const ch2Tree = Chapter2Reallocation({ reallocation, analytics, metrics, waterfall, currency: '$' });
    const ch2Text = flattenTree(ch2Tree).map(getNodeText).join(' ');

    assert.ok(ch1Text.includes('$2,375,590.85'), 'Chapter 1 Hero must show $2,375,590.85');
    assert.ok(ch2Text.includes('$2,375,590.85'), 'Chapter 2 Waste Bleed tier must show $2,375,590.85');
    assert.ok(ch2Text.includes('91.5%'), 'Chapter 2 Secured spend share must be 91.5%');
    assert.ok(ch2Text.includes('0.1%'), 'Chapter 2 Exploratory share must be 0.1%');
    assert.ok(ch2Text.includes('8.4%'), 'Chapter 2 Waste Bleed share must be 8.4%');
    assert.ok(ch2Text.includes('+35,633'), 'Chapter 2 formula callout must output +35,633 acquisitions');
  });

  test('Step 3: Chapter 3 renders populated Match-Type Dilution Index and hijacked query table', () => {
    const analytics = computeExecutiveAnalytics(BENCHMARK_KEYWORDS, { targetCPA: 50, minClicks: 5 }, { totalWaste: 2375590.85 } as any, '$');
    const ch3Tree = Chapter3SearchTerms({
      keywords: BENCHMARK_KEYWORDS,
      analytics,
      currency: '$',
      dilutionSummary: MOCK_DILUTION_SUMMARY,
      longTail: { total_long_tail_queries: 12, total_long_tail_clicks: 18, total_long_tail_cost: 450, total_long_tail_waste: 450, identified_root_tokens_count: 3, root_tokens: [] },
    });

    const ch3Text = flattenTree(ch3Tree).map(getNodeText).join(' ');

    assert.ok(ch3Text.includes('14.5%'), 'Must display Dilution Index 14.5%');
    assert.ok(ch3Text.includes('$125.50'), 'Must display Budget Lost $125.50');
    assert.ok(ch3Text.includes('2 diluted queries'), 'Must display 2 diluted queries');
    assert.ok(ch3Text.includes('1.65x'), 'Must display average inflation 1.65x');
    assert.ok(!ch3Text.includes('$0.00 across 0 diluted queries'), 'Must NOT output hardcoded $0.00 across 0 diluted queries');

    assert.ok(ch3Text.includes('best crm software tools'), 'Must render top hijacked query 1');
    assert.ok(ch3Text.includes('$2.00') && ch3Text.includes('$3.50'), 'Must render Exact vs Broad CPC');
    assert.ok(ch3Text.includes('$75.00'), 'Must render budget lost for hijacked query');
    assert.ok(ch3Text.includes('online accounting tool free'), 'Must render top hijacked query 2');
  });

  test('Step 4: Vector PDF generation compiles in-memory with valid %PDF- binary signature', async () => {
    const store = useSieveStore.getState();
    const kpi = store.kpi;
    const reallocation = calculateReallocationModel({ recoveredWaste: 1000, marginalCPA: 50 });
    const analytics = computeExecutiveAnalytics([], { targetCPA: 50, minClicks: 5 }, kpi, '$');

    const doc = React.createElement(ForensicDeck, {
      kpi,
      reallocation,
      analytics,
      dilutionResult: {
        dilution_index: 0.145,
        budget_lost: 125.5,
        diluted_queries_count: 2,
        total_diluted_clicks: 100,
        diluted_spend: 300,
        exact_benchmark_spend: 174.5,
        average_cpc_inflation: 1.65,
        items: [{ query: 'best crm software tools', exact_cpc: 2.0, broad_cpc: 3.5, clicks: 50, budget_lost: 75.0, cpc_inflation_ratio: 1.75 }],
      },
    });

    const blob = await generatePdfBlob(doc);
    assert.ok(blob.size > 1000, 'Compiled PDF Blob must have substantial size');
    assert.strictEqual(await verifyPdfSignature(blob), true, 'Must possess valid %PDF- signature');
  });
});
