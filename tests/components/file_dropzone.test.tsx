/**
 * FileDropzone & Ingestion Component Test Suite
 *
 * Verifies:
 * 1. Initial State: When fileLoaded is false, renders BrandHeader and FileDropzone.
 * 2. Watermark: FileDropzone includes ambient /sieve.svg watermark with pointer-events-none.
 * 3. Drag & Drop & Upload: CSV upload parses multi-platform files and updates store without threshold zeroing.
 * 4. Multi-file Processing: Processes dropped CSV files and handles worker ingestion dispatch.
 * 5. Validation: Gracefully rejects non-CSV files with supported format warnings.
 * 6. Throughput Guarantee: Renders 600MB worker processing copy.
 * 7. Archival Notice Banner: Renders un-dismissible disclaimer card directly above dropzone.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';

import { App } from '../../src/App.tsx';
import { FileDropzone } from '../../src/components/dropzone/FileDropzone.tsx';
import { SummaryDashboard } from '../../src/components/kpi/SummaryDashboard.tsx';
import { useSieveStore } from '../../src/state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

// Setup Mock Viewport for Happy-DOM
if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
}

describe('FileDropzone & CSV Ingestion Flow', () => {
  test('Initial pre-upload state renders Header and FileDropzone without downstream widgets', () => {
    cleanup();
    useSieveStore.getState().reset();
    const { container } = render(<App />);

    assert.ok(container.querySelector('[data-testid="brand-header"]'), 'Header must be present');
    assert.ok(container.querySelector('[data-testid="file-dropzone"]'), 'Dropzone must be present');
    assert.strictEqual(container.querySelector('[data-testid="threshold-controls"]'), null);
    assert.strictEqual(container.querySelector('[data-testid="executive-card-waste"]'), null);
    assert.strictEqual(container.querySelector('[data-testid="virtual-grid-container"]'), null);
  });

  test('FileDropzone includes ambient /sieve.svg watermark with pointer-events-none', () => {
    cleanup();
    const { container } = render(<FileDropzone />);

    const watermark = container.querySelector('[data-testid="dropzone-watermark"]') as HTMLElement;
    assert.ok(watermark, 'FileDropzone must contain ambient watermark element');
    assert.ok(
      watermark.className.includes('pointer-events-none'),
      'Watermark must strictly enforce pointer-events-none to prevent blocking drop interactions'
    );

    const img = watermark.tagName === 'IMG' ? watermark : watermark.querySelector('img');
    assert.ok(img, 'Watermark must contain img element');
    assert.strictEqual(img.getAttribute('src'), '/sieve.svg', 'Watermark must source /sieve.svg');
  });

  test('FileDropzone displays active "Up to 600MB processed in background workers" guarantee', () => {
    cleanup();
    render(<FileDropzone />);
    assert.ok(screen.getByText(/Up to 600MB processed in background workers/i));
    assert.strictEqual(screen.queryByText(/Up to 500MB/i), null);
  });

  test('CSV upload parses multi-platform headers and displays dashboard without threshold zeroing', async () => {
    cleanup();
    useSieveStore.getState().reset();
    const { container } = render(<App />);

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

    const state = useSieveStore.getState();
    assert.strictEqual(state.fileLoaded, true, 'fileLoaded must be true');
    assert.strictEqual(state.isLoading, false, 'isLoading must be false');
    assert.strictEqual(state.records.length, 3, 'All 3 search terms must be parsed');
    assert.strictEqual(state.filteredRecords.length, 3, 'filteredRecords must equal records');

    // Downstream components mount
    assert.ok(container.querySelector('[data-testid="active-file-bar"]'));
    assert.ok(container.querySelector('[data-testid="threshold-controls"]'));
    assert.ok(container.querySelector('[data-testid="executive-card-waste"]'));
    assert.ok(container.querySelector('[data-testid="virtual-grid-container"]'));
  });

  test('Multi-file dropzone processes dropped CSV handles and rejects non-CSV files', async () => {
    cleanup();
    useSieveStore.getState().reset();

    let workerIngestDispatched = false;
    let ingestedFileNames: string[] = [];

    const mockWorkerPool = {
      executeIngestion: async (taskId: string, chunkBuffer: ArrayBuffer) => {
        workerIngestDispatched = true;
        return { statusCode: 0, workerId: 1, bytesConsumed: chunkBuffer.byteLength };
      },
    };

    const { container } = render(
      <FileDropzone
        workerPool={mockWorkerPool as any}
        onIngestComplete={(files) => {
          ingestedFileNames = files.map((f) => f.name);
        }}
      />
    );

    const dropArea = container.querySelector('[data-testid="file-dropzone"]');
    assert.ok(dropArea, 'Dropzone element must be present with testid');

    const file1 = new File(['Query,Clicks,Cost\nshoes,10,5.0'], 'search_terms_1.csv', { type: 'text/csv' });
    const file2 = new File(['Query,Clicks,Cost\nboots,20,15.0'], 'search_terms_2.csv', { type: 'text/csv' });

    await act(async () => {
      fireEvent.drop(dropArea, {
        dataTransfer: {
          files: [file1, file2],
        },
      });
    });

    await waitFor(() => {
      assert.strictEqual(workerIngestDispatched, true, 'Worker ingestion dispatch must be invoked');
      assert.strictEqual(ingestedFileNames.length, 2, 'Both files must be processed');
    });

    // Verify non-CSV rejection
    const invalidFile = new File(['bad data'], 'malicious.exe', { type: 'application/x-msdownload' });
    await act(async () => {
      fireEvent.drop(dropArea, {
        dataTransfer: {
          files: [invalidFile],
        },
      });
    });

    const errorMessage = screen.queryByText(/only csv files are supported/i);
    assert.ok(errorMessage, 'Invalid non-csv file must render validation warning');
  });

  test('FileDropzone: Ingesting CSV file populates useSieveStore keywords and updates SummaryDashboard KPI', async () => {
    cleanup();
    useSieveStore.getState().reset();

    const mockExtractedKeywords: PersistedNegativeKeyword[] = [
      {
        sha256Hash: 'hash_csv_upload_1',
        keyword: 'cheap running shoes',
        matchType: 'phrase',
        formattedRule: '"cheap running shoes"',
        platform: 1,
        confidenceScore: 0.95,
        marginalWaste: 150.0,
        hasCollision: false,
        clicks: 40,
        cost: 150.0,
        conversions: 0,
        createdAt: Date.now(),
      },
      {
        sha256Hash: 'hash_csv_upload_2',
        keyword: 'free download shoes',
        matchType: 'exact',
        formattedRule: '[free download shoes]',
        platform: 1,
        confidenceScore: 0.99,
        marginalWaste: 250.0,
        hasCollision: true,
        collidingSafeTerms: ['converting shoes'],
        clicks: 80,
        cost: 250.0,
        conversions: 0,
        createdAt: Date.now(),
      },
    ];

    const mockWorkerPool = {
      executeIngestion: async () => ({
        statusCode: 0,
        workerId: 0,
        bytesConsumed: 1024,
        keywords: mockExtractedKeywords,
      }),
    };

    const { container } = render(
      <div>
        <FileDropzone workerPool={mockWorkerPool as any} />
        <SummaryDashboard />
      </div>
    );

    const file = new File(
      ['Search keyword,Clicks,Cost,Conversions\n"cheap running shoes",40,150.00,0\n'],
      'google_search_terms.csv',
      { type: 'text/csv' }
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    assert.ok(input, 'File input must exist');

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    // Verify Zustand store received keywords from worker
    const storeKeywords = useSieveStore.getState().keywords;
    assert.strictEqual(storeKeywords.length, 2, 'Store must contain 2 ingested keywords');
    assert.strictEqual(storeKeywords[0].keyword, 'cheap running shoes');
    assert.strictEqual(storeKeywords[1].keyword, 'free download shoes');

    // Verify KPI metrics computed
    const kpi = useSieveStore.getState().kpi;
    assert.strictEqual(kpi.totalKeywords, 2);
    assert.strictEqual(kpi.totalWaste, 400.0);
    assert.strictEqual(kpi.collisionCount, 1);
    assert.strictEqual(kpi.exactLockedCount, 1);
  });

  test('Archival Disclaimer Banner: Renders permanent, un-dismissible warning card directly above dropzone', () => {
    cleanup();
    const { container } = render(<FileDropzone />);

    const banner = container.querySelector('[data-testid="archival-notice-banner"]');
    assert.ok(banner, 'Archival notice banner must be mounted');

    const dropzone = container.querySelector('[data-testid="file-dropzone"]');
    assert.ok(dropzone, 'Dropzone element must be mounted');

    // Verify banner is positioned directly before the dropzone in the DOM
    assert.ok(
      banner.compareDocumentPosition(dropzone) & Node.DOCUMENT_POSITION_FOLLOWING,
      'Dropzone must strictly follow archival notice banner in DOM order'
    );

    // Verify Header copy
    const header = screen.getByText('⚠️ CRITICAL NOTICE: PROJECT CONCLUDED / ARCHIVAL STATE');
    assert.ok(header, 'Header copy must match exactly');

    // Verify Subhead copy
    const subhead = screen.getByText('DO NOT USE OUTPUTS FOR LIVE FINANCIAL DECISIONS OR PRODUCTION PPC CAMPAIGNS.');
    assert.ok(subhead, 'Subhead copy must match exactly');

    // Verify Body copy
    const body = screen.getByText(
      'While the interface and core pipelines demonstrate what is possible with client-side WebAssembly, the calculations, reconciliations, and outputs from this tool are not verified for production accuracy. Use this repository strictly as an educational case study and architectural reference for in-browser data processing.'
    );
    assert.ok(body, 'Body copy must match exactly');

    // Verify styling rules: uses amber Tailwind classes
    const classList = banner.className;
    assert.ok(classList.includes('border-amber-500/40'), 'Must use border-amber-500/40');
    assert.ok(classList.includes('bg-amber-950/20'), 'Must use bg-amber-950/20');
    assert.ok(classList.includes('text-amber-200'), 'Must use text-amber-200');

    // Verify un-dismissible: no close or dismiss button exists inside the banner
    const closeButtons = banner.querySelectorAll('button');
    assert.strictEqual(closeButtons.length, 0, 'Archival notice banner must be permanent and un-dismissible');
  });
});
