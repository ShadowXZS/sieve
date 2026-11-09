/**
 * SIEVE DuckDB Analytical Query Adapter Behavioral Suite
 *
 * TDD Test Suite verifying:
 * 1. Querying across search_terms, token_matrix, and safe_list virtual tables
 * 2. EXPLAIN query plan execution and operator/projection extraction
 * 3. Parameterized zero-conversion waste preset SQL generation and execution
 * 4. Structured descriptive error handling on malformed SQL
 * 5. Zero-copy Arrow IPC byte stream query execution
 * 6. Catalog table registration checks and lifecycle unregistration
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as arrow from 'apache-arrow';
import type {
  SearchTermRecord,
  AggregatedTokenMetric,
  SearchTermsTableContract,
  TokenMatrixTableContract,
  CurrencyMicros,
  ClickCount,
  ImpressionCount,
  QueryString,
  TokenString,
} from '../domain/types/index.ts';
import {
  SEARCH_TERMS_DDL,
  TOKEN_MATRIX_DDL,
} from '../domain/types/schema.ts';
import { recordsToArrowIpc, tokensToArrowIpc } from './arrow_bridge.ts';
import { zeroConvWastePreset } from './presets.ts';
import { DuckDbAdapter, DuckDbExecutionError } from './duckdb_adapter.ts';

const createMockRecord = (overrides: Partial<SearchTermRecord> = {}): SearchTermRecord => ({
  rawQuery: 'running shoes' as QueryString,
  normalizedQuery: 'running shoes' as QueryString,
  campaignName: 'Campaign_US',
  adGroupName: 'Shoes_AG',
  matchType: 'EXACT',
  impressions: 500 as ImpressionCount,
  clicks: 100 as ClickCount,
  spendMicros: 200_000_000n as CurrencyMicros,
  conversions: 5.0,
  revenueMicros: 800_000_000n as CurrencyMicros,
  averageCpcMicros: 2_000_000n as CurrencyMicros,
  hasCollision: false,
  ...overrides,
});

const mockTokens: AggregatedTokenMetric[] = [
  {
    tokenText: 'shoes' as TokenString,
    gramDegree: 1,
    classification: 'COMMERCIAL',
    occurrences: 15,
    subClickQueriesCount: 2,
    totalClicks: 120 as ClickCount,
    totalSpendMicros: 240_000_000n as CurrencyMicros,
    conversions: 5.0,
    wilsonScoreUpperBound: 0.15,
  },
];

const searchTermsContract: SearchTermsTableContract = {
  tableName: 'search_terms',
  ddl: SEARCH_TERMS_DDL,
  columns: [],
};

const tokenMatrixContract: TokenMatrixTableContract = {
  tableName: 'token_matrix',
  ddl: TOKEN_MATRIX_DDL,
  columns: [],
};

test('1. executeQuery runs standard SQL against search_terms, token_matrix, and safe_list', async () => {
  const adapter = new DuckDbAdapter();
  await adapter.resetDatabase();

  const records = [
    createMockRecord({ rawQuery: 'running shoes' as QueryString, conversions: 5.0 }),
    createMockRecord({
      rawQuery: 'free download' as QueryString,
      clicks: 50 as ClickCount,
      spendMicros: 100_000_000n as CurrencyMicros,
      conversions: 0.0,
      hasCollision: true,
    }),
  ];

  const searchIpc = recordsToArrowIpc(records);
  const tokenIpc = tokensToArrowIpc(mockTokens);

  await adapter.registerSearchTermsTable(searchTermsContract, searchIpc.buffer as ArrayBuffer);
  await adapter.registerTokenMatrixTable(tokenMatrixContract, tokenIpc.buffer as ArrayBuffer);

  // 1a: Query search_terms
  const stRes = await adapter.executeQuery<{ query: string; clicks: number }>('SELECT query, clicks FROM search_terms ORDER BY clicks DESC;');
  assert.equal(stRes.rowCount, 2);
  assert.equal(stRes.rows[0].query, 'running shoes');
  assert.equal(stRes.rows[0].clicks, 100);

  // 1b: Query token_matrix
  const tmRes = await adapter.executeQuery<{ token_text: string }>('SELECT token_text FROM token_matrix;');
  assert.equal(tmRes.rowCount, 1);
  assert.equal(tmRes.rows[0].token_text, 'shoes');

  // 1c: Query safe_list (distinct converting terms conversions > 0)
  const slRes = await adapter.executeQuery<{ term: string; conversions: number }>('SELECT term, conversions FROM safe_list;');
  assert.equal(slRes.rowCount, 1);
  assert.equal(slRes.rows[0].term, 'running shoes');
  assert.equal(slRes.rows[0].conversions, 5.0);
});

test('2. explainQuery executes EXPLAIN and returns scan operator details and projections', async () => {
  const adapter = new DuckDbAdapter();
  const explanation = await adapter.explainQuery('SELECT query FROM search_terms WHERE clicks > 10;');

  assert.ok(explanation.rawPlan.length > 0, 'Must return raw plan text');
  assert.ok(explanation.operators.includes('SEQ_SCAN'), 'Must capture SEQ_SCAN operator');
  assert.ok(explanation.projections.some((p) => p.includes('query')), 'Must identify query projection');
  assert.ok(explanation.scanDetails.length > 0, 'Must extract scan details');
});

test('3. zeroConvWastePreset generates correct SQL filtering and executes accurately', async () => {
  const sql = zeroConvWastePreset(4, 5000000n);

  assert.match(sql, /conversions\s*=\s*0/, 'Must filter conversions = 0');
  assert.match(sql, /clicks\s*>=\s*4/, 'Must filter clicks >= 4');
  assert.match(sql, /spend_micros\s*>=\s*5000000/, 'Must filter spend_micros >= 5000000');
  assert.match(sql, /CAST\(round\(spend_micros \/ nullif\(clicks, 0\)\) AS UBIGINT\) AS cpc_micros/);

  const adapter = new DuckDbAdapter();
  const res = await adapter.executeQuery(sql);
  assert.equal(res.rowCount, 1);
  assert.equal(res.rows[0].query, 'free download');
});

test('4. Malformed SQL queries return structured descriptive DuckDbExecutionError without crashing', async () => {
  const adapter = new DuckDbAdapter();

  await assert.rejects(
    async () => {
      await adapter.executeQuery('SELEEEECT * FROM non_existent_table;');
    },
    (err: unknown) => {
      assert.ok(err instanceof DuckDbExecutionError, 'Must be instance of DuckDbExecutionError');
      assert.ok(err.message.includes('Parser Error') || err.message.includes('syntax error'));
      assert.ok(err.title.length > 0, 'Must contain descriptive title');
      return true;
    }
  );
});

test('5. executeArrowIpcQuery produces valid zero-copy Arrow IPC byte stream', async () => {
  const adapter = new DuckDbAdapter();
  const result = await adapter.executeArrowIpcQuery('SELECT query, clicks, spend_micros FROM search_terms;');

  assert.ok(result.ipcStreamBuffer instanceof ArrayBuffer);
  assert.ok(result.byteLength > 0);
  assert.equal(result.rowCount, 2);

  const roundtripped = arrow.tableFromIPC(new Uint8Array(result.ipcStreamBuffer));
  assert.equal(roundtripped.numRows, 2);
  assert.equal(roundtripped.getChild('query')?.get(0), 'running shoes');
});

test('6. Database catalog tracks table registration and supports preset execution', async () => {
  const adapter = new DuckDbAdapter();

  assert.equal(await adapter.isTableRegistered('search_terms'), true);
  assert.equal(await adapter.isTableRegistered('token_matrix'), true);
  assert.equal(await adapter.isTableRegistered('safe_list'), true);
  assert.equal(await adapter.isTableRegistered('ghost_table'), false);

  const topRes = await adapter.executeDiagnosticPreset({
    presetId: 'TOP_SPENDERS',
    parameters: { limit: 1 },
  });
  assert.equal(topRes.rowCount, 1);

  await adapter.unregisterTable('token_matrix');
  assert.equal(await adapter.isTableRegistered('token_matrix'), false);
});
