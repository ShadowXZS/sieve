/**
 * Power Query Drawer Constants, Presets & Error Formatting
 * Line ceiling: <= 250 lines.
 */
import {
  topSpendersPreset,
  zeroConvWastePreset,
  campaignRollupPreset,
  auctionCollisionsPreset,
  highCpcOutliersPreset,
} from '../../analytics/presets.ts';

export const SCHEMA_TABLES: Record<string, Array<{ name: string; type: string }>> = {
  search_terms: [
    { name: 'query', type: 'VARCHAR' },
    { name: 'campaign', type: 'VARCHAR' },
    { name: 'adgroup', type: 'VARCHAR' },
    { name: 'match_type', type: 'VARCHAR' },
    { name: 'impressions', type: 'UINTEGER' },
    { name: 'clicks', type: 'UINTEGER' },
    { name: 'spend_micros', type: 'UBIGINT' },
    { name: 'conversions', type: 'DECIMAL' },
    { name: 'revenue_micros', type: 'UBIGINT' },
    { name: 'cpc_micros', type: 'UBIGINT' },
    { name: 'is_safe', type: 'BOOLEAN' },
  ],
  token_matrix: [
    { name: 'token', type: 'VARCHAR' },
    { name: 'gram_degree', type: 'INTEGER' },
    { name: 'classification', type: 'VARCHAR' },
    { name: 'occurrences', type: 'BIGINT' },
    { name: 'sub_click_queries', type: 'BIGINT' },
    { name: 'total_clicks', type: 'BIGINT' },
    { name: 'total_spend_micros', type: 'BIGINT' },
    { name: 'conversions', type: 'DOUBLE' },
    { name: 'wilson_score_upper', type: 'DOUBLE' },
  ],
  safe_list: [
    { name: 'term', type: 'VARCHAR' },
    { name: 'conversions', type: 'DOUBLE' },
    { name: 'revenue_micros', type: 'BIGINT' },
    { name: 'created_at', type: 'BIGINT' },
  ],
};

export const PRESETS = [
  { name: 'Top Spenders', sql: () => topSpendersPreset(50) },
  { name: 'Zero-Conv Waste', sql: () => zeroConvWastePreset(5, 0n) },
  { name: 'Campaign Rollup', sql: () => campaignRollupPreset() },
  { name: 'Auction Collisions', sql: () => auctionCollisionsPreset() },
  { name: 'High CPC Outliers', sql: () => highCpcOutliersPreset(2_000_000n) },
];

export let sessionActiveTab: 'search_terms' | 'token_matrix' | 'safe_list' = 'search_terms';
export let sessionQueryHistory: string[] = [];

export function setSessionActiveTab(tab: 'search_terms' | 'token_matrix' | 'safe_list'): void {
  sessionActiveTab = tab;
}

export function pushSessionHistory(query: string): string[] {
  sessionQueryHistory = [query, ...sessionQueryHistory.filter((x) => x !== query)].slice(0, 10);
  return sessionQueryHistory;
}

export function formatDuckDBError(error: unknown): { title: string; message: string } {
  const raw = typeof error === 'string' ? error : error instanceof Error ? error.message : String(error ?? '');
  const title = raw.includes('Parser Error:')
    ? 'SQL Syntax / Parser Error'
    : raw.includes('Catalog Error:')
    ? 'Database Catalog Error'
    : raw.includes('Binder Error:')
    ? 'Query Binder Error'
    : 'DuckDB Execution Error';
  return { title, message: raw.replace(/^.*?(Error:\s*)/i, '').trim() || raw.trim() };
}
