/**
 * Power Query Drawer Component (Phase 13 - Analytics)
 *
 * Implements an understated, high-performance slide-over SQL drawer for advanced
 * operators to execute fast local SQL queries against search term reports.
 *
 * Architectural Guarantees:
 * 1. Zero Server Compute: 100% in-browser DuckDB-Wasm execution.
 * 2. Off Main Thread: Dispatches SQL queries exclusively through the background worker pool
 *    or direct execution hook, preserving 60/120 FPS UI execution.
 * 3. Zero-Copy Apache Arrow IPC: Queries against virtual table `search_terms`.
 * 4. High-density tabular typography and accessible keyboard navigation (Escape to dismiss, Cmd+Enter to execute).
 */

import React, { useState, useEffect, useCallback, useId } from 'react';
import {
  X,
  Terminal,
  Play,
  RotateCcw,
  Copy,
  Check,
  ShieldCheck,
  Database,
  Download,
  AlertTriangle,
  Clock,
  Layers,
} from 'lucide-react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import type { SieveWorkerPool } from '../../workers/pool.ts';
import { copyToClipboard } from '../../formatters/clipboard.ts';

export interface PowerQueryDrawerProps {
  isOpen?: boolean;
  onClose?: () => void;
  workerPool?: SieveWorkerPool;
  onExecuteQuery?: (sql: string) => Promise<{
    columns: string[];
    rows: Array<Record<string, any>>;
    rowCount: number;
    executionTimeMs: number;
  }>;
}

interface PresetQuery {
  name: string;
  description: string;
  sql: string;
}

const PRESET_QUERIES: PresetQuery[] = [
  {
    name: 'Top Spenders',
    description: 'Top 20 search terms ranked by total spend',
    sql: 'SELECT query, campaign, clicks, cost, conversions FROM search_terms ORDER BY cost DESC LIMIT 20;',
  },
  {
    name: 'Zero-Conv Waste',
    description: 'High click search terms with zero recorded conversions',
    sql: 'SELECT query, campaign, clicks, cost FROM search_terms WHERE conversions = 0 AND clicks >= 5 ORDER BY cost DESC;',
  },
  {
    name: 'Campaign Rollup',
    description: 'Aggregated spend, clicks, and conversions grouped by campaign',
    sql: 'SELECT campaign, count(*) as query_count, sum(clicks) as total_clicks, round(sum(cost), 2) as total_spend, sum(conversions) as total_conversions FROM search_terms GROUP BY campaign ORDER BY total_spend DESC;',
  },
  {
    name: 'Auction Collisions',
    description: 'Queries competing across multiple campaigns with collision flags',
    sql: 'SELECT query, campaign, clicks, cost, conversions FROM search_terms WHERE has_collision = true ORDER BY cost DESC;',
  },
  {
    name: 'High CPC Outliers',
    description: 'Search terms with inflated cost per click',
    sql: 'SELECT query, campaign, clicks, cost, round(cost / nullif(clicks, 0), 2) as cpc FROM search_terms WHERE clicks >= 3 ORDER BY cpc DESC LIMIT 25;',
  },
];

/**
 * Formats raw DuckDB exceptions into user-friendly console error messages.
 */
export function formatDuckDBError(error: unknown): { title: string; message: string } {
  const raw =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? '');

  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.exception_type && parsed.exception_message) {
        return {
          title: `${parsed.exception_type} Error`,
          message: parsed.exception_message,
        };
      }
    } catch {}
  }

  if (raw.includes('Parser Error:')) {
    return {
      title: 'SQL Syntax / Parser Error',
      message: raw.replace(/^Parser Error:\s*/i, '').trim(),
    };
  }
  if (raw.includes('Catalog Error:')) {
    return {
      title: 'Database Catalog Error',
      message: raw.replace(/^Catalog Error:\s*/i, '').trim(),
    };
  }
  if (raw.includes('Binder Error:')) {
    return {
      title: 'Query Binder Error',
      message: raw.replace(/^Binder Error:\s*/i, '').trim(),
    };
  }

  return {
    title: 'DuckDB Execution Error',
    message: raw.trim(),
  };
}

export const PowerQueryDrawer: React.FC<PowerQueryDrawerProps> = ({
  isOpen: propIsOpen,
  onClose: propOnClose,
  workerPool,
  onExecuteQuery,
}) => {
  const {
    isPowerQueryOpen,
    powerQuerySql,
    sqlQueryResult,
    isQueryRunning,
    sqlQueryError,
    setPowerQueryOpen,
    setPowerQuerySql,
    setSqlQueryResult,
    setIsQueryRunning,
    setSqlQueryError,
    resetPowerQuery,
  } = useSieveStore();

  const isOpen = propIsOpen !== undefined ? propIsOpen : isPowerQueryOpen;
  const [copiedFormat, setCopiedFormat] = useState<'csv' | 'json' | null>(null);

  const titleId = useId();

  const handleClose = useCallback(() => {
    if (propOnClose) {
      propOnClose();
    } else {
      setPowerQueryOpen(false);
    }
  }, [propOnClose, setPowerQueryOpen]);

  // Execute SQL Query via onExecuteQuery or Worker Pool
  const handleExecuteQuery = useCallback(async () => {
    const trimmed = powerQuerySql.trim();
    if (!trimmed || isQueryRunning) return;

    setIsQueryRunning(true);
    setSqlQueryError(null);

    try {
      let res: {
        columns: string[];
        rows: Array<Record<string, any>>;
        rowCount: number;
        executionTimeMs: number;
      };

      if (onExecuteQuery) {
        res = await onExecuteQuery(trimmed);
      } else if (workerPool) {
        res = await workerPool.executeSQL(trimmed);
      } else {
        throw new Error('Worker pool not initialized. Please load a report first.');
      }

      setSqlQueryResult({
        columns: res.columns,
        rows: res.rows,
        rowCount: res.rowCount,
        executionTimeMs: res.executionTimeMs,
        query: trimmed,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'DuckDB execution failed';
      setSqlQueryError(msg);
    } finally {
      setIsQueryRunning(false);
    }
  }, [
    powerQuerySql,
    isQueryRunning,
    onExecuteQuery,
    workerPool,
    setIsQueryRunning,
    setSqlQueryError,
    setSqlQueryResult,
  ]);

  // Keyboard shortcut: Escape to close, Cmd/Ctrl + Enter to run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        handleClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExecuteQuery();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, handleExecuteQuery]);

  const handleCopyResults = async (format: 'csv' | 'json') => {
    if (!sqlQueryResult || sqlQueryResult.rows.length === 0) return;

    let textToCopy = '';
    if (format === 'json') {
      textToCopy = JSON.stringify(sqlQueryResult.rows, null, 2);
    } else {
      // CSV
      const cols = sqlQueryResult.columns;
      const headerRow = cols.join(',');
      const rows = sqlQueryResult.rows.map((row) =>
        cols
          .map((col) => {
            const val = row[col];
            if (val === null || val === undefined) return '';
            const str = String(val);
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(',')
      );
      textToCopy = [headerRow, ...rows].join('\n');
    }

    await copyToClipboard(textToCopy);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 1500);
  };

  const handleDownloadCsv = () => {
    if (!sqlQueryResult || sqlQueryResult.rows.length === 0) return;

    const cols = sqlQueryResult.columns;
    const headerRow = cols.join(',');
    const rows = sqlQueryResult.rows.map((row) =>
      cols
        .map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(',')
    );
    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sieve_power_query_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="power-query-drawer"
      className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-150"
    >
      {/* Backdrop */}
      <div
        data-testid="power-query-backdrop"
        onClick={handleClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ease-out"
      />

      {/* Slide-over Drawer Panel */}
      <div className="relative w-full max-w-4xl bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-emerald-400 shadow-inner">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id={titleId} className="text-base font-bold text-zinc-100 tracking-tight">
                  Power Query
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950/70 text-emerald-400 border border-emerald-800/70">
                  DuckDB-Wasm
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Zero Server Compute
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                Query search term reports locally using standard SQL with Apache Arrow IPC
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close Power Query drawer"
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Virtual Table Schema Reference */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-lg p-3 text-xs font-mono space-y-1.5">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5 font-semibold text-zinc-300">
                <Database className="w-3.5 h-3.5 text-indigo-400" />
                Virtual Table: <span className="text-emerald-400">search_terms</span>
              </span>
              <span className="text-[11px] text-zinc-500">Shortcut: Cmd + Enter</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                query <span className="text-zinc-500">VARCHAR</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                campaign <span className="text-zinc-500">VARCHAR</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                adgroup <span className="text-zinc-500">VARCHAR</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                clicks <span className="text-zinc-500">DOUBLE</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                cost <span className="text-zinc-500">DOUBLE</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                conversions <span className="text-zinc-500">DOUBLE</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                has_collision <span className="text-zinc-500">BOOLEAN</span>
              </span>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>Diagnostic Presets:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_QUERIES.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => setPowerQuerySql(preset.sql)}
                  title={preset.description}
                  className="px-2.5 py-1 rounded-md text-xs font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-emerald-300 border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* SQL Editor Area */}
          <div className="space-y-2">
            <div className="relative">
              <textarea
                data-testid="power-query-sql-input"
                value={powerQuerySql}
                onChange={(e) => setPowerQuerySql(e.target.value)}
                placeholder="Enter SQL query against search_terms table..."
                rows={4}
                className="w-full bg-zinc-950 font-mono text-xs sm:text-sm text-zinc-100 border border-zinc-800 rounded-lg p-3.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-y transition-colors leading-relaxed selection:bg-emerald-500/30 selection:text-emerald-200"
              />
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="power-query-run-btn"
                  onClick={handleExecuteQuery}
                  disabled={isQueryRunning || !powerQuerySql.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs font-mono transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none shadow-sm shadow-emerald-500/20 active:scale-[0.98]"
                >
                  <Play className={`w-3.5 h-3.5 ${isQueryRunning ? 'animate-spin' : 'fill-current'}`} />
                  <span>{isQueryRunning ? 'Executing SQL...' : 'Run Query'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => resetPowerQuery()}
                  disabled={isQueryRunning}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-mono border border-zinc-800 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Execution Telemetry Badge */}
              {sqlQueryResult && (
                <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-zinc-400">
                  <span className="flex items-center gap-1 text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/60">
                    <Clock className="w-3 h-3" />
                    {sqlQueryResult.executionTimeMs} ms
                  </span>
                  <span>{sqlQueryResult.rowCount} rows</span>
                </div>
              )}
            </div>
          </div>

          {/* Error Banner */}
          {sqlQueryError && (() => {
            const err = formatDuckDBError(sqlQueryError);
            return (
              <div
                data-testid="power-query-error"
                className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono space-y-1.5"
              >
                <div className="flex items-center gap-2 text-rose-400 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{err.title}</span>
                </div>
                <div className="pl-6 text-rose-200/90 whitespace-pre-wrap font-mono text-[11px] leading-relaxed bg-zinc-950/50 p-2.5 rounded border border-rose-900/40">
                  {err.message}
                </div>
              </div>
            );
          })()}

          {/* Query Results Section */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-zinc-300 uppercase tracking-wider">
                Results
              </span>

              {sqlQueryResult && sqlQueryResult.rows.length > 0 && (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => handleCopyResults('csv')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors"
                  >
                    {copiedFormat === 'csv' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedFormat === 'csv' ? 'Copied CSV' : 'Copy CSV'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyResults('json')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors"
                  >
                    {copiedFormat === 'json' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedFormat === 'json' ? 'Copied JSON' : 'Copy JSON'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors"
                  >
                    <Download className="w-3 h-3 text-indigo-400" />
                    <span>Download</span>
                  </button>
                </div>
              )}
            </div>

            {/* Results Table Container */}
            <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
              {sqlQueryResult ? (
                sqlQueryResult.rows.length === 0 ? (
                  <div className="py-12 text-center text-xs font-mono text-zinc-500">
                    Query returned 0 rows.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[420px] divide-y divide-zinc-800/80">
                    <table className="w-full text-left text-xs font-mono border-collapse" data-testid="power-query-table">
                      <thead className="bg-zinc-900/90 text-zinc-400 sticky top-0 z-10 border-b border-zinc-800">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center font-normal text-zinc-600">#</th>
                          {sqlQueryResult.columns.map((col) => (
                            <th
                              key={col}
                              className="py-2.5 px-3 font-semibold text-zinc-200 tracking-wider whitespace-nowrap"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-850">
                        {sqlQueryResult.rows.map((row, idx) => (
                          <tr
                            key={idx}
                            className="hover:bg-zinc-900/50 transition-colors duration-100 tabular-nums"
                          >
                            <td className="py-2 px-3 text-center text-zinc-600 select-none">{idx + 1}</td>
                            {sqlQueryResult.columns.map((col) => {
                              const val = row[col];
                              const isNum = typeof val === 'number';
                              const isBool = typeof val === 'boolean';
                              return (
                                <td
                                  key={col}
                                  className={`py-2 px-3 whitespace-nowrap ${
                                    isNum ? 'text-right text-emerald-300' : isBool ? 'text-indigo-300' : 'text-zinc-300'
                                  }`}
                                >
                                  {isBool ? (val ? 'true' : 'false') : val !== null && val !== undefined ? String(val) : 'NULL'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="py-16 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center mx-auto text-zinc-600">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-mono text-zinc-400">
                    Run a query above to inspect search terms in DuckDB
                  </p>
                  <p className="text-[11px] font-mono text-zinc-600">
                    Zero latency • Local in-memory DuckDB-Wasm compute
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
