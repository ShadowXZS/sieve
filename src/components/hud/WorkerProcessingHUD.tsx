/**
 * Web Worker Processing HUD (Brand Symmetry & UI Polish)
 *
 * Real-time operational heads-up display rendering WebAssembly worker pool status,
 * linear memory allocation throughput, transferable buffer metrics, and ingestion progress.
 * Adheres to bilateral symmetry with balanced two-column configuration and tabular numerals.
 */

import React from 'react';
import { Cpu, Zap, Database, Activity, CheckCircle2, RotateCcw } from 'lucide-react';
import { SieveLogo } from '../brand/SieveLogo.tsx';
import { useSieveStore } from '../../state/useSieveStore.ts';
import type { SieveWorkerPool } from '../../workers/pool.ts';

export interface WorkerProcessingHUDProps {
  workerPool?: SieveWorkerPool;
  onClearDataset?: () => void;
  className?: string;
}

export const WorkerProcessingHUD: React.FC<WorkerProcessingHUDProps> = ({
  workerPool,
  onClearDataset,
  className = '',
}) => {
  const { isIngesting, ingestionProgress, kpi, ingestedFiles } = useSieveStore();

  const concurrency = workerPool?.concurrency || 4;
  const busyWorkers = workerPool?.busyWorkersCount || (isIngesting ? Math.min(concurrency, Math.max(1, ingestedFiles.length || 1)) : 0);
  const queueDepth = workerPool?.queueDepth || 0;

  return (
    <div
      data-testid="worker-processing-hud"
      role="region"
      aria-label="Worker Processing HUD"
      className={`rounded-xl bg-zinc-900/60 border border-zinc-800 p-4 shadow-lg backdrop-blur-md transition-all duration-150 ease-out hover:border-zinc-700/70 ${className}`}
    >
      {/* Balanced Two-Column Bilateral Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        {/* Left Column: Brand Emblem & Concurrency Architecture */}
        <div className="flex items-center gap-3.5">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center p-2 shadow-inner">
              <SieveLogo
                size="sm"
                alt="Sieve WebAssembly Worker HUD"
                data-testid="hud-sieve-logo"
                animate={isIngesting}
                className={`w-full h-full object-contain ${
                  isIngesting ? 'scale-110 filter drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]' : ''
                }`}
              />
            </div>
            {/* Live Status Pip */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-zinc-900 ${
                isIngesting ? 'bg-emerald-400 animate-ping' : 'bg-emerald-500'
              }`}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-100 truncate">
                WebAssembly Worker Engine
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-emerald-400 border border-zinc-700/60">
                SIMD Pointers
              </span>
            </div>

            <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-400 font-mono tabular-nums">
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-indigo-400 shrink-0" />
                <span>
                  Threads: <strong className="text-zinc-200">{concurrency}</strong>
                </span>
              </span>
              <span className="text-zinc-600">•</span>
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-amber-400 shrink-0" />
                <span>
                  Busy: <strong className="text-zinc-200">{busyWorkers}</strong>
                </span>
              </span>
              <span className="text-zinc-600">•</span>
              <span>
                Queue: <strong className="text-zinc-200">{queueDepth}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Execution State & Ingestion Progress */}
        <div className="flex flex-col justify-center border-t md:border-t-0 md:border-l border-zinc-800/80 pt-3 md:pt-0 md:pl-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-1.5 text-zinc-300">
              {isIngesting ? (
                <>
                  <Zap className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
                  <span className="font-medium">Ingesting Stream into Linear Memory...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-zinc-400">
                    Engine Ready •{' '}
                    <strong className="text-zinc-200 font-mono tabular-nums">
                      {kpi.totalKeywords.toLocaleString()}
                    </strong>{' '}
                    active rules evaluated
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono tabular-nums text-xs font-semibold text-emerald-400">
                {isIngesting ? `${ingestionProgress}%` : '< 10ms live'}
              </span>
              {onClearDataset && (
                <button
                  type="button"
                  data-testid="clear-dataset-btn"
                  onClick={onClearDataset}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-zinc-800 hover:bg-rose-950/60 text-zinc-300 hover:text-rose-300 border border-zinc-700 hover:border-rose-800/60 transition-all duration-150 ease-out active:scale-95 shadow-sm"
                  title="Clear current dataset and release memory"
                >
                  <RotateCcw className="w-3 h-3 text-rose-400" />
                  <span>Clear Dataset</span>
                </button>
              )}
            </div>
          </div>

          {/* Progress / Status Bar (Zero Layout Shift) */}
          <div className="w-full h-1.5 bg-zinc-800/80 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ease-out rounded-full ${
                isIngesting
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  : 'bg-zinc-700/60'
              }`}
              style={{ width: isIngesting ? `${Math.max(5, ingestionProgress)}%` : '100%' }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono tabular-nums mt-1">
            <span className="flex items-center gap-1">
              <Database className="w-3 h-3 text-emerald-500/70" />
              <span>Dexie Storage Tier Active</span>
            </span>
            <span>Zero-Copy Transferable Buffer</span>
          </div>
        </div>
      </div>
    </div>
  );
};

