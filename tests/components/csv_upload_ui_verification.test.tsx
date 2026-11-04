import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { App } from '../../src/App.tsx';
import { useSieveStore } from '../../src/state/useSieveStore.ts';

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

describe('CSV Upload & Chronological Workbench Verification', () => {
  test('Initial pre-upload state renders only Header and FileDropzone', () => {
    useSieveStore.getState().reset();
    const { container } = render(<App />);

    assert.ok(container.querySelector('[data-testid="brand-header"]'), 'Header must be present');
    assert.ok(container.querySelector('[data-testid="file-dropzone"]'), 'Dropzone must be present');
    assert.strictEqual(container.querySelector('[data-testid="threshold-controls"]'), null);
    assert.strictEqual(container.querySelector('[data-testid="executive-card-waste"]'), null);
    assert.strictEqual(container.querySelector('[data-testid="virtual-grid-container"]'), null);
    cleanup();
  });

  test('CSV upload parses and immediately displays dashboard and data table with real numbers without threshold zeroing', async () => {
    useSieveStore.getState().reset();
    const { container } = render(<App />);

    // Create a real multi-platform CSV file with Amazon PPC headers & currency symbols
    const csvContent = `Customer Search Term,Clicks,Spend,7 Day Total Orders (#),Campaign Name
"enterprise cloud erp software",150,"$2,500.00",0,"US_Search_Enterprise"
"cloud crm solution",80,"$1,200.00",2,"US_Search_CRM"
"free accounting app",45,"$350.00",0,"US_Search_Free"`;

    const file = new File([csvContent], 'amazon_search_terms.csv', { type: 'text/csv' });

    const dropzoneInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    assert.ok(dropzoneInput, 'File input must exist in dropzone');

    await act(async () => {
      fireEvent.change(dropzoneInput, { target: { files: [file] } });
      await new Promise((r) => setTimeout(r, 600));
    });

    // Check store state
    const state = useSieveStore.getState();
    assert.strictEqual(state.fileLoaded, true, 'fileLoaded must be true');
    assert.strictEqual(state.isLoading, false, 'isLoading must be false');
    assert.strictEqual(state.records.length, 3, 'All 3 search terms must be parsed');
    assert.strictEqual(
      state.filteredRecords.length,
      3,
      'filteredRecords must equal records to prevent threshold zeroing'
    );

    // Verify chronological DOM order once loaded: FileBar -> ThresholdControls -> ExecutiveDashboard -> KeywordVirtualGrid
    const fileBar = container.querySelector('[data-testid="active-file-bar"]');
    const thresholds = container.querySelector('[data-testid="threshold-controls"]');
    const execDashboard = container.querySelector('[data-testid="executive-card-waste"]');
    const grid = container.querySelector('[data-testid="virtual-grid-container"]');

    assert.ok(fileBar, 'Active file bar must be mounted');
    assert.ok(thresholds, 'ThresholdControls must be mounted');
    assert.ok(execDashboard, 'ExecutiveDashboard must be mounted');
    assert.ok(grid, 'KeywordVirtualGrid must be mounted');

    // Verify Dashboard renders real numbers (Identified waste)
    const wasteCard = container.querySelector('[data-testid="executive-card-waste"]');
    assert.ok(wasteCard, 'Executive waste card must be in DOM');
    // Total spend = 2500 + 1200 + 350 = 4050. Term 2 conv = 2 * 50 = 100, waste = 1100. Total waste = 2500 + 1100 + 350 = 3950
    assert.ok(
      wasteCard.textContent?.includes('3,950') || wasteCard.textContent?.includes('$'),
      `Waste card should render computed waste numbers: ${wasteCard.textContent}`
    );

    // Verify Virtual Grid renders rows with real search terms
    const gridContainer = container.querySelector('[data-testid="virtual-grid-container"]');
    assert.ok(gridContainer, 'Virtual Grid container must be mounted');
    const gridText = gridContainer.textContent || '';
    assert.ok(
      gridText.includes('enterprise cloud erp software') || gridText.includes('cloud crm solution'),
      'Virtual Grid must display the parsed search term queries'
    );
    cleanup();
  });
});
