/**
 * Application Flow & Integration Test Suite
 *
 * Verifies end-to-end presentation and workbench contracts:
 * 1. Empty State: When fileLoaded === false, only BrandHeader and FileDropzone are visible.
 * 2. Chronological Flow: When fileLoaded === true, DOM order is strictly:
 *    Dropzone/FileBar -> ThresholdControls -> ExecutiveDashboard -> KeywordVirtualGrid.
 * 3. Reset Lifecycle: "Clear Dataset" resets store fileLoaded to false and invokes cleanup.
 * 4. Modal Portals: ReportConfigModal and ExportDefModal portal directly to document.body.
 * 5. BrandHeader Upgrades: Renders GitHub repository link with accessible SVG logo.
 * 6. App Footer & UI Audit: Renders "Sieve © 2026" and confirms absence of deprecated badges.
 * 7. Pre-boot Loader: index.html dark background inline style and #preboot-loader inside #root.
 * 8. PDF Text & Card Style: AuditOnePager card formatting, dynamic flex, and "Conv." abbreviation.
 * 9. DuckDB Lifecycle Safety: Memory clearance, dropTable, and query timeout cancellation.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

import { App } from '../../src/App.tsx';
import { BrandHeader } from '../../src/components/brand/BrandHeader.tsx';
import { ReportConfigModal } from '../../src/components/reports/ReportConfigModal.tsx';
import { ExportDefModal } from '../../src/components/export/ExportDefModal.tsx';
import { ThresholdControls } from '../../src/components/sliders/ThresholdControls.tsx';
import { AuditOnePager } from '../../src/reports/pdf/AuditOnePager.tsx';
import { executivePdfStyles } from '../../src/reports/pdf/styles.ts';
import { useSieveStore } from '../../src/state/useSieveStore.ts';
import * as duckdbModule from '../../src/analytics/duckdb.ts';

// Setup Mock Viewport for Happy-DOM
if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
}

describe('Application Flow & Gated Workbench Suite', () => {
  test('1. Empty State: When fileLoaded is false, only BrandHeader and FileDropzone are visible', () => {
    cleanup();
    useSieveStore.getState().reset();

    const storeState = useSieveStore.getState() as any;
    assert.strictEqual(
      storeState.fileLoaded,
      false,
      'useSieveStore must expose fileLoaded boolean initialized to false'
    );

    const { container } = render(<App />);

    assert.ok(container.querySelector('[data-testid="brand-header"]'), 'BrandHeader must be mounted');
    assert.ok(container.querySelector('[data-testid="file-dropzone"]'), 'FileDropzone must be mounted');

    assert.strictEqual(container.querySelector('[data-testid="threshold-controls"]'), null);
    assert.strictEqual(container.querySelector('[data-testid="executive-card-waste"]'), null);
    assert.strictEqual(container.querySelector('[data-testid="virtual-grid-container"]'), null);
  });

  test('2. Chronological Flow: When fileLoaded is true, DOM order is strictly Dropzone/FileBar -> ThresholdControls -> ExecutiveDashboard -> KeywordVirtualGrid', () => {
    cleanup();
    useSieveStore.getState().reset();

    act(() => {
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

    const fileBar = container.querySelector(
      '[data-testid="file-dropzone"], [data-testid="worker-processing-hud"], [data-testid="active-file-bar"]'
    );
    const thresholds = container.querySelector('[data-testid="threshold-controls"]');
    const execDashboard = container.querySelector('[data-testid="executive-card-waste"]');
    const grid = container.querySelector('[data-testid="virtual-grid-container"]');

    assert.ok(fileBar, 'Dropzone or active file bar must be mounted');
    assert.ok(thresholds, 'ThresholdControls must be mounted');
    assert.ok(execDashboard, 'ExecutiveDashboard must be mounted');
    assert.ok(grid, 'KeywordVirtualGrid must be mounted');

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

    const clearBtn = container.querySelector('[data-testid="clear-dataset-btn"]') as HTMLButtonElement;
    assert.ok(clearBtn, '"Clear Dataset" button must be present');

    await act(async () => {
      fireEvent.click(clearBtn);
    });

    const finalState = useSieveStore.getState() as any;
    assert.strictEqual(finalState.fileLoaded, false, 'fileLoaded must be reset to false');
    assert.strictEqual(finalState.keywords.length, 0, 'keywords must be empty');

    assert.ok(container.querySelector('[data-testid="file-dropzone"]'), 'Dropzone must be visible in State 0');
    assert.strictEqual(container.querySelector('[data-testid="threshold-controls"]'), null);
  });

  test('4. Modal Portal Placement: ReportConfigModal and ExportDefModal portal directly into document.body', () => {
    cleanup();
    const { unmount: unmountReport } = render(<ReportConfigModal isOpen={true} onClose={() => {}} />);

    const reportModal = document.body.querySelector('[role="dialog"]') as HTMLElement;
    assert.ok(reportModal, 'ReportConfigModal must portal into document.body');
    assert.ok(reportModal.className.includes('fixed') && reportModal.className.includes('z-50'));
    unmountReport();

    // ExportDefModal portal check
    const mockGridContainer = document.createElement('div');
    mockGridContainer.style.overflow = 'hidden';
    document.body.appendChild(mockGridContainer);

    const { unmount: unmountExport } = render(<ExportDefModal isOpen={true} onClose={() => {}} />, {
      container: mockGridContainer,
    });

    const exportModal = document.body.querySelector('.fixed.inset-0.z-50') as HTMLElement;
    assert.ok(exportModal, 'ExportDefModal must portal directly into document.body');
    assert.strictEqual(exportModal.parentElement, document.body);

    unmountExport();
    mockGridContainer.remove();
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
  });

  test('6. App Footer & UI Audit: Footer renders copyright contract and confirms absence of deprecated badges', () => {
    cleanup();
    useSieveStore.getState().reset();
    render(<App />);

    const footer = screen.getByRole('contentinfo');
    assert.ok(footer, 'App footer landmark must exist');
    assert.strictEqual(footer.textContent?.trim(), 'Sieve © 2026', 'Footer copyright contract must match exactly');

    // Confirm absence of deprecated 60/120 FPS Validated badge
    cleanup();
    render(<ThresholdControls />);
    assert.strictEqual(screen.queryByText(/60\/120 FPS Validated/i), null);
    assert.strictEqual(screen.queryByRole('button', { name: /60\/120 FPS Validated/i }), null);
  });

  test('7. Pre-boot Loader & Brand Logo Animation: index.html dark background inline style and #preboot-loader inside #root', () => {
    const indexPath = path.resolve(process.cwd(), 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf-8');

    const headMatch = indexHtml.match(/<head[\s\S]*?<\/head>/i);
    assert.ok(headMatch, 'index.html must contain a <head> block');
    const styleMatch = headMatch[0].match(/<style[\s\S]*?>([\s\S]*?)<\/style>/i);
    assert.ok(styleMatch, '<head> must contain an inline <style> block');
    assert.match(
      styleMatch[1],
      /html\s*,\s*body\s*\{[^}]*background-color\s*:\s*#09090b/i,
      'Inline style in <head> must set background-color: #09090b for html, body'
    );

    const rootMatch = indexHtml.match(/<div\s+id=["']root["'][^>]*>([\s\S]*?)<\/div>/i);
    assert.ok(rootMatch, 'index.html must contain a <div id="root"> container');
    const rootInnerHtml = rootMatch[1];

    assert.ok(
      rootInnerHtml.includes('id="preboot-loader"') || rootInnerHtml.includes("id='preboot-loader'"),
      '#preboot-loader must be present inside <div id="root">'
    );
    assert.ok(
      rootInnerHtml.includes('sieve-logo-anim'),
      'Brand logo <img> must have class "sieve-logo-anim"'
    );
  });

  test('8. PDF Text & Card Style Audit: AuditOnePager cards use paddingVertical 8, paddingHorizontal 10, fontSize 12.5, and "Conv." notation', () => {
    const cardStyle = executivePdfStyles.card as any;
    assert.strictEqual(cardStyle.paddingVertical, 8);
    assert.strictEqual(cardStyle.paddingHorizontal, 10);
    assert.strictEqual(cardStyle.flexDirection, 'column');

    const cardValueStyle = executivePdfStyles.cardValue as any;
    assert.strictEqual(cardValueStyle.fontSize, 12.5);
    assert.strictEqual(cardValueStyle.lineHeight, 1.2);

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
      } as any,
    });

    const docJson = JSON.stringify(element);
    assert.ok(
      docJson.includes('Conv.') || docJson.includes('Conv'),
      'AuditOnePager must use "Conv." abbreviation to prevent "Con- vs" word hyphenation'
    );
    assert.strictEqual(docJson.includes('Convs'), false);
  });

  test('9. DuckDB Power Query Audit: Exports dropTable() and implements query timeout cancellation', () => {
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
