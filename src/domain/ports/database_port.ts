/**
 * SIEVE Domain Port: Analytical Virtual Database Contract
 *
 * Clean Architecture decoupled port contract for in-browser SQL querying,
 * virtual table registration (search_terms, token_matrix, safe_list),
 * and parameterized diagnostic preset execution.
 * Strict Dependency Rule: Depends ONLY on src/domain/types. No DuckDB or Arrow concrete classes.
 */

import type {
  DuckDbTableContract,
  SearchTermsTableContract,
  TokenMatrixTableContract,
  SafeListTableContract,
  SearchTermsTableName,
  TokenMatrixTableName,
  SafeListTableName,
} from '../types/index.ts';

/**
 * Primitive SQL parameter types supported across virtual database queries.
 */
export type SqlQueryParam = string | number | bigint | boolean | null;

/**
 * Canonical diagnostic query preset identifiers for automated forensic audits.
 */
export type DiagnosticPresetId =
  | 'TOP_SPENDERS'
  | 'ZERO_CONVERSION_WASTE'
  | 'CAMPAIGN_ROLLUP'
  | 'AUCTION_COLLISIONS'
  | 'LONG_TAIL_BLEED'
  | 'MATCH_TYPE_DILUTION';

/**
 * Parameterized diagnostic audit preset query request.
 */
export interface DiagnosticPresetQuery {
  readonly presetId: DiagnosticPresetId;
  readonly parameters?: Readonly<Record<string, SqlQueryParam>>;
}

/**
 * Structured tabular query execution result with typed row records.
 */
export interface QueryExecutionResult<TRow extends Record<string, unknown> = Record<string, unknown>> {
  readonly columns: readonly string[];
  readonly rows: readonly TRow[];
  readonly rowCount: number;
  readonly executionTimeMs: number;
}

/**
 * Zero-copy Arrow IPC byte stream query execution result.
 */
export interface ArrowIpcStreamResult {
  readonly ipcStreamBuffer: ArrayBuffer;
  readonly byteLength: number;
  readonly rowCount: number;
  readonly executionTimeMs: number;
}

/**
 * Decoupled Port Contract for In-Browser Analytical Database Operations.
 */
export interface IAnalyticalDatabasePort {
  /**
   * Registers the `search_terms` virtual table with optional backing memory buffer.
   */
  registerSearchTermsTable(
    contract: SearchTermsTableContract,
    sourceBuffer?: ArrayBuffer
  ): Promise<void>;

  /**
   * Registers the `token_matrix` virtual table with optional backing memory buffer.
   */
  registerTokenMatrixTable(
    contract: TokenMatrixTableContract,
    sourceBuffer?: ArrayBuffer
  ): Promise<void>;

  /**
   * Registers the `safe_list` virtual table with optional backing memory buffer.
   */
  registerSafeListTable(
    contract: SafeListTableContract,
    sourceBuffer?: ArrayBuffer
  ): Promise<void>;

  /**
   * Registers a generic analytical virtual table contract.
   */
  registerVirtualTable<TName extends string, TRow extends object>(
    contract: DuckDbTableContract<TName, TRow>,
    sourceBuffer?: ArrayBuffer
  ): Promise<void>;

  /**
   * Unregisters and unlinks an analytical virtual table from the database catalog.
   */
  unregisterTable(
    tableName: SearchTermsTableName | TokenMatrixTableName | SafeListTableName | string
  ): Promise<void>;

  /**
   * Checks whether a specific virtual table is currently registered and queryable.
   */
  isTableRegistered(
    tableName: string
  ): Promise<boolean>;

  /**
   * Executes a parameterized SQL query returning tabular records.
   */
  executeQuery<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly SqlQueryParam[]
  ): Promise<QueryExecutionResult<TRow>>;

  /**
   * Executes a parameterized SQL query returning a zero-copy Arrow IPC byte buffer.
   */
  executeArrowIpcQuery(
    sql: string,
    params?: readonly SqlQueryParam[]
  ): Promise<ArrowIpcStreamResult>;

  /**
   * Executes a predefined forensic diagnostic preset query.
   */
  executeDiagnosticPreset<TRow extends Record<string, unknown> = Record<string, unknown>>(
    preset: DiagnosticPresetQuery
  ): Promise<QueryExecutionResult<TRow>>;

  /**
   * Resets the analytical database, dropping all virtual tables and clearing state.
   */
  resetDatabase(): Promise<void>;
}
