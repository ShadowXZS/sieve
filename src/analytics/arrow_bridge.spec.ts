/**
 * Sieve Apache Arrow IPC Bridge Specification
 *
 * TDD Test Suite verifying:
 * 1. 11-column analytical schema and Arrow data types from SearchTermRecord
 * 2. 64-bit integer currency precision without IEEE-754 float hazards
 * 3. Zero-copy Arrow IPC streaming serialization roundtrip
 * 4. Secondary token_matrix Arrow batch generation
 * 5. DuckDB zero-copy virtual table registration and SQL querying
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as arrow from 'apache-arrow';
import type {
  SearchTermRecord,
  CurrencyMicros,
  ClickCount,
  ImpressionCount,
  QueryString,
  AggregatedTokenMetric,
  TokenString,
} from '../domain/types/index.ts';
import {
  recordsToArrowIpc,
  recordsToArrowTable,
  tokensToArrowIpc,
  tokensToArrowTable,
  serializeToArrowIPC,
} from './arrow_bridge.ts';
import {
  initDuckDB,
  registerArrowTable,
  executeDuckDBSQL,
} from './duckdb.ts';

const createMockRecord = (overrides: Partial<SearchTermRecord> = {}): SearchTermRecord => ({
  rawQuery: 'running shoes' as QueryString, normalizedQuery: 'running shoes' as QueryString,
  campaignName: 'Search_US', adGroupName: 'Shoes_AG', matchType: 'EXACT',
  impressions: 1250 as ImpressionCount, clicks: 120 as ClickCount,
  spendMicros: 240_500_000n as CurrencyMicros, conversions: 8.5,
  revenueMicros: 850_000_000n as CurrencyMicros, averageCpcMicros: 2_004_166n as CurrencyMicros,
  hasCollision: false, ...overrides,
});

test('1. recordsToArrowIpc builds valid Arrow Table with 11 analytical columns', () => {
  const records = [
    createMockRecord(),
    createMockRecord({
      rawQuery: 'trail boots' as QueryString,
      normalizedQuery: 'trail boots' as QueryString,
      matchType: 'BROAD',
      hasCollision: true,
    }),
  ];

  const ipcBuffer = recordsToArrowIpc(records);
  assert.ok(ipcBuffer instanceof Uint8Array, 'Should return Uint8Array IPC buffer');
  assert.ok(ipcBuffer.byteLength > 0, 'Buffer should not be empty');

  const table = arrow.tableFromIPC(ipcBuffer);
  assert.equal(table.numRows, 2, 'Table should contain 2 rows');

  const expectedSchema: Record<string, string> = {
    query: 'Utf8',
    campaign: 'Utf8',
    adgroup: 'Utf8',
    match_type: 'Utf8',
    impressions: 'Uint32',
    clicks: 'Uint32',
    spend_micros: 'Uint64',
    conversions: 'Float64',
    revenue_micros: 'Uint64',
    cpc_micros: 'Uint64',
    is_safe: 'Bool',
  };

  const fields = table.schema.fields;
  assert.equal(fields.length, 11, 'Must have exactly 11 analytical columns');

  for (const field of fields) {
    const expectedType = expectedSchema[field.name];
    assert.ok(expectedType, `Unexpected column: ${field.name}`);
    assert.equal(field.type.toString(), expectedType, `Column ${field.name} type mismatch`);
  }

  // Validate values for row 0
  assert.equal(table.getChild('query')?.get(0), 'running shoes');
  assert.equal(table.getChild('match_type')?.get(0), 'EXACT');
  assert.equal(table.getChild('impressions')?.get(0), 1250);
  assert.equal(table.getChild('clicks')?.get(0), 120);
  assert.equal(table.getChild('spend_micros')?.get(0), 240_500_000n);
  assert.equal(table.getChild('conversions')?.get(0), 8.5);
  assert.equal(table.getChild('is_safe')?.get(0), true);

  // Validate row 1 collision / is_safe
  assert.equal(table.getChild('is_safe')?.get(1), false);
});

test('2. spend_micros and revenue_micros retain exact 64-bit integer values', () => {
  // Beyond Number.MAX_SAFE_INTEGER (9_007_199_254_740_991n) to test float hazard elimination
  const largeSpend = 9_007_199_254_740_993n as CurrencyMicros;
  const largeRevenue = 18_000_000_000_000_000n as CurrencyMicros;
  const record = createMockRecord({
    spendMicros: largeSpend,
    revenueMicros: largeRevenue,
  });

  const table = recordsToArrowTable([record]);
  const spendCol = table.getChild('spend_micros');
  const revCol = table.getChild('revenue_micros');

  assert.equal(spendCol?.get(0), largeSpend, 'spend_micros must preserve exact 64-bit BigInt');
  assert.equal(revCol?.get(0), largeRevenue, 'revenue_micros must preserve exact 64-bit BigInt');
});

test('3. Arrow table serializes to IPC streaming buffer and cleanly roundtrips', () => {
  const records = [createMockRecord(), createMockRecord({ rawQuery: 'climbing shoes' as QueryString })];
  const table = recordsToArrowTable(records);
  const ipcBytes = serializeToArrowIPC(table);

  assert.ok(ipcBytes instanceof Uint8Array);
  const roundtripped = arrow.tableFromIPC(ipcBytes);

  assert.equal(roundtripped.numRows, table.numRows);
  assert.equal(roundtripped.schema.fields.length, table.schema.fields.length);
  for (let i = 0; i < roundtripped.schema.fields.length; i++) {
    const origField = table.schema.fields[i];
    const rtField = roundtripped.schema.fields[i];
    assert.equal(rtField.name, origField.name);
    assert.equal(rtField.type.toString(), origField.type.toString());
  }
});

test('4. tokenMatrix Arrow batch generation retains analytical types', () => {
  const tokens: AggregatedTokenMetric[] = [
    {
      tokenText: 'shoes' as TokenString,
      gramDegree: 1,
      classification: 'COMMERCIAL',
      occurrences: 45,
      subClickQueriesCount: 5,
      totalClicks: 210 as ClickCount,
      totalSpendMicros: 420_000_000n as CurrencyMicros,
      conversions: 15.0,
      wilsonScoreUpperBound: 0.1245,
    },
  ];

  const ipcBuffer = tokensToArrowIpc(tokens);
  assert.ok(ipcBuffer instanceof Uint8Array);

  const table = arrow.tableFromIPC(ipcBuffer);
  assert.equal(table.numRows, 1);

  const fields = table.schema.fields;
  assert.equal(fields.length, 6);
  assert.equal(fields[0].name, 'token_text');
  assert.equal(fields[0].type.toString(), 'Utf8');
  assert.equal(fields[1].name, 'occurrences');
  assert.equal(fields[1].type.toString(), 'Uint32');
  assert.equal(fields[2].name, 'total_clicks');
  assert.equal(fields[2].type.toString(), 'Uint32');
  assert.equal(fields[3].name, 'total_spend_micros');
  assert.equal(fields[3].type.toString(), 'Uint64');
  assert.equal(fields[4].name, 'conversions');
  assert.equal(fields[4].type.toString(), 'Float64');
  assert.equal(fields[5].name, 'wilson_upper_bound');
  assert.equal(fields[5].type.toString(), 'Float64');

  assert.equal(table.getChild('token_text')?.get(0), 'shoes');
  assert.equal(table.getChild('total_spend_micros')?.get(0), 420_000_000n);
  assert.equal(table.getChild('wilson_upper_bound')?.get(0), 0.1245);
});

test('5. DuckDB registers virtual tables from Arrow IPC streams and queries accurately', async () => {
  const conn = await initDuckDB();
  assert.ok(conn);

  const records = [createMockRecord({ rawQuery: 'duckdb wasm test' as QueryString, clicks: 50 as ClickCount })];
  const searchIpc = recordsToArrowIpc(records);
  await registerArrowTable('search_terms', searchIpc);

  const res = await executeDuckDBSQL('SELECT query, clicks, spend_micros, is_safe FROM search_terms;');
  assert.equal(res.rowCount, 1);
  assert.equal(res.rows[0].query, 'duckdb wasm test');
  assert.equal(res.rows[0].clicks, 50);
  assert.equal(res.rows[0].spend_micros, 240500000);
  assert.equal(res.rows[0].is_safe, true);
});
