/**
 * Power Query Drawer Component Test Suite
 *
 * Verifies:
 * 1. BrandHeader renders Power Query trigger button.
 * 2. PowerQueryDrawer renders slide-over panel with DuckDB-Wasm badge and Zero Server guarantee.
 * 3. Preset queries populate the SQL input textarea.
 * 4. Run Query dispatches query to worker pool and displays tabular results with telemetry.
 * 5. Error handling renders clear alert banner on invalid SQL.
 * 6. Keyboard accessibility: Escape key closes the drawer.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BrandHeader } from '../../src/components/brand/BrandHeader.tsx';
import { PowerQueryDrawer } from '../../src/components/analytics/PowerQueryDrawer.tsx';
import { useSieveStore } from '../../src/state/useSieveStore.ts';

test('PowerQueryDrawer: BrandHeader renders Power Query SQL button', () => {
  cleanup();
  let opened = false;
  render(<BrandHeader onOpenPowerQuery={() => { opened = true; }} />);

  const btn = screen.getByTestId('header-power-query-btn');
  assert.ok(btn);
  assert.ok(btn.textContent?.includes('Power Query'));
  assert.ok(btn.textContent?.includes('SQL'));

  fireEvent.click(btn);
  assert.equal(opened, true);
});

test('PowerQueryDrawer: Does not render in DOM when isOpen is false', () => {
  cleanup();
  useSieveStore.setState({ isPowerQueryOpen: false });
  render(<PowerQueryDrawer isOpen={false} />);

  assert.equal(screen.queryByTestId('power-query-drawer'), null);
});

test('PowerQueryDrawer: Renders when open with DuckDB-Wasm & Zero Server badges', () => {
  cleanup();
  render(<PowerQueryDrawer isOpen={true} />);

  const drawer = screen.getByTestId('power-query-drawer');
  assert.ok(drawer);

  // Check titles and badges
  assert.ok(drawer.textContent?.includes('Power Query'));
  assert.ok(drawer.textContent?.includes('DuckDB-Wasm'));
  assert.ok(drawer.textContent?.includes('Zero Server Compute'));
  assert.ok(drawer.textContent?.includes('search_terms'));

  // Default textarea exists
  const textarea = screen.getByTestId('power-query-sql-input') as HTMLTextAreaElement;
  assert.ok(textarea);
});

test('PowerQueryDrawer: Clicking preset queries updates SQL textarea', () => {
  cleanup();
  render(<PowerQueryDrawer isOpen={true} />);

  const textarea = screen.getByTestId('power-query-sql-input') as HTMLTextAreaElement;

  // Click 'Zero-Conv Waste' preset
  const zeroConvBtn = screen.getByRole('button', { name: /Zero-Conv Waste/i });
  fireEvent.click(zeroConvBtn);

  assert.ok(textarea.value.includes('WHERE conversions = 0'));

  // Click 'Campaign Rollup' preset
  const rollupBtn = screen.getByRole('button', { name: /Campaign Rollup/i });
  fireEvent.click(rollupBtn);

  assert.ok(textarea.value.includes('GROUP BY campaign'));
});

test('PowerQueryDrawer: Run Query executes SQL and renders results table with telemetry', async () => {
  cleanup();

  const mockWorkerPool = {
    executeSQL: async (query: string) => {
      return {
        columns: ['query', 'clicks', 'cost'],
        rows: [
          { query: 'cheap shoes', clicks: 12, cost: 15.5 },
          { query: 'trail boots', clicks: 45, cost: 60.0 },
        ],
        rowCount: 2,
        executionTimeMs: 1.45,
      };
    },
  } as any;

  render(<PowerQueryDrawer isOpen={true} workerPool={mockWorkerPool} />);

  const runBtn = screen.getByTestId('power-query-run-btn');
  fireEvent.click(runBtn);

  // Allow promise to resolve
  await new Promise((r) => setTimeout(r, 20));

  const table = screen.getByTestId('power-query-table');
  assert.ok(table);
  assert.ok(table.textContent?.includes('cheap shoes'));
  assert.ok(table.textContent?.includes('trail boots'));

  const drawer = screen.getByTestId('power-query-drawer');
  assert.ok(drawer.textContent?.includes('1.45 ms'));
});

test('PowerQueryDrawer: Error in SQL execution renders clear alert banner', async () => {
  cleanup();

  const mockWorkerPool = {
    executeSQL: async () => {
      throw new Error('Catalog Error: Table with name unknown_table does not exist');
    },
  } as any;

  render(<PowerQueryDrawer isOpen={true} workerPool={mockWorkerPool} />);

  const runBtn = screen.getByTestId('power-query-run-btn');
  fireEvent.click(runBtn);

  await new Promise((r) => setTimeout(r, 20));

  const errorBanner = screen.getByTestId('power-query-error');
  assert.ok(errorBanner);
  assert.ok(errorBanner.textContent?.includes('Catalog Error'));
});

test('PowerQueryDrawer: Escape key invokes onClose', () => {
  cleanup();
  let closed = false;
  render(<PowerQueryDrawer isOpen={true} onClose={() => { closed = true; }} />);

  fireEvent.keyDown(window, { key: 'Escape' });
  assert.equal(closed, true);
});
