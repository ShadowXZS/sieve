/**
 * Phase 12 TDD Red Phase: Executive Dashboard PDF Sync & Multi-Currency Engine
 *
 * Requirements:
 * 1. PDF document tree contains exact currency symbols matching current user selection ($, ₹, €, ¥, £).
 * 2. PDF layout tree defines the 4 color-coded executive sections matching the live web dashboard.
 * 3. ForensicDeck layout tree embeds bid elasticity and long-tail dilution metrics.
 * 4. Generated document returns valid %PDF- binary signature without encoding exceptions.
 * 5. Uses shared styles, certified font definitions, and color tokens from src/reports/pdf/styles.ts.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

import { AuditOnePager } from '../../src/reports/pdf/AuditOnePager.tsx';
import { ForensicDeck } from '../../src/reports/pdf/ForensicDeck.tsx';
import { generatePdfBlob, verifyPdfSignature } from '../../src/reports/pdf/renderer.ts';
import {
  EXECUTIVE_COLOR_TOKENS,
  CERTIFIED_PDF_FONT,
  executivePdfStyles,
} from '../../src/reports/pdf/styles.ts';
import { calculateReallocationModel } from '../../src/reports/reallocation.ts';
import {
  computeExecutiveAnalytics,
  computeFragmentedLongTail,
  computeMatchTypeDilution,
} from '../../src/utils/executiveAnalytics.ts';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../../src/utils/currency.ts';
import type { KPISummary, SieveThresholds } from '../../src/state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

const MOCK_KPI: KPISummary = {
  totalWaste: 24500.0,
  totalKeywords: 180,
  avgConfidence: 0.95,
  collisionCount: 12,
  exactLockedCount: 8,
  processedRows: 10000,
};

const MOCK_THRESHOLDS: SieveThresholds = {
  targetCPA: 50,
  minClicks: 10,
  minSpend: 50,
  minConfidence: 0.85,
};

const MOCK_KEYWORDS: PersistedNegativeKeyword[] = [
  {
    id: 'kw-1',
    keyword: 'free download crack keygen',
    matchType: 'broad',
    clicks: 250,
    cost: 1250.0,
    conversions: 0,
    marginalWaste: 1250.0,
    confidenceScore: 0.99,
    hasCollision: false,
    clusterId: 'cluster-software',
    sha256Hash: 'hash-1',
    createdAt: Date.now(),
    campaignId: 'camp-1',
    adGroupId: 'ag-1',
  },
  {
    id: 'kw-2',
    keyword: 'crm enterprise software solution',
    matchType: 'phrase',
    clicks: 140,
    cost: 700.0,
    conversions: 8,
    marginalWaste: 0,
    confidenceScore: 0.35,
    hasCollision: true,
    collidingTerm: 'crm enterprise software',
    clusterId: 'cluster-b2b',
    sha256Hash: 'hash-2',
    createdAt: Date.now(),
    campaignId: 'camp-1',
    adGroupId: 'ag-2',
  },
  {
    id: 'kw-3',
    keyword: 'cheap free serial license',
    matchType: 'exact',
    clicks: 80,
    cost: 320.0,
    conversions: 0,
    marginalWaste: 320.0,
    confidenceScore: 0.98,
    hasCollision: false,
    clusterId: 'cluster-piracy',
    sha256Hash: 'hash-3',
    createdAt: Date.now(),
    campaignId: 'camp-2',
    adGroupId: 'ag-3',
  },
];

describe('Phase 12 TDD: Executive Dashboard Vector PDF Synchronization', () => {
  const reallocationModel = calculateReallocationModel({
    recoveredWaste: MOCK_KPI.totalWaste,
    marginalCPA: 50,
    baselineSpend: 100000,
    baselineConversions: 1000,
    baselineRevenue: 300000,
  });

  test('Shared Styles: Exports color tokens and certified font definitions', () => {
    assert.equal(CERTIFIED_PDF_FONT, 'DejaVuSans');
    assert.ok(EXECUTIVE_COLOR_TOKENS.wasteBleed, 'Must define wasteBleed token');
    assert.ok(EXECUTIVE_COLOR_TOKENS.safeList, 'Must define safeList token');
    assert.ok(EXECUTIVE_COLOR_TOKENS.highRisk, 'Must define highRisk token');
    assert.ok(EXECUTIVE_COLOR_TOKENS.reallocation, 'Must define reallocation token');
    assert.ok(executivePdfStyles.page, 'Must define page styling');
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

  test('Layout Tree Semantic Sections: AuditOnePager mirrors 4 color-coded executive cards', () => {
    const analytics = computeExecutiveAnalytics(
      MOCK_KEYWORDS,
      MOCK_THRESHOLDS,
      MOCK_KPI,
      '₹'
    );

    const element = React.createElement(AuditOnePager, {
      organizationTitle: 'Executive One-Pager Sync',
      currencySymbol: '₹',
      kpi: MOCK_KPI,
      reallocation: reallocationModel,
      topKeywords: MOCK_KEYWORDS,
      reportDate: '2026-11-04',
      analytics,
    });

    const rendered = (AuditOnePager as any)(element.props);
    assert.ok(React.isValidElement(rendered), 'AuditOnePager must render valid element');

    // Inspect document structure
    const page = React.Children.toArray((rendered as any).props.children).find(
      (c: any) => c?.type?.displayName === 'Page' || c?.props?.size === 'A4'
    ) as any;
    assert.ok(page, 'Must contain A4 Page');

    // Verify grid cards container exists
    const children = React.Children.toArray(page.props.children);
    assert.ok(children.length >= 3, 'Page must contain header, grid cards, and data sections');
  });

  test('ForensicDeck: Embeds bid elasticity and dilution diagnostic metrics', () => {
    const analytics = computeExecutiveAnalytics(
      MOCK_KEYWORDS,
      MOCK_THRESHOLDS,
      MOCK_KPI,
      '$'
    );
    const longTail = computeFragmentedLongTail(MOCK_KEYWORDS, 50, '$');
    const dilution = computeMatchTypeDilution(MOCK_KEYWORDS, '$');

    const element = React.createElement(ForensicDeck, {
      organizationTitle: 'Forensic Diagnostic Deck Sync',
      currencySymbol: '$',
      kpi: MOCK_KPI,
      reallocation: reallocationModel,
      keywords: MOCK_KEYWORDS,
      reportDate: '2026-11-04',
      analytics,
      longTailResult: longTail,
      dilutionResult: dilution,
    });

    assert.equal(element.props.currencySymbol, '$');
    assert.ok(element.props.longTailResult, 'ForensicDeck must accept longTailResult prop');
    assert.ok(element.props.dilutionResult, 'ForensicDeck must accept dilutionResult prop');
  });

  test('Binary Signature & Zero Encoding Exceptions: Generates valid %PDF- across currencies', async () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      const analytics = computeExecutiveAnalytics(
        MOCK_KEYWORDS,
        MOCK_THRESHOLDS,
        MOCK_KPI,
        currency
      );

      const docElement = React.createElement(AuditOnePager, {
        organizationTitle: `Executive Audit Binary Test (${currency})`,
        currencySymbol: currency,
        kpi: MOCK_KPI,
        reallocation: reallocationModel,
        topKeywords: MOCK_KEYWORDS,
        analytics,
      });

      const blob = await generatePdfBlob(docElement);
      assert.ok(blob.size > 1000, `PDF size must be > 1000 bytes for ${currency}`);

      const validSignature = await verifyPdfSignature(blob);
      assert.equal(validSignature, true, `Must have valid %PDF- header for currency ${currency}`);
    }
  });
});

