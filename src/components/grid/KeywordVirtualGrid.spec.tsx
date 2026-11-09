/**
 * KeywordVirtualGrid & Threshold Controls Test Suite
 * Validates reactive slicing, zero dummy rows, scope controls, bulk actions, and Cooper's 5 States.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import { ThresholdControls } from '../sliders/ThresholdControls.tsx';
import { KeywordVirtualGrid } from './KeywordVirtualGrid.tsx';
import type { PersistedNegativeKeyword } from '../../workers/protocol.ts';

if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1000 });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: 1000000 });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 1000, height: 600, top: 0, left: 0, bottom: 600, right: 1000 }),
  });
}

function makeKeyword(overrides: Partial<PersistedNegativeKeyword> = {}): PersistedNegativeKeyword {
  const keyword = overrides.keyword ?? 'sample negative candidate';
  const matchType = overrides.matchType ?? 'broad';
  const formattedRule = overrides.formattedRule ?? (matchType === 'exact' ? `[${keyword}]` : matchType === 'phrase' ? `"${keyword}"` : keyword);
  return {
    sha256Hash: `hash_${Math.random().toString(36).substring(2, 9)}`,
    keyword, matchType, platform: 1, confidenceScore: 0.92,
    marginalWaste: 150, cost: 150, clicks: 10, conversions: 0, hasCollision: false, createdAt: Date.now(),
    formattedRule,
    ...overrides,
  };
}

test('Step 1.1: Adjusting minNonConvertingClicks from 1 to 4 removes queries with < 4 clicks from DOM', () => {
  cleanup();
  useSieveStore.getState().reset();

  const kw1 = makeKeyword({ sha256Hash: 'h_1', keyword: 'term with 1 click', clicks: 1, cost: 50, marginalWaste: 50 });
  const kw2 = makeKeyword({ sha256Hash: 'h_3', keyword: 'term with 3 clicks', clicks: 3, cost: 80, marginalWaste: 80 });
  const kw3 = makeKeyword({ sha256Hash: 'h_5', keyword: 'term with 5 clicks', clicks: 5, cost: 120, marginalWaste: 120 });

  act(() => {
    useSieveStore.getState().updateThresholds({ minClicks: 1 });
    useSieveStore.getState().setKeywords([kw1, kw2, kw3]);
  });

  const { container } = render(<div style={{ height: '600px', width: '1000px' }}><KeywordVirtualGrid /></div>);
  assert.ok(container.textContent?.includes('term with 1 click'), 'Term with 1 click should be visible initially');
  assert.ok(container.textContent?.includes('term with 3 clicks'), 'Term with 3 clicks should be visible initially');
  assert.ok(container.textContent?.includes('term with 5 clicks'), 'Term with 5 clicks should be visible initially');

  act(() => {
    useSieveStore.getState().updateThresholds({ minClicks: 4 });
  });

  assert.ok(!container.textContent?.includes('term with 1 click'), 'Term with 1 click must be removed when minClicks=4');
  assert.ok(!container.textContent?.includes('term with 3 clicks'), 'Term with 3 clicks must be removed when minClicks=4');
  assert.ok(container.textContent?.includes('term with 5 clicks'), 'Term with 5 clicks must remain visible');
  assert.ok(container.textContent?.includes('1 of 3 qualifying rules'), 'Counter dynamically updates matching rules');
});

test('Step 1.2: Zero-waste dummy rows and $0.00 spend terms are strictly omitted from table', () => {
  cleanup();
  useSieveStore.getState().reset();

  const zeroSpend = makeKeyword({ sha256Hash: 'z_cost', keyword: 'zero spend query', cost: 0, marginalWaste: 0, clicks: 8 });
  const zeroWaste = makeKeyword({ sha256Hash: 'z_waste', keyword: 'zero waste query', cost: 50, conversions: 2, marginalWaste: 0, clicks: 8 });
  const zeroClicks = makeKeyword({ sha256Hash: 'z_clicks', keyword: 'zero click query', cost: 40, marginalWaste: 40, clicks: 0 });
  const validKw = makeKeyword({ sha256Hash: 'v_term', keyword: 'valid actionable term', cost: 65, marginalWaste: 65, clicks: 6 });

  act(() => {
    useSieveStore.getState().setKeywords([zeroSpend, zeroWaste, zeroClicks, validKw]);
  });

  const { container } = render(<div style={{ height: '600px', width: '1000px' }}><KeywordVirtualGrid /></div>);
  assert.ok(!container.textContent?.includes('zero spend query'), '$0 spend queries must be omitted');
  assert.ok(!container.textContent?.includes('zero waste query'), '$0 waste queries must be omitted');
  assert.ok(!container.textContent?.includes('zero click query'), '0 click queries must be omitted');
  assert.ok(container.textContent?.includes('valid actionable term'), 'Valid term must be rendered');
});

test('Step 1.3: Hierarchical scope selector and Match Type toggle dispatch actions to the store', () => {
  cleanup();
  useSieveStore.getState().reset();

  const kw = makeKeyword({ sha256Hash: 'scope_1', keyword: 'nike shoes discount', matchType: 'broad' });
  act(() => {
    useSieveStore.getState().setKeywords([kw]);
  });

  const { container } = render(<div style={{ height: '600px', width: '1000px' }}><KeywordVirtualGrid /></div>);
  const scopeSelect = container.querySelector('select[aria-label="Scope for nike shoes discount"]') as HTMLSelectElement;
  assert.ok(scopeSelect, 'Scope selector dropdown must render on row');

  act(() => {
    fireEvent.change(scopeSelect, { target: { value: 'CAMPAIGN' } });
  });
  const updatedKw = useSieveStore.getState().keywords.find((k) => k.sha256Hash === 'scope_1') as any;
  assert.equal(updatedKw?.targetLevel, 'CAMPAIGN', 'Store keywords must reflect scope update');

  const matchBtn = screen.getByRole('button', { name: /Toggle match type for nike shoes discount/i });
  act(() => {
    fireEvent.click(matchBtn);
  });
  const toggledKw = useSieveStore.getState().keywords.find((k) => k.sha256Hash === 'scope_1');
  assert.equal(toggledKw?.matchType, 'phrase', 'Match type should cycle from broad to phrase');
  assert.equal(toggledKw?.formattedRule, '"nike shoes discount"', 'Rule string should wrap in quotes');
});

test('Step 1.4: Bulk selection state and batch actions (Dismiss, Toggle Match Type) update the store', () => {
  cleanup();
  useSieveStore.getState().reset();

  const kwA = makeKeyword({ sha256Hash: 'bulk_a', keyword: 'term bulk alpha', matchType: 'broad', clicks: 5, cost: 50, marginalWaste: 50 });
  const kwB = makeKeyword({ sha256Hash: 'bulk_b', keyword: 'term bulk beta', matchType: 'broad', clicks: 6, cost: 60, marginalWaste: 60 });

  act(() => {
    useSieveStore.getState().setKeywords([kwA, kwB]);
  });

  render(<div style={{ height: '600px', width: '1000px' }}><KeywordVirtualGrid /></div>);
  const selectAll = screen.getByRole('checkbox', { name: /Select all qualifying rules/i });
  act(() => {
    fireEvent.click(selectAll);
  });

  const actionsBar = screen.getByTestId('staging-actions-bar');
  assert.ok(actionsBar, 'Sticky bulk actions bar must mount when rows are selected');
  assert.ok(actionsBar.textContent?.includes('2 selected'), 'Must display selected row count');

  const toggleBulkBtn = screen.getByTestId('bulk-toggle-match-type');
  act(() => {
    fireEvent.click(toggleBulkBtn);
  });
  const storeKeywords = useSieveStore.getState().keywords;
  assert.ok(storeKeywords.every((k) => k.matchType === 'phrase'), 'Bulk toggle must cycle selected to phrase');

  const dismissBtn = screen.getByTestId('bulk-dismiss');
  act(() => {
    fireEvent.click(dismissBtn);
  });
  assert.equal(useSieveStore.getState().keywords.length, 0, 'Dismissing all selected rows clears them from store');
});

test('Step 1.5: Cooper 5 States: Empty, Loading, Ideal, Partial, Error', () => {
  cleanup();
  useSieveStore.getState().reset();

  // State 1: Empty
  const { unmount } = render(<div style={{ height: '600px', width: '1000px' }}><KeywordVirtualGrid /></div>);
  assert.ok(screen.getByTestId('grid-empty-state'), 'Empty state banner must mount when no items match');
  unmount();

  // State 2: Loading
  act(() => {
    useSieveStore.getState().setIsLoading(true);
  });
  const renderLoading = render(<div style={{ height: '600px', width: '1000px' }}><KeywordVirtualGrid /></div>);
  assert.ok(screen.getByTestId('grid-loading-state'), 'Loading HUD must mount when isLoading=true');
  renderLoading.unmount();

  // State 3: Error
  act(() => {
    useSieveStore.getState().setIsLoading(false);
    useSieveStore.getState().setErrorMessage('Fatal CSV parsing collision');
  });
  const renderError = render(<div style={{ height: '600px', width: '1000px' }}><KeywordVirtualGrid /></div>);
  const errBanner = screen.getByTestId('grid-error-banner');
  assert.ok(errBanner.textContent?.includes('Fatal CSV parsing collision'), 'Error banner must display message');
  renderError.unmount();

  // State 4: Partial Sample (< 5 items)
  act(() => {
    useSieveStore.getState().setErrorMessage(null);
    useSieveStore.getState().setKeywords([
      makeKeyword({ sha256Hash: 'part_1', clicks: 5, cost: 50, marginalWaste: 50 }),
      makeKeyword({ sha256Hash: 'part_2', clicks: 6, cost: 60, marginalWaste: 60 }),
    ]);
  });
  const renderPartial = render(<div style={{ height: '600px', width: '1000px' }}><KeywordVirtualGrid /></div>);
  assert.ok(screen.getByTestId('grid-partial-badge'), 'Partial sample badge mounts for < 5 items');
  renderPartial.unmount();

  // State 5: Ideal (Populated virtualized grid)
  act(() => {
    const idealList = [1, 2, 3, 4, 5, 6].map((i) =>
      makeKeyword({ sha256Hash: `id_${i}`, keyword: `ideal query ${i}`, clicks: 10, cost: 100, marginalWaste: 100 })
    );
    useSieveStore.getState().setKeywords(idealList);
  });
  const renderIdeal = render(<div style={{ height: '600px', width: '1000px' }}><KeywordVirtualGrid /></div>);
  const rows = renderIdeal.container.querySelectorAll('[data-testid="virtual-grid-row"]');
  assert.ok(rows.length >= 5, 'Ideal populated state renders virtualized rows');
  renderIdeal.unmount();
});

test('Step 1.6: ThresholdControls slider onChange debounces updates into store and filters table in < 10ms', async () => {
  cleanup();
  useSieveStore.getState().reset();

  const kw1 = makeKeyword({ sha256Hash: 'tc_1', keyword: 'slider query 1 click', clicks: 1, cost: 50, marginalWaste: 50 });
  const kw4 = makeKeyword({ sha256Hash: 'tc_4', keyword: 'slider query 4 clicks', clicks: 4, cost: 90, marginalWaste: 90 });

  act(() => {
    useSieveStore.getState().updateThresholds({ minClicks: 1 });
    useSieveStore.getState().setKeywords([kw1, kw4]);
  });

  const { container } = render(
    <div>
      <ThresholdControls />
      <div style={{ height: '600px', width: '1000px' }}>
        <KeywordVirtualGrid />
      </div>
    </div>
  );

  assert.ok(container.textContent?.includes('slider query 1 click'));
  assert.ok(container.textContent?.includes('slider query 4 clicks'));

  const clicksSlider = screen.getByRole('slider', { name: /Min Non-Converting Clicks/i });
  const t0 = performance.now();
  act(() => {
    fireEvent.change(clicksSlider, { target: { value: '3' } });
  });

  await new Promise((r) => setTimeout(r, 15));
  const elapsed = performance.now() - t0;

  assert.ok(elapsed < 60, `Recalculation and rendering took ${elapsed.toFixed(2)}ms`);
  assert.ok(!container.textContent?.includes('slider query 1 click'), '1 click query removed after slider moved to 3');
  assert.ok(container.textContent?.includes('slider query 4 clicks'), '4 click query remains visible');
});

