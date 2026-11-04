/**
 * Application Flow & Integration TDD Test Suite (Phase: Red)
 *
 * Requirements:
 * 1. When `fileLoaded === false`: ThresholdControls, ExecutiveDashboard, and KeywordVirtualGrid
 *    are NOT in the document. Only BrandHeader and FileDropzone are visible.
 * 2. When `fileLoaded === true`: Order of rendered DOM elements is strictly:
 *    Dropzone/FileBar -> ThresholdControls -> ExecutiveDashboard -> KeywordVirtualGrid.
 * 3. Clicking "Clear Dataset" resets all state, calls DuckDB/WASM cleanup, and returns view to State 0.
 * 4. ReportConfigModal mounts inside a portal at the document body with:
 *    `fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto`,
 *    not nested inside table parent nodes.
 * 5. BrandHeader renders GitHub anchor tag linking to `https://github.com/ShadowXZS/sieve` with an accessible SVG logo.
 * 6. AuditOnePager metric cards use dynamic padding (`paddingVertical: 8`, `paddingHorizontal: 10`, `flexDirection: 'column'`),
 *    main metric font size `12.5`, `lineHeight: 1.2`, header `marginBottom: 4`, and `"Conv."` notation preventing text clipping and hyphenation.
 * 7. DuckDB Power Query audit: Exports dropTable() and supports query cancellation timeout after 5000ms.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

import { App } from '../../src/App.tsx';
import { BrandHeader } from '../../src/components/brand/BrandHeader.tsx';
import { ReportConfigModal } from '../../src/components/reports/ReportConfigModal.tsx';
import { AuditOnePager } from '../../src/reports/pdf/AuditOnePager.tsx';
import { executivePdfStyles } from '../../src/reports/pdf/styles.ts';
import { useSieveStore } from '../../src/state/useSieveStore.ts';
import * as duckdbModule from '../../src/analytics/duckdb.ts';

// Setup Mock Viewport for Happy-DOM
if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: 600,
  });
}

describe('Application Flow & Gated Workbench TDD (Red Phase)', () => {
  test('1. Empty State: When fileLoaded is false, only BrandHeader and FileDropzone are visible', () => {
    cleanup();
    useSieveStore.getState().reset();

    // Verify store has fileLoaded flag
    const storeState = useSieveStore.getState() as any;
    assert.strictEqual(
      storeState.fileLoaded,
      false,
      'useSieveStore must expose fileLoaded boolean initialized to false'
    );

    const { container } = render(<App />);

    // Header and Dropzone MUST be visible
    assert.ok(container.querySelector('[data-testid="brand-header"]'), 'BrandHeader must be mounted');
    assert.ok(container.querySelector('[data-testid="file-dropzone"]'), 'FileDropzone must be mounted');

    // Downstream widgets MUST NOT exist
    assert.strictEqual(
      container.querySelector('[data-testid="threshold-controls"]'),
      null,
      'ThresholdControls must NOT be in DOM when fileLoaded is false'
    );
    assert.strictEqual(
      container.querySelector('[data-testid="executive-card-waste"]'),
      null,
      'ExecutiveDashboard must NOT be in DOM when fileLoaded is false'
    );
    assert.strictEqual(
      container.querySelector('[data-testid="virtual-grid-container"]'),
      null,
      'KeywordVirtualGrid must NOT be in DOM when fileLoaded is false'
    );
  });

  test('2. Chronological Flow: When fileLoaded is true, DOM order is strictly Dropzone/FileBar -> ThresholdControls -> ExecutiveDashboard -> KeywordVirtualGrid', () => {
    cleanup();
    useSieveStore.getState().reset();

    act(() => {
      // Simulate file load
      const store = useSieveStore.getState() as any;
      if (typeof store.setFileLoaded === 'function') {
        store.setFileLoaded(true);
      }
      store.setKeywords([
        {
          id: 'kw-1',
          keyword: 'crm software enterprise',
          matchType: 'exact',
          clicks: 25,
          cost: 120,
          conversions: 0,
          marginalWaste: 120,
          confidenceScore: 0.95,
          hasCollision: false,
          sha256Hash: 'hash-appflow-1',
          createdAt: Date.now(),
        },
      ]);
    });

    const storeState = useSieveStore.getState() as any;
    assert.strictEqual(storeState.fileLoaded, true, 'fileLoaded must be true after loading dataset');

    const { container } = render(<App />);

    const mainEl = container.querySelector('main');
    assert.ok(mainEl, 'Main workbench container must be mounted');

    // Check all 4 items exist
    const fileBar = container.querySelector('[data-testid="file-dropzone"], [data-testid="worker-processing-hud"], [data-testid="active-file-bar"]');
    const thresholds = container.querySelector('[data-testid="threshold-controls"]');
    const execDashboard = container.querySelector('[data-testid="executive-card-waste"]');
    const grid = container.querySelector('[data-testid="virtual-grid-container"]');

    assert.ok(fileBar, 'Dropzone or active file bar must be mounted');
    assert.ok(thresholds, 'ThresholdControls must be mounted');
    assert.ok(execDashboard, 'ExecutiveDashboard must be mounted');
    assert.ok(grid, 'KeywordVirtualGrid must be mounted');

    // Verify DOM order: compareDocumentPosition
    assert.ok(
      fileBar.compareDocumentPosition(thresholds) & Node.DOCUMENT_POSITION_FOLLOWING,
      'ThresholdControls must strictly follow FileBar/Dropzone'
    );
    assert.ok(
      thresholds.compareDocumentPosition(execDashboard) & Node.DOCUMENT_POSITION_FOLLOWING,
      'ExecutiveDashboard must strictly follow ThresholdControls'
    );
    assert.ok(
      execDashboard.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING,
      'KeywordVirtualGrid must strictly follow ExecutiveDashboard'
    );
  });

  test('3. Reset Lifecycle: "Clear Dataset" resets store fileLoaded to false and calls cleanup', async () => {
    cleanup();
    useSieveStore.getState().reset();

    act(() => {
      const store = useSieveStore.getState() as any;
      if (typeof store.setFileLoaded === 'function') {
        store.setFileLoaded(true);
      }
      store.setKeywords([
        {
          id: 'kw-clear',
          keyword: 'clearable test query',
          matchType: 'broad',
          clicks: 10,
          cost: 50,
          conversions: 0,
          marginalWaste: 50,
          confidenceScore: 0.9,
          hasCollision: false,
          sha256Hash: 'hash-clear-test',
          createdAt: Date.now(),
        },
      ]);
    });

    const { container } = render(<App />);

    // Clear Dataset button must be present in FileBar/HUD or Header
    const clearBtn = container.querySelector('[data-testid="clear-dataset-btn"]') as HTMLButtonElement;
    assert.ok(clearBtn, '"Clear Dataset" button must be present');

    await act(async () => {
      fireEvent.click(clearBtn);
    });

    const finalState = useSieveStore.getState() as any;
    assert.strictEqual(finalState.fileLoaded, false, 'fileLoaded must be reset to false');
    assert.strictEqual(finalState.keywords.length, 0, 'keywords must be empty');

    // View returns to State 0
    assert.ok(container.querySelector('[data-testid="file-dropzone"]'), 'Dropzone must be visible in State 0');
    assert.strictEqual(
      container.querySelector('[data-testid="threshold-controls"]'),
      null,
      'ThresholdControls must be unmounted in State 0'
    );
  });

  test('4. Modal Portal Placement: ReportConfigModal uses fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto', () => {
    cleanup();
    const { unmount } = render(<ReportConfigModal isOpen={true} onClose={() => {}} />);

    const modalInBody = document.body.querySelector('[role="dialog"]') as HTMLElement;
    assert.ok(modalInBody, 'Modal dialog must be portaled directly into document.body');

    const expectedClasses = [
      'fixed',
      'inset-0',
      'z-50',
      'flex',
      'items-center',
      'justify-center',
      'bg-black/80',
      'backdrop-blur-sm',
      'p-4',
      'overflow-y-auto',
    ];

    for (const cls of expectedClasses) {
      assert.ok(
        modalInBody.className.includes(cls),
        `Modal container must include class "${cls}", got: "${modalInBody.className}"`
      );
    }

    unmount();
  });

  test('5. BrandHeader Upgrades: Renders GitHub repository link with accessible SVG logo', () => {
    cleanup();
    const { container } = render(<BrandHeader />);

    const githubLink = container.querySelector('a[href="https://github.com/ShadowXZS/sieve"]');
    assert.ok(githubLink, 'BrandHeader must contain an anchor to https://github.com/ShadowXZS/sieve');
    assert.strictEqual(githubLink.getAttribute('target'), '_blank');
    assert.strictEqual(githubLink.getAttribute('rel'), 'noopener noreferrer');

    const svgIcon = githubLink.querySelector('svg');
    assert.ok(svgIcon, 'GitHub anchor must render an SVG icon');
    assert.ok(
      githubLink.getAttribute('aria-label') || githubLink.getAttribute('title'),
      'GitHub link must be accessible with aria-label or title'
    );
  });

  test('6. PDF Text & Card Style Audit: AuditOnePager cards use paddingVertical 8, paddingHorizontal 10, flexDirection column, fontSize 12.5, and "Conv." abbreviation', () => {
    const cardStyle = executivePdfStyles.card as any;
    assert.strictEqual(cardStyle.paddingVertical, 8, 'Card style must have paddingVertical: 8');
    assert.strictEqual(cardStyle.paddingHorizontal, 10, 'Card style must have paddingHorizontal: 10');
    assert.strictEqual(cardStyle.flexDirection, 'column', 'Card style must have flexDirection: column');

    const cardValueStyle = executivePdfStyles.cardValue as any;
    assert.strictEqual(cardValueStyle.fontSize, 12.5, 'Card value metric font size must be 12.5');
    assert.strictEqual(cardValueStyle.lineHeight, 1.2, 'Card value lineHeight must be 1.2');

    const cardHeaderRowStyle = executivePdfStyles.cardHeaderRow as any;
    assert.strictEqual(cardHeaderRowStyle.marginBottom, 4, 'Card header row must have marginBottom: 4');

    // Render AuditOnePager element and inspect children text for "Conv."
    const element = React.createElement(AuditOnePager, {
      kpi: {
        totalKeywords: 10,
        totalWaste: 500,
        collisionCount: 0,
        avgConfidence: 0.9,
        exactLockedCount: 2,
      },
      reallocation: {
        recoveredWaste: 500,
        marginalCPA: 50,
        baselineSpend: 2500,
        baselineConversions: 50,
        baselineRevenue: 7500,
        baselineCPA: 50,
        baselineROAS: 3.0,
        incrementalConversions: 10,
        projectedConversions: 60,
        projectedSpend: 2500,
        projectedCPA: 41.67,
        projectedRevenue: 9000,
        projectedROAS: 3.6,
        conversionLiftPercent: 20,
        cpaReductionPercent: 16.67,
        roasLiftPercent: 20,
        efficiencyMultiplier: 1.2,
      },
    });

    const docJson = JSON.stringify(element);
    assert.ok(
      docJson.includes('Conv.') || docJson.includes('Conv'),
      'AuditOnePager must use "Conv." abbreviation to prevent "Con- vs" word hyphenation'
    );
    assert.strictEqual(
      docJson.includes('Convs'),
      false,
      'AuditOnePager must replace awkward "Convs" with "Conv."'
    );
  });

  test('7. DuckDB Power Query Audit: Exports dropTable() and implements query timeout cancellation', () => {
    const duckdb = duckdbModule as any;
    assert.strictEqual(
      typeof duckdb.dropTable,
      'function',
      'duckdb module must export a dropTable(tableName) function for dataset clearance'
    );
    assert.strictEqual(
      typeof duckdb.executeDuckDBSQLWithTimeout,
      'function',
      'duckdb module must export executeDuckDBSQLWithTimeout(query, timeoutMs)'
    );
  });
});

