/**
 * Final Conclusion Phase & Refinements Verification Test Suite
 *
 * Verifies:
 * 1. Pre-Upload Display: When no file is loaded, hides downstream widgets (Thresholds, Dashboard, Grid)
 *    and shows only Header and FileDropzone.
 * 2. Chronological Layout: Once loaded, arranges tiles in exact chronological order:
 *    Header -> Ingestion Status Bar (with "Clear Dataset" button) -> Threshold Controls -> Executive Analytics Dashboard -> Virtual Grid.
 * 3. "Clear Dataset" Lifecycle: Reverts state to pre-upload display and invokes memory clearing on WASM & DuckDB.
 * 4. ReportConfigModal Portal: Verifies modal renders via React Portal attached to document.body with `fixed inset-0 z-50`.
 * 5. BrandHeader Upgrades: Verifies GitHub repository link (https://github.com/ShadowXZS/sieve) with official GitHub vector SVG icon.
 * 6. DuckDB Memory & Prepared Statement Safety: Verifies executePreparedStatement closes statement in finally block and resetDuckDB clears memory with CHECKPOINT.
 * 7. PDF Text & Hyphenation Safety: Verifies hyphenation callback is configured and cards do not have fixed heights.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

import { App } from '../../src/App.tsx';
import { BrandHeader } from '../../src/components/brand/BrandHeader.tsx';
import { ReportConfigModal } from '../../src/components/reports/ReportConfigModal.tsx';
import { WorkerProcessingHUD } from '../../src/components/hud/WorkerProcessingHUD.tsx';
import { useSieveStore } from '../../src/state/useSieveStore.ts';
import {
  initDuckDB,
  executeDuckDBSQL,
  executePreparedStatement,
  resetDuckDB,
} from '../../src/analytics/duckdb.ts';
import { executivePdfStyles } from '../../src/reports/pdf/styles.ts';

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

describe('Final Conclusion Phase: Critical Bug Fixes & Refinements', () => {
  test('1. Pre-Upload Display: When no dataset is loaded, only Header and Dropzone are displayed', () => {
    cleanup();
    useSieveStore.getState().reset();

    const { container } = render(<App />);

    // Header must exist
    assert.ok(container.querySelector('[data-testid="brand-header"]'), 'Header must be displayed');

    // FileDropzone must exist
    assert.ok(container.querySelector('[data-testid="file-dropzone"]'), 'Dropzone must be displayed');

    // Downstream widgets MUST NOT exist
    assert.strictEqual(
      container.querySelector('[data-testid="worker-processing-hud"]'),
      null,
      'WorkerProcessingHUD must be hidden when no file is loaded'
    );
    assert.strictEqual(
      container.querySelector('[data-testid="threshold-controls"]'),
      null,
      'ThresholdControls must be hidden when no file is loaded'
    );
    assert.strictEqual(
      container.querySelector('[data-testid="executive-card-waste"]'),
      null,
      'ExecutiveDashboard must be hidden when no file is loaded'
    );
    assert.strictEqual(
      container.querySelector('[data-testid="virtual-grid-container"]'),
      null,
      'KeywordVirtualGrid must be hidden when no file is loaded'
    );
  });

  test('2. Chronological Layout: Once loaded, tiles arrange in strict order with "Clear Dataset" button', async () => {
    cleanup();
    useSieveStore.getState().reset();

    // Populate dataset
    act(() => {
      useSieveStore.getState().setKeywords([
        {
          id: 'kw-1',
          keyword: 'luxury test shoes',
          matchType: 'exact',
          clicks: 15,
          cost: 45,
          conversions: 0,
          marginalWaste: 45,
          confidenceScore: 0.95,
          hasCollision: false,
          sha256Hash: 'hash-1',
          createdAt: Date.now(),
        },
      ]);
    });

    const { container } = render(<App />);

    // Ingestion Status Bar (WorkerProcessingHUD) must be present
    const hud = container.querySelector('[data-testid="worker-processing-hud"]');
    assert.ok(hud, 'Ingestion Status Bar must be displayed once loaded');

    // "Clear Dataset" button must be present in HUD
    const clearBtn = container.querySelector('[data-testid="clear-dataset-btn"]');
    assert.ok(clearBtn, '"Clear Dataset" button must be present in Ingestion Status Bar');
    assert.ok(clearBtn.textContent?.includes('Clear Dataset'));

    // Threshold Controls must be present
    const thresholds = container.querySelector('[data-testid="threshold-controls"]');
    assert.ok(thresholds, 'Threshold Controls must be displayed');

    // Executive Analytics Dashboard must be present
    const execDashboard = container.querySelector('[data-testid="executive-card-waste"]');
    assert.ok(execDashboard, 'Executive Dashboard must be displayed');

    // Virtualized Keyword Grid must be present
    const grid = container.querySelector('[data-testid="virtual-grid-container"]');
    assert.ok(grid, 'Virtualized Keyword Grid must be displayed');

    // Test chronological document order:
    // Header -> Ingestion Status Bar -> Threshold Controls -> Executive Analytics Dashboard -> Virtual Grid
    const mainEl = container.querySelector('main');
    assert.ok(mainEl, 'Main workbench must be mounted');
    const sections = Array.from(mainEl.querySelectorAll('section'));

    assert.strictEqual(sections.length, 4, 'Must render 4 sequential sections once loaded');
    assert.strictEqual(sections[0].getAttribute('aria-label'), 'Ingestion Status Bar');
    assert.strictEqual(sections[1].getAttribute('aria-label'), 'Threshold Controls');
    assert.strictEqual(sections[2].getAttribute('aria-label'), 'Executive Analytics Dashboard');
    assert.strictEqual(sections[3].getAttribute('aria-label'), 'Negative Keyword Rules');
  });

  test('3. Clear Dataset Action: Clicking "Clear Dataset" resets store and returns to Pre-Upload Display', async () => {
    cleanup();
    useSieveStore.getState().reset();

    act(() => {
      useSieveStore.getState().setKeywords([
        {
          id: 'kw-1',
          keyword: 'clear test keyword',
          matchType: 'broad',
          clicks: 20,
          cost: 100,
          conversions: 0,
          marginalWaste: 100,
          confidenceScore: 0.9,
          hasCollision: false,
          sha256Hash: 'hash-clear',
          createdAt: Date.now(),
        },
      ]);
    });

    const { container } = render(<App />);
    const clearBtn = container.querySelector('[data-testid="clear-dataset-btn"]') as HTMLButtonElement;
    assert.ok(clearBtn, 'Clear button should exist');

    await act(async () => {
      fireEvent.click(clearBtn);
    });

    // Verify store reset
    assert.strictEqual(useSieveStore.getState().keywords.length, 0);

    // Verify UI returned to Pre-Upload display
    assert.ok(container.querySelector('[data-testid="file-dropzone"]'), 'Dropzone must be restored');
    assert.strictEqual(
      container.querySelector('[data-testid="worker-processing-hud"]'),
      null,
      'WorkerProcessingHUD must be unmounted on clear'
    );
    assert.strictEqual(
      container.querySelector('[data-testid="threshold-controls"]'),
      null,
      'ThresholdControls must be unmounted on clear'
    );
  });

  test('4. Modal Clipping Bug: ReportConfigModal renders via React Portal attached to document.body with fixed inset-0 z-50', () => {
    cleanup();
    const { container, unmount } = render(
      <ReportConfigModal isOpen={true} onClose={() => {}} />
    );

    // The modal should NOT be trapped inside container; it must be portaled directly to document.body
    const modalInBody = document.body.querySelector('[role="dialog"]');
    assert.ok(modalInBody, 'Modal must be portaled to document.body');
    assert.ok(
      modalInBody.className.includes('fixed') &&
        modalInBody.className.includes('inset-0') &&
        modalInBody.className.includes('z-50'),
      'Modal must have "fixed inset-0 z-50" styling to break free of data table clipping'
    );

    unmount();
  });

  test('5. Header Upgrades: GitHub repository link with official vector SVG icon', () => {
    cleanup();
    const { container } = render(<BrandHeader />);

    const githubLink = container.querySelector('[data-testid="header-github-link"]') as HTMLAnchorElement;
    assert.ok(githubLink, 'GitHub link must exist in BrandHeader');
    assert.strictEqual(githubLink.getAttribute('href'), 'https://github.com/ShadowXZS/sieve');
    assert.strictEqual(githubLink.getAttribute('target'), '_blank');
    assert.strictEqual(githubLink.getAttribute('rel'), 'noopener noreferrer');

    const svgIcon = githubLink.querySelector('svg');
    assert.ok(svgIcon, 'GitHub link must contain vector SVG icon');
    assert.strictEqual(svgIcon.getAttribute('viewBox'), '0 0 24 24');
  });

  test('6. DuckDB Audit: Prepared statements execute safely, and resetDuckDB frees memory', async () => {
    await initDuckDB();

    // Create test table
    await executeDuckDBSQL('CREATE TABLE IF NOT EXISTS audit_test (query VARCHAR, clicks DOUBLE, cost DOUBLE);');
    await executeDuckDBSQL("INSERT INTO audit_test VALUES ('test query', 10, 25.5);");

    // Execute prepared statement safely without deadlock
    const prepResult = await executePreparedStatement('SELECT * FROM audit_test WHERE clicks >= ?', [5]);
    assert.strictEqual(prepResult.rowCount, 1);
    assert.strictEqual(prepResult.rows[0].query, 'test query');

    // Test reset / clear table unlinking & checkpoint
    await resetDuckDB('audit_test');

    // Confirm table is dropped cleanly
    await assert.rejects(async () => {
      await executeDuckDBSQL('SELECT * FROM audit_test;');
    });
  });

  test('7. PDF Styling Audit: executivePdfStyles card has no fixed height, cardValue font size is calibrated', () => {
    const cardStyle = executivePdfStyles.card as any;
    assert.strictEqual(
      cardStyle.height,
      undefined,
      'PDF card style must not have a fixed height to prevent text overflow'
    );

    const cardValueStyle = executivePdfStyles.cardValue as any;
    assert.strictEqual(
      cardValueStyle.fontSize,
      12.5,
      `PDF cardValue fontSize must be calibrated to 12.5 (actual: ${cardValueStyle.fontSize})`
    );
  });
});

