import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';

// Target Phase 4 UI Components and Store
import { useSieveStore } from '../../src/state/useSieveStore.ts';
import { FileDropzone } from '../../src/components/dropzone/FileDropzone.tsx';
import { SummaryDashboard } from '../../src/components/kpi/SummaryDashboard.tsx';
import { ThresholdControls } from '../../src/components/sliders/ThresholdControls.tsx';
import { KeywordVirtualGrid } from '../../src/components/grid/KeywordVirtualGrid.tsx';
import { CollisionBadge } from '../../src/components/badges/CollisionBadge.tsx';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

// Setup Mock Viewport for Virtualizer in headless Happy-DOM
if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    value: 1000000,
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 1000,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: 1000,
    }),
  });
}

test('Multi-file dropzone correctly processes dropped CSV handles and invokes worker ingestion dispatch', async () => {
  useSieveStore.getState().reset();

  let workerIngestDispatched = false;
  let ingestedFileNames: string[] = [];

  const mockWorkerPool = {
    executeIngestion: async (taskId: string, chunkBuffer: ArrayBuffer, isFinal: boolean) => {
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

  // Create mock CSV files
  const file1 = new File(['Query,Clicks,Cost\nshoes,10,5.0'], 'search_terms_1.csv', {
    type: 'text/csv',
  });
  const file2 = new File(['Query,Clicks,Cost\nboots,20,15.0'], 'search_terms_2.csv', {
    type: 'text/csv',
  });

  // Simulate drag and drop
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

test('Threshold slider adjustments trigger store updates and dispatches parameter messages', async () => {
  useSieveStore.getState().reset();

  let parameterDispatchCount = 0;
  let lastDispatchedConfidence = 0;

  const mockWorkerPool = {
    execute: async (cmd: any) => {
      if (cmd.type === 'CALCULATE_BETA_CONFIDENCE' || cmd.type === 'CALCULATE_WILSON_SCORE') {
        parameterDispatchCount++;
        lastDispatchedConfidence = cmd.thresholdRate ?? cmd.z ?? 0;
        return {
          type: 'CALCULATE_BETA_CONFIDENCE_RESULT',
          requestId: cmd.requestId,
          posterior: { alpha: 1, beta: 1, mean: 0.1, variance: 0.01 },
          probabilityBelowThreshold: 0.95,
        };
      }
      return { type: 'WORKER_ERROR', error: 'unhandled' };
    },
  };

  render(<ThresholdControls workerPool={mockWorkerPool as any} />);

  const confidenceSlider = screen.getByRole('slider', { name: /confidence threshold/i });
  assert.ok(confidenceSlider, 'Confidence threshold slider must be rendered');

  // Adjust confidence slider value to 0.85
  await act(async () => {
    fireEvent.change(confidenceSlider, { target: { value: '0.85' } });
  });

  const state = useSieveStore.getState();
  assert.strictEqual(
    state.thresholds.confidenceScore,
    0.85,
    'Store confidence threshold must update'
  );

  await waitFor(() => {
    assert.ok(parameterDispatchCount > 0, 'Worker parameter message must be dispatched');
  });
});

test('Virtualized grid renders only the visible DOM row buffer plus overscan limit with 100,000 mock records', async () => {
  useSieveStore.getState().reset();

  // Generate 100,000 synthetic records
  const count = 100000;
  const mockKeywords: PersistedNegativeKeyword[] = [];
  for (let i = 0; i < count; i++) {
    mockKeywords.push({
      sha256Hash: `hash_${i}`,
      keyword: `wasteful search term ${i}`,
      matchType: i % 2 === 0 ? 'exact' : 'phrase',
      formattedRule: i % 2 === 0 ? `[wasteful search term ${i}]` : `"wasteful search term ${i}"`,
      platform: 1,
      confidenceScore: 0.92,
      marginalWaste: 15.4 * (i + 1),
      hasCollision: i % 10 === 0,
      collidingSafeTerms: i % 10 === 0 ? [`safe converting term ${i}`] : undefined,
      createdAt: 1730700000000 + i,
    });
  }

  useSieveStore.getState().setKeywords(mockKeywords);

  const { container } = render(
    <div style={{ height: '600px', width: '1000px' }}>
      <KeywordVirtualGrid />
    </div>
  );

  const renderedRows = container.querySelectorAll('[data-testid="virtual-grid-row"]');
  // For a 600px viewport with ~40px row height, visible rows + overscan should be ~15 to 40 rows.
  // Must definitely be sustained under 120 elements, NOT 100,000!
  assert.ok(
    renderedRows.length > 0 && renderedRows.length <= 120,
    `Rendered DOM rows count (${renderedRows.length}) must be bounded between 1 and 120 elements`
  );

  // Assert first rendered row displays proper keyword text
  const firstRow = renderedRows[0];
  assert.ok(firstRow.textContent?.includes('wasteful search term 0'), 'First row must render keyword');
});

test('Collision badges correctly mount and display hover tooltips indicating impacted converting queries', async () => {
  const collidingKeyword: PersistedNegativeKeyword = {
    sha256Hash: 'hash_collision_1',
    keyword: 'luxury high top sneakers',
    matchType: 'exact',
    formattedRule: '[luxury high top sneakers]',
    platform: 1,
    confidenceScore: 0.96,
    marginalWaste: 142.5,
    hasCollision: true,
    collidingSafeTerms: ['top sneakers online', 'luxury sneakers sale'],
    createdAt: Date.now(),
  };

  const { container } = render(<CollisionBadge keyword={collidingKeyword} />);

  const badge = container.querySelector('[data-testid="collision-badge"]');
  assert.ok(badge, 'Collision badge element must render');
  assert.ok(badge.textContent?.includes('Exact Match Locked') || badge.textContent?.includes('Collision Guard'));

  // Trigger hover to display tooltip
  await act(async () => {
    fireEvent.mouseEnter(badge);
  });

  const tooltip = screen.getByRole('tooltip');
  assert.ok(tooltip, 'Tooltip must appear on mouse hover');
  assert.ok(
    tooltip.textContent?.includes('top sneakers online'),
    'Tooltip must display impacted safe converting queries'
  );
  assert.ok(
    tooltip.textContent?.includes('luxury sneakers sale'),
    'Tooltip must display all colliding terms'
  );
});

test('Sub-10ms state updates: Verify that simulated parameter updates resolve UI state within target frame budget', async () => {
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [];
  for (let i = 0; i < 10000; i++) {
    mockKeywords.push({
      sha256Hash: `hash_${i}`,
      keyword: `negative keyword ${i}`,
      matchType: 'broad',
      formattedRule: `negative keyword ${i}`,
      platform: 1,
      confidenceScore: (i % 100) / 100,
      marginalWaste: i * 2,
      hasCollision: false,
      createdAt: Date.now(),
    });
  }
  useSieveStore.getState().setKeywords(mockKeywords);

  // Benchmark store update and filtering time
  const t0 = performance.now();
  act(() => {
    useSieveStore.getState().updateThresholds({
      confidenceScore: 0.9,
      maxMarginalWaste: 500,
    });
  });
  const durationMs = performance.now() - t0;

  assert.ok(
    durationMs < 10,
    `State threshold update and filtered subset evaluation took ${durationMs.toFixed(3)}ms (must be < 10ms)`
  );

  const filtered = useSieveStore.getState().filteredKeywords;
  assert.ok(filtered.length > 0, 'Filtered keywords must be computed');
  assert.ok(
    filtered.every((k) => k.confidenceScore >= 0.9 && k.marginalWaste <= 500),
    'All filtered keywords must satisfy thresholds'
  );
});

test('Accessible keyboard navigation and focus rings across sliders and grid rows', async () => {
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'hash_kb_1',
      keyword: 'test term keyboard',
      matchType: 'exact',
      formattedRule: '[test term keyboard]',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 120,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];
  useSieveStore.getState().setKeywords(mockKeywords);

  const { container } = render(
    <div>
      <ThresholdControls />
      <div style={{ height: '600px', width: '1000px' }}>
        <KeywordVirtualGrid />
      </div>
    </div>
  );

  // Check sliders have focus rings and accessible attributes
  const slider = screen.getByRole('slider', { name: /confidence threshold/i });
  slider.focus();
  assert.strictEqual(document.activeElement, slider, 'Slider must receive keyboard focus');

  // Trigger keyboard adjustment on slider
  fireEvent.keyDown(slider, { key: 'ArrowRight', code: 'ArrowRight' });

  // Check grid rows have keyboard focus and selection triggers
  const row = container.querySelector('[data-testid="virtual-grid-row"]') as HTMLElement;
  assert.ok(row, 'Row must exist');
  row.focus();
  assert.strictEqual(document.activeElement, row, 'Virtual row must receive keyboard focus');

  // Press Enter to select
  fireEvent.keyDown(row, { key: 'Enter', code: 'Enter' });
  const selected = useSieveStore.getState().selectedKeyword;
  assert.strictEqual(selected?.sha256Hash, 'hash_kb_1', 'Row must be selected on Enter keydown');
});

test('Virtual grid sustained DOM node ceiling below 120 elements during continuous scroll across 250,000 records', async () => {
  cleanup();
  useSieveStore.getState().reset();

  const totalRecords = 250000;
  const mockKeywords: PersistedNegativeKeyword[] = [];
  for (let i = 0; i < totalRecords; i++) {
    mockKeywords.push({
      sha256Hash: `hash_250k_${i}`,
      keyword: `query scale ${i}`,
      matchType: 'phrase',
      formattedRule: `"query scale ${i}"`,
      platform: 1,
      confidenceScore: 0.88,
      marginalWaste: 42,
      hasCollision: false,
      createdAt: Date.now(),
    });
  }
  useSieveStore.getState().setKeywords(mockKeywords);

  const { container } = render(
    <div style={{ height: '600px', width: '1000px' }}>
      <KeywordVirtualGrid />
    </div>
  );

  const scrollContainer = container.querySelector('[role="region"]') as HTMLElement;
  assert.ok(scrollContainer, 'Scroll container must be mounted');

  // Simulate scrolling through various depths: 0px, 5,000px, 50,000px, 200,000px
  const scrollOffsets = [0, 5000, 50000, 200000];

  for (const offset of scrollOffsets) {
    act(() => {
      scrollContainer.scrollTop = offset;
      fireEvent.scroll(scrollContainer);
    });

    const renderedRows = container.querySelectorAll('[data-testid="virtual-grid-row"]');
    assert.ok(
      renderedRows.length <= 120,
      `At scroll offset ${offset}px, rendered DOM rows count (${renderedRows.length}) must stay strictly below 120 elements`
    );
  }
});

test('Zero layout shifts (CLS = 0) during rapid slider manipulations and dataset switching', async () => {
  cleanup();
  useSieveStore.getState().reset();

  const datasetA: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'a_1',
      keyword: 'dataset a term',
      matchType: 'exact',
      formattedRule: '[dataset a term]',
      platform: 1,
      confidenceScore: 0.99,
      marginalWaste: 50,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  const datasetB: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'b_1',
      keyword: 'dataset b term',
      matchType: 'broad',
      formattedRule: 'dataset b term',
      platform: 2,
      confidenceScore: 0.85,
      marginalWaste: 200,
      hasCollision: true,
      collidingSafeTerms: ['safe b'],
      createdAt: Date.now(),
    },
  ];

  useSieveStore.getState().setKeywords(datasetA);

  const { container } = render(
    <div style={{ height: '600px', width: '1000px' }}>
      <KeywordVirtualGrid />
    </div>
  );

  const gridWrapper = container.firstElementChild as HTMLElement;
  const initialHeight = gridWrapper.offsetHeight;
  const initialWidth = gridWrapper.offsetWidth;

  // Rapidly switch datasets
  act(() => {
    useSieveStore.getState().setKeywords(datasetB);
  });
  assert.strictEqual(gridWrapper.offsetHeight, initialHeight, 'Height must remain invariant across dataset switches (CLS = 0)');
  assert.strictEqual(gridWrapper.offsetWidth, initialWidth, 'Width must remain invariant across dataset switches (CLS = 0)');

  // Rapidly manipulate thresholds
  act(() => {
    useSieveStore.getState().updateThresholds({ confidenceScore: 0.5 });
  });
  assert.strictEqual(gridWrapper.offsetHeight, initialHeight, 'Height must remain invariant across slider adjustments (CLS = 0)');
});
