/**
 * Sieve Local DuckDB-Wasm Analytics Engine
 *
 * Provides in-memory SQL analytics over search term data with zero server compute.
 * Zero-copy Arrow IPC table registration and production analytical DDL.
 */

import * as duckdb from '@duckdb/duckdb-wasm/blocking';
import { logger } from '../utils/logger.ts';

export interface DuckDBConnection {
  query: (query: string) => any;
  prepare: (query: string) => Promise<any>;
  insertArrowFromIPCStream: (buffer: Uint8Array, options?: { name?: string }) => void;
  close: () => void;
}

export interface DuckDBDatabase {
  connect: () => DuckDBConnection;
  instantiate: () => Promise<void>;
  terminate?: () => void;
}

export interface DuckDBQueryResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  executionTimeMs: number;
}

let dbInstance: DuckDBDatabase | null = null;
let connInstance: DuckDBConnection | null = null;
let initPromise: Promise<DuckDBConnection> | null = null;

const TABLE_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function validateTableName(tableName: string): string {
  if (!TABLE_IDENTIFIER_REGEX.test(tableName)) {
    throw new Error(`Invalid table identifier: "${tableName}". Alphanumeric and underscores only.`);
  }
  return tableName;
}

function extractResult(arrowResult: any, elapsed: number): DuckDBQueryResult {
  const columns: string[] = arrowResult.schema ? arrowResult.schema.fields.map((f: any) => f.name) : [];
  const rows = arrowResult.toArray().map((r: any) => {
    const obj: Record<string, unknown> = {};
    for (const col of columns) {
      const val = r[col];
      obj[col] = typeof val === 'bigint' ? Number(val) : val;
    }
    return obj;
  });
  return { columns, rows, rowCount: rows.length, executionTimeMs: Math.round(elapsed * 100) / 100 };
}

/**
 * Initializes local DuckDB-Wasm instance and registers production analytical schemas.
 */
export async function initDuckDB(): Promise<DuckDBConnection> {
  if (connInstance) return connInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      let bundle: any;
      let runtime: any;

      if (typeof process !== 'undefined' && process.versions?.node) {
        const path = await import(/* @vite-ignore */ 'node:path');
        const { fileURLToPath } = await import(/* @vite-ignore */ 'node:url');
        const wasmPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../Public/duckdb-eh.wasm');
        bundle = { eh: { mainModule: wasmPath, mainWorker: '' } };
        const duckdbAny: any = duckdb;
        runtime = duckdbAny.NODE_RUNTIME ?? duckdbAny.DEFAULT_RUNTIME;
      } else {
        const origin = (typeof self !== 'undefined' && (self as any).location?.origin) || '';
        bundle = {
          eh: { mainModule: origin ? `${origin}/duckdb-eh.wasm` : '/duckdb-eh.wasm', mainWorker: '' },
          mvp: { mainModule: origin ? `${origin}/duckdb-mvp.wasm` : '/duckdb-mvp.wasm', mainWorker: '' },
        };
        runtime = (duckdb as any).DEFAULT_RUNTIME;
      }

      const duckLogger = new (duckdb as any).VoidLogger();
      dbInstance = (await (duckdb as any).createDuckDB(bundle, duckLogger, runtime)) as DuckDBDatabase;
      await dbInstance.instantiate();
      connInstance = dbInstance.connect();

      connInstance.query(`
        CREATE TABLE IF NOT EXISTS search_terms (
          query VARCHAR, campaign VARCHAR, adgroup VARCHAR, match_type VARCHAR,
          impressions UBIGINT, clicks UBIGINT, spend_micros UBIGINT,
          conversions DOUBLE, revenue_micros UBIGINT, cpc_micros UBIGINT, is_safe BOOLEAN
        );
        CREATE TABLE IF NOT EXISTS token_matrix (
          token_text VARCHAR, occurrences UBIGINT, total_clicks UBIGINT,
          total_spend_micros UBIGINT, conversions DOUBLE, wilson_upper_bound DOUBLE
        );
      `);

      return connInstance;
    } catch (err) {
      logger.error('Failed to initialize DuckDB:', err);
      throw err;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export async function executeDuckDBSQL(query: string, timeoutMs: number = 5000): Promise<DuckDBQueryResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DuckDB query timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  const queryExec = (async () => {
    const conn = await initDuckDB();
    const startTime = performance.now();
    const arrowResult = conn.query(query);
    return extractResult(arrowResult, performance.now() - startTime);
  })();

  try {
    return await Promise.race([queryExec, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const executeDuckDBSQLWithTimeout = executeDuckDBSQL;

export async function executePreparedStatement(sql: string, params: unknown[] = []): Promise<DuckDBQueryResult> {
  const conn = await initDuckDB();
  const startTime = performance.now();
  let stmt: any = null;
  try {
    stmt = await conn.prepare(sql);
    const arrowResult = await stmt.query(...params);
    return extractResult(arrowResult, performance.now() - startTime);
  } finally {
    if (stmt) {
      try { await stmt.close(); } catch (e) { logger.debug('DuckDB stmt close:', e); }
    }
  }
}

export function bindSearchTermsColumns(conn: DuckDBConnection): void {
  const missingCols = [
    "ALTER TABLE search_terms ADD COLUMN match_type VARCHAR DEFAULT 'BROAD';",
    'ALTER TABLE search_terms ADD COLUMN impressions UBIGINT DEFAULT 0;',
    'ALTER TABLE search_terms ADD COLUMN clicks UBIGINT DEFAULT 0;',
    'ALTER TABLE search_terms ADD COLUMN spend_micros UBIGINT DEFAULT 0;',
    'ALTER TABLE search_terms ADD COLUMN conversions DOUBLE DEFAULT 0;',
    'ALTER TABLE search_terms ADD COLUMN revenue_micros UBIGINT DEFAULT 0;',
    'ALTER TABLE search_terms ADD COLUMN cpc_micros UBIGINT DEFAULT 0;',
    'ALTER TABLE search_terms ADD COLUMN is_safe BOOLEAN DEFAULT true;',
    'ALTER TABLE search_terms ADD COLUMN cost DOUBLE DEFAULT 0.0;',
  ];
  for (const ddl of missingCols) {
    try { conn.query(ddl); } catch {}
  }
  try {
    conn.query('UPDATE search_terms SET spend_micros = CAST(round(cost * 1000000) AS UBIGINT) WHERE (spend_micros = 0 OR spend_micros IS NULL) AND cost IS NOT NULL AND cost > 0;');
  } catch {}
  try {
    conn.query('UPDATE search_terms SET cost = CAST(spend_micros AS DOUBLE) / 1000000.0 WHERE (cost = 0 OR cost IS NULL) AND spend_micros IS NOT NULL AND spend_micros > 0;');
  } catch {}
  try {
    conn.query('UPDATE search_terms SET cpc_micros = CAST(round(spend_micros / nullif(clicks, 0)) AS UBIGINT) WHERE (cpc_micros = 0 OR cpc_micros IS NULL) AND spend_micros > 0;');
  } catch {}
  try {
    conn.query('UPDATE search_terms SET is_safe = NOT has_collision WHERE has_collision IS NOT NULL;');
  } catch {}
}

/**
 * Registers an Arrow IPC buffer as a virtual table in DuckDB using zero-copy IPC streaming.
 */
export async function registerArrowTable(tableName: string, ipcBuffer: Uint8Array | ArrayBuffer): Promise<void> {
  const safeName = validateTableName(tableName);
  const conn = await initDuckDB();
  try {
    conn.query(`DROP TABLE IF EXISTS ${safeName};`);
  } catch (dropErr) {
    logger.debug(`DuckDB table ${safeName} drop notice:`, dropErr);
  }
  const uint8 = ipcBuffer instanceof Uint8Array ? ipcBuffer : new Uint8Array(ipcBuffer);
  conn.insertArrowFromIPCStream(uint8, { name: safeName });
  if (safeName === 'search_terms') {
    bindSearchTermsColumns(conn);
  }
}

export const registerSearchTermsTable = (buf: Uint8Array | ArrayBuffer) => registerArrowTable('search_terms', buf);
export const registerTokenMatrixTable = (buf: Uint8Array | ArrayBuffer) => registerArrowTable('token_matrix', buf);

export async function dropTable(tableName: string = 'search_terms'): Promise<void> {
  const safeName = validateTableName(tableName);
  if (!connInstance) return;
  try {
    connInstance.query(`DROP TABLE IF EXISTS ${safeName};`);
    try { connInstance.query('CHECKPOINT;'); } catch {}
  } catch (err) {
    logger.warn(`Failed to drop DuckDB table ${safeName}:`, err);
  }
}

export const resetDuckDB = (tableName = 'search_terms') => dropTable(tableName);

export async function closeDuckDB(): Promise<void> {
  if (connInstance) {
    try { connInstance.close(); } catch {}
    connInstance = null;
  }
  if (dbInstance) {
    try { dbInstance.terminate?.(); } catch {}
    dbInstance = null;
  }
}

export { ensureTablesRegistered } from './duckdb_adapter.ts';
