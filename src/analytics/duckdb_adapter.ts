/**
 * SIEVE DuckDB-Wasm Analytical Query Adapter
 *
 * Implements IAnalyticalDatabasePort with zero-copy Arrow IPC streaming,
 * dynamic diagnostic preset resolution, and EXPLAIN query plan extraction.
 */

import * as arrow from 'apache-arrow';
import type {
  IAnalyticalDatabasePort,
  QueryExecutionResult,
  ArrowIpcStreamResult,
  DiagnosticPresetQuery,
  SqlQueryParam,
} from '../domain/ports/database_port.ts';
import type {
  SearchTermsTableContract, TokenMatrixTableContract, SafeListTableContract, DuckDbTableContract,
  SearchTermRecord, CurrencyMicros, ClickCount, ImpressionCount, QueryString, PlatformMatchType,
} from '../domain/types/index.ts';
import { toCurrencyMicros } from '../domain/types/index.ts';
import type { PersistedNegativeKeyword } from '../workers/protocol.ts';
import { recordsToArrowIpc, tokensToArrowIpc } from './arrow_bridge.ts';
import { NgramTokenizerEngine } from '../domain/engines/tokenizer_engine.ts';
import { logger } from '../utils/logger.ts';
import {
  initDuckDB, executeDuckDBSQL, executePreparedStatement, registerArrowTable, dropTable, validateTableName,
} from './duckdb.ts';
import { resolveDiagnosticPreset } from './presets.ts';

export class DuckDbExecutionError extends Error {
  readonly title: string;
  readonly originalError?: unknown;

  constructor(message: string, title = 'DuckDB Execution Error', originalError?: unknown) {
    super(message);
    this.name = 'DuckDbExecutionError';
    this.title = title;
    this.originalError = originalError;
  }
}

export interface QueryPlanExplanation {
  readonly plan: string;
  readonly rawPlan: string;
  readonly operators: readonly string[];
  readonly scanDetails: string;
  readonly projections: readonly string[];
  readonly filters: readonly string[];
}

function wrapError(err: unknown): DuckDbExecutionError {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const title = msg.includes('Parser Error')
    ? 'SQL Syntax / Parser Error'
    : msg.includes('Catalog Error')
      ? 'DuckDB Catalog Error'
      : 'DuckDB Execution Error';
  return new DuckDbExecutionError(msg, title, err);
}

export class DuckDbAdapter implements IAnalyticalDatabasePort {
  async registerSearchTermsTable(contract: SearchTermsTableContract, sourceBuffer?: ArrayBuffer): Promise<void> {
    if (sourceBuffer) {
      await registerArrowTable('search_terms', sourceBuffer);
      try {
        await executeDuckDBSQL(`
          CREATE OR REPLACE VIEW safe_list AS
          SELECT DISTINCT query AS term, query, conversions, revenue_micros, spend_micros, CAST(0 AS BIGINT) AS created_at
          FROM search_terms WHERE conversions > 0;
        `);
      } catch {}
    } else {
      await executeDuckDBSQL(contract.ddl);
    }
  }

  async registerTokenMatrixTable(contract: TokenMatrixTableContract, sourceBuffer?: ArrayBuffer): Promise<void> {
    if (sourceBuffer) {
      await registerArrowTable('token_matrix', sourceBuffer);
    } else {
      await executeDuckDBSQL(contract.ddl);
    }
  }

  async registerSafeListTable(contract: SafeListTableContract, sourceBuffer?: ArrayBuffer): Promise<void> {
    if (sourceBuffer) {
      await registerArrowTable('safe_list', sourceBuffer);
    } else {
      await executeDuckDBSQL(contract.ddl);
    }
  }

  async registerVirtualTable<TName extends string, TRow extends object>(
    contract: DuckDbTableContract<TName, TRow>,
    sourceBuffer?: ArrayBuffer
  ): Promise<void> {
    if (sourceBuffer) {
      await registerArrowTable(contract.tableName, sourceBuffer);
    } else {
      await executeDuckDBSQL(contract.ddl);
    }
  }

  async unregisterTable(tableName: string): Promise<void> {
    const safe = validateTableName(tableName);
    try { await executeDuckDBSQL(`DROP VIEW IF EXISTS ${safe};`); } catch {}
    await dropTable(safe);
  }

  async isTableRegistered(tableName: string): Promise<boolean> {
    const safe = validateTableName(tableName);
    try {
      const res = await this.executeQuery(`SELECT count(*) as cnt FROM information_schema.tables WHERE table_name = '${safe}';`);
      return Number(res.rows[0]?.cnt ?? 0) > 0;
    } catch {
      return false;
    }
  }

  async executeQuery<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly SqlQueryParam[]
  ): Promise<QueryExecutionResult<TRow>> {
    try {
      if (params && params.length > 0) {
        const res = await executePreparedStatement(sql, params as unknown[]);
        return { columns: res.columns, rows: res.rows as TRow[], rowCount: res.rowCount, executionTimeMs: res.executionTimeMs };
      }
      const res = await executeDuckDBSQL(sql);
      return { columns: res.columns, rows: res.rows as TRow[], rowCount: res.rowCount, executionTimeMs: res.executionTimeMs };
    } catch (err) {
      throw wrapError(err);
    }
  }

  async executeArrowIpcQuery(sql: string, params?: readonly SqlQueryParam[]): Promise<ArrowIpcStreamResult> {
    const startTime = performance.now();
    const conn = await initDuckDB();
    let res: any;
    try {
      if (params && params.length > 0) {
        const stmt = await conn.prepare(sql);
        try { res = await stmt.query(...params); } finally { await stmt.close(); }
      } else {
        res = conn.query(sql);
      }
    } catch (err) {
      throw wrapError(err);
    }
    const cols: Record<string, arrow.Vector> = {};
    for (const field of res.schema?.fields ?? []) {
      cols[field.name] = arrow.vectorFromArray(res.getChild(field.name).toArray());
    }
    const appTable = new arrow.Table(cols);
    const ipcBytes = arrow.tableToIPC(appTable, 'stream');
    return {
      ipcStreamBuffer: ipcBytes.buffer.slice(ipcBytes.byteOffset, ipcBytes.byteOffset + ipcBytes.byteLength) as ArrayBuffer,
      byteLength: ipcBytes.byteLength,
      rowCount: appTable.numRows,
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
    };
  }

  async executeDiagnosticPreset<TRow extends Record<string, unknown> = Record<string, unknown>>(
    preset: DiagnosticPresetQuery
  ): Promise<QueryExecutionResult<TRow>> {
    const sql = resolveDiagnosticPreset(preset);
    return this.executeQuery<TRow>(sql);
  }

  async explainQuery(sql: string, params?: readonly SqlQueryParam[]): Promise<QueryPlanExplanation> {
    const res = await this.executeQuery(`EXPLAIN ${sql}`, params);
    const rawPlan = String(res.rows[0]?.explain_value ?? '');
    const operators = Array.from(new Set(Array.from(rawPlan.matchAll(/│\s+([A-Z_]{3,})\s+│/g), (m) => m[1])));
    const projMatch = rawPlan.match(/Projections?:\s*([^\n│]+)/);
    const projections = projMatch ? projMatch[1].split(',').map((s) => s.trim()) : [];
    const filterMatch = rawPlan.match(/Filters?:\s*([^\n│]+)/);
    const filters = filterMatch ? filterMatch[1].split(',').map((s) => s.trim()) : [];
    const scanMatch = rawPlan.match(/(Type:\s*[^\n│]+)/) || rawPlan.match(/(Table:\s*[^\n│]+)/);
    const scanDetails = scanMatch ? scanMatch[1].trim() : (operators.find((o) => o.includes('SCAN')) ?? '');
    return { plan: rawPlan, rawPlan, operators, scanDetails, projections, filters };
  }

  async resetDatabase(): Promise<void> {
    await this.unregisterTable('safe_list');
    await this.unregisterTable('token_matrix');
    await this.unregisterTable('search_terms');
  }

  async ensureTablesRegistered(records: readonly SearchTermRecord[] | readonly PersistedNegativeKeyword[], force = false): Promise<void> {
    return ensureTablesRegistered(records, force);
  }
}

export async function ensureTablesRegistered(records: readonly SearchTermRecord[] | readonly PersistedNegativeKeyword[], force = false): Promise<void> {
  if (!records || records.length === 0) return;
  const conn = await initDuckDB();
  let rowCount = 0;
  try {
    const res = conn.query('SELECT COUNT(*) as cnt FROM search_terms;');
    const cntVal = res.toArray()[0]?.cnt;
    rowCount = typeof cntVal === 'bigint' ? Number(cntVal) : Number(cntVal ?? 0);
  } catch { rowCount = 0; }
  if (!force && rowCount > 0 && rowCount === records.length) return;

  const normalized: SearchTermRecord[] = records.map((r: any, idx: number) => {
    const raw = (r.rawQuery || r.normalizedQuery || r.keyword || `query_${idx}`) as QueryString;
    const clicks = (r.clicks ?? 0) as ClickCount;
    const convs = typeof r.conversions === 'number' ? r.conversions : Number(r.conversions || 0);
    const spend = r.spendMicros !== undefined ? (typeof r.spendMicros === 'bigint' ? r.spendMicros : BigInt(Math.round(Number(r.spendMicros)))) : r.spend_micros !== undefined ? (typeof r.spend_micros === 'bigint' ? r.spend_micros : BigInt(Math.round(Number(r.spend_micros)))) : r.cost !== undefined ? toCurrencyMicros(r.cost) : r.marginalWaste !== undefined ? toCurrencyMicros(r.marginalWaste) : 0n;
    const rev = r.revenueMicros !== undefined ? (typeof r.revenueMicros === 'bigint' ? r.revenueMicros : BigInt(Math.round(Number(r.revenueMicros)))) : r.revenue_micros !== undefined ? (typeof r.revenue_micros === 'bigint' ? r.revenue_micros : BigInt(Math.round(Number(r.revenue_micros)))) : 0n;
    const cpc = r.averageCpcMicros !== undefined ? (typeof r.averageCpcMicros === 'bigint' ? r.averageCpcMicros : BigInt(Math.round(Number(r.averageCpcMicros)))) : r.cpc_micros !== undefined ? (typeof r.cpc_micros === 'bigint' ? r.cpc_micros : BigInt(Math.round(Number(r.cpc_micros)))) : clicks > 0 && spend > 0n ? (spend / BigInt(Math.round(clicks))) : 0n;
    return {
      rawQuery: raw, normalizedQuery: (r.normalizedQuery || raw.toLowerCase()) as QueryString,
      campaignName: r.campaignName || r.firstSeenCampaign || r.scope?.campaign || r.campaignId || r.campaign || 'campaign',
      adGroupName: r.adGroupName || r.scope?.adGroup || r.adGroupId || r.adgroup || 'adgroup',
      matchType: ((r.matchType || 'BROAD') as string).toUpperCase() as PlatformMatchType,
      impressions: (r.impressions ?? 0) as ImpressionCount, clicks, spendMicros: spend as CurrencyMicros,
      conversions: convs, revenueMicros: rev as CurrencyMicros, averageCpcMicros: cpc as CurrencyMicros,
      hasCollision: Boolean(r.hasCollision ?? (r.is_safe === false)),
    };
  });

  await registerArrowTable('search_terms', recordsToArrowIpc(normalized));
  try {
    conn.query('ALTER TABLE search_terms ADD COLUMN cost DOUBLE; UPDATE search_terms SET cost = CAST(spend_micros AS DOUBLE) / 1000000.0;');
    conn.query('CREATE OR REPLACE VIEW safe_list AS SELECT DISTINCT query AS term, query, conversions, revenue_micros, spend_micros, CAST(0 AS BIGINT) AS created_at FROM search_terms WHERE conversions > 0;');
  } catch {}
  try {
    const tokens = new NgramTokenizerEngine().aggregateTokens(normalized);
    if (tokens.length > 0) {
      await registerArrowTable('token_matrix', tokensToArrowIpc(tokens));
      try { conn.query('ALTER TABLE token_matrix ADD COLUMN token VARCHAR; UPDATE token_matrix SET token = token_text; ALTER TABLE token_matrix ADD COLUMN wilson_score_upper DOUBLE; UPDATE token_matrix SET wilson_score_upper = wilson_upper_bound;'); } catch {}
    }
  } catch (tokenErr) { logger.debug('DuckDB token_matrix registration note:', tokenErr); }
}

export const duckDbAdapter = new DuckDbAdapter();
