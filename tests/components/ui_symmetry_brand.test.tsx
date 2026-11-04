/**
 * UI Symmetry & Brand Integration Test Suite (Phase 7 - TDD Red Phase)
 *
 * Asserts:
 * 1. SieveLogo component mounts /sieve.svg with scalable dimensions (xs to hero),
 *    contrast variants (dark/light), and correct ARIA labelling (role="img").
 * 2. AppShell container applies balanced horizontal margin structures
 *    (max-w-7xl mx-auto px-4 sm:px-6 lg:px-8) and renders a centered workbench layout.
 * 3. SummaryDashboard implements a balanced 4-column metric grid with matching card heights and vertical rhythm.
 * 4. FileDropzone displays the ambient watermark of /sieve.svg with pointer-events-none.
 * 5. Table rows maintain uniform height (h-10 or h-12) with aligned tabular columns for metrics and text.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

// Components under test
import { SieveLogo } from '../../src/components/brand/SieveLogo.tsx';
import { AppShell } from '../../src/components/layout/AppShell.tsx';
import { BrandHeader } from '../../src/components/brand/BrandHeader.tsx';
import { SummaryDashboard } from '../../src/components/kpi/SummaryDashboard.tsx';
import { FileDropzone } from '../../src/components/dropzone/FileDropzone.tsx';
import { KeywordVirtualGrid } from '../../src/components/grid/KeywordVirtualGrid.tsx';
import { useSieveStore } from '../../src/state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

// Viewport mocks for virtualizer in Happy-DOM
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

test('SieveLogo component successfully mounts /sieve.svg with scalable dimensions, handles dark/light contrast variants, and enforces correct ARIA labelling (role="img")', () => {
  cleanup();

  // Test default mount and accessibility role
  const { container: defaultContainer } = render(<SieveLogo size="md" />);
  const logoImg = defaultContainer.querySelector('img[role="img"]') as HTMLImageElement;
  assert.ok(logoImg, 'SieveLogo must render an img element with role="img"');
  assert.strictEqual(logoImg.getAttribute('src'), '/sieve.svg', 'SieveLogo must source /sieve.svg');
  assert.ok(logoImg.getAttribute('aria-label'), 'SieveLogo must have an accessible aria-label');

  // Test scalable size variants: xs to hero
  const sizes: Array<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero'> = ['xs', 'sm', 'md', 'lg', 'xl', 'hero'];
  for (const s of sizes) {
    cleanup();
    const { container } = render(<SieveLogo size={s} />);
    const img = container.querySelector('img[role="img"]') as HTMLImageElement;
    assert.ok(img, `SieveLogo must render for size ${s}`);
    assert.ok(img.dataset.size === s || img.className.includes(s) || img.getAttribute('data-size') === s, `SieveLogo must register size variant ${s}`);
  }

  // Test dark/light contrast variants
  cleanup();
  const { container: darkContainer } = render(<SieveLogo contrast="dark" />);
  const darkImg = darkContainer.querySelector('img[role="img"]') as HTMLImageElement;
  assert.ok(darkImg.className.includes('contrast-dark') || darkImg.getAttribute('data-contrast') === 'dark', 'Dark contrast variant must apply styling class or attribute');

  cleanup();
  const { container: lightContainer } = render(<SieveLogo contrast="light" />);
  const lightImg = lightContainer.querySelector('img[role="img"]') as HTMLImageElement;
  assert.ok(lightImg.className.includes('contrast-light') || lightImg.getAttribute('data-contrast') === 'light', 'Light contrast variant must apply styling class or attribute');
});

test('AppShell container applies balanced horizontal margin structures (max-w-7xl mx-auto px-4 sm:px-6 lg:px-8) and renders a centered workbench layout', () => {
  cleanup();
  const { container } = render(
    <AppShell header={<div>Header Content</div>} footer={<div>Footer Content</div>}>
      <div data-testid="workbench-child">Workbench Content</div>
    </AppShell>
  );

  // Assert bilateral horizontal container constraints
  const mainContainer = container.querySelector('main');
  assert.ok(mainContainer, 'AppShell must render a main container');
  assert.ok(
    mainContainer.className.includes('max-w-7xl') &&
      mainContainer.className.includes('mx-auto') &&
      mainContainer.className.includes('px-4') &&
      mainContainer.className.includes('sm:px-6') &&
      mainContainer.className.includes('lg:px-8'),
    'AppShell main layout must enforce bilateral margin structure: max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'
  );

  // Assert centered workbench presence
  const child = container.querySelector('[data-testid="workbench-child"]');
  assert.ok(child, 'AppShell must render workbench child within bilateral structure');
});

test('SummaryDashboard implements a balanced 4-column metric grid with matching card heights and vertical rhythm', () => {
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
    'SummaryDashboard must use balanced 4-column grid (grid-cols-2 lg:grid-cols-4)'
  );

  const cards = gridContainer.children;
  assert.strictEqual(cards.length, 4, 'SummaryDashboard must render 4 metric cards');

  // Verify all cards enforce matching height and vertical rhythm
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i] as HTMLElement;
    assert.ok(
      card.className.includes('h-full') || card.className.includes('flex flex-col justify-between') || card.className.includes('flex flex-col'),
      'Card must enforce uniform vertical rhythm and height'
    );
  }
});

test('FileDropzone displays the ambient watermark of /sieve.svg with pointer-events-none to guarantee drag-and-drop operations remain unblocked', () => {
  cleanup();
  const { container } = render(<FileDropzone />);

  const watermark = container.querySelector('[data-testid="dropzone-watermark"]') as HTMLElement;
  assert.ok(watermark, 'FileDropzone must render ambient watermark with data-testid="dropzone-watermark"');
  assert.ok(
    watermark.className.includes('pointer-events-none'),
    'Watermark must strictly enforce pointer-events-none to prevent blocking drop interactions'
  );

  const img = watermark.tagName === 'IMG' ? watermark : watermark.querySelector('img');
  assert.ok(img, 'Watermark must contain img element');
  assert.strictEqual(img.getAttribute('src'), '/sieve.svg', 'Watermark must source /sieve.svg');
});

test('Table rows maintain uniform height (h-10 or h-12) with aligned tabular columns for metrics and text', () => {
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

  // Assert uniform height: h-10 or h-12
  assert.ok(
    row.className.includes('h-10') || row.className.includes('h-12'),
    'Table rows must specify uniform height class h-10 or h-12'
  );

  // Assert tabular numeral alignment across numeric columns
  const tabularElements = row.querySelectorAll('.tabular-nums');
  assert.ok(
    tabularElements.length >= 2,
    'Numeric metrics (Confidence Score, Marginal Waste) in table rows must format with tabular-nums'
  );
});

