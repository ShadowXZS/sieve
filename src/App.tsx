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
import {
  generateSessionAuditHash,
  generateZeroLeakAttestation,
  type ZeroLeakAttestation,
} from './crypto/privacy_monitor.ts';
import { exportVaultToBuffer } from './crypto/vault.ts';
import {
  pickLocalDirectory,
  syncVaultToLocalDirectory,
  triggerBrowserVaultDownload,
} from './sync/filesystem.ts';
import { defaultDb } from './storage/db.ts';
import { resetDuckDB, dropTable } from './analytics/duckdb.ts';
import { useSieveStore } from './state/useSieveStore.ts';

export const App: React.FC = () => {
  const [workerPool, setWorkerPool] = useState<SieveWorkerPool | null>(null);
  const [isPrivacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [sessionAuditHash, setSessionAuditHash] = useState(
    '0000000000000000000000000000000000000000000000000000000000000000'
  );
  const [attestation, setAttestation] = useState<ZeroLeakAttestation | null>(null);

  const { keywords, filteredKeywords, kpi, isIngesting, ingestionProgress, fileLoaded, reset } =
    useSieveStore();

  const handleClearDataset = async () => {
    reset();
    if (workerPool) {
      await workerPool.resetAll();
    }
    try {
      await dropTable('search_terms');
      await resetDuckDB();
    } catch {}
    try {
      await defaultDb.exclusions.clear();
      await defaultDb.hashChunks.clear();
    } catch {}
  };

  useEffect(() => {
    // Generate deterministic session audit hash & zero-leak attestation
    generateZeroLeakAttestation({
      sessionId: 'session_active',
      datasetRecordCount: keywords.length,
      totalWasteRecovered: kpi.totalWaste,
      exclusionsCount: filteredKeywords.length,
      platform: 'sieve_unified',
      clientAppVersion: '0.1.0',
    }).then((att) => {
      setAttestation(att);
      setSessionAuditHash(att.sessionHash);
    });
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
          onClearDataset={handleClearDataset}
        />
      }
      footer={
        <footer className="text-center py-4 text-xs text-zinc-500 font-mono">
          Sieve © 2026
        </footer>
      }
    >
      {!fileLoaded ? (
        /* Pre-Upload State: When no file is loaded, hide ALL downstream widgets; only show Dropzone */
        <section aria-label="File Ingestion">
          <FileDropzone workerPool={workerPool || undefined} />
        </section>
      ) : (
        /* Chronological Layout Once Loaded:
           Dropzone/FileBar -> Threshold Controls -> Executive Analytics Dashboard -> Virtualized Detailed Keyword Grid
        */
        <>
          {/* 1. Ingestion Status Bar (with "Clear Dataset" button) */}
          <section aria-label="Ingestion Status Bar" data-testid="active-file-bar">
            <WorkerProcessingHUD
              workerPool={workerPool || undefined}
              onClearDataset={handleClearDataset}
            />
          </section>

          {/* 2. Live Threshold Controls */}
          <section aria-label="Threshold Controls">
            <ThresholdControls workerPool={workerPool || undefined} />
          </section>

          {/* 3. Executive Analytics Dashboard */}
          <section aria-label="Executive Analytics Dashboard" className="space-y-6">
            <ExecutiveDashboard />
            <SpendWaterfallBar />
            <BidElasticityProbe />
            <div aria-label="Secondary Diagnostic Analysis" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <LongTailBleedCard />
              <DilutionAuditCard />
            </div>
          </section>

          {/* 4. Virtualized Detailed Keyword Grid */}
          <section aria-label="Negative Keyword Rules" className="h-[550px] flex flex-col">
            <KeywordVirtualGrid />
          </section>
        </>
      )}

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
        attestation={attestation}
        onSyncFileSystem={handleSyncFileSystem}
      />
    </AppShell>
  );
};