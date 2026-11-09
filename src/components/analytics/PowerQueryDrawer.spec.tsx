/**
 * PowerQueryDrawer Component Specification Test Suite
 * Validates 11-column analytical DDL, parameterized presets, EXPLAIN inspector,
 * negative candidate staging, modal session persistence, and Cooper's 5 UI states.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { PowerQueryDrawer } from './PowerQueryDrawer.tsx';
import { useSieveStore } from '../../state/useSieveStore.ts';

function resetTestStore() {
  cleanup();
  useSieveStore.getState().reset();
  useSieveStore.setState({
    isPowerQueryOpen: false,
    powerQuerySql: 'SELECT query, spend_micros FROM search_terms LIMIT 10;',
    sqlQueryResult: null,
    isQueryRunning: false,
    sqlQueryError: null,
    keywords: [],
    records: [],
  });
}

test('PowerQueryDrawer: Renders all 11 production columns for search_terms and switches virtual tables', () => {
  resetTestStore();
  render(<PowerQueryDrawer isOpen={true} />);

  const schemaViewer = screen.getByTestId('schema-viewer');
  assert.ok(schemaViewer, 'Schema viewer must be present');

  const requiredCols = [
    { name: 'query', type: 'VARCHAR' },
    { name: 'campaign', type: 'VARCHAR' },
    { name: 'adgroup', type: 'VARCHAR' },
    { name: 'match_type', type: 'VARCHAR' },
    { name: 'impressions', type: 'UINTEGER' },
    { name: 'clicks', type: 'UINTEGER' },
    { name: 'spend_micros', type: 'UBIGINT' },
    { name: 'conversions', type: 'DECIMAL' },
    { name: 'revenue_micros', type: 'UBIGINT' },
    { name: 'cpc_micros', type: 'UBIGINT' },
    { name: 'is_safe', type: 'BOOLEAN' },
  ];

  for (const col of requiredCols) {
    assert.ok(schemaViewer.textContent?.includes(col.name), `Must contain column ${col.name}`);
    assert.ok(schemaViewer.textContent?.includes(col.type), `Must contain type ${col.type}`);
  }

  // Toggle secondary tables
  fireEvent.click(screen.getByTestId('schema-tab-token_matrix'));
  assert.ok(schemaViewer.textContent?.includes('token'));
  assert.ok(schemaViewer.textContent?.includes('gram_degree'));

  fireEvent.click(screen.getByTestId('schema-tab-safe_list'));
  assert.ok(schemaViewer.textContent?.includes('term'));
  assert.ok(schemaViewer.textContent?.includes('created_at'));
});

test('PowerQueryDrawer: Diagnostic presets populate SQL input with parameterized micro-unit expressions', () => {
  resetTestStore();
  render(<PowerQueryDrawer isOpen={true} />);
  const textarea = screen.getByTestId('power-query-sql-input') as HTMLTextAreaElement;

  // Zero-Conv Waste preset
  fireEvent.click(screen.getByRole('button', { name: /Zero-Conv Waste/i }));
  assert.ok(textarea.value.includes('WHERE conversions = 0'));
  assert.ok(textarea.value.includes('spend_micros'));
  assert.ok(textarea.value.includes('cpc_micros'));

  // High CPC Outliers preset
  fireEvent.click(screen.getByRole('button', { name: /High CPC Outliers/i }));
  assert.ok(textarea.value.includes('cpc_micros'));
  assert.ok(textarea.value.includes('spend_micros'));
  assert.ok(textarea.value.includes('cpa_micros'));
});

test('PowerQueryDrawer: Running EXPLAIN renders execution plan tree inspector', async () => {
  resetTestStore();
  const mockPlan = 'PROJECTION -> FILTER -> SEQ_SCAN(search_terms)';
  render(
    <PowerQueryDrawer
      isOpen={true}
      onExplainQuery={async () => ({ plan: mockPlan, operators: ['PROJECTION', 'FILTER', 'SEQ_SCAN'] })}
    />
  );

  const explainBtn = screen.getByTestId('power-query-explain-btn');
  fireEvent.click(explainBtn);
  await new Promise((r) => setTimeout(r, 10));

  const inspector = screen.getByTestId('query-plan-inspector');
  assert.ok(inspector);
  const tree = screen.getByTestId('explain-plan-tree');
  assert.ok(tree.textContent?.includes(mockPlan));
});

test('PowerQueryDrawer: Stage Results as Negative Candidates dispatches to store', () => {
  resetTestStore();
  useSieveStore.setState({
    sqlQueryResult: {
      columns: ['query', 'clicks', 'spend_micros', 'conversions'],
      rows: [
        { query: 'cheap shoes', clicks: 12, spend_micros: 25_000_000n, conversions: 0 },
        { query: 'free trial online', clicks: 8, spend_micros: 16_000_000n, conversions: 0 },
      ],
      rowCount: 2,
      executionTimeMs: 1.2,
      query: 'SELECT query, clicks, spend_micros, conversions FROM search_terms;',
    },
  });

  render(<PowerQueryDrawer isOpen={true} />);

  const stageBtn = screen.getByTestId('stage-negatives-btn');
  assert.ok(stageBtn);
  fireEvent.click(stageBtn);

  const staged = useSieveStore.getState().keywords;
  assert.equal(staged.length, 2);
  assert.equal(staged[0].keyword, 'cheap shoes');
  assert.equal(staged[1].keyword, 'free trial online');
});

test('PowerQueryDrawer: Cooper 5 UI States (Blank, Loading, Ideal, Partial, Error)', () => {
  resetTestStore();

  // 1. Blank state
  const { rerender } = render(<PowerQueryDrawer isOpen={true} />);
  assert.ok(screen.getByTestId('power-query-blank'));

  // 2. Loading state
  useSieveStore.setState({ isQueryRunning: true });
  rerender(<PowerQueryDrawer isOpen={true} />);
  assert.ok(screen.getByTestId('power-query-loading'));

  // 3. Ideal state
  useSieveStore.setState({
    isQueryRunning: false,
    sqlQueryResult: {
      columns: ['query', 'clicks'],
      rows: [{ query: 'test query', clicks: 4 }],
      rowCount: 1,
      executionTimeMs: 0.8,
      query: 'SELECT query, clicks FROM search_terms;',
    },
  });
  rerender(<PowerQueryDrawer isOpen={true} />);
  assert.ok(screen.getByTestId('power-query-table'));
  assert.ok(screen.getByTestId('power-query-table').textContent?.includes('test query'));

  // 4. Partial state (0 rows returned)
  useSieveStore.setState({
    sqlQueryResult: {
      columns: ['query', 'clicks'],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0.5,
      query: 'SELECT query FROM search_terms WHERE false;',
    },
  });
  rerender(<PowerQueryDrawer isOpen={true} />);
  assert.ok(screen.getByTestId('power-query-partial'));

  // 5. Error state
  useSieveStore.setState({
    sqlQueryResult: null,
    sqlQueryError: 'Parser Error: syntax error at or near SELECTT',
  });
  rerender(<PowerQueryDrawer isOpen={true} />);
  assert.ok(screen.getByTestId('power-query-error'));
  assert.ok(screen.getByTestId('power-query-error').textContent?.includes('syntax error'));
});

test('PowerQueryDrawer: Persists query text, active tab, and query history across open/close cycles', async () => {
  resetTestStore();
  const mockExecute = async (sql: string) => ({
    columns: ['query'],
    rows: [{ query: 'persisted row' }],
    rowCount: 1,
    executionTimeMs: 1.0,
  });

  const { rerender } = render(<PowerQueryDrawer isOpen={true} onExecuteQuery={mockExecute} />);

  // Switch tab to token_matrix
  fireEvent.click(screen.getByTestId('schema-tab-token_matrix'));
  assert.ok(screen.getByTestId('schema-viewer').textContent?.includes('token'));

  // Change query and execute to populate history
  act(() => {
    useSieveStore.getState().setPowerQuerySql('SELECT token FROM token_matrix LIMIT 5;');
  });
  rerender(<PowerQueryDrawer isOpen={true} onExecuteQuery={mockExecute} />);

  const runBtn = screen.getByTestId('power-query-run-btn');
  fireEvent.click(runBtn);
  await new Promise((r) => setTimeout(r, 10));

  // Check history select is present
  const historySelect = screen.getByTestId('power-query-history-select');
  assert.ok(historySelect);

  // Close drawer
  rerender(<PowerQueryDrawer isOpen={false} onExecuteQuery={mockExecute} />);
  assert.equal(screen.queryByTestId('power-query-drawer'), null);

  // Reopen drawer
  rerender(<PowerQueryDrawer isOpen={true} onExecuteQuery={mockExecute} />);
  assert.ok(screen.getByTestId('power-query-drawer'));

  // Tab, SQL, and history persist
  assert.ok(screen.getByTestId('schema-viewer').textContent?.includes('token'));
  const textarea = screen.getByTestId('power-query-sql-input') as HTMLTextAreaElement;
  assert.equal(textarea.value, 'SELECT token FROM token_matrix LIMIT 5;');
  assert.ok(screen.getByTestId('power-query-history-select'));
});
