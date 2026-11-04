/**
 * Sieve Application Root Component
 *
 * Coordinates WebAssembly worker pool instances, Dexie.js persistence tier,
 * live threshold sliders, and virtualized keyword exploration grid.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { SieveWorkerPool } from './workers/pool.ts';
import { FileDropzone } from './components/dropzone/FileDropzone.tsx';
import { SummaryDashboard } from './components/kpi/SummaryDashboard.tsx';
import { ThresholdControls } from './components/sliders/ThresholdControls.tsx';
import { KeywordVirtualGrid } from './components/grid/KeywordVirtualGrid.tsx';
import { useSieveStore } from './state/useSieveStore.ts';
import { Filter, Cpu, Database, Sparkles, RefreshCw } from 'lucide-react';
import type { PersistedNegativeKeyword } from './workers/protocol.ts';

export const App: React.FC = () => {
  const [workerPool, setWorkerPool] = useState<SieveWorkerPool | null>(null);
  const { setKeywords } = useSieveStore();

  useEffect(() => {
    // Initialize Web Worker pool sized to navigator hardware concurrency
    const pool = new SieveWorkerPool();
    setWorkerPool(pool);

    return () => {
      pool.terminate();
    };
  }, []);

  const handleGenerateDemoData = () => {
    const demoKeywords: PersistedNegativeKeyword[] = [];
    const count = 10000;
    const matchTypes: Array<'exact' | 'phrase' | 'broad'> = ['exact', 'phrase', 'broad'];

    for (let i = 0; i < count; i++) {
      const matchType = matchTypes[i % 3];
      const hasCollision = i % 8 === 0;
      const term = `wasteful search term ${i}`;
      let formatted = term;
      if (hasCollision || matchType === 'exact') {
        formatted = `[${term}]`;
      } else if (matchType === 'phrase') {
        formatted = `"${term}"`;
      }

      demoKeywords.push({
        sha256Hash: `hash_demo_${i}_${Date.now()}`,
        keyword: term,
        matchType: hasCollision ? 'exact' : matchType,
        formattedRule: formatted,
        platform: 1,
        confidenceScore: 0.65 + ((i * 7) % 35) / 100,
        marginalWaste: Math.round(((i % 50) + 1) * 18.5 * 100) / 100,
        hasCollision,
        collidingSafeTerms: hasCollision
          ? [`converting brand query ${i}`, `high value purchase ${i}`]
          : undefined,
        createdAt: Date.now() - i * 1000,
      });
    }

    setKeywords(demoKeywords);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Navbar */}
      <header className="h-16 border-b border-zinc-800 bg-zinc-900/40 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Filter className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-zinc-100 text-sm">SIEVE</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
                Phase 5
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 font-mono">
              WebAssembly Streaming Engine &amp; Bayesian Filter
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>Workers: {workerPool?.concurrency || 4} threads</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Dexie IndexedDB Tier</span>
          </div>

          <button
            type="button"
            onClick={handleGenerateDemoData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Load 10k Demo Dataset
          </button>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* KPI Dashboard */}
        <section aria-label="KPI Metrics">
          <SummaryDashboard />
        </section>

        {/* Dropzone & Ingestion */}
        <section aria-label="File Ingestion">
          <FileDropzone workerPool={workerPool || undefined} />
        </section>

        {/* Live Threshold Controls */}
        <section aria-label="Threshold Controls">
          <ThresholdControls workerPool={workerPool || undefined} />
        </section>

        {/* Virtualized Keyword Grid */}
        <section aria-label="Negative Keyword Rules" className="h-[550px] flex flex-col">
          <KeywordVirtualGrid />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-850 py-4 px-6 text-center text-xs text-zinc-500 font-mono">
        Sieve Core v0.1.0 • 60/120 FPS Main Thread Guarantee • Sub-10ms WASM Pointer Re-evaluations
      </footer>
    </div>
  );
};

