/**
 * Behavioral & Structural Typography and Layout Audit for Vector PDF Engine
 *
 * Enforcing principles:
 * - Refactoring UI (Adam Wathan & Steve Schoger): Visual hierarchy, explicit spacing tokens, tabular numbers
 * - About Face (Alan Cooper): Cooper's 5 Core UI States (Blank, Loading, Ideal, Partial, Error)
 * - Kent Beck Test-Driven Development: Red-Green-Refactor
 *
 * Invariants:
 * 1. Zero Text Truncation: Headers, badges, and large currency values ($100M+) never clip or collide.
 * 2. Zero Unstyled Equations: Mathematical models render in dedicated styled callout boxes with distinct sub-elements.
 * 3. Table Column Integrity: Column widths strictly sum to 100% with explicit cell padding.
 * 4. Air-Gap Compliance: 100% client-side vector font rendering with zero network requests.
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
import { computeExecutiveAnalytics, type ExecutiveAnalytics } from '../../src/utils/executiveAnalytics.ts';
import type { KPISummary, SieveThresholds } from '../../src/state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

// ---------------------------------------------------------------------------
// Mock Fixtures & Helpers
// ---------------------------------------------------------------------------

const BASE_MOCK_KPI: KPISummary = {
  totalWaste: 18450.5,
  totalKeywords: 142,
  avgConfidence: 0.94,
  collisionCount: 7,
  exactLockedCount: 7,
  processedRows: 5000,
};

const BASE_MOCK_THRESHOLDS: SieveThresholds = {
  targetCPA: 45,
  minClicks: 10,
  minSpend: 50,
  minConfidence: 0.85,
};

const BASE_MOCK_KEYWORDS: PersistedNegativeKeyword[] = [
  {
    id: 'kw-1',
    keyword: 'free download crack software',
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
    keyword: 'enterprise erp license',
    matchType: 'exact',
    clicks: 80,
    cost: 240.0,
    conversions: 8,
    marginalWaste: 0,
    confidenceScore: 0.92,
    hasCollision: true,
    collidingTerm: 'official erp sales portal',
    clusterId: 'cluster-b2b',
    sha256Hash: 'hash-2',
    createdAt: Date.now(),
    campaignId: 'camp-1',
    adGroupId: 'ag-2',
  },
];

/** Recursively flattens a React element tree into an array of nodes, expanding component elements */
function flattenTree(element: any): any[] {
  if (!element || typeof element !== 'object') return [];
  if (typeof element.type === 'function') {
    try {
      const rendered = element.type(element.props);
      return flattenTree(rendered);
    } catch {
      return [element];
    }
  }
  const nodes = [element];
  const children = element.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      nodes.push(...flattenTree(child));
    }
  } else if (children && typeof children === 'object') {
    nodes.push(...flattenTree(children));
  }
  return nodes;
}

/** Recursively collects all text from a React element or text node */
function getNodeText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  const children = node.props?.children;
  if (Array.isArray(children)) {
    return children.map(getNodeText).join('');
  }
  if (children) {
    return getNodeText(children);
  }
  return '';
}

/** Determines if a node is a leaf text element */
function isLeafTextNode(node: any): boolean {
  if (!node || !node.props) return false;
  const children = node.props.children;
  if (typeof children === 'string' || typeof children === 'number') return true;
  if (Array.isArray(children) && children.every((c: any) => typeof c === 'string' || typeof c === 'number')) {
    return true;
  }
  return false;
}

/** Extracts style object or flattened styles from a React element */
function getFlattenedStyle(node: any): Record<string, any> {
  const style = node?.props?.style;
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean));
  }
  return typeof style === 'object' ? style : {};
}

// ---------------------------------------------------------------------------
// TEST SUITE: Typography & Layout Specification
// ---------------------------------------------------------------------------

describe('PDF Typography & Responsive Container Layout Specification', () => {

  // -------------------------------------------------------------------------
  // Test 1: Enterprise Number Overflow & Dynamic Font Scaling
  // -------------------------------------------------------------------------
  test('Test 1 (Enterprise Number Overflow): Card big numbers dynamically scale font size for $100M+ figures without truncation', async () => {
    // 1A: Standard sized metric (< 12 characters) -> 14-16pt bold font size
    const standardRealloc = calculateReallocationModel({
      recoveredWaste: BASE_MOCK_KPI.totalWaste,
      marginalCPA: 45,
      baselineSpend: 85000,
      baselineConversions: 850,
      baselineRevenue: 255000,
    });
    const standardAnalytics = computeExecutiveAnalytics(
      BASE_MOCK_KEYWORDS,
      BASE_MOCK_THRESHOLDS,
      BASE_MOCK_KPI,
      '$'
    );
    const standardTree = AuditOnePager({
      kpi: BASE_MOCK_KPI,
      reallocation: standardRealloc,
      topKeywords: BASE_MOCK_KEYWORDS,
      analytics: standardAnalytics,
    });
    const standardNodes = flattenTree(standardTree);
    const standardBigNumNode = standardNodes.find((n) => {
      if (!isLeafTextNode(n)) return false;
      const text = getNodeText(n).trim();
      return text === standardAnalytics.wasteBleed.formatted; // e.g. "$18,450.50" (10 chars <= 12)
    });
    assert.ok(standardBigNumNode, 'Must find standard primary metric leaf text node');
    const standardStyle = getFlattenedStyle(standardBigNumNode);
    assert.ok(
      standardStyle.fontSize >= 14 && standardStyle.fontSize <= 16,
      `Standard big number font size must be 14-16pt bold (was ${standardStyle.fontSize}pt)`
    );

    // 1B: Enterprise sized metric ($150,000,000.00 -> 15 characters > 12) -> dynamically scales down to <= 12pt
    const enterpriseWaste = 150000000.0;
    const enterpriseKpi: KPISummary = {
      ...BASE_MOCK_KPI,
      totalWaste: enterpriseWaste,
    };
    const enterpriseRealloc = calculateReallocationModel({
      recoveredWaste: enterpriseWaste,
      marginalCPA: 50,
      baselineSpend: 300000000,
      baselineConversions: 5000000,
      baselineRevenue: 900000000,
    });
    const enterpriseAnalytics = computeExecutiveAnalytics(
      BASE_MOCK_KEYWORDS,
      BASE_MOCK_THRESHOLDS,
      enterpriseKpi,
      '$'
    );
    const docTree = AuditOnePager({
      organizationTitle: 'MegaCorp Global Enterprise Audit',
      currencySymbol: '$',
      kpi: enterpriseKpi,
      reallocation: enterpriseRealloc,
      topKeywords: BASE_MOCK_KEYWORDS,
      analytics: enterpriseAnalytics,
    });

    const nodes = flattenTree(docTree);
    const enterpriseBigNumNode = nodes.find((n) => {
      if (!isLeafTextNode(n)) return false;
      const text = getNodeText(n).trim();
      return text.includes('$150,000,000');
    });

    assert.ok(
      enterpriseBigNumNode,
      'Must render enterprise figure ($150,000,000.00) in primary metric display'
    );

    const enterpriseStyle = getFlattenedStyle(enterpriseBigNumNode);
    assert.ok(
      enterpriseStyle.fontSize !== undefined,
      'Big number node must declare an explicit font size'
    );
    assert.ok(
      enterpriseStyle.fontSize <= 12,
      `Enterprise big number font size (${enterpriseStyle.fontSize}pt) must dynamically scale down to <= 12pt when string length > 12 chars`
    );

    // Verify PDF compilation succeeds without layout crash
    const blob = await generatePdfBlob(React.createElement(AuditOnePager, {
      kpi: enterpriseKpi,
      reallocation: enterpriseRealloc,
      topKeywords: BASE_MOCK_KEYWORDS,
      analytics: enterpriseAnalytics,
    }));
    assert.ok(await verifyPdfSignature(blob), 'Enterprise PDF generation must return valid %PDF- binary header');
  });

  // -------------------------------------------------------------------------
  // Test 2: Badge & Header Separation in Isolated Container Nodes
  // -------------------------------------------------------------------------
  test('Test 2 (Badge & Header Separation): Card title and status badge render in isolated container nodes to eliminate truncation', () => {
    const realloc: ReallocationModel = calculateReallocationModel({
      recoveredWaste: BASE_MOCK_KPI.totalWaste,
      marginalCPA: 45,
      baselineSpend: 85000,
      baselineConversions: 850,
      baselineRevenue: 255000,
    });
    const analytics = computeExecutiveAnalytics(
      BASE_MOCK_KEYWORDS,
      BASE_MOCK_THRESHOLDS,
      BASE_MOCK_KPI,
      '$'
    );

    const docTree = AuditOnePager({
      kpi: BASE_MOCK_KPI,
      reallocation: realloc,
      topKeywords: BASE_MOCK_KEYWORDS,
      analytics,
    });

    const nodes = flattenTree(docTree);

    // 2A: Full title node preservation without truncation
    const reallocTitleNode = nodes.find((n) => {
      if (!isLeafTextNode(n)) return false;
      return getNodeText(n).trim().toUpperCase() === 'REALLOCATION YIELD';
    });

    assert.ok(reallocTitleNode, 'Must contain complete "REALLOCATION YIELD" leaf text node');
    assert.strictEqual(
      getNodeText(reallocTitleNode).trim().toUpperCase(),
      'REALLOCATION YIELD',
      'Title must not truncate to "REALLOCATION YIE"'
    );

    // 2B: Card title must be wrapped in its own isolated container node (View),
    // separating it from the badge container so titles never fight for horizontal space.
    const reallocContainer = nodes.find((n) => {
      // Must be a container View wrapping specifically the title
      if (!n || !n.props) return false;
      const children = Array.isArray(n.props?.children) ? n.props.children : [n.props?.children];
      return (
        children.length === 1 &&
        isLeafTextNode(children[0]) &&
        getNodeText(children[0]).trim().toUpperCase() === 'REALLOCATION YIELD'
      );
    });

    assert.ok(
      reallocContainer,
      'Card title "REALLOCATION YIELD" must be enclosed within its own dedicated isolated container node rather than sharing an unconstrained row'
    );

    // 2C: Verify badge is also inside its own isolated badge container
    const badgeContainers = nodes.filter((n) => {
      const style = getFlattenedStyle(n);
      const text = getNodeText(n).trim();
      return (
        (text === 'Efficiency' || text === 'Secured' || text === 'Elasticity') &&
        style.borderRadius !== undefined
      );
    });
    assert.ok(badgeContainers.length >= 3, 'Status badges must be isolated in styled badge pill containers');

    // 2D: ROAS Lift formatted to 0 or 1 decimal place without floating-point noise
    const roasLiftNode = nodes.find((n) => {
      if (!isLeafTextNode(n)) return false;
      const text = getNodeText(n).trim();
      return text.includes('ROAS Lift');
    });
    assert.ok(roasLiftNode, 'Must contain ROAS Lift caption leaf text node');
    const roasLiftText = getNodeText(roasLiftNode).trim();
    assert.ok(
      !/\.[0-9]{3,}%/.test(roasLiftText),
      `ROAS Lift text "${roasLiftText}" must not contain unrounded floating point decimals`
    );
    assert.ok(
      /\+[0-9]+(\.[0-9])?% ROAS Lift/.test(roasLiftText),
      `ROAS Lift text "${roasLiftText}" must match formatted pattern "+XX.X% ROAS Lift"`
    );

    // 2E: ForensicDeck Chapter 1 Summary also renders formatted ROAS lift without floating-point noise
    const deckTree = ForensicDeck({
      kpi: BASE_MOCK_KPI,
      reallocation: realloc,
      keywords: BASE_MOCK_KEYWORDS,
      analytics,
    });
    const deckNodes = flattenTree(deckTree);
    const deckRoasLiftNode = deckNodes.find((n) => {
      if (!isLeafTextNode(n)) return false;
      const text = getNodeText(n).trim();
      return text.includes('ROAS Lift');
    });
    assert.ok(deckRoasLiftNode, 'ForensicDeck must contain ROAS Lift caption leaf text node');
    const deckRoasLiftText = getNodeText(deckRoasLiftNode).trim();
    assert.ok(
      !/\.[0-9]{3,}%/.test(deckRoasLiftText),
      `ForensicDeck ROAS Lift text "${deckRoasLiftText}" must not contain unrounded floating point decimals`
    );
    assert.ok(
      /\+[0-9]+(\.[0-9])?% ROAS Lift/.test(deckRoasLiftText),
      `ForensicDeck ROAS Lift text "${deckRoasLiftText}" must match formatted pattern "+XX.X% ROAS Lift"`
    );
  });

  // -------------------------------------------------------------------------
  // Test 3: Table Column Integrity & Percentage Allocations
  // -------------------------------------------------------------------------
  test('Test 3 (Table Column Integrity): Table headers have strict percentage allocations summing to 100% with cell padding', () => {
    const realloc: ReallocationModel = calculateReallocationModel({
      recoveredWaste: BASE_MOCK_KPI.totalWaste,
      marginalCPA: 45,
      baselineSpend: 85000,
      baselineConversions: 850,
      baselineRevenue: 255000,
    });
    const analytics = computeExecutiveAnalytics(
      BASE_MOCK_KEYWORDS,
      BASE_MOCK_THRESHOLDS,
      BASE_MOCK_KPI,
      '$'
    );

    const docTree = AuditOnePager({
      kpi: BASE_MOCK_KPI,
      reallocation: realloc,
      topKeywords: BASE_MOCK_KEYWORDS,
      analytics,
    });

    const nodes = flattenTree(docTree);

    // Find the specific table header row node (its direct children are the header columns)
    const tableHeaderRow = nodes.find((n) => {
      const children = Array.isArray(n.props?.children) ? n.props.children : [];
      if (children.length < 4) return false;
      const texts = children.map(getNodeText);
      return texts.some((t: string) => t.includes('Search Term Query') || t.includes('Query Term'));
    });

    assert.ok(tableHeaderRow, 'Must find table header row container');

    const headerCells = Array.isArray(tableHeaderRow.props.children)
      ? tableHeaderRow.props.children
      : [tableHeaderRow.props.children];

    let totalWidthPercentage = 0;
    let headerCellsWithPercent = 0;

    for (const cell of headerCells) {
      if (!cell || !cell.props) continue;
      const style = getFlattenedStyle(cell);
      const cellText = getNodeText(cell);

      // Verify no fused header string
      assert.ok(
        !/%[A-Z]/.test(cellText),
        `Header text "${cellText}" must not contain fused regex /%[A-Z]/`
      );

      // Verify percentage width
      if (style.width && typeof style.width === 'string' && style.width.endsWith('%')) {
        totalWidthPercentage += parseFloat(style.width);
        headerCellsWithPercent++;
      }
    }

    assert.ok(
      headerCellsWithPercent >= 4,
      `Table header cells must declare explicit percentage widths (found ${headerCellsWithPercent})`
    );
    assert.ok(
      Math.abs(totalWidthPercentage - 100) < 0.5,
      `Column widths must strictly sum to 100% (sum was ${totalWidthPercentage}%)`
    );

    // Verify minimum cell padding: 6pt vertical, 8pt horizontal (on row or cells)
    const rowStyle = getFlattenedStyle(tableHeaderRow);
    const hasRowPadding =
      (rowStyle.paddingVertical >= 6 || (rowStyle.paddingTop >= 6 && rowStyle.paddingBottom >= 6)) &&
      (rowStyle.paddingHorizontal >= 8 || (rowStyle.paddingLeft >= 8 && rowStyle.paddingRight >= 8));

    const allCellsPadded = headerCells.every((c: any) => {
      const cs = getFlattenedStyle(c);
      return (
        (cs.paddingVertical >= 6 || (cs.paddingTop >= 6 && cs.paddingBottom >= 6)) &&
        (cs.paddingHorizontal >= 8 || (cs.paddingLeft >= 8 && cs.paddingRight >= 8))
      );
    });

    assert.ok(
      hasRowPadding || allCellsPadded,
      'Table headers must have explicit cell padding (minimum 6pt vertical, 8pt horizontal)'
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: Styled Equation Block & Component Separation
  // -------------------------------------------------------------------------
  test('Test 4 (Equation Formatting): Deterministic formula renders dedicated styled callout box with distinct formula, substitution, and outcome nodes', () => {
    const realloc: ReallocationModel = calculateReallocationModel({
      recoveredWaste: BASE_MOCK_KPI.totalWaste,
      marginalCPA: 45,
      baselineSpend: 85000,
      baselineConversions: 850,
      baselineRevenue: 255000,
    });
    const analytics = computeExecutiveAnalytics(
      BASE_MOCK_KEYWORDS,
      BASE_MOCK_THRESHOLDS,
      BASE_MOCK_KPI,
      '$'
    );

    // 4A: AuditOnePager contains styled formula callout block
    const onePagerTree = AuditOnePager({
      kpi: BASE_MOCK_KPI,
      reallocation: realloc,
      topKeywords: BASE_MOCK_KEYWORDS,
      analytics,
    });

    const onePagerNodes = flattenTree(onePagerTree);

    // Find the formula callout container
    const formulaContainer = onePagerNodes.find((n) => {
      const style = getFlattenedStyle(n);
      const text = getNodeText(n);
      return (
        (text.includes('Δ Conversions') || text.includes('ΔConversions') || text.includes('Recovered Waste')) &&
        (style.borderLeftWidth !== undefined || style.borderWidth !== undefined)
      );
    });

    assert.ok(
      formulaContainer,
      'AuditOnePager must render the Deterministic Reallocation Equation in a dedicated bordered callout container'
    );

    // Formula container must have distinct sub-elements:
    // 1. Formula Label (e.g. "Deterministic Capital Reallocation Model")
    // 2. Formula Equation (e.g. "Δ Conversions = Recovered Waste / Marginal CPA")
    // 3. Variable Substitutions / Outcome
    const leafTextsInFormula = flattenTree(formulaContainer)
      .filter(isLeafTextNode)
      .map((n) => getNodeText(n).trim());

    assert.ok(
      leafTextsInFormula.length >= 3,
      `Equation callout must render distinct sub-elements rather than a single interpolated raw string (found ${leafTextsInFormula.length})`
    );

    // Must not contain raw unspaced delimiters like "$="
    const formulaAllText = getNodeText(formulaContainer);
    assert.ok(
      !/\$=/.test(formulaAllText),
      'Formula must not contain unstyled raw delimiters like "$="'
    );

    // 4B: ForensicDeck Chapter 2 formula callout check
    const deckTree = ForensicDeck({
      kpi: BASE_MOCK_KPI,
      reallocation: realloc,
      keywords: BASE_MOCK_KEYWORDS,
      analytics,
    });
    const deckNodes = flattenTree(deckTree);
    const deckFormulaContainer = deckNodes.find((n) => {
      const style = getFlattenedStyle(n);
      const text = getNodeText(n);
      return (
        (text.includes('Δ Conversions') || text.includes('ΔConversions')) &&
        (style.borderLeftWidth !== undefined || style.borderWidth !== undefined)
      );
    });
    assert.ok(deckFormulaContainer, 'ForensicDeck Chapter 2 must render styled formula callout box');

    const deckLeafTexts = flattenTree(deckFormulaContainer)
      .filter(isLeafTextNode)
      .map((n) => getNodeText(n).trim());

    assert.ok(
      deckLeafTexts.length >= 3,
      `ForensicDeck equation callout must render distinct sub-elements rather than a single interpolated raw string (found ${deckLeafTexts.length})`
    );
  });

  // -------------------------------------------------------------------------
  // Test 5: Cooper's 5 Core UI States
  // -------------------------------------------------------------------------
  test('Test 5 (Cooper 5 Core UI States): Engine renders blank, zero-waste, and ideal states without layout collapse', async () => {
    // 1. Blank State: 0 keywords, 0 waste, 0 conversions
    const blankKpi: KPISummary = {
      totalWaste: 0,
      totalKeywords: 0,
      avgConfidence: 0,
      collisionCount: 0,
      exactLockedCount: 0,
      processedRows: 0,
    };
    const blankRealloc = calculateReallocationModel({
      recoveredWaste: 0,
      marginalCPA: 50,
      baselineSpend: 0,
      baselineConversions: 0,
      baselineRevenue: 0,
    });
    const blankAnalytics = computeExecutiveAnalytics([], BASE_MOCK_THRESHOLDS, blankKpi, '$');

    const blankTree = AuditOnePager({
      kpi: blankKpi,
      reallocation: blankRealloc,
      topKeywords: [],
      analytics: blankAnalytics,
    });
    assert.ok(blankTree, 'Must render Blank State without crashing');
    const blankBlob = await generatePdfBlob(React.createElement(AuditOnePager, {
      kpi: blankKpi,
      reallocation: blankRealloc,
      topKeywords: [],
      analytics: blankAnalytics,
    }));
    assert.ok(await verifyPdfSignature(blankBlob), 'Blank State must compile to valid PDF');

    // 2. 0% Waste Scenario (100% Safe / Profitable traffic)
    const zeroWasteKpi: KPISummary = {
      ...BASE_MOCK_KPI,
      totalWaste: 0,
    };
    const zeroWasteAnalytics = computeExecutiveAnalytics(
      [BASE_MOCK_KEYWORDS[1]], // only converting term
      BASE_MOCK_THRESHOLDS,
      zeroWasteKpi,
      '$'
    );
    const zeroWasteTree = AuditOnePager({
      kpi: zeroWasteKpi,
      reallocation: blankRealloc,
      topKeywords: [BASE_MOCK_KEYWORDS[1]],
      analytics: zeroWasteAnalytics,
    });
    const zeroWasteText = flattenTree(zeroWasteTree).map(getNodeText).join(' ');
    assert.ok(zeroWasteText.includes('0.0%'), '0% Waste State must display 0.0% waste badge without NaN');

    // 3. Multi-Currency Zero Decimal (JPY ¥)
    const jpyAnalytics = computeExecutiveAnalytics(
      BASE_MOCK_KEYWORDS,
      BASE_MOCK_THRESHOLDS,
      BASE_MOCK_KPI,
      '¥'
    );
    const jpyTree = AuditOnePager({
      currencySymbol: '¥',
      kpi: BASE_MOCK_KPI,
      reallocation: reallocWithJpy(BASE_MOCK_KPI.totalWaste),
      topKeywords: BASE_MOCK_KEYWORDS,
      analytics: jpyAnalytics,
    });
    const jpyText = flattenTree(jpyTree).map(getNodeText).join(' ');
    assert.ok(jpyText.includes('¥'), 'JPY audit must render clean "¥" symbols without decimal corruption');
  });
});

function reallocWithJpy(waste: number): ReallocationModel {
  return calculateReallocationModel({
    recoveredWaste: waste,
    marginalCPA: 5000,
    baselineSpend: 10000000,
    baselineConversions: 2000,
    baselineRevenue: 30000000,
  });
}
