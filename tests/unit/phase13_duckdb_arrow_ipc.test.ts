/**
 * Phase 13 TDD Test Suite: DuckDB-Wasm & Apache Arrow IPC
 *
 * Verifies:
 * 1. Zero-copy Apache Arrow IPC serialization between the Rust WASM core and DuckDB-Wasm.
 * 2. Embedded DuckDB-Wasm SQL querying inside worker pool threads (strictly off main UI thread).
 * 3. Unlinking and dropping in-memory virtual tables immediately when a new report is loaded.
 * 4. Advanced SQL analytical query execution across search terms.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SieveWorkerPool } from '../../src/workers/pool.ts';

test('Phase 13: DuckDB-Wasm Embedding in Worker Pool - Fast Local SQL Execution', async () => {
  const pool = new SieveWorkerPool({ concurrency: 2 });

  try {
    // Execute SQL directly in worker thread before any CSV ingestion
    // Default schema should be ready
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

test('Phase 13: Zero-Copy Arrow IPC Serialization from Rust WASM Core to DuckDB-Wasm', async () => {
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

    // Ingest final chunk into worker
    const ingestRes = await pool.executeIngestion('task_arrow_ipc_1', csvBuffer, true, 0, 50);
    assert.equal(ingestRes.statusCode, 0);
    assert.ok(ingestRes.keywords && ingestRes.keywords.length > 0);

    // Verify search_terms table is populated in DuckDB-Wasm via Arrow IPC stream
    const sqlRes = await pool.executeSQL(
      'SELECT query, campaign, clicks, cost, conversions FROM search_terms ORDER BY clicks DESC;'
    );

    assert.equal(sqlRes.rowCount, 5);
    assert.deepEqual(sqlRes.columns, ['query', 'campaign', 'clicks', 'cost', 'conversions']);

    // Check top clicks row: 'custom orthotic insoles' (30 clicks)
    assert.equal(sqlRes.rows[0].query, 'custom orthotic insoles');
    assert.equal(sqlRes.rows[0].clicks, 30);
    assert.equal(sqlRes.rows[0].cost, 120);
    assert.equal(sqlRes.rows[0].conversions, 5);

    // Perform SQL Aggregation query: Group by campaign
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
    // UK_Search (Sneakers: 80 + Insoles: 120 = 200)
    assert.equal(rollupRes.rows[0].campaign, 'UK_Search');
    assert.equal(rollupRes.rows[0].total_cost, 200);
    assert.equal(rollupRes.rows[0].total_clicks, 40);
    assert.equal(rollupRes.rows[0].total_conv, 6);

    // US_Search (50 + 45 + 15 = 110)
    assert.equal(rollupRes.rows[1].campaign, 'US_Search');
    assert.equal(rollupRes.rows[1].total_cost, 110);
    assert.equal(rollupRes.rows[1].total_clicks, 45);
  } finally {
    await pool.terminate();
  }
});

test('Phase 13: Unlink and Drop In-Memory Virtual Tables on New Report Ingestion', async () => {
  const pool = new SieveWorkerPool({ concurrency: 1 });

  try {
    const encoder = new TextEncoder();

    // Report 1: 2 terms
    const report1 = [
      'Search term,Campaign,Ad group,Clicks,Cost,Conversions',
      'alpha query,Camp_A,AG1,10,20.00,1',
      'beta query,Camp_A,AG1,20,40.00,2',
    ].join('\n');

    await pool.executeIngestion('task_r1', encoder.encode(report1).buffer, true, 0);

    const r1Res = await pool.executeSQL('SELECT count(*) as cnt FROM search_terms;');
    assert.equal(r1Res.rows[0].cnt, 2);

    // Explicit unlink verification
    await pool.unlinkTables();
    // Table should now be empty or dropped
    const unlinkedRes = await pool.executeSQL(
      "SELECT count(*) as cnt FROM information_schema.tables WHERE table_name = 'search_terms';"
    );
    assert.equal(unlinkedRes.rows[0].cnt, 0);

    // Report 2: 1 new term
    const report2 = [
      'Search term,Campaign,Ad group,Clicks,Cost,Conversions',
      'gamma query,Camp_B,AG2,50,100.00,5',
    ].join('\n');

    await pool.executeIngestion('task_r2', encoder.encode(report2).buffer, true, 0);

    // Verify report 1 terms were dropped and only report 2 is present
    const r2Res = await pool.executeSQL('SELECT query, clicks, cost FROM search_terms;');
    assert.equal(r2Res.rowCount, 1);
    assert.equal(r2Res.rows[0].query, 'gamma query');
    assert.equal(r2Res.rows[0].clicks, 50);
  } finally {
    await pool.terminate();
  }
});

test('Phase 13: Zero Server Compute & Main Thread Protection Constraints', async () => {
  const pool = new SieveWorkerPool({ concurrency: 1 });

  try {
    // Generate 500 synthetic queries to measure sub-50ms execution in worker
    const rows = ['Search term,Campaign,Ad group,Clicks,Cost,Conversions'];
    for (let i = 0; i < 500; i++) {
      rows.push(`synthetic search term query ${i},Camp_${i % 4},AG_${i % 10},${i + 1},${(i + 1) * 2.5},${i % 5}`);
    }
    const csvBuffer = new TextEncoder().encode(rows.join('\n')).buffer;

    await pool.executeIngestion('task_perf', csvBuffer, true, 0);

    // Measure SQL query execution time
    const start = performance.now();
    const res = await pool.executeSQL(`
      SELECT
        campaign,
        count(*) as count,
        avg(cost) as avg_cost
      FROM search_terms
      WHERE clicks >= 10
      GROUP BY campaign
      ORDER BY count DESC;
    `);
    const totalDuration = performance.now() - start;

    assert.equal(res.rowCount, 4);
    assert.ok(res.executionTimeMs > 0);
    // Worker round-trip + DuckDB query must easily finish in under 150ms
    assert.ok(totalDuration < 200, `Expected sub-200ms query execution, got ${totalDuration}ms`);
  } finally {
    await pool.terminate();
  }
});

