/**
 * CurrencySelector & Multi-Currency Presentation Layer Test Suite
 *
 * Verifies:
 * 1. BrandHeader renders unobtrusive currency toggles for all 5 supported currencies ($, ₹, €, ¥, £).
 * 2. Quick cycle toggle button cycles sequentially through currencies.
 * 3. Reactive formatting updates across dashboard and virtual grid with JPY zero-decimal precision.
 * 4. FileDropzone auto-detects currency from CSV headers/cells when not manually overridden.
 * 5. Numerical metrics enforce font-mono tabular-nums to prevent visual layout jitter.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

import { BrandHeader } from '../../src/components/brand/BrandHeader.tsx';
import { CurrencySelector } from '../../src/components/brand/CurrencySelector.tsx';
import { SummaryDashboard } from '../../src/components/kpi/SummaryDashboard.tsx';
import { ThresholdControls } from '../../src/components/sliders/ThresholdControls.tsx';
import { KeywordVirtualGrid } from '../../src/components/grid/KeywordVirtualGrid.tsx';
import { FileDropzone } from '../../src/components/dropzone/FileDropzone.tsx';
import { useSieveStore, SUPPORTED_CURRENCIES } from '../../src/state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

// Mock Viewport for Happy-DOM
if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1000 });
}

test('CurrencySelector: Renders toggle buttons for all 5 supported currencies and handles selection', () => {
  cleanup();
  useSieveStore.getState().reset();

  const { container } = render(<BrandHeader />);

  // Verify all 5 currency buttons are present
  for (const sym of SUPPORTED_CURRENCIES) {
    const btn = container.querySelector(`[data-testid="currency-toggle-${sym}"]`);
    assert.ok(btn, `Header must render button for ${sym}`);
    assert.equal(btn.textContent?.trim(), sym);
  }

  // Initial currency is '$'
  assert.equal(useSieveStore.getState().currency, '$');
  assert.equal(useSieveStore.getState().isCurrencyManual, false);

  // Click '€' button
  const eurBtn = container.querySelector('[data-testid="currency-toggle-€"]') as HTMLButtonElement;
  act(() => {
    fireEvent.click(eurBtn);
  });

  assert.equal(useSieveStore.getState().currency, '€');
  assert.equal(useSieveStore.getState().isCurrencyManual, true);

  // Click '¥' button
  const jpyBtn = container.querySelector('[data-testid="currency-toggle-¥"]') as HTMLButtonElement;
  act(() => {
    fireEvent.click(jpyBtn);
  });

  assert.equal(useSieveStore.getState().currency, '¥');
  assert.equal(useSieveStore.getState().isCurrencyManual, true);
});

test('CurrencySelector: Quick cycle toggle button cycles through supported currencies', () => {
  cleanup();
  useSieveStore.getState().reset();

  const { container } = render(<BrandHeader />);

  const cycleBtn = container.querySelector('[data-testid="currency-toggle"]') as HTMLButtonElement;
  assert.ok(cycleBtn, 'Cycle toggle button must exist');

  // Cycle from $ -> ₹ -> € -> ¥ -> £ -> $
  assert.equal(useSieveStore.getState().currency, '$');

  act(() => {
    fireEvent.click(cycleBtn);
  });
  assert.equal(useSieveStore.getState().currency, '₹');

  act(() => {
    fireEvent.click(cycleBtn);
  });
  assert.equal(useSieveStore.getState().currency, '€');

  act(() => {
    fireEvent.click(cycleBtn);
  });
  assert.equal(useSieveStore.getState().currency, '¥');

  act(() => {
    fireEvent.click(cycleBtn);
  });
  assert.equal(useSieveStore.getState().currency, '£');

  act(() => {
    fireEvent.click(cycleBtn);
  });
  assert.equal(useSieveStore.getState().currency, '$');
});

test('CurrencySelector: Accessible ARIA roles allow selecting currency button directly', () => {
  cleanup();
  useSieveStore.getState().reset();

  render(<CurrencySelector />);
  const eurButton = screen.getByRole('button', { name: /Select € currency/i });
  assert.ok(eurButton);

  fireEvent.click(eurButton);
  assert.strictEqual(useSieveStore.getState().currency, '€');
  assert.strictEqual(useSieveStore.getState().isCurrencyManual, true);
});

test('Multi-Currency UI: SummaryDashboard & KeywordVirtualGrid update currency display with JPY zero-decimal rounding', () => {
  cleanup();
  useSieveStore.getState().reset();

  const mockKeywords: PersistedNegativeKeyword[] = [
    {
      sha256Hash: 'hash_1',
      keyword: 'unprofitable shoes',
      matchType: 'exact',
      formattedRule: '[unprofitable shoes]',
      platform: 1,
      confidenceScore: 0.95,
      marginalWaste: 12450.4,
      cost: 12450.4,
      conversions: 0,
      hasCollision: false,
      createdAt: Date.now(),
    },
  ];

  act(() => {
    useSieveStore.getState().setKeywords(mockKeywords);
  });

  const { container } = render(
    <div>
      <SummaryDashboard />
      <div style={{ height: '600px', width: '1000px' }}>
        <KeywordVirtualGrid />
      </div>
    </div>
  );

  // Initially in USD: 2-decimals
  let wasteCard = container.querySelector('.text-2xl.font-bold.font-mono.tabular-nums');
  assert.ok(wasteCard);
  assert.equal(wasteCard.textContent?.trim(), '$12,450.40');

  // Switch to JPY: zero-decimal rounding
  act(() => {
    useSieveStore.getState().setCurrency('¥', true);
  });

  wasteCard = container.querySelector('.text-2xl.font-bold.font-mono.tabular-nums');
  assert.ok(wasteCard);
  assert.equal(wasteCard.textContent?.trim(), '¥12,450');

  // Switch to INR: Indian numbering system grouping
  act(() => {
    useSieveStore.getState().setCurrency('₹', true);
  });

  wasteCard = container.querySelector('.text-2xl.font-bold.font-mono.tabular-nums');
  assert.ok(wasteCard);
  assert.equal(wasteCard.textContent?.trim(), '₹12,450.40');
});

test('Multi-Currency UI: FileDropzone auto-detects currency from CSV when not manually overridden', async () => {
  cleanup();
  useSieveStore.getState().reset();
  assert.equal(useSieveStore.getState().currency, '$');
  assert.equal(useSieveStore.getState().isCurrencyManual, false);

  const mockWorkerPool = {
    executeIngestion: async () => ({
      statusCode: 0,
      workerId: 0,
      bytesConsumed: 1024,
      keywords: [
        {
          sha256Hash: 'hash_auto_1',
          keyword: 'chaussures de course',
          matchType: 'phrase',
          formattedRule: '"chaussures de course"',
          platform: 1,
          confidenceScore: 0.9,
          marginalWaste: 85.5,
          clicks: 30,
          cost: 85.5,
          conversions: 0,
          createdAt: Date.now(),
        },
      ],
    }),
  };

  const { container } = render(
    <div>
      <FileDropzone workerPool={mockWorkerPool as any} />
      <SummaryDashboard />
    </div>
  );

  // Ingest a Euro-denominated CSV
  const euroCsv =
    'Search keyword,Campaign,Ad group,Currency,Clicks,Impressions,Cost,Conversions\n"chaussures",Camp1,Adg1,EUR,30,500,"85,50 €",0\n';
  const file = new File([euroCsv], 'euro_report.csv', { type: 'text/csv' });

  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  assert.ok(input);

  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });

  // Verify store auto-detected '€'
  assert.equal(useSieveStore.getState().currency, '€');
  assert.equal(useSieveStore.getState().isCurrencyManual, false);

  // Now manually override to '£'
  act(() => {
    useSieveStore.getState().setCurrency('£', true);
  });
  assert.equal(useSieveStore.getState().currency, '£');
  assert.equal(useSieveStore.getState().isCurrencyManual, true);

  // Ingest another file with INR: should NOT overwrite manual selection
  const inrCsv = 'Customer Search Term,Spend,Currency\n"shoes",₹500.00,INR\n';
  const inrFile = new File([inrCsv], 'inr_report.csv', { type: 'text/csv' });

  await act(async () => {
    fireEvent.change(input, { target: { files: [inrFile] } });
  });

  // Currency must remain '£' because manual override was active
  assert.equal(useSieveStore.getState().currency, '£');
});

test('Multi-Currency UI: Numerical display elements enforce tabular-nums font-mono', () => {
  cleanup();
  useSieveStore.getState().reset();

  const { container } = render(
    <div>
      <BrandHeader />
      <SummaryDashboard />
      <ThresholdControls />
    </div>
  );

  // Verify tabular-nums and font-mono across metric displays
  const tabularElements = container.querySelectorAll('.tabular-nums.font-mono');
  assert.ok(tabularElements.length >= 5, 'All currency and numerical displays must use tabular-nums font-mono');
});
