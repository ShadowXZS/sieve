/**
 * Sieve Application Root Component
 *
 * Coordinates WebAssembly worker pool instances, Dexie.js persistence tier,
 * live threshold sliders, and virtualized keyword exploration grid.
 */

import React, { useEffect, useState } from 'react';
import { SieveWorkerPool } from './workers/pool.ts';
import { FileDropzone } from './components/dropzone/FileDropzone.tsx';
import { SummaryDashboard } from './components/kpi/SummaryDashboard.tsx';
import { ThresholdControls } from './components/sliders/ThresholdControls.tsx';
import { KeywordVirtualGrid } from './components/grid/KeywordVirtualGrid.tsx';
import { WorkerProcessingHUD } from './components/hud/WorkerProcessingHUD.tsx';
import { BrandHeader } from './components/brand/BrandHeader.tsx';
import { AppShell } from './components/layout/AppShell.tsx';
import { ProcessingOverlay } from './components/feedback/ProcessingOverlay.tsx';
import { useSieveStore } from './state/useSieveStore.ts';
import type { PersistedNegativeKeyword } from './workers/protocol.ts';

export const App: React.FC = () => {
  const [workerPool, setWorkerPool] = useState<SieveWorkerPool | null>(null);
  const { setKeywords, isIngesting, ingestionProgress } = useSieveStore();

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
    <AppShell
      header={
        <BrandHeader
          workerConcurrency={workerPool?.concurrency || 4}
          onLoadDemo={handleGenerateDemoData}
        />
      }
      footer={
        <footer className="border-t border-zinc-850 py-4 px-4 sm:px-6 lg:px-8 text-center text-xs text-zinc-500 font-mono tabular-nums">
          Sieve Core v0.1.0 • 60/120 FPS Main Thread Guarantee • Sub-10ms WASM Pointer Re-evaluations
        </footer>
      }
    >
      {/* KPI Dashboard - Equal Column Grid */}
      <section aria-label="KPI Metrics">
        <SummaryDashboard />
      </section>

      {/* Worker Processing HUD - Brand Integrated Multi-Threaded Status */}
      <section aria-label="Worker Processing HUD">
        <WorkerProcessingHUD workerPool={workerPool || undefined} />
      </section>

      {/* Dropzone & File Ingestion with Ambient Watermark */}
      <section aria-label="File Ingestion">
        <FileDropzone workerPool={workerPool || undefined} />
      </section>

      {/* Live Threshold Controls - Balanced Two-Column Surface */}
      <section aria-label="Threshold Controls">
        <ThresholdControls workerPool={workerPool || undefined} />
      </section>

      {/* Virtualized Keyword Grid - Numeric Tabular Data Alignment */}
      <section aria-label="Negative Keyword Rules" className="h-[550px] flex flex-col">
        <KeywordVirtualGrid />
      </section>

      {/* Centered Vector Processing Pulse Overlay */}
      <ProcessingOverlay isProcessing={isIngesting} progress={ingestionProgress} />
    </AppShell>
  );
};

