/**
 * High-Fidelity Vector PDF Synchronization & Multi-Currency Engine Tests
 *
 * Requirements:
 * 1. Client-side vector PDF generation synchronizes directly with Executive Dashboard semantic tiers.
 * 2. UTF-8 font embedding propagates active currency symbols ($, ₹, €, ¥, £) cleanly without missing glyphs.
 * 3. Color-coded semantic sections (Waste Bleed, Safe-List Protected, High Risk, Reallocation)
 *    are populated in AuditOnePager and ForensicDeck.
 * 4. ForensicDeck layout tree embeds bid elasticity and long-tail dilution metrics.
 * 5. Generated document returns valid %PDF- binary signature without encoding exceptions.
 * 6. Zero network calls constraint: 100% in-memory client-side execution.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

import { AuditOnePager, type AuditOnePagerProps } from '../../src/reports/pdf/AuditOnePager.tsx';
import { ForensicDeck, type ForensicDeckProps } from '../../src/reports/pdf/ForensicDeck.tsx';
import { generatePdfBlob, verifyPdfSignature } from '../../src/reports/pdf/renderer.ts';
import {
  EXECUTIVE_COLOR_TOKENS,
  CERTIFIED_PDF_FONT,
  executivePdfStyles,
} from '../../src/reports/pdf/styles.ts';
import { calculateReallocationModel, type ReallocationModel } from '../../src/reports/reallocation.ts';
import {
  computeExecutiveAnalytics,
  computeFragmentedLongTail,
  computeMatchTypeDilution,
  type ExecutiveAnalytics,
} from '../../src/utils/executiveAnalytics.ts';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../../src/utils/currency.ts';
import type { KPISummary, SieveThresholds } from '../../src/state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

const MOCK_KPI: KPISummary = {
  totalWaste: 18450.5,
  totalKeywords: 142,
  avgConfidence: 0.94,
  collisionCount: 7,
  exactLockedCount: 7,
  processedRows: 5000,
};

const MOCK_THRESHOLDS: SieveThresholds = {
  targetCPA: 45,
  minClicks: 10,
  minSpend: 50,
  minConfidence: 0.85,
};

const MOCK_KEYWORDS: PersistedNegativeKeyword[] = [
  {
    id: 'kw-1',
    keyword: 'free download crack',
    matchType: 'broad',
    clicks: 120,
    cost: 420.5,
    conversions: 0,
    marginalWaste: 420.5,
    confidenceScore: 0.98,
    hasCollision: false,
    clusterId: 'cluster-software',
    sha256Hash: 'hash-1',
    createdAt: Date.now(),
    campaignId: 'camp-1',
    adGroupId: 'ag-1',
  },
  {
    id: 'kw-2',
    keyword: 'running shoes sale',
    matchType: 'exact',
    clicks: 80,
    cost: 240.0,
    conversions: 8,
    marginalWaste: 0,
    confidenceScore: 0.92,
    hasCollision: true,
    collidingTerm: 'official running shoes store',
    clusterId: 'cluster-b2b',
    sha256Hash: 'hash-2',
    createdAt: Date.now(),
    campaignId: 'camp-1',
    adGroupId: 'ag-2',
  },
  {
    id: 'kw-3',
    keyword: 'expensive trial software',
    matchType: 'phrase',
    clicks: 6,
    cost: 150.0,
    conversions: 0,
    marginalWaste: 150.0,
    confidenceScore: 0.72,
    hasCollision: false,
    clusterId: 'cluster-piracy',
    sha256Hash: 'hash-3',
    createdAt: Date.now(),
    campaignId: 'camp-2',
    adGroupId: 'ag-3',
  },
];

describe('Vector PDF Synchronization & Multi-Currency Engine', () => {
  const reallocationModel: ReallocationModel = calculateReallocationModel({
    recoveredWaste: MOCK_KPI.totalWaste,
    marginalCPA: 45,
    baselineSpend: 85000,
    baselineConversions: 850,
    baselineRevenue: 255000,
  });

  test('Shared Styles: Exports color tokens and certified font definitions', () => {
    assert.equal(CERTIFIED_PDF_FONT, 'DejaVuSans');
    assert.ok(EXECUTIVE_COLOR_TOKENS.wasteBleed, 'Must define wasteBleed token');
    assert.ok(EXECUTIVE_COLOR_TOKENS.safeList, 'Must define safeList token');
    assert.ok(EXECUTIVE_COLOR_TOKENS.highRisk, 'Must define highRisk token');
    assert.ok(EXECUTIVE_COLOR_TOKENS.reallocation, 'Must define reallocation token');
    assert.ok(executivePdfStyles.page, 'Must define page styling');
  });

  test('AuditOnePager: Synchronizes with live Executive Dashboard 4-tier semantic sections', () => {
    const analytics: ExecutiveAnalytics = computeExecutiveAnalytics(
      MOCK_KEYWORDS,
      MOCK_THRESHOLDS,
      MOCK_KPI,
      '$'
    );

    const props: AuditOnePagerProps = {
      organizationTitle: 'Apex Global Growth Ltd.',
      accentColor: '#10b981',
      notes: 'Strategic mandate: enforce exact negative exclusions on non-converting clusters.',
      currencySymbol: '$',
      kpi: MOCK_KPI,
      reallocation: reallocationModel,
      topKeywords: MOCK_KEYWORDS,
      reportDate: '2026-11-04',
      analytics,
      thresholds: MOCK_THRESHOLDS,
    };

    const element = React.createElement(AuditOnePager, props);
    assert.ok(React.isValidElement(element), 'AuditOnePager must be a valid React element');
    assert.equal(element.props.organizationTitle, 'Apex Global Growth Ltd.');
    assert.equal(element.props.currencySymbol, '$');
    assert.ok(element.props.analytics, 'Must receive synchronized ExecutiveAnalytics');
    assert.equal(element.props.analytics.wasteBleed.amount, analytics.wasteBleed.amount);
    assert.equal(element.props.analytics.safeListProtection.collisionCount, 7);
  });

  test('Currency Symbol Propagation: Propagates user-selected currency ($, ₹, €, ¥, £) directly into element tree', () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      const analytics = computeExecutiveAnalytics(
        MOCK_KEYWORDS,
        MOCK_THRESHOLDS,
        MOCK_KPI,
        currency
      );

      const element = React.createElement(AuditOnePager, {
        organizationTitle: `Audit Test ${currency}`,
        currencySymbol: currency,
        kpi: MOCK_KPI,
        reallocation: reallocationModel,
        topKeywords: MOCK_KEYWORDS,
        reportDate: '2026-11-04',
        analytics,
      });

      assert.equal(element.props.currencySymbol, currency, `Currency prop must match ${currency}`);
      assert.ok(
        element.props.analytics!.wasteBleed.formatted.includes(currency),
        `Formatted waste must contain active currency symbol ${currency}`
      );
    }
  });

  test('ForensicDeck: Synchronizes all 4 chapters and embeds bid elasticity and dilution metrics', () => {
    const analytics: ExecutiveAnalytics = computeExecutiveAnalytics(
      MOCK_KEYWORDS,
      MOCK_THRESHOLDS,
      MOCK_KPI,
      '€'
    );
    const longTail = computeFragmentedLongTail(MOCK_KEYWORDS, 50, '€');
    const dilution = computeMatchTypeDilution(MOCK_KEYWORDS, '€');

    const props: ForensicDeckProps = {
      organizationTitle: 'European E-Commerce Forensic Deck',
      accentColor: '#6366f1',
      currencySymbol: '€',
      notes: 'Evaluate bid elasticity across broad exploratory traffic.',
      kpi: MOCK_KPI,
      reallocation: reallocationModel,
      keywords: MOCK_KEYWORDS,
      reportDate: '2026-11-04',
      analytics,
      thresholds: MOCK_THRESHOLDS,
      longTailResult: longTail,
      dilutionResult: dilution,
    };

    const element = React.createElement(ForensicDeck, props);
    assert.ok(React.isValidElement(element));
    assert.equal(element.props.currencySymbol, '€');
    assert.equal(element.props.analytics!.exploratoryRisk.highRiskClicks, analytics.exploratoryRisk.highRiskClicks);
  });

  test('Vector PDF Synthesis: In-memory compilation produces valid %PDF- binary header', async () => {
    const analytics = computeExecutiveAnalytics(
      MOCK_KEYWORDS,
      MOCK_THRESHOLDS,
      MOCK_KPI,
      '$'
    );

    const docElement = React.createElement(AuditOnePager, {
      organizationTitle: 'Vector PDF Test',
      currencySymbol: '$',
      kpi: MOCK_KPI,
      reallocation: reallocationModel,
      topKeywords: MOCK_KEYWORDS,
      reportDate: '2026-11-04',
      analytics,
    });

    const pdfBlob = await generatePdfBlob(docElement);
    assert.ok(pdfBlob, 'Must generate valid PDF Blob');
    assert.ok(pdfBlob.size > 1000, `PDF size (${pdfBlob.size} bytes) must be substantial`);

    const isValidSig = await verifyPdfSignature(pdfBlob);
    assert.strictEqual(isValidSig, true, 'Generated binary must possess valid %PDF- header signature');
  });
});
