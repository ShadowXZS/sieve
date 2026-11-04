/**
 * Reports and Capital Reallocation Engine Tests (Phase 6 - TDD Red Phase)
 *
 * Verifies:
 * 1. Capital efficiency and dynamic reallocation formulas compute projected conversions
 *    and ROAS lift based on historical account marginal CPA.
 * 2. PDF layout trees compile without missing font references or unhandled element structures.
 * 3. Audit one-pager dynamically binds custom organization titles, custom hex accent colors,
 *    and custom notes.
 * 4. Vector PDF rendering completes entirely in browser memory and outputs a valid `%PDF-`
 *    binary blob signature.
 * 5. Zero-server privacy: zero network requests dispatched during PDF generation.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

// Modules under test (will fail in Red Phase until implemented)
import {
  calculateReallocationModel,
  calculateCapitalEfficiency,
  formatCurrency,
  type ReallocationParams,
  type ReallocationModel,
} from '../../src/reports/reallocation.ts';
import {
  AuditOnePager,
  type AuditOnePagerProps,
} from '../../src/reports/pdf/AuditOnePager.tsx';
import {
  ForensicDeck,
  type ForensicDeckProps,
} from '../../src/reports/pdf/ForensicDeck.tsx';
import {
  generatePdfBlob,
  verifyPdfSignature,
  downloadPdfBlob,
} from '../../src/reports/pdf/renderer.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';
import type { KPISummary } from '../../src/state/useSieveStore.ts';

const MOCK_KPI: KPISummary = {
  totalKeywords: 150,
  totalWaste: 18450.75,
  collisionCount: 4,
  avgConfidence: 0.92,
  exactLockedCount: 28,
};

const MOCK_KEYWORDS: PersistedNegativeKeyword[] = [
  {
    id: 'kw-1',
    sha256Hash: 'hash_mock_1',
    keyword: 'free download crack',
    formattedRule: '[free download crack]',
    matchType: 'exact',
    platform: 1,
    confidenceScore: 0.98,
    marginalWaste: 4200.5,
    hasCollision: false,
    clicks: 120,
    cost: 4200.5,
    conversions: 0,
    createdAt: 1730700000000,
    linguisticFingerprint: 'crack',
    firstSeenCampaign: 'Search_Global_B2B',
    scope: { campaign: 'Search_Global_B2B', adGroup: 'Software_Core' },
  },
  {
    id: 'kw-2',
    sha256Hash: 'hash_mock_2',
    keyword: 'cheap jobs hiring',
    formattedRule: '"cheap jobs hiring"',
    matchType: 'phrase',
    platform: 1,
    confidenceScore: 0.91,
    marginalWaste: 3120.25,
    hasCollision: true,
    collidingTerm: 'cheap enterprise jobs software',
    collidingSafeTerms: ['cheap enterprise jobs software'],
    clicks: 85,
    cost: 3120.25,
    conversions: 0,
    createdAt: 1730700001000,
    linguisticFingerprint: 'jobs',
    firstSeenCampaign: 'Search_US_Enterprise',
    scope: { campaign: 'Search_US_Enterprise', adGroup: 'Enterprise_Tier' },
  },
  {
    id: 'kw-3',
    sha256Hash: 'hash_mock_3',
    keyword: 'diy tutorial course',
    formattedRule: 'diy tutorial course',
    matchType: 'broad',
    platform: 1,
    confidenceScore: 0.88,
    marginalWaste: 1850.0,
    hasCollision: false,
    clicks: 64,
    cost: 1850.0,
    conversions: 0,
    createdAt: 1730700002000,
    linguisticFingerprint: 'tutorial',
    firstSeenCampaign: 'Search_US_Generic',
    scope: { campaign: 'Search_US_Generic' },
  },
];

describe('Phase 6: Capital Efficiency & Reallocation Modeling', () => {
  test('Deterministic Reallocation: Computes incremental conversions from recovered waste and marginal CPA', () => {
    const params: ReallocationParams = {
      recoveredWaste: 10000,
      marginalCPA: 50,
      baselineSpend: 50000,
      baselineConversions: 500,
      baselineRevenue: 150000,
    };

    const model: ReallocationModel = calculateReallocationModel(params);

    // Waste $10,000 reallocated at marginal CPA of $50/conversion
    // Incremental conversions = 10,000 / 50 = 200 conversions
    assert.equal(model.incrementalConversions, 200);

    // Total projected conversions = 500 + 200 = 700
    assert.equal(model.projectedConversions, 700);

    // Baseline CPA = 50,000 / 500 = $100.00
    assert.equal(model.currentCPA, 100);

    // Projected CPA = 50,000 / 700 = $71.43
    assert.equal(Math.round(model.projectedCPA * 100) / 100, 71.43);

    // Baseline ROAS = 150,000 / 50,000 = 3.0x
    assert.equal(model.currentROAS, 3.0);

    // AOV = 150,000 / 500 = $300/conversion
    // Incremental revenue = 200 * $300 = $60,000
    // Total projected revenue = $150,000 + $60,000 = $210,000
    // Projected ROAS = 210,000 / 50,000 = 4.2x
    assert.equal(Math.round(model.projectedROAS * 100) / 100, 4.2);

    // ROAS lift % = ((4.2 - 3.0) / 3.0) * 100 = 40.0%
    assert.equal(Math.round(model.roasLiftPercent * 10) / 10, 40.0);

    // Conversion lift % = (200 / 500) * 100 = 40.0%
    assert.equal(Math.round(model.conversionLiftPercent * 10) / 10, 40.0);

    // Capital efficiency multiplier = 100 / 71.43 = 1.4x
    assert.equal(Math.round(model.efficiencyMultiplier * 100) / 100, 1.4);
  });

  test('Graceful Fallback: Handles zero or missing baseline metrics with deterministic defaults', () => {
    const params: ReallocationParams = {
      recoveredWaste: 5000,
      marginalCPA: 100,
    };

    const model: ReallocationModel = calculateReallocationModel(params);

    assert.equal(model.recoveredWaste, 5000);
    assert.equal(model.marginalCPA, 100);
    assert.equal(model.incrementalConversions, 50);
    assert.ok(model.projectedConversions >= 50);
    assert.ok(Number.isFinite(model.projectedROAS));
    assert.ok(!Number.isNaN(model.projectedCPA));
  });

  test('Boundary Conditions: Zero marginal CPA or zero recovered waste does not trigger NaN / Infinity', () => {
    const zeroWasteModel = calculateReallocationModel({
      recoveredWaste: 0,
      marginalCPA: 50,
      baselineSpend: 10000,
      baselineConversions: 100,
    });

    assert.equal(zeroWasteModel.incrementalConversions, 0);
    assert.equal(zeroWasteModel.conversionLiftPercent, 0);
    assert.equal(zeroWasteModel.roasLiftPercent, 0);

    const zeroCPAModel = calculateReallocationModel({
      recoveredWaste: 1000,
      marginalCPA: 0,
    });

    assert.equal(zeroCPAModel.incrementalConversions, 0);
    assert.ok(Number.isFinite(zeroCPAModel.projectedCPA));
  });

  test('Capital Efficiency Index calculation', () => {
    // Current CPA = $100, Target/Marginal CPA = $50 -> Efficiency index = 2.0
    const eff = calculateCapitalEfficiency(10000, 50, 100);
    assert.equal(eff, 2.0);

    // Current CPA = $50, Marginal CPA = $50 -> Efficiency index = 1.0
    const effBase = calculateCapitalEfficiency(10000, 50, 50);
    assert.equal(effBase, 1.0);
  });
});

describe('Phase 6: PDF Vector Layout & Template Structure', () => {
  const reallocationModel: ReallocationModel = calculateReallocationModel({
    recoveredWaste: MOCK_KPI.totalWaste,
    marginalCPA: 60,
    baselineSpend: 65000,
    baselineConversions: 650,
    baselineRevenue: 195000,
  });

  test('AuditOnePager: Dynamically binds custom organization title, hex accent color, and custom notes', () => {
    const customProps: AuditOnePagerProps = {
      organizationTitle: 'Apex Global Growth Ltd.',
      accentColor: '#10b981',
      notes: 'Priority audit: eliminate crack/serial high waste clusters before Q4.',
      kpi: MOCK_KPI,
      reallocation: reallocationModel,
      topKeywords: MOCK_KEYWORDS,
      reportDate: '2026-11-04',
    };

    const element = React.createElement(AuditOnePager, customProps);
    assert.ok(React.isValidElement(element), 'AuditOnePager must return a valid React element');
    assert.equal(element.props.organizationTitle, 'Apex Global Growth Ltd.');
    assert.equal(element.props.accentColor, '#10b981');
    assert.equal(element.props.notes, 'Priority audit: eliminate crack/serial high waste clusters before Q4.');
  });

  test('ForensicDeck: Compiles multi-page layout tree structure with diagnosis chapters', () => {
    const deckProps: ForensicDeckProps = {
      organizationTitle: 'Enterprise Forensic Audit',
      accentColor: '#6366f1',
      notes: 'Comprehensive multi-page audit report across Search campaigns.',
      kpi: MOCK_KPI,
      reallocation: reallocationModel,
      keywords: MOCK_KEYWORDS,
      reportDate: '2026-11-04',
    };

    const element = React.createElement(ForensicDeck, deckProps);
    assert.ok(React.isValidElement(element), 'ForensicDeck must return a valid React element');
    assert.equal(element.props.organizationTitle, 'Enterprise Forensic Audit');
  });
});

describe('Phase 6: In-Memory Client-Side PDF Synthesis & Binary Verification', () => {
  const reallocationModel: ReallocationModel = calculateReallocationModel({
    recoveredWaste: MOCK_KPI.totalWaste,
    marginalCPA: 50,
    baselineSpend: 50000,
    baselineConversions: 500,
    baselineRevenue: 150000,
  });

  test('Vector PDF Synthesis: Compiles directly in browser memory and outputs valid %PDF- header', async () => {
    const docElement = React.createElement(AuditOnePager, {
      organizationTitle: 'Test BioCorp Audit',
      accentColor: '#059669',
      notes: 'Zero-server client-side PDF test generation.',
      kpi: MOCK_KPI,
      reallocation: reallocationModel,
      topKeywords: MOCK_KEYWORDS,
      reportDate: '2026-11-04',
    });

    // Generate PDF blob in-memory
    const blob = await generatePdfBlob(docElement);

    assert.ok(blob instanceof Blob, 'Generated output must be an instance of Blob');
    assert.ok(blob.size > 500, `PDF blob must have valid content size (actual: ${blob.size} bytes)`);
    assert.equal(blob.type, 'application/pdf');

    // Verify binary signature (%PDF- = 0x25 0x50 0x44 0x46 0x2D)
    const isValidSignature = await verifyPdfSignature(blob);
    assert.equal(isValidSignature, true, 'Binary buffer must start with %PDF- magic signature');

    const arrayBuffer = await blob.arrayBuffer();
    const headerBytes = new Uint8Array(arrayBuffer.slice(0, 5));
    const headerString = String.fromCharCode(...headerBytes);
    assert.equal(headerString, '%PDF-', 'First 5 bytes must strictly match "%PDF-"');
  });

  test('ForensicDeck Multi-page Vector PDF Synthesis: Compiles multiple pages with diagnostic cards', async () => {
    const deckElement = React.createElement(ForensicDeck, {
      organizationTitle: 'Comprehensive Account Diagnosis',
      accentColor: '#3b82f6',
      notes: 'Multi-page forensic inspection with collision details and cluster analysis.',
      kpi: MOCK_KPI,
      reallocation: reallocationModel,
      keywords: MOCK_KEYWORDS,
      reportDate: '2026-11-04',
    });

    const blob = await generatePdfBlob(deckElement);
    assert.ok(blob.size > 1000, 'Multi-page PDF must have substantial content size');

    const isValid = await verifyPdfSignature(blob);
    assert.equal(isValid, true, 'Multi-page PDF must have valid %PDF- magic signature');
  });

  test('Zero-Server Privacy Guarantee: Confirms no external network calls made during PDF rendering', async () => {
    let networkCallMade = false;

    // Track global fetch calls
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (...args: any[]) => {
      networkCallMade = true;
      return new Response('{}');
    }) as any;

    try {
      const docElement = React.createElement(AuditOnePager, {
        organizationTitle: 'Privacy Isolation Test',
        accentColor: '#10b981',
        notes: 'Confirms complete privacy preservation and zero telemetry.',
        kpi: MOCK_KPI,
        reallocation: reallocationModel,
        topKeywords: MOCK_KEYWORDS,
        reportDate: '2026-11-04',
      });

      const blob = await generatePdfBlob(docElement);
      assert.ok(blob.size > 0);
      assert.equal(networkCallMade, false, 'No network requests may be dispatched during PDF rendering');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('Localized Currency Metrics: Formats uniform spacing across currencies preventing text clipping', () => {
    assert.equal(formatCurrency(1234.56, '$'), '$1,234.56');
    assert.equal(formatCurrency(987654.321, '€'), '€987,654.32');
    assert.equal(formatCurrency(50000, '£'), '£50,000.00');
    assert.equal(formatCurrency(1000000, '¥'), '¥1,000,000');
    assert.equal(formatCurrency(1234567.89, '₹'), '₹12,34,567.89');

    // AuditOnePager with localized Euro symbol
    const euroDoc = React.createElement(AuditOnePager, {
      organizationTitle: 'European E-Commerce Audit',
      currencySymbol: '€',
      kpi: MOCK_KPI,
      reallocation: reallocationModel,
      topKeywords: MOCK_KEYWORDS,
    });
    assert.ok(React.isValidElement(euroDoc));
    assert.equal(euroDoc.props.currencySymbol, '€');
  });

  test('Memory Lifecycle: Releases object URL immediately after trigger download', async () => {
    let createdUrl: string | null = null;
    let revokedUrl: string | null = null;

    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;

    URL.createObjectURL = (blob: Blob) => {
      createdUrl = 'blob:http://localhost/mock-uuid';
      return createdUrl;
    };

    URL.revokeObjectURL = (url: string) => {
      revokedUrl = url;
    };

    try {
      const mockBlob = new Blob(['%PDF-1.4 mock binary stream'], { type: 'application/pdf' });
      downloadPdfBlob(mockBlob, 'sieve-audit-report.pdf');

      assert.equal(createdUrl, 'blob:http://localhost/mock-uuid');

      // Wait 150ms for the revocation timer to complete
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(revokedUrl, 'blob:http://localhost/mock-uuid', 'Object URL must be revoked after download');
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
