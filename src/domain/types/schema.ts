/**
 * SIEVE Domain Core: DuckDB Virtual Table Relational DDL & Schemas
 *
 * Establishes formal relational contracts for analytical virtual tables in DuckDB-Wasm:
 * 1. `search_terms`: Granular auction performance records with integer micros.
 * 2. `token_matrix`: Aggregated n-gram tokens with Wilson score confidence bounds.
 * 3. `safe_list`: High-converting terms shielded from negative keyword exclusion.
 */

/**
 * Supported SQL primitive types within DuckDB virtual analytical tables.
 */
export type DuckDbSqlType =
  | 'VARCHAR'
  | 'BIGINT'
  | 'INTEGER'
  | 'DOUBLE'
  | 'BOOLEAN'
  | 'TIMESTAMP';

/**
 * Column descriptor for relational schema definition and validation.
 */
export interface DuckDbColumnDescriptor<TName extends string = string> {
  /** Column identifier name in SQL queries. */
  readonly name: TName;
  /** Relational SQL data type. */
  readonly type: DuckDbSqlType;
  /** Whether the column allows null values. */
  readonly nullable: boolean;
  /** Documentation describing column semantics. */
  readonly description: string;
}

/**
 * Relational row schema for the `search_terms` DuckDB virtual table.
 */
export interface SearchTermsTableRow {
  readonly query: string;
  readonly campaign: string;
  readonly adgroup: string;
  readonly match_type: string;
  readonly impressions: bigint;
  readonly clicks: bigint;
  readonly cost_micros: bigint;
  readonly conversions: number;
  readonly revenue_micros: bigint;
  readonly avg_cpc_micros: bigint;
  readonly has_collision: boolean;
}

/**
 * Relational row schema for the `token_matrix` DuckDB virtual table.
 */
export interface TokenMatrixTableRow {
  readonly token: string;
  readonly gram_degree: number;
  readonly classification: string;
  readonly occurrences: bigint;
  readonly sub_click_queries: bigint;
  readonly total_clicks: bigint;
  readonly total_spend_micros: bigint;
  readonly conversions: number;
  readonly wilson_score_upper: number;
}

/**
 * Relational row schema for the `safe_list` DuckDB virtual table.
 */
export interface SafeListTableRow {
  readonly term: string;
  readonly conversions: number;
  readonly revenue_micros: bigint;
  readonly created_at: bigint;
}

/**
 * Relational table schema definition contract.
 */
export interface DuckDbTableContract<
  TTableName extends string = string,
  TRow extends object = object,
> {
  /** Table identifier in DuckDB catalog. */
  readonly tableName: TTableName;
  /** Standard DDL SQL statement for table creation. */
  readonly ddl: string;
  /** Ordered list of column metadata descriptors. */
  readonly columns: readonly DuckDbColumnDescriptor[];
  /** Phantom row type descriptor for static type inference. */
  readonly _row?: TRow;
}

/** Table identifier literals */
export type SearchTermsTableName = 'search_terms';
export type TokenMatrixTableName = 'token_matrix';
export type SafeListTableName = 'safe_list';

/** DDL SQL String for `search_terms` */
export const SEARCH_TERMS_DDL = `CREATE TABLE IF NOT EXISTS search_terms (
  query VARCHAR NOT NULL,
  campaign VARCHAR NOT NULL,
  adgroup VARCHAR NOT NULL,
  match_type VARCHAR NOT NULL,
  impressions BIGINT NOT NULL,
  clicks BIGINT NOT NULL,
  cost_micros BIGINT NOT NULL,
  conversions DOUBLE NOT NULL,
  revenue_micros BIGINT NOT NULL,
  avg_cpc_micros BIGINT NOT NULL,
  has_collision BOOLEAN NOT NULL
);` as const;

/** DDL SQL String for `token_matrix` */
export const TOKEN_MATRIX_DDL = `CREATE TABLE IF NOT EXISTS token_matrix (
  token VARCHAR NOT NULL,
  gram_degree INTEGER NOT NULL,
  classification VARCHAR NOT NULL,
  occurrences BIGINT NOT NULL,
  sub_click_queries BIGINT NOT NULL,
  total_clicks BIGINT NOT NULL,
  total_spend_micros BIGINT NOT NULL,
  conversions DOUBLE NOT NULL,
  wilson_score_upper DOUBLE NOT NULL
);` as const;

/** DDL SQL String for `safe_list` */
export const SAFE_LIST_DDL = `CREATE TABLE IF NOT EXISTS safe_list (
  term VARCHAR NOT NULL,
  conversions DOUBLE NOT NULL,
  revenue_micros BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);` as const;

export type SearchTermsTableContract = DuckDbTableContract<SearchTermsTableName, SearchTermsTableRow>;
export type TokenMatrixTableContract = DuckDbTableContract<TokenMatrixTableName, TokenMatrixTableRow>;
export type SafeListTableContract = DuckDbTableContract<SafeListTableName, SafeListTableRow>;

/**
 * Virtual schema catalog mapping all DuckDB analytical tables.
 */
export interface DuckDbVirtualCatalog {
  readonly searchTerms: SearchTermsTableContract;
  readonly tokenMatrix: TokenMatrixTableContract;
  readonly safeList: SafeListTableContract;
}
