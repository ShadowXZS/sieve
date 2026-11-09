/**
 * Power Query Drawer Component (Analytics SQL Workspace)
 * Zero-server in-browser DuckDB-Wasm SQL workbench with Apache Arrow IPC.
 * Line ceiling: <= 250 lines.
 */
import React, { useState, useEffect, useCallback, useId } from 'react';
import { X, Terminal, Play, RotateCcw, Copy, Check, ShieldCheck, Database, Download, AlertTriangle, Clock, Layers, GitBranch, PlusCircle } from 'lucide-react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import type { SieveWorkerPool } from '../../workers/pool.ts';
import type { PersistedNegativeKeyword } from '../../workers/protocol.ts';
import { copyToClipboard } from '../../formatters/clipboard.ts';
import { DuckDbAdapter, duckDbAdapter } from '../../analytics/duckdb_adapter.ts';
import {
  SCHEMA_TABLES,
  PRESETS,
  sessionActiveTab,
  sessionQueryHistory,
  setSessionActiveTab,
  pushSessionHistory,
  formatDuckDBError,
} from './powerQueryConstants.ts';
import { PowerQueryResultsTable } from './PowerQueryResultsTable.tsx';

export { SCHEMA_TABLES, formatDuckDBError };

export interface PowerQueryDrawerProps {
  isOpen?: boolean; onClose?: () => void; workerPool?: SieveWorkerPool; adapter?: DuckDbAdapter;
  onExecuteQuery?: (sql: string) => Promise<{ columns: string[]; rows: Array<Record<string, unknown>>; rowCount: number; executionTimeMs: number }>;
  onExplainQuery?: (sql: string) => Promise<{ plan: string; operators?: readonly string[] } | string>;
}

export const PowerQueryDrawer: React.FC<PowerQueryDrawerProps> = ({ isOpen: propIsOpen, onClose, workerPool, adapter, onExecuteQuery, onExplainQuery }) => {
  const { isPowerQueryOpen, powerQuerySql, sqlQueryResult, isQueryRunning, sqlQueryError, keywords, setPowerQueryOpen, setPowerQuerySql, setSqlQueryResult, setIsQueryRunning, setSqlQueryError, resetPowerQuery, setKeywords } = useSieveStore();
  const isOpen = propIsOpen !== undefined ? propIsOpen : isPowerQueryOpen;
  const [activeTable, setActiveTable] = useState<'search_terms' | 'token_matrix' | 'safe_list'>(() => sessionActiveTab);
  const [history, setHistory] = useState<string[]>(() => [...sessionQueryHistory]);
  const [explainPlan, setExplainPlan] = useState<string | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<'csv' | 'json' | null>(null);
  const [stagedCount, setStagedCount] = useState<number | null>(null);
  const titleId = useId();

  const handleClose = useCallback(() => (onClose ? onClose() : setPowerQueryOpen(false)), [onClose, setPowerQueryOpen]);
  const pushHistory = (q: string) => { setHistory(pushSessionHistory(q)); };

  const handleExecute = useCallback(async (isExplain = false) => {
    const trimmed = powerQuerySql.trim();
    if (!trimmed || isQueryRunning) return;
    setIsQueryRunning(true);
    setSqlQueryError(null);
    try {
      const activeAdapter = adapter ?? duckDbAdapter;
      const storeState = useSieveStore.getState();
      const currentDataset = storeState.records.length > 0 ? storeState.records : storeState.keywords;
      if (currentDataset.length > 0) {
        await activeAdapter.ensureTablesRegistered(currentDataset as any);
      }

      if (isExplain) {
        const res = onExplainQuery ? await onExplainQuery(trimmed) : adapter ? await adapter.explainQuery(trimmed) : null;
        if (res) { setExplainPlan(typeof res === 'string' ? res : res.plan || res.operators?.join(' -> ') || ''); }
        else {
          const isMockPool = workerPool && typeof (workerPool as any).executeSQL === 'function' && typeof (workerPool as any).parseAndIngest !== 'function';
          const run = onExecuteQuery || (isMockPool ? (s: string) => workerPool.executeSQL(s) : null);
          const raw = run ? await run(`EXPLAIN ${trimmed}`) : await activeAdapter.explainQuery(trimmed);
          const typedRaw = raw as { plan?: string; rows?: Array<{ explain_value?: string; plan?: string }> };
          setExplainPlan(typeof raw === 'string' ? raw : typedRaw.plan || String(typedRaw.rows?.[0]?.explain_value ?? typedRaw.rows?.[0]?.plan ?? JSON.stringify(raw)));
        }
      } else {
        setExplainPlan(null);
        let res: { columns: readonly string[]; rows: readonly Record<string, unknown>[]; rowCount: number; executionTimeMs: number };
        const isMockPool = workerPool && typeof (workerPool as any).executeSQL === 'function' && typeof (workerPool as any).parseAndIngest !== 'function';
        if (onExecuteQuery) res = await onExecuteQuery(trimmed);
        else if (adapter) res = await adapter.executeQuery(trimmed);
        else if (isMockPool) res = await workerPool.executeSQL(trimmed);
        else res = await activeAdapter.executeQuery(trimmed);
        setSqlQueryResult({ columns: [...res.columns], rows: [...res.rows], rowCount: res.rowCount, executionTimeMs: res.executionTimeMs, query: trimmed });
        pushHistory(trimmed);
      }
    } catch (err: unknown) { setSqlQueryError(err instanceof Error ? err.message : String(err)); }
    finally { setIsQueryRunning(false); }
  }, [powerQuerySql, isQueryRunning, onExplainQuery, adapter, onExecuteQuery, workerPool, setIsQueryRunning, setSqlQueryError, setSqlQueryResult]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') handleClose();
      else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleExecute(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose, handleExecute]);

  const handleStageResults = () => {
    if (!sqlQueryResult) return;
    const items: PersistedNegativeKeyword[] = sqlQueryResult.rows.filter((r) => r.query).map((r, i) => ({
      id: `sql_${Date.now()}_${i}`, sha256Hash: `hash_${String(r.query)}_${i}`, keyword: String(r.query).trim(), matchType: 'exact',
      formattedRule: `[${String(r.query).trim()}]`, confidenceScore: 0.95,
      marginalWaste: r.spend_micros !== undefined ? Number(r.spend_micros) / 1_000_000 : (Number(r.cost) || 0),
      cost: r.spend_micros !== undefined ? Number(r.spend_micros) / 1_000_000 : (Number(r.cost) || 0),
      clicks: Number(r.clicks) || 5, conversions: Number(r.conversions) || 0, hasCollision: Boolean(r.is_safe === false || r.has_collision),
      firstSeenCampaign: r.campaign ? String(r.campaign) : 'Power Query', createdAt: Date.now(),
    }));
    setKeywords([...keywords, ...items]);
    setStagedCount(items.length);
    setTimeout(() => setStagedCount(null), 2000);
  };

  const toCsv = () => [sqlQueryResult!.columns.join(','), ...sqlQueryResult!.rows.map((r) => sqlQueryResult!.columns.map((c) => JSON.stringify((r as Record<string, unknown>)[c] ?? '')).join(','))].join('\n');
  const handleCopy = async (fmt: 'csv' | 'json') => { if (!sqlQueryResult?.rows.length) return; await copyToClipboard(fmt === 'json' ? JSON.stringify(sqlQueryResult.rows, null, 2) : toCsv()); setCopiedFormat(fmt); setTimeout(() => setCopiedFormat(null), 1500); };
  const handleDownloadCsv = () => { if (!sqlQueryResult?.rows.length) return; const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([toCsv()], { type: 'text/csv' })), download: `power_query_${Date.now()}.csv` }); a.click(); };

  if (!isOpen) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="power-query-drawer" className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      <div data-testid="power-query-backdrop" onClick={handleClose} className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-4xl bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col h-full z-10">
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-emerald-400"><Terminal className="w-5 h-5" /></div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id={titleId} className="text-base font-bold text-zinc-100">Power Query</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/70 text-emerald-400 border border-emerald-800/70">DuckDB-Wasm</span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800"><ShieldCheck className="w-3 h-3 text-emerald-400" />Zero Server Compute</span>
              </div>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">In-browser SQL workspace with Arrow IPC vectors</p>
            </div>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close Power Query drawer" className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-lg p-3 text-xs font-mono space-y-2">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5 font-semibold text-zinc-300"><Database className="w-3.5 h-3.5 text-indigo-400" />Virtual Tables:</span>
              <div className="flex items-center gap-1.5">
                {(['search_terms', 'token_matrix', 'safe_list'] as const).map((t) => (
                  <button key={t} type="button" data-testid={`schema-tab-${t}`} onClick={() => { setSessionActiveTab(t); setActiveTable(t); }} className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${activeTable === t ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200'}`}>{t}</button>
                ))}
              </div>
            </div>
            <div data-testid="schema-viewer" className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
              {SCHEMA_TABLES[activeTable]?.map((col) => (<span key={col.name} className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">{col.name} <span className="text-zinc-500">{col.type}</span></span>))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono"><Layers className="w-3.5 h-3.5 text-emerald-400" /><span>Diagnostic Presets:</span></div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (<button key={p.name} type="button" onClick={() => setPowerQuerySql(p.sql())} className="px-2.5 py-1 rounded-md text-xs font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-emerald-300 border border-zinc-800 transition-colors">{p.name}</button>))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-zinc-400">SQL Input:</span>
              {history.length > 0 && (
                <select data-testid="power-query-history-select" aria-label="Recent Queries" value="" onChange={(e) => e.target.value && setPowerQuerySql(e.target.value)} className="bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-mono rounded px-2 py-1 outline-none">
                  <option value="" disabled>Recent Queries ({history.length})</option>
                  {history.map((h, i) => (<option key={i} value={h}>{h.slice(0, 36)}...</option>))}
                </select>
              )}
            </div>
            <textarea data-testid="power-query-sql-input" value={powerQuerySql} onChange={(e) => setPowerQuerySql(e.target.value)} placeholder="Enter SQL query against virtual tables..." rows={4} className="w-full bg-zinc-950 font-mono text-xs sm:text-sm text-zinc-100 border border-zinc-800 rounded-lg p-3 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-y" />
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <button type="button" data-testid="power-query-run-btn" onClick={() => handleExecute(false)} disabled={isQueryRunning || !powerQuerySql.trim()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs font-mono transition-colors disabled:opacity-50"><Play className={`w-3.5 h-3.5 ${isQueryRunning ? 'animate-spin' : 'fill-current'}`} /><span>{isQueryRunning ? 'Executing...' : 'Run Query'}</span></button>
                <button type="button" data-testid="power-query-explain-btn" onClick={() => handleExecute(true)} disabled={isQueryRunning || !powerQuerySql.trim()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-emerald-300 text-xs font-mono border border-zinc-800 transition-colors disabled:opacity-50"><GitBranch className="w-3.5 h-3.5 text-indigo-400" /><span>Explain Plan</span></button>
                <button type="button" onClick={() => { resetPowerQuery(); setExplainPlan(null); }} disabled={isQueryRunning} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs font-mono border border-zinc-800"><RotateCcw className="w-3.5 h-3.5" /><span>Reset</span></button>
              </div>
              {sqlQueryResult && (
                <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-zinc-400">
                  <span className="flex items-center gap-1 text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/60"><Clock className="w-3 h-3" />{sqlQueryResult.executionTimeMs} ms</span>
                  <span>{sqlQueryResult.rowCount} rows</span>
                </div>
              )}
            </div>
          </div>

          {explainPlan && (
            <div data-testid="query-plan-inspector" className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800 space-y-1.5 font-mono text-xs">
              <div className="flex items-center justify-between text-zinc-400"><span className="font-semibold text-emerald-400 flex items-center gap-1.5"><GitBranch className="w-3.5 h-3.5" />Execution Plan Inspector</span><button type="button" onClick={() => setExplainPlan(null)} className="text-zinc-500 hover:text-zinc-300">Dismiss</button></div>
              <pre data-testid="explain-plan-tree" className="text-zinc-300 whitespace-pre overflow-x-auto text-[11px] p-2 bg-zinc-950 rounded border border-zinc-800/80 max-h-48">{explainPlan}</pre>
            </div>
          )}

          {sqlQueryError && !isQueryRunning && (() => {
            const err = formatDuckDBError(sqlQueryError);
            return (
              <div data-testid="power-query-error" className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono space-y-1">
                <div className="flex items-center gap-2 text-rose-400 font-semibold"><AlertTriangle className="w-4 h-4 shrink-0" /><span>{err.title}</span></div>
                <div className="text-rose-200/90 whitespace-pre-wrap font-mono text-[11px] bg-zinc-950/50 p-2 rounded border border-rose-900/40">{err.message}</div>
              </div>
            );
          })()}

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-zinc-300 uppercase tracking-wider">Results</span>
                {sqlQueryResult?.columns.includes('query') && sqlQueryResult.rows.length > 0 && (
                  <button type="button" data-testid="stage-negatives-btn" onClick={handleStageResults} className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/70 text-xs font-mono transition-colors">
                    <PlusCircle className="w-3.5 h-3.5" /><span>{stagedCount ? `Staged ${stagedCount} Candidates!` : 'Stage Results as Negative Candidates'}</span>
                  </button>
                )}
              </div>
              {sqlQueryResult && sqlQueryResult.rows.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <button type="button" onClick={() => handleCopy('csv')} className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800">{copiedFormat === 'csv' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}<span>{copiedFormat === 'csv' ? 'Copied' : 'CSV'}</span></button>
                  <button type="button" onClick={() => handleCopy('json')} className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800">{copiedFormat === 'json' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}<span>{copiedFormat === 'json' ? 'Copied' : 'JSON'}</span></button>
                  <button type="button" onClick={handleDownloadCsv} className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800"><Download className="w-3 h-3 text-indigo-400" /><span>Download</span></button>
                </div>
              )}
            </div>

            <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
              {isQueryRunning ? (
                <div data-testid="power-query-loading" className="py-16 text-center space-y-2"><div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" /><p className="text-xs font-mono text-zinc-400">Executing SQL in DuckDB-Wasm...</p></div>
              ) : sqlQueryResult ? (
                sqlQueryResult.rows.length === 0 ? (
                  <div data-testid="power-query-partial" className="py-12 text-center text-xs font-mono text-zinc-500">Query returned 0 rows (Partial / Empty Result).</div>
                ) : (
                  <PowerQueryResultsTable columns={sqlQueryResult.columns} rows={sqlQueryResult.rows} />
                )
              ) : (
                <div data-testid="power-query-blank" className="py-16 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center mx-auto text-zinc-600"><Terminal className="w-5 h-5" /></div>
                  <p className="text-xs font-mono text-zinc-400">Run a query above to inspect search terms in DuckDB</p>
                  <p className="text-[11px] font-mono text-zinc-600">Zero latency • Local in-memory DuckDB-Wasm compute</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
