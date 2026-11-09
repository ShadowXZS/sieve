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
  SearchTermsTableContract,
  TokenMatrixTableContract,
  SafeListTableContract,
  DuckDbTableContract,
} from '../domain/types/index.ts';
import {
  initDuckDB,
  executeDuckDBSQL,
  executePreparedStatement,
  registerArrowTable,
  dropTable,
  validateTableName,
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
}
