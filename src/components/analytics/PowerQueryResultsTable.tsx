/**
 * Power Query Tabular Results Table Component
 * Line ceiling: <= 250 lines.
 */
import React from 'react';

export interface PowerQueryResultsTableProps {
  columns: readonly string[];
  rows: readonly Record<string, unknown>[];
}

export const PowerQueryResultsTable: React.FC<PowerQueryResultsTableProps> = ({ columns, rows }) => {
  return (
    <div className="overflow-x-auto max-h-[420px] divide-y divide-zinc-800/80">
      <table className="w-full text-left text-xs font-mono border-collapse" data-testid="power-query-table">
        <thead className="bg-zinc-900/90 text-zinc-400 sticky top-0 z-10 border-b border-zinc-800">
          <tr>
            <th className="py-2 px-3 w-10 text-center font-normal text-zinc-600">#</th>
            {columns.map((c) => (
              <th key={c} className="py-2 px-3 font-semibold text-zinc-200 whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-850">
          {rows.map((row, idx) => (
            <tr key={idx} className="hover:bg-zinc-900/50 transition-colors tabular-nums">
              <td className="py-2 px-3 text-center text-zinc-600 select-none">{idx + 1}</td>
              {columns.map((c) => {
                const v = row[c];
                const isN = typeof v === 'number' || typeof v === 'bigint';
                const isB = typeof v === 'boolean';
                return (
                  <td
                    key={c}
                    className={`py-2 px-3 whitespace-nowrap ${isN ? 'text-right text-emerald-300' : isB ? 'text-indigo-300' : 'text-zinc-300'}`}
                  >
                    {isB ? (v ? 'true' : 'false') : v != null ? String(v) : 'NULL'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
