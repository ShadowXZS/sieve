/**
 * DuckDB-Wasm & Apache Arrow IPC Integration Suite
 *
 * Requirements:
 * 1. DuckDB-Wasm initializes cleanly and runs analytical SQL queries in < 25ms.
 * 2. Arrow IPC bridge converts parsed WASM memory into valid Arrow RecordBatches with preserved schema types.
 * 3. PowerQuery drawer handles user SQL queries and returns tabular records without throwing uncaught exceptions.
 * 4. DuckDB-Wasm embedding in Worker Pool for fast local SQL execution.
 * 5. Zero-Copy Arrow IPC serialization from Rust WASM Core to DuckDB-Wasm in worker pool.
 * 6. Unlinking and dropping in-memory virtual tables on new report ingestion.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

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
import { SieveWorkerPool } from '../../src/workers/pool.ts';

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

  const input = screen.getByTestId('power-query-sql-input') as HTMLTextAreaElement;
  assert.ok(input, 'SQL input should be mounted');

  const runBtn = screen.getByTestId('power-query-run-btn');
  assert.ok(runBtn, 'Run button should be mounted');

  fireEvent.click(runBtn);
  await new Promise((r) => setTimeout(r, 20));

  const table = screen.getByTestId('power-query-table');
  assert.ok(table, 'Results table should mount');
  assert.ok(table.textContent?.includes('cheap flight tickets'));
  assert.ok(table.textContent?.includes('hotel reservations'));

  fireEvent.change(input, { target: { value: 'SELECT * FROM SYNTAX_ERROR' } });
  fireEvent.click(runBtn);
  await new Promise((r) => setTimeout(r, 20));

  const errorEl = screen.getByTestId('power-query-error');
  assert.ok(errorEl, 'Error banner should be displayed without throwing uncaught exception');
  assert.ok(errorEl.textContent?.includes('Parser Error'));
});

test('4. DuckDB-Wasm Embedding in Worker Pool - Fast Local SQL Execution', async () => {
  const pool = new SieveWorkerPool({ concurrency: 2 });

  try {
    const res = await pool.executeSQL('SELECT 1 + 1 as sum_val, 42 as answer;');
    assert.equal(res.rowCount, 1);
    assert.deepEqual(res.columns, ['sum_val', 'answer']);
    assert.equal(res.rows[0].sum_val, 2);
    assert.equal(res.rows[0].answer, 42);
    assert.ok(res.executionTimeMs >= 0);
  } finally {
    await pool.terminate();
  }
});

test('5. Zero-Copy Arrow IPC Serialization from Rust WASM Core to DuckDB-Wasm', async () => {
  const pool = new SieveWorkerPool({ concurrency: 1 });

  try {
    const csvContent = [
      'Search term,Campaign,Ad group,Clicks,Cost,Conversions',
      'cheap running shoes,US_Search,Shoes_AG,25,50.00,2',
      'best trail running shoes,US_Search,Shoes_AG,15,45.00,0',
      'luxury designer sneakers,UK_Search,Sneakers_AG,10,80.00,1',
      'free running shoes,US_Search,Free_AG,5,15.00,0',
      'custom orthotic insoles,UK_Search,Insoles_AG,30,120.00,5',
    ].join('\n');

    const encoder = new TextEncoder();
    const csvBuffer = encoder.encode(csvContent).buffer;

    const ingestRes = await pool.executeIngestion('task_arrow_ipc_1', csvBuffer, true, 0, 50);
    assert.equal(ingestRes.statusCode, 0);
    assert.ok(ingestRes.keywords && ingestRes.keywords.length > 0);

    const sqlRes = await pool.executeSQL(
      'SELECT query, campaign, clicks, cost, conversions FROM search_terms ORDER BY clicks DESC;'
    );

    assert.equal(sqlRes.rowCount, 5);
    assert.deepEqual(sqlRes.columns, ['query', 'campaign', 'clicks', 'cost', 'conversions']);
    assert.equal(sqlRes.rows[0].query, 'custom orthotic insoles');
    assert.equal(sqlRes.rows[0].clicks, 30);
    assert.equal(sqlRes.rows[0].cost, 120);
    assert.equal(sqlRes.rows[0].conversions, 5);

    const rollupRes = await pool.executeSQL(`
      SELECT
        campaign,
        count(*) as total_terms,
        sum(clicks) as total_clicks,
        round(sum(cost), 2) as total_cost,
        sum(conversions) as total_conv
      FROM search_terms
      GROUP BY campaign
      ORDER BY total_cost DESC;
    `);

    assert.equal(rollupRes.rowCount, 2);
    assert.equal(rollupRes.rows[0].campaign, 'UK_Search');
    assert.equal(rollupRes.rows[0].total_cost, 200);
    assert.equal(rollupRes.rows[0].total_clicks, 40);
    assert.equal(rollupRes.rows[0].total_conv, 6);

    assert.equal(rollupRes.rows[1].campaign, 'US_Search');
    assert.equal(rollupRes.rows[1].total_cost, 110);
    assert.equal(rollupRes.rows[1].total_clicks, 45);
  } finally {
    await pool.terminate();
  }
});

test('6. Unlink and Drop In-Memory Virtual Tables on New Report Ingestion', async () => {
  const pool = new SieveWorkerPool({ concurrency: 1 });

  try {
    const encoder = new TextEncoder();

    const report1 = [
      'Search term,Campaign,Ad group,Clicks,Cost,Conversions',
      'alpha query,Camp_A,AG1,10,20.00,1',
      'beta query,Camp_A,AG1,20,40.00,2',
    ].join('\n');

    await pool.executeIngestion('task_r1', encoder.encode(report1).buffer, true, 0);

    const r1Res = await pool.executeSQL('SELECT count(*) as cnt FROM search_terms;');
    assert.equal(r1Res.rows[0].cnt, 2);

    await pool.unlinkTables();
    const unlinkedRes = await pool.executeSQL(
      "SELECT count(*) as cnt FROM information_schema.tables WHERE table_name = 'search_terms';"
    );
    assert.equal(unlinkedRes.rows[0].cnt, 0);

    const report2 = [
      'Search term,Campaign,Ad group,Clicks,Cost,Conversions',
      'gamma query,Camp_B,AG2,50,100.00,5',
    ].join('\n');

    await pool.executeIngestion('task_r2', encoder.encode(report2).buffer, true, 0);

    const r2Res = await pool.executeSQL('SELECT query, clicks, cost FROM search_terms;');
    assert.equal(r2Res.rowCount, 1);
    assert.equal(r2Res.rows[0].query, 'gamma query');
    assert.equal(r2Res.rows[0].clicks, 50);
  } finally {
    await pool.terminate();
  }
});
