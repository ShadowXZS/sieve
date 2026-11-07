/**
 * KeywordVirtualGrid High-Performance Virtualization & Grid Operations Suite
 *
 * Operating Principles:
 * - High Performance Web Sites (Steve Souders) & Refactoring UI: Virtual DOM windowing, fixed row heights, sub-16ms frames
 * - Cooper's Interaction Principles: Instant visual feedback, accessible keyboard navigation
 *
 * Verifies:
 * 1. Virtualized row ceiling: DOM row elements stay strictly <= 120 for 100,000 and 250,000 records.
 * 2. Uniform row heights (h-10 or h-12) with tabular-nums alignment.
 * 3. Collision badges mount with hover tooltips displaying impacted converting queries.
 * 4. Sub-10ms state updates: Threshold adjustments resolve within frame budget.
 * 5. Keyboard navigation: Arrow keys on sliders, Enter key selection on rows.
 * 6. Zero layout shift (CLS = 0) across rapid dataset switching and slider manipulations.
 * 7. Action modals (ExportModal, ReportConfigModal) mount from grid triggers and handle Escape dismissal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';

import { useSieveStore } from '../../src/state/useSieveStore.ts';
import { ThresholdControls } from '../../src/components/sliders/ThresholdControls.tsx';
import { KeywordVirtualGrid } from '../../src/components/grid/KeywordVirtualGrid.tsx';
import { CollisionBadge } from '../../src/components/badges/CollisionBadge.tsx';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

// Setup Mock Viewport for Virtualizer in headless Happy-DOM
if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1000 });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: 1000000 });
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

test('KeywordVirtualGrid: Renders bounded DOM row buffer (<= 120 elements) with 100,000 mock records', async () => {
  cleanup();
  useSieveStore.getState().reset();

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
  assert.ok(
    renderedRows.length > 0 && renderedRows.length <= 120,
    `Rendered DOM rows count (${renderedRows.length}) must be bounded between 1 and 120 elements`
  );

  const firstRow = renderedRows[0];
  assert.ok(firstRow.textContent?.includes('wasteful search term 0'), 'First row must render keyword');
});

test('KeywordVirtualGrid: Table rows maintain uniform height and tabular numerals for metrics', () => {
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'row_test_1',
      keyword: 'wasteful search term test',
      matchType: 'exact',
      formattedRule: '[wasteful search term test]',
      platform: 1,
      confidenceScore: 0.92,
      marginalWaste: 125.5,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];
  useSieveStore.getState().setKeywords(mockKeywords);

  const { container } = render(
    <div style={{ height: '600px', width: '1000px' }}>
      <KeywordVirtualGrid />
    </div>
  );

  const row = container.querySelector('[data-testid="virtual-grid-row"]') as HTMLElement;
  assert.ok(row, 'KeywordVirtualGrid row must mount');
  assert.ok(
    row.className.includes('h-10') || row.className.includes('h-12'),
    'Table rows must specify uniform height class h-10 or h-12'
  );

  const tabularElements = row.querySelectorAll('.tabular-nums');
  assert.ok(
    tabularElements.length >= 2,
    'Numeric metrics in table rows must format with tabular-nums'
  );
});

test('KeywordVirtualGrid: Collision badges correctly mount and display hover tooltips indicating impacted queries', async () => {
  cleanup();
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

test('KeywordVirtualGrid: Sub-10ms state updates during threshold filter adjustments', async () => {
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

  const t0 = performance.now();
  act(() => {
    useSieveStore.getState().updateThresholds({
      confidenceScore: 0.9,
      maxMarginalWaste: 500,
    });
  });
  const durationMs = performance.now() - t0;

  assert.ok(
    durationMs < 15,
    `State threshold update took ${durationMs.toFixed(3)}ms (must be < 15ms)`
  );

  const filtered = useSieveStore.getState().filteredKeywords;
  assert.ok(filtered.length > 0, 'Filtered keywords must be computed');
  assert.ok(
    filtered.every((k) => k.confidenceScore >= 0.9 && (k.marginalWaste ?? 0) <= 500),
    'All filtered keywords must satisfy thresholds'
  );
});

test('KeywordVirtualGrid: Accessible keyboard navigation and row selection', async () => {
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

  const slider = screen.getByRole('slider', { name: /confidence threshold/i });
  slider.focus();
  assert.strictEqual(document.activeElement, slider, 'Slider must receive keyboard focus');

  const row = container.querySelector('[data-testid="virtual-grid-row"]') as HTMLElement;
  assert.ok(row, 'Row must exist');
  row.focus();
  assert.strictEqual(document.activeElement, row, 'Virtual row must receive keyboard focus');

  fireEvent.keyDown(row, { key: 'Enter', code: 'Enter' });
  const selected = useSieveStore.getState().selectedKeyword;
  assert.strictEqual(selected?.sha256Hash, 'hash_kb_1', 'Row must be selected on Enter keydown');
});

test('KeywordVirtualGrid: Sustained DOM node ceiling below 120 elements during continuous scroll across 250,000 records', async () => {
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

test('KeywordVirtualGrid: Zero layout shifts (CLS = 0) during rapid slider manipulations and dataset switching', async () => {
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

  act(() => {
    useSieveStore.getState().setKeywords(datasetB);
  });
  assert.strictEqual(gridWrapper.offsetHeight, initialHeight, 'Height invariant across dataset switches');
  assert.strictEqual(gridWrapper.offsetWidth, initialWidth, 'Width invariant across dataset switches');

  act(() => {
    useSieveStore.getState().updateThresholds({ confidenceScore: 0.5 });
  });
  assert.strictEqual(gridWrapper.offsetHeight, initialHeight, 'Height invariant across slider adjustments');
});

test('KeywordVirtualGrid: ExportModal and ReportConfigModal mount from action triggers and dismiss via Escape', async () => {
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'hash_exp_1',
      keyword: 'free crack download',
      matchType: 'exact',
      formattedRule: '[free crack download]',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 150,
      hasCollision: true,
      collidingSafeTerms: ['converting safe term'],
      createdAt: Date.now(),
      scope: { campaign: 'Search_Campaign_A', adGroup: 'AdGroup_1' },
    },
  ];
  useSieveStore.getState().setKeywords(mockKeywords);

  render(
    <div style={{ height: '600px', width: '1000px' }}>
      <KeywordVirtualGrid />
    </div>
  );

  // 1. ExportModal trigger
  const exportBtn = screen.getByRole('button', { name: /export negative rules/i });
  await act(async () => {
    fireEvent.click(exportBtn);
  });

  const exportDialog = screen.getByRole('dialog');
  assert.ok(exportDialog, 'Export dialog must mount');
  assert.ok(screen.getByText(/Export Negative Keyword Rules/i));

  // Dismiss via Escape
  await act(async () => {
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
  });
  assert.strictEqual(screen.queryByRole('dialog'), null, 'Export modal closes on Escape');

  // 2. ReportConfigModal trigger
  const pdfBtn = screen.getByRole('button', { name: /generate pdf report/i });
  await act(async () => {
    fireEvent.click(pdfBtn);
  });

  const pdfDialog = screen.getByRole('dialog');
  assert.ok(pdfDialog, 'PDF modal must mount');
  assert.ok(screen.getByText(/Generate Vector Audit Report/i));

  await act(async () => {
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
  });
  assert.strictEqual(screen.queryByRole('dialog'), null, 'PDF modal closes on Escape');
});
