/**
 * BrandHeader & Brand Integration Test Suite
 *
 * Verifies:
 * 1. BrandHeader: Wordmark "SIEVE" typography, removal of sprint badges ("Phase 7", "WASM Analytical Pipeline", "Load 10k Demo").
 * 2. SieveLogo: Mounts /sieve.svg with scalable dimensions (xs to hero), dark/light contrast variants, role="img", aria-label.
 * 3. Brand Assets: Application header, WorkerProcessingHUD, ExportModal, and ReportConfigModal embed /sieve.svg vector asset.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';

import { BrandHeader } from '../../src/components/brand/BrandHeader.tsx';
import { SieveLogo } from '../../src/components/brand/SieveLogo.tsx';
import { App } from '../../src/App.tsx';
import { WorkerProcessingHUD } from '../../src/components/hud/WorkerProcessingHUD.tsx';
import { ExportModal } from '../../src/components/export/ExportModal.tsx';
import { ReportConfigModal } from '../../src/components/reports/ReportConfigModal.tsx';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

test('BrandHeader: Wordmark "SIEVE" has enlarged typography styling (text-2xl or larger, bold/black weight)', () => {
  cleanup();
  render(<BrandHeader />);
  const wordmark = screen.getByText('SIEVE');
  assert.ok(wordmark, 'Header must render "SIEVE" wordmark');
  assert.ok(
    wordmark.className.includes('text-2xl') ||
      wordmark.className.includes('text-3xl') ||
      wordmark.className.includes('text-4xl'),
    `Expected enlarged typography (text-2xl or larger), got classes: "${wordmark.className}"`
  );
  assert.ok(
    wordmark.className.includes('font-black') ||
      wordmark.className.includes('font-extrabold') ||
      wordmark.className.includes('font-bold'),
    `Expected bold/black weight, got classes: "${wordmark.className}"`
  );
});

test('BrandHeader: Does NOT render sprint badges or legacy buttons', () => {
  cleanup();
  const { container } = render(<BrandHeader />);
  assert.strictEqual(
    container.textContent?.includes('Phase 7'),
    false,
    'Header must NOT render the text "Phase 7"'
  );
  assert.strictEqual(
    container.textContent?.includes('WASM Analytical Pipeline'),
    false,
    'Header must NOT render "WASM Analytical Pipeline"'
  );
  assert.strictEqual(
    container.textContent?.includes('Bayesian Posteriori'),
    false,
    'Header must NOT render "Bayesian Posteriori"'
  );
  assert.strictEqual(
    container.textContent?.includes('Load 10k Demo'),
    false,
    'Header must NOT render "Load 10k Demo" button'
  );
  assert.strictEqual(
    screen.queryByRole('button', { name: /10k demo/i }),
    null,
    'Header must not contain any button matching 10k demo'
  );
});

test('SieveLogo: Mounts /sieve.svg with scalable dimensions, handles dark/light contrast variants, and enforces role="img"', () => {
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
    assert.ok(
      img.dataset.size === s || img.className.includes(s) || img.getAttribute('data-size') === s,
      `SieveLogo must register size variant ${s}`
    );
  }

  // Test dark/light contrast variants
  cleanup();
  const { container: darkContainer } = render(<SieveLogo contrast="dark" />);
  const darkImg = darkContainer.querySelector('img[role="img"]') as HTMLImageElement;
  assert.ok(
    darkImg.className.includes('contrast-dark') || darkImg.getAttribute('data-contrast') === 'dark',
    'Dark contrast variant must apply styling class or attribute'
  );

  cleanup();
  const { container: lightContainer } = render(<SieveLogo contrast="light" />);
  const lightImg = lightContainer.querySelector('img[role="img"]') as HTMLImageElement;
  assert.ok(
    lightImg.className.includes('contrast-light') || lightImg.getAttribute('data-contrast') === 'light',
    'Light contrast variant must apply styling class or attribute'
  );
});

test('Brand Integration: Application header renders /sieve.svg brand asset', () => {
  cleanup();
  const { container } = render(<App />);

  const headerLogo = container.querySelector('[data-testid="header-sieve-logo"]') as HTMLImageElement;
  assert.ok(headerLogo, 'Header must contain brand logo with data-testid');
  assert.strictEqual(headerLogo.tagName, 'IMG');
  assert.strictEqual(headerLogo.getAttribute('src'), '/sieve.svg');
  assert.ok(headerLogo.getAttribute('alt')?.includes('Sieve'), 'Logo must have accessible alt text');
});

test('Brand Integration: WorkerProcessingHUD displays /sieve.svg with concurrency metrics', () => {
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

test('Brand Integration: Modal dialog headers embed /sieve.svg vector brand asset', () => {
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
  const exportLogo = (exportContainer.querySelector('[data-testid="export-modal-logo"]') ||
    document.body.querySelector('[data-testid="export-modal-logo"]')) as HTMLImageElement;
  assert.ok(exportLogo, 'ExportModal header must feature /sieve.svg brand asset');
  assert.strictEqual(exportLogo.getAttribute('src'), '/sieve.svg');
  unmountExport();

  // 2. ReportConfigModal header brand integration
  const { container: reportContainer, unmount: unmountReport } = render(
    <ReportConfigModal isOpen={true} onClose={() => {}} />
  );
  const reportLogo = (reportContainer.querySelector('[data-testid="report-modal-logo"]') ||
    document.body.querySelector('[data-testid="report-modal-logo"]')) as HTMLImageElement;
  assert.ok(reportLogo, 'ReportConfigModal header must feature /sieve.svg brand asset');
  assert.strictEqual(reportLogo.getAttribute('src'), '/sieve.svg');
  unmountReport();
});
