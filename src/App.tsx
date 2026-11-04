/**
 * Sieve Application Root Component
 *
 * Coordinates WebAssembly worker pool instances, Dexie.js persistence tier,
 * live threshold sliders, and virtualized keyword exploration grid.
 */

import React, { useEffect, useState } from 'react';
import { SieveWorkerPool } from './workers/pool.ts';
import { FileDropzone } from './components/dropzone/FileDropzone.tsx';
import { ExecutiveDashboard } from './components/dashboard/ExecutiveDashboard.tsx';
import { SpendWaterfallBar } from './components/dashboard/SpendWaterfallBar.tsx';
import { BidElasticityProbe } from './components/dashboard/BidElasticityProbe.tsx';
import { LongTailBleedCard } from './components/analytics/LongTailBleedCard.tsx';
import { DilutionAuditCard } from './components/analytics/DilutionAuditCard.tsx';
import { AnalyticalDrawer } from './components/dashboard/AnalyticalDrawer.tsx';
import { PowerQueryDrawer } from './components/dashboard/PowerQueryDrawer.tsx';
import { ThresholdControls } from './components/sliders/ThresholdControls.tsx';
import { KeywordVirtualGrid } from './components/grid/KeywordVirtualGrid.tsx';
import { WorkerProcessingHUD } from './components/hud/WorkerProcessingHUD.tsx';
import { BrandHeader } from './components/brand/BrandHeader.tsx';
import { AppShell } from './components/layout/AppShell.tsx';
import { ProcessingOverlay } from './components/feedback/ProcessingOverlay.tsx';
import { PrivacyBadgeModal } from './components/privacy/PrivacyBadgeModal.tsx';
import { generateSessionAuditHash } from './crypto/privacy_monitor.ts';
import { exportVaultToBuffer } from './crypto/vault.ts';
import {
  pickLocalDirectory,
  syncVaultToLocalDirectory,
  triggerBrowserVaultDownload,
} from './sync/filesystem.ts';
import { defaultDb } from './storage/db.ts';
import { useSieveStore } from './state/useSieveStore.ts';

export const App: React.FC = () => {
  const [workerPool, setWorkerPool] = useState<SieveWorkerPool | null>(null);
  const [isPrivacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [sessionAuditHash, setSessionAuditHash] = useState(
    '0000000000000000000000000000000000000000000000000000000000000000'
  );

  const { keywords, filteredKeywords, kpi, isIngesting, ingestionProgress } =
    useSieveStore();

  useEffect(() => {
    // Generate deterministic session audit hash reflecting current execution state
    generateSessionAuditHash({
      sessionId: 'session_active',
      timestamp: 1700000000000,
      datasetRecordCount: keywords.length,
      totalWasteRecovered: kpi.totalWaste,
      exclusionsCount: filteredKeywords.length,
      platform: 'sieve_unified',
      clientAppVersion: '0.1.0',
    }).then(setSessionAuditHash);
  }, [keywords.length, kpi.totalWaste, filteredKeywords.length]);

  const handleSyncFileSystem = async () => {
    try {
      const passphrase = window.prompt('Enter passphrase to encrypt .sievevault backup:', '');
      if (!passphrase) return;
      const buffer = await exportVaultToBuffer(defaultDb, passphrase);
      const filename = `sieve_backup_${new Date().toISOString().slice(0, 10)}.sievevault`;
      const dirHandle = await pickLocalDirectory();
      if (dirHandle) {
        await syncVaultToLocalDirectory(dirHandle, filename, buffer);
        alert(`Encrypted backup saved: ${filename}`);
      } else {
        triggerBrowserVaultDownload(buffer, filename);
      }
    } catch (err: any) {
      alert(`Backup failed: ${err.message}`);
    }
  };

  useEffect(() => {
    // Initialize Web Worker pool sized to navigator hardware concurrency
    const pool = new SieveWorkerPool();
    setWorkerPool(pool);

    return () => {
      pool.terminate();
    };
  }, []);

  return (
    <AppShell
      header={
        <BrandHeader
          workerConcurrency={workerPool?.concurrency || 4}
          onOpenPrivacyModal={() => setPrivacyModalOpen(true)}
        />
      }
      footer={
        <footer className="text-center py-4 text-xs text-zinc-500 font-mono">
          Sieve © 2026
        </footer>
      }
    >
      {/* Executive Analytics Dashboard - Equal Column Grid */}
      <section aria-label="KPI Metrics">
        <ExecutiveDashboard />
      </section>

      {/* Spend Waterfall Breakdown Bar */}
      <section aria-label="Spend Waterfall">
        <SpendWaterfallBar />
      </section>

      {/* Bid Elasticity Probe */}
      <section aria-label="Bid Elasticity">
        <BidElasticityProbe />
      </section>

      {/* Secondary Analysis Grid: Long-Tail Bleed & Match Dilution Audit */}
      <section aria-label="Secondary Diagnostic Analysis" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LongTailBleedCard />
        <DilutionAuditCard />
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

      {/* Analytical Diagnostic Drawer (Phase 11) */}
      <AnalyticalDrawer />

      {/* Power Query Drawer (Phase 13 - DuckDB & Arrow IPC) */}
      <PowerQueryDrawer workerPool={workerPool || undefined} />

      {/* Cryptographic Privacy & Zero-Telemetry Audit Modal */}
      <PrivacyBadgeModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setPrivacyModalOpen(false)}
        sessionAuditHash={sessionAuditHash}
        telemetryBlockedCount={0}
        isEncrypted={true}
        onSyncFileSystem={handleSyncFileSystem}
      />
    </AppShell>
  );
};