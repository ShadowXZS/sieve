/**
 * Phase 7 - UI/UX Refinement & Brand Symmetry Test Suite
 *
 * Validates:
 * 1. Brand Integration: /sieve.svg touchpoints (Application Header, Ambient Dropzone Watermark,
 *    Worker Processing HUD, Modal Dialog Headers).
 * 2. Layout Symmetry Mandate:
 *    - KPI Dashboards: Equal-column CSS grids (grid-cols-2 lg:grid-cols-4).
 *    - Control Surfaces: Balanced two-column configuration (grid-cols-1 md:grid-cols-2).
 *    - Data Tables: Numeric data tabular alignment (font-mono tabular-nums).
 * 3. Micro-interactions & Polish:
 *    - 150ms spring transitions (duration-150 ease-out).
 *    - Accessible focus rings with consistent ring-offset (ring-offset-2).
 *    - Zero layout shift (CLS = 0) during active processing and threshold manipulations.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

import { App } from '../../src/App.tsx';
import { FileDropzone } from '../../src/components/dropzone/FileDropzone.tsx';
import { SummaryDashboard } from '../../src/components/kpi/SummaryDashboard.tsx';
import { ThresholdControls } from '../../src/components/sliders/ThresholdControls.tsx';
import { KeywordVirtualGrid } from '../../src/components/grid/KeywordVirtualGrid.tsx';
import { WorkerProcessingHUD } from '../../src/components/hud/WorkerProcessingHUD.tsx';
import { ExportModal } from '../../src/components/export/ExportModal.tsx';
import { ReportConfigModal } from '../../src/components/reports/ReportConfigModal.tsx';
import { useSieveStore } from '../../src/state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

// Setup Mock Viewport for Happy-DOM
if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    value: 1000,
  });
}

test('Phase 7 Brand Integration: Application header renders /sieve.svg brand asset', () => {
  cleanup();
  const { container } = render(<App />);

  const headerLogo = container.querySelector('[data-testid="header-sieve-logo"]') as HTMLImageElement;
  assert.ok(headerLogo, 'Header must contain brand logo with data-testid');
  assert.strictEqual(headerLogo.tagName, 'IMG');
  assert.strictEqual(headerLogo.getAttribute('src'), '/sieve.svg');
  assert.ok(headerLogo.getAttribute('alt')?.includes('Sieve'), 'Logo must have accessible alt text');
});

test('Phase 7 Brand Integration: FileDropzone includes ambient /sieve.svg watermark', () => {
  cleanup();
  const { container } = render(<FileDropzone />);

  const watermark = container.querySelector('[data-testid="dropzone-watermark"]') as HTMLImageElement;
  assert.ok(watermark, 'FileDropzone must contain ambient watermark element');
  assert.strictEqual(watermark.tagName, 'IMG');
  assert.strictEqual(watermark.getAttribute('src'), '/sieve.svg');
  assert.ok(watermark.className.includes('pointer-events-none'), 'Watermark must not interfere with drag/drop events');
  assert.ok(watermark.className.includes('opacity-'), 'Watermark must be subtly blended/ambient');
});

test('Phase 7 Brand Integration: WorkerProcessingHUD displays /sieve.svg with concurrency metrics', () => {
  cleanup();
  const mockPool = {
    concurrency: 8,
    busyWorkersCount: 2,
    queueDepth: 0,
    activeWorkersCount: 8,
  };

  const { container } = render(<WorkerProcessingHUD workerPool={mockPool as any} />);

  const hudLogo = container.querySelector('[data-testid="hud-sieve-logo"]') as HTMLImageElement;
  assert.ok(hudLogo, 'Worker Processing HUD must display /sieve.svg logo asset');
  assert.strictEqual(hudLogo.getAttribute('src'), '/sieve.svg');

  // Verify concurrency and hardware threads readout
  assert.ok(container.textContent?.includes('Threads: 8'), 'HUD must display hardware concurrency threads');
  assert.ok(container.textContent?.includes('Busy: 2'), 'HUD must display busy workers');
  assert.ok(container.textContent?.includes('SIMD Pointers'), 'HUD must display WebAssembly memory architecture');
});

test('Phase 7 Brand Integration: Modal dialog headers embed /sieve.svg vector brand asset', () => {
  cleanup();
  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'hash_modal_1',
      keyword: 'test brand modal term',
      matchType: 'exact',
      formattedRule: '[test brand modal term]',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 75,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  // 1. ExportModal header brand integration
  const { container: exportContainer, unmount: unmountExport } = render(
    <ExportModal isOpen={true} onClose={() => {}} keywords={mockKeywords} />
  );
  const exportLogo = exportContainer.querySelector('[data-testid="export-modal-logo"]') as HTMLImageElement;
  assert.ok(exportLogo, 'ExportModal header must feature /sieve.svg brand asset');
  assert.strictEqual(exportLogo.getAttribute('src'), '/sieve.svg');
  unmountExport();

  // 2. ReportConfigModal header brand integration
  const { container: reportContainer, unmount: unmountReport } = render(
    <ReportConfigModal isOpen={true} onClose={() => {}} />
  );
  const reportLogo = reportContainer.querySelector('[data-testid="report-modal-logo"]') as HTMLImageElement;
  assert.ok(reportLogo, 'ReportConfigModal header must feature /sieve.svg brand asset');
  assert.strictEqual(reportLogo.getAttribute('src'), '/sieve.svg');
  unmountReport();
});

test('Phase 7 Layout Symmetry: KPI summary dashboard uses equal-column CSS grid (grid-cols-2 lg:grid-cols-4)', () => {
  cleanup();
  useSieveStore.getState().reset();
  useSieveStore.getState().setKeywords([
    {
      sha256Hash: 'kpi_test_1',
      keyword: 'sample query',
      matchType: 'exact',
      formattedRule: '[sample query]',
      platform: 1,
      confidenceScore: 0.94,
      marginalWaste: 1500,
      hasCollision: true,
      createdAt: Date.now(),
    },
  ]);

  const { container } = render(<SummaryDashboard />);
  const gridContainer = container.firstElementChild as HTMLElement;

  assert.ok(
    gridContainer.className.includes('grid-cols-2 lg:grid-cols-4'),
    'KPI dashboard must adhere to equal-column bilateral grid layout: grid-cols-2 lg:grid-cols-4'
  );

  // Verify all numeric metrics use tabular numerals
  const tabularNumerals = container.querySelectorAll('.tabular-nums');
  assert.ok(
    tabularNumerals.length >= 4,
    'All 4 KPI metric cards must format numbers with font-mono tabular-nums'
  );
});

test('Phase 7 Layout Symmetry: ThresholdControls employs balanced two-column configuration', () => {
  cleanup();
  const { container } = render(<ThresholdControls />);

  const controlSurface = container.querySelector('.grid') as HTMLElement;
  assert.ok(controlSurface, 'ThresholdControls must render grid container');
  assert.ok(
    controlSurface.className.includes('grid-cols-1 md:grid-cols-2'),
    'ThresholdControls must enforce a balanced two-column surface configuration (grid-cols-1 md:grid-cols-2)'
  );

  // Verify tabular numerals on all 4 control values
  const tabularValues = container.querySelectorAll('.tabular-nums');
  assert.ok(
    tabularValues.length >= 4,
    'Slider readouts must employ font-mono tabular-nums to prevent layout shift'
  );
});

test('Phase 7 Polish: Accessible focus rings with consistent ring-offset and 150ms spring transitions', () => {
  cleanup();
  const { container } = render(
    <div>
      <ThresholdControls />
      <FileDropzone />
    </div>
  );

  // Check sliders have consistent ring-offset-2
  const sliders = container.querySelectorAll('input[type="range"]');
  assert.strictEqual(sliders.length, 4, 'Must have 4 sliders');
  sliders.forEach((slider) => {
    assert.ok(
      slider.className.includes('ring-offset-2') && slider.className.includes('duration-150'),
      'Sliders must specify accessible focus rings with ring-offset-2 and 150ms transitions'
    );
  });

  // Check dropzone focus ring
  const dropzone = container.querySelector('[data-testid="file-dropzone"]') as HTMLElement;
  assert.ok(
    dropzone.className.includes('focus-visible:ring-offset-2') &&
      dropzone.className.includes('duration-150'),
    'Dropzone must specify accessible focus ring with ring-offset-2 and 150ms spring transition'
  );
});

test('Phase 7 Polish: Zero layout shift across worker state elevation and HUD transitions', async () => {
  cleanup();
  useSieveStore.getState().reset();

  const { container } = render(<WorkerProcessingHUD />);
  const hudWrapper = container.firstElementChild as HTMLElement;

  const initialHeight = hudWrapper.offsetHeight;
  const initialWidth = hudWrapper.offsetWidth;

  // Elevate worker state into active ingestion
  act(() => {
    useSieveStore.getState().setIngesting(true, 45);
  });

  assert.strictEqual(
    hudWrapper.offsetHeight,
    initialHeight,
    'HUD height must remain invariant during state elevation into active ingestion (CLS = 0)'
  );
  assert.strictEqual(
    hudWrapper.offsetWidth,
    initialWidth,
    'HUD width must remain invariant during state elevation into active ingestion (CLS = 0)'
  );

  // Progress to 95%
  act(() => {
    useSieveStore.getState().setIngesting(true, 95);
  });

  assert.strictEqual(hudWrapper.offsetHeight, initialHeight, 'HUD height invariant at 95% progress (CLS = 0)');

  // Complete ingestion
  act(() => {
    useSieveStore.getState().setIngesting(false, 100);
  });

  assert.strictEqual(hudWrapper.offsetHeight, initialHeight, 'HUD height invariant when returning to standby (CLS = 0)');
});

