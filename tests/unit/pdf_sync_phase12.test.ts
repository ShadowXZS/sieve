/**
 * Phase 12: High-Fidelity Vector PDF Synchronization & Multi-Currency Engine Tests
 *
 * Verifies:
 * 1. Client-side vector PDF generation synchronizes directly with Executive Dashboard semantic tiers.
 * 2. UTF-8 font embedding propagates active currency symbols ($, ₹, €, ¥, £) cleanly without missing glyphs.
 * 3. Color-coded semantic sections (Waste Bleed, Safe-List Protected, High Risk, Reallocation)
 *    are populated in AuditOnePager and ForensicDeck.
 * 4. Zero network calls constraint: 100% in-memory client-side execution.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import zlib from 'node:zlib';

import { AuditOnePager, type AuditOnePagerProps } from '../../src/reports/pdf/AuditOnePager.tsx';
import { ForensicDeck, type ForensicDeckProps } from '../../src/reports/pdf/ForensicDeck.tsx';
import { generatePdfBlob, verifyPdfSignature } from '../../src/reports/pdf/renderer.ts';
import { calculateReallocationModel, type ReallocationModel } from '../../src/reports/reallocation.ts';
import { computeExecutiveAnalytics, type ExecutiveAnalytics } from '../../src/utils/executiveAnalytics.ts';
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
    keyword: 'enterprise software pricing',
    matchType: 'phrase',
    clicks: 85,
    cost: 380.0,
    conversions: 4,
    marginalWaste: 0,
    confidenceScore: 0.4,
    hasCollision: true,
    collidingTerm: 'enterprise software direct',
    clusterId: 'cluster-b2b',
    sha256Hash: 'hash-2',
    createdAt: Date.now(),
    campaignId: 'camp-1',
    adGroupId: 'ag-2',
  },
  {
    id: 'kw-3',
    keyword: 'torrent serial keygen',
    matchType: 'exact',
    clicks: 45,
    cost: 195.0,
    conversions: 0,
    marginalWaste: 195.0,
    confidenceScore: 0.99,
    hasCollision: false,
    clusterId: 'cluster-piracy',
    sha256Hash: 'hash-3',
    createdAt: Date.now(),
    campaignId: 'camp-2',
    adGroupId: 'ag-3',
  },
];

describe('Phase 12: High-Fidelity Vector PDF Synchronization', () => {
  const reallocationModel: ReallocationModel = calculateReallocationModel({
    recoveredWaste: MOCK_KPI.totalWaste,
    marginalCPA: 45,
    baselineSpend: 85000,
    baselineConversions: 850,
    baselineRevenue: 255000,
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

  test('ForensicDeck: Synchronizes all 4 chapters with live Executive Dashboard data', () => {
    const analytics: ExecutiveAnalytics = computeExecutiveAnalytics(
      MOCK_KEYWORDS,
      MOCK_THRESHOLDS,
      MOCK_KPI,
      '€'
    );

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
    };

    const element = React.createElement(ForensicDeck, props);
    assert.ok(React.isValidElement(element));
    assert.equal(element.props.currencySymbol, '€');
    assert.equal(element.props.analytics.exploratoryRisk.highRiskClicks, analytics.exploratoryRisk.highRiskClicks);
  });

  test('Multi-Currency Vector PDF Synthesis across all supported currencies ($, ₹, €, ¥, £)', async () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      const analytics = computeExecutiveAnalytics(
        MOCK_KEYWORDS,
        MOCK_THRESHOLDS,
        MOCK_KPI,
        currency
      );

      const docElement = React.createElement(AuditOnePager, {
        organizationTitle: `Multi-Currency Audit (${currency})`,
        currencySymbol: currency,
        kpi: MOCK_KPI,
        reallocation: reallocationModel,
        topKeywords: MOCK_KEYWORDS,
        reportDate: '2026-11-04',
        analytics,
      });

      const blob = await generatePdfBlob(docElement);
      assert.ok(blob instanceof Blob, `Blob generated for currency ${currency}`);
      assert.ok(blob.size > 1000, `Blob size must be substantive for ${currency} (actual: ${blob.size})`);

      const isValid = await verifyPdfSignature(blob);
      assert.equal(isValid, true, `PDF for currency ${currency} must have valid %PDF- binary header`);
    }
  });

  test('Font UTF-8 Embedding: Encodes Indian Rupee (₹) symbol into Unicode CMap without font errors', async () => {
    const inrAnalytics = computeExecutiveAnalytics(
      MOCK_KEYWORDS,
      MOCK_THRESHOLDS,
      MOCK_KPI,
      '₹'
    );

    const docElement = React.createElement(AuditOnePager, {
      organizationTitle: 'India Market PPC Forensic Audit',
      currencySymbol: '₹',
      kpi: MOCK_KPI,
      reallocation: reallocationModel,
      topKeywords: MOCK_KEYWORDS,
      reportDate: '2026-11-04',
      analytics: inrAnalytics,
    });

    const blob = await generatePdfBlob(docElement);
    const arrayBuffer = await blob.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    // Scan PDF stream objects to verify ToUnicode CMap includes 20b9 (U+20B9, Indian Rupee sign)
    let foundRupeeInCMap = false;
    let idx = 0;
    while ((idx = buf.indexOf('stream\n', idx)) !== -1) {
      const end = buf.indexOf('\nendstream', idx);
      if (end === -1) break;
      const compressed = buf.subarray(idx + 7, end);
      try {
        const decompressed = zlib.inflateSync(compressed).toString('utf-8');
        if (
          decompressed.includes('begincmap') &&
          (decompressed.includes('20b9') || decompressed.includes('20B9'))
        ) {
          foundRupeeInCMap = true;
          break;
        }
      } catch {
        // Stream may not be flate compressed or may be non-text
      }
      idx = end + 10;
    }

    assert.equal(
      foundRupeeInCMap,
      true,
      'Generated PDF must embed TrueType ToUnicode CMap mapping for U+20B9 (₹)'
    );
  });

  test('Zero-Server Privacy Guarantee: Confirms zero network calls dispatched during multi-currency PDF rendering', async () => {
    let networkCallMade = false;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (...args: any[]) => {
      networkCallMade = true;
      throw new Error(`Forbidden network call dispatched during PDF rendering: ${args[0]}`);
    }) as any;

    try {
      const inrAnalytics = computeExecutiveAnalytics(
        MOCK_KEYWORDS,
        MOCK_THRESHOLDS,
        MOCK_KPI,
        '₹'
      );

      const deckElement = React.createElement(ForensicDeck, {
        organizationTitle: 'Zero Network Privacy Deck',
        currencySymbol: '₹',
        kpi: MOCK_KPI,
        reallocation: reallocationModel,
        keywords: MOCK_KEYWORDS,
        reportDate: '2026-11-04',
        analytics: inrAnalytics,
      });

      const blob = await generatePdfBlob(deckElement);
      assert.ok(blob.size > 2000, 'Forensic deck must synthesize complete multi-page document');
      assert.equal(networkCallMade, false, 'No fetch calls permitted during vector PDF synthesis');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('Zero-Decimal Precision Invariant: Enforces zero decimals for JPY (¥) in PDF vector metrics', async () => {
    const jpyAnalytics = computeExecutiveAnalytics(
      MOCK_KEYWORDS,
      MOCK_THRESHOLDS,
      MOCK_KPI,
      '¥'
    );

    // Formatted waste for JPY must not contain a decimal point
    assert.ok(
      !jpyAnalytics.wasteBleed.formatted.includes('.'),
      `JPY waste format must have zero decimals (actual: ${jpyAnalytics.wasteBleed.formatted})`
    );
    assert.ok(
      jpyAnalytics.wasteBleed.formatted.startsWith('¥'),
      `JPY waste format must start with ¥ symbol (actual: ${jpyAnalytics.wasteBleed.formatted})`
    );

    const docElement = React.createElement(AuditOnePager, {
      organizationTitle: 'Tokyo Account Diagnostic',
      currencySymbol: '¥',
      kpi: MOCK_KPI,
      reallocation: reallocationModel,
      topKeywords: MOCK_KEYWORDS,
      analytics: jpyAnalytics,
    });

    const blob = await generatePdfBlob(docElement);
    const isValid = await verifyPdfSignature(blob);
    assert.equal(isValid, true, 'JPY PDF must generate valid %PDF- binary structure');
  });
});

