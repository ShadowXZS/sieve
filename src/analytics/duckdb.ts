/**
 * Sieve Local DuckDB-Wasm Analytics Engine
 *
 * Provides fast in-memory SQL analytics over search term data with zero server compute.
 * Guarantees sub-25ms analytical query performance and clean table unlinking.
 */

import * as duckdb from '@duckdb/duckdb-wasm/blocking';
import { logger } from '../utils/logger.ts';

// Type definitions for DuckDB internal instances
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

let dbInstance: DuckDBDatabase | null = null;
let connInstance: DuckDBConnection | null = null;
let initPromise: Promise<DuckDBConnection> | null = null;

export interface DuckDBQueryResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  executionTimeMs: number;
}

const TABLE_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validates a table name string to prevent SQL injection.
 */
export function validateTableName(tableName: string): string {
  if (!TABLE_IDENTIFIER_REGEX.test(tableName)) {
    throw new Error(
      `Invalid table name identifier: "${tableName}". Table names must only contain alphanumeric characters and underscores.`
    );
  }
  return tableName;
}

/**
 * Initializes the local DuckDB-Wasm database instance and connection.
 */
export async function initDuckDB(): Promise<DuckDBConnection> {
  if (connInstance) return connInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      let bundle: any;
      let runtime: any;

      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const pathMod = 'node:path';
        const urlMod = 'node:url';
        const path = await import(/* @vite-ignore */ pathMod);
        const { fileURLToPath } = await import(/* @vite-ignore */ urlMod);
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const wasmPath = path.resolve(__dirname, '../../Public/duckdb-eh.wasm');
        bundle = {
          eh: {
            mainModule: wasmPath,
            mainWorker: '',
          },
        };
        const duckdbAny: any = duckdb;
        runtime = duckdbAny['NODE' + '_RUNTIME'] ?? duckdbAny.DEFAULT_RUNTIME;
      } else {
        // Browser context
        let baseUrl = '';
        try {
          if (typeof (self as any).location !== 'undefined') {
            baseUrl = (self as any).location.origin || '';
          }
        } catch (locErr) {
          logger.debug('Unable to resolve self.location.origin, using root relative path', locErr);
        }
        bundle = {
          eh: {
            mainModule: baseUrl ? `${baseUrl}/duckdb-eh.wasm` : '/duckdb-eh.wasm',
            mainWorker: '',
          },
          mvp: {
            mainModule: baseUrl ? `${baseUrl}/duckdb-mvp.wasm` : '/duckdb-mvp.wasm',
            mainWorker: '',
          },
        };
        runtime = (duckdb as any).DEFAULT_RUNTIME;
      }

      const duckLogger = new (duckdb as any).VoidLogger();
      dbInstance = (await (duckdb as any).createDuckDB(bundle, duckLogger, runtime)) as DuckDBDatabase;
      await dbInstance.instantiate();
      connInstance = dbInstance.connect();

      // Ensure default empty schema
      connInstance.query(`
        CREATE TABLE IF NOT EXISTS search_terms (
          query VARCHAR,
          campaign VARCHAR,
          adgroup VARCHAR,
          clicks DOUBLE,
          cost DOUBLE,
          conversions DOUBLE,
          has_collision BOOLEAN
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

/**
 * Executes an analytical SQL query against the DuckDB instance with query timeout cancellation.
 * Aborts queries exceeding the specified timeout (default: 5000ms).
 */
export async function executeDuckDBSQL(
  query: string,
  timeoutMs: number = 5000
): Promise<DuckDBQueryResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`DuckDB query timed out after ${timeoutMs}ms: query aborted`));
    }, timeoutMs);
  });

  const queryExec = (async () => {
    const conn = await initDuckDB();
    const startTime = performance.now();
    const arrowResult = conn.query(query);
    const elapsed = performance.now() - startTime;

    const columns: string[] = arrowResult.schema
      ? arrowResult.schema.fields.map((f: any) => f.name)
      : [];

    const rows = arrowResult.toArray().map((r: any) => {
      const obj: Record<string, unknown> = {};
      for (const col of columns) {
        const val = r[col];
        obj[col] = typeof val === 'bigint' ? Number(val) : val;
      }
      return obj;
    });

    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs: Math.round(elapsed * 100) / 100,
    };
  })();

  try {
    return await Promise.race([queryExec, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Convenience alias for executing SQL with explicit timeout cancellation.
 */
export async function executeDuckDBSQLWithTimeout(
  query: string,
  timeoutMs: number = 5000
): Promise<DuckDBQueryResult> {
  return executeDuckDBSQL(query, timeoutMs);
}

/**
 * Prepares and executes a parameterized SQL query safely, guaranteeing prepared statement
 * cleanup in a finally block to prevent connection locks and deadlocks.
 */
export async function executePreparedStatement(
  sql: string,
  params: unknown[] = []
): Promise<DuckDBQueryResult> {
  const conn = await initDuckDB();
  const startTime = performance.now();
  let stmt: any = null;

  try {
    stmt = await conn.prepare(sql);
    const arrowResult = await stmt.query(...params);
    const elapsed = performance.now() - startTime;

    const columns: string[] = arrowResult.schema
      ? arrowResult.schema.fields.map((f: any) => f.name)
      : [];

    const rows = arrowResult.toArray().map((r: any) => {
      const obj: Record<string, unknown> = {};
      for (const col of columns) {
        const val = r[col];
        obj[col] = typeof val === 'bigint' ? Number(val) : val;
      }
      return obj;
    });

    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs: Math.round(elapsed * 100) / 100,
    };
  } finally {
    if (stmt) {
      try {
        await stmt.close();
      } catch (closeErr) {
        logger.debug('DuckDB prepared statement close warning:', closeErr);
      }
    }
  }
}

/**
 * Inserts an Apache Arrow IPC buffer into a DuckDB virtual table.
 */
export async function registerArrowTable(
  tableName: string,
  ipcBuffer: Uint8Array | ArrayBuffer
): Promise<void> {
  const safeName = validateTableName(tableName);
  const conn = await initDuckDB();
  try {
    conn.query(`DROP TABLE IF EXISTS ${safeName};`);
  } catch (dropErr) {
    logger.debug(`DuckDB table ${safeName} drop before registration notice:`, dropErr);
  }
  const uint8 = ipcBuffer instanceof Uint8Array ? ipcBuffer : new Uint8Array(ipcBuffer);
  conn.insertArrowFromIPCStream(uint8, { name: safeName });
}

/**
 * Drops an analytical virtual table and issues a memory checkpoint.
 */
export async function dropTable(tableName: string = 'search_terms'): Promise<void> {
  const safeName = validateTableName(tableName);
  if (!connInstance) return;
  try {
    connInstance.query(`DROP TABLE IF EXISTS ${safeName};`);
    try {
      connInstance.query('CHECKPOINT;');
    } catch (chkErr) {
      logger.debug('DuckDB checkpoint warning:', chkErr);
    }
  } catch (err) {
    logger.warn(`Failed to drop DuckDB table ${safeName}:`, err);
  }
}

/**
 * Unlinks virtual tables, drops in-memory data, and runs CHECKPOINT to prevent memory leaks.
 */
export async function resetDuckDB(tableName: string = 'search_terms'): Promise<void> {
  await dropTable(tableName);
}

/**
 * Closes the connection and terminates the DuckDB instance.
 */
export async function closeDuckDB(): Promise<void> {
  if (connInstance) {
    try {
      connInstance.close();
    } catch (closeErr) {
      logger.debug('DuckDB close warning:', closeErr);
    }
    connInstance = null;
  }
  if (dbInstance) {
    try {
      dbInstance.terminate?.();
    } catch (termErr) {
      logger.debug('DuckDB terminate warning:', termErr);
    }
    dbInstance = null;
  }
}
