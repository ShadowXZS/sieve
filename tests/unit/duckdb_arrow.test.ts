/**
 * TDD Phase 13: DuckDB & Apache Arrow IPC Integration Suite
 *
 * Requirements:
 * 1. DuckDB-Wasm initializes cleanly and runs analytical SQL queries in < 25ms.
 * 2. Arrow IPC bridge converts parsed WASM memory into valid Arrow RecordBatches with preserved schema types.
 * 3. PowerQuery drawer handles user SQL queries and returns tabular records without throwing uncaught exceptions.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Modules to be implemented in Step 2 (Green Phase)
import {
  initDuckDB,
  executeDuckDBSQL,
  registerArrowTable,
  resetDuckDB,
} from '../../src/analytics/duckdb.ts';

import {
  convertWasmMemoryToArrowBatch,
  serializeToArrowIPC,
  type SieveColumnarHeader,
} from '../../src/analytics/arrow_bridge.ts';

import { PowerQueryDrawer } from '../../src/components/analytics/PowerQueryDrawer.tsx';

test('1. DuckDB-Wasm initializes cleanly and runs analytical SQL queries in < 25ms', async () => {
  const db = await initDuckDB();
  assert.ok(db, 'DuckDB instance should be initialized');

  // Populate analytical test table
  await executeDuckDBSQL('CREATE TABLE IF NOT EXISTS test_terms (query VARCHAR, clicks DOUBLE, cost DOUBLE, conversions DOUBLE);');
  await executeDuckDBSQL("INSERT INTO test_terms VALUES ('nike shoes', 120, 240.50, 5), ('adidas boots', 80, 180.00, 2), ('cheap sandals', 45, 90.00, 0);");

  // Warmup analytical execution pipeline
  await executeDuckDBSQL(`
    SELECT
      query,
      clicks,
      cost,
      round(cost / clicks, 2) as cpc,
      conversions
    FROM test_terms
    WHERE cost > 100
    ORDER BY cost DESC;
  `);

  // Measure analytical query execution latency
  const result = await executeDuckDBSQL(`
    SELECT
      query,
      clicks,
      cost,
      round(cost / clicks, 2) as cpc,
      conversions
    FROM test_terms
    WHERE cost > 100
    ORDER BY cost DESC;
  `);

  assert.ok(
    result.executionTimeMs < 25,
    `DuckDB-Wasm query should execute in < 25ms, took ${result.executionTimeMs}ms`
  );

  assert.equal(result.rowCount, 2);
  assert.deepEqual(result.columns, ['query', 'clicks', 'cost', 'cpc', 'conversions']);
  assert.equal(result.rows[0].query, 'nike shoes');
  assert.equal(result.rows[0].clicks, 120);
  assert.equal(result.rows[0].cpc, 2.0);

  // Clean up table
  await executeDuckDBSQL('DROP TABLE test_terms;');
});

test('2. Arrow IPC bridge converts parsed WASM memory into valid Arrow RecordBatches with preserved schema types', () => {
  // Mock WASM memory layout matching Sieve columnar output format with 8-byte alignment
  const rowCount = 2;
  const queries = ['running shoes', 'hiking boots'];
  const campaigns = ['Search_US', 'Search_UK'];
  const adgroups = ['AG_Shoes', 'AG_Boots'];
  const clicks = [15, 30];
  const costs = [45.5, 90.0];
  const conversions = [1, 3];
  const hasCollisions = [0, 1];

  const enc = new TextEncoder();
  const qBytes = enc.encode(queries.join(''));
  const cBytes = enc.encode(campaigns.join(''));
  const aBytes = enc.encode(adgroups.join(''));

  const align8 = (pos: number) => (pos + 7) & ~7;

  // Build binary buffer
  const buffer = new ArrayBuffer(4096);
  const u32 = new Uint32Array(buffer, 0, 20);

  // Set aligned positions
  const headerLen = 80;
  const qOffPos = align8(headerLen);
  const qOffLen = (rowCount + 1) * 4;
  const qDataPos = align8(qOffPos + qOffLen);
  const qDataLen = qBytes.length;

  const cOffPos = align8(qDataPos + qDataLen);
  const cOffLen = (rowCount + 1) * 4;
  const cDataPos = align8(cOffPos + cOffLen);
  const cDataLen = cBytes.length;

  const aOffPos = align8(cDataPos + cDataLen);
  const aOffLen = (rowCount + 1) * 4;
  const aDataPos = align8(aOffPos + aOffLen);
  const aDataLen = aBytes.length;

  const clicksPos = align8(aDataPos + aDataLen);
  const costPos = align8(clicksPos + rowCount * 8);
  const convPos = align8(costPos + rowCount * 8);
  const collPos = align8(convPos + rowCount * 8);

  u32[0] = 0x53494556; // magic 'SIEV'
  u32[1] = 1; // version
  u32[2] = rowCount;
  u32[3] = qOffPos;
  u32[4] = qOffLen;
  u32[5] = qDataPos;
  u32[6] = qDataLen;
  u32[7] = cOffPos;
  u32[8] = cOffLen;
  u32[9] = cDataPos;
  u32[10] = cDataLen;
  u32[11] = aOffPos;
  u32[12] = aOffLen;
  u32[13] = aDataPos;
  u32[14] = aDataLen;
  u32[15] = clicksPos;
  u32[16] = costPos;
  u32[17] = convPos;
  u32[18] = collPos;

  // Offsets
  const qOff = new Int32Array(buffer, qOffPos, rowCount + 1);
  qOff[0] = 0;
  qOff[1] = enc.encode(queries[0]).length;
  qOff[2] = qBytes.length;
  new Uint8Array(buffer, qDataPos, qDataLen).set(qBytes);

  const cOff = new Int32Array(buffer, cOffPos, rowCount + 1);
  cOff[0] = 0;
  cOff[1] = enc.encode(campaigns[0]).length;
  cOff[2] = cBytes.length;
  new Uint8Array(buffer, cDataPos, cDataLen).set(cBytes);

  const aOff = new Int32Array(buffer, aOffPos, rowCount + 1);
  aOff[0] = 0;
  aOff[1] = enc.encode(adgroups[0]).length;
  aOff[2] = aBytes.length;
  new Uint8Array(buffer, aDataPos, aDataLen).set(aBytes);

  const clkView = new Float64Array(buffer, clicksPos, rowCount);
  clkView[0] = clicks[0];
  clkView[1] = clicks[1];

  const cstView = new Float64Array(buffer, costPos, rowCount);
  cstView[0] = costs[0];
  cstView[1] = costs[1];

  const cnvView = new Float64Array(buffer, convPos, rowCount);
  cnvView[0] = conversions[0];
  cnvView[1] = conversions[1];

  const collView = new Uint8Array(buffer, collPos, rowCount);
  collView[0] = hasCollisions[0];
  collView[1] = hasCollisions[1];

  // Convert to Arrow RecordBatch
  const batch = convertWasmMemoryToArrowBatch(buffer, 0);
  assert.ok(batch, 'Should return valid Arrow RecordBatch');
  assert.equal(batch.numRows, 2);

  // Assert preserved schema types
  const schema = batch.schema;
  assert.equal(schema.fields[0].name, 'query');
  assert.equal(schema.fields[0].type.toString(), 'Utf8');

  assert.equal(schema.fields[1].name, 'campaign');
  assert.equal(schema.fields[1].type.toString(), 'Utf8');

  assert.equal(schema.fields[2].name, 'adgroup');
  assert.equal(schema.fields[2].type.toString(), 'Utf8');

  assert.equal(schema.fields[3].name, 'clicks');
  assert.equal(schema.fields[3].type.toString(), 'Float64');

  assert.equal(schema.fields[4].name, 'cost');
  assert.equal(schema.fields[4].type.toString(), 'Float64');

  assert.equal(schema.fields[5].name, 'conversions');
  assert.equal(schema.fields[5].type.toString(), 'Float64');

  assert.equal(schema.fields[6].name, 'has_collision');
  assert.equal(schema.fields[6].type.toString(), 'Bool');

  // Verify IPC stream serialization
  const ipcBuffer = serializeToArrowIPC(batch);
  assert.ok(ipcBuffer.byteLength > 0, 'IPC serialization should produce valid byte buffer');
});

test('3. PowerQuery drawer handles user SQL queries and returns tabular records without throwing uncaught exceptions', async () => {
  cleanup();

  const mockExecute = async (sql: string) => {
    if (sql.includes('SYNTAX_ERROR')) {
      throw new Error('Parser Error: syntax error at or near "SYNTAX_ERROR"');
    }
    return {
      columns: ['query', 'clicks', 'cost'],
      rows: [
        { query: 'cheap flight tickets', clicks: 50, cost: 120.0 },
        { query: 'hotel reservations', clicks: 30, cost: 75.0 },
      ],
      rowCount: 2,
      executionTimeMs: 1.8,
    };
  };

  render(
    React.createElement(PowerQueryDrawer, {
      isOpen: true,
      onExecuteQuery: mockExecute,
    })
  );

  // Verify elements render
  const input = screen.getByTestId('power-query-sql-input') as HTMLTextAreaElement;
  assert.ok(input, 'SQL input should be mounted');

  const runBtn = screen.getByTestId('power-query-run-btn');
  assert.ok(runBtn, 'Run button should be mounted');

  // Execute query
  fireEvent.click(runBtn);
  await new Promise((r) => setTimeout(r, 20));

  // Verify tabular records displayed
  const table = screen.getByTestId('power-query-table');
  assert.ok(table, 'Results table should mount');
  assert.ok(table.textContent?.includes('cheap flight tickets'));
  assert.ok(table.textContent?.includes('hotel reservations'));

  // Execute invalid query and verify exception is caught and rendered gracefully
  fireEvent.change(input, { target: { value: 'SELECT * FROM SYNTAX_ERROR' } });
  fireEvent.click(runBtn);
  await new Promise((r) => setTimeout(r, 20));

  const errorEl = screen.getByTestId('power-query-error');
  assert.ok(errorEl, 'Error banner should be displayed without throwing uncaught exception');
  assert.ok(errorEl.textContent?.includes('Parser Error'));
});
