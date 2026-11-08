/**
 * Multi-File Dropzone Component
 *
 * Provides drag-and-drop CSV file ingestion with client-side mime validation,
 * zero-copy ArrayBuffer extraction, and asynchronous worker pool dispatch.
 */

import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import type { SieveWorkerPool } from '../../workers/pool.ts';
import { parseCsvTextToRecords } from '../../utils/csvParser.ts';
import { ArchivalNoticeBanner } from './ArchivalNoticeBanner.tsx';

export interface FileDropzoneProps {
  workerPool?: SieveWorkerPool;
  onIngestComplete?: (files: File[]) => void;
  className?: string;
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  workerPool,
  onIngestComplete,
  className = '',
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isIngesting, ingestionProgress, setIngesting, addIngestedFiles, errorMessage: storeError, setErrorMessage: setStoreErrorMessage } = useSieveStore();

  const processFiles = useCallback(
    async (files: File[]) => {
      setErrorMessage(null);
      setStoreErrorMessage(null);

      // Validate files
      const nonCsv = files.find((f) => {
        const name = f.name.toLowerCase();
        return (
          !name.endsWith('.csv') &&
          !name.endsWith('.tsv') &&
          !name.endsWith('.txt') &&
          f.type !== 'text/csv' &&
          f.type !== 'text/tab-separated-values' &&
          f.type !== 'application/vnd.ms-excel' &&
          f.type !== ''
        );
      });
      if (nonCsv) {
        const msg = 'Only CSV files are supported';
        setErrorMessage(msg);
        setStoreErrorMessage(msg);
        return;
      }

      if (files.length === 0) return;

      setIngesting(true, 0);
      addIngestedFiles(files);

      try {
        const totalFiles = files.length;
        const allKeywords: import('../../workers/protocol.ts').PersistedNegativeKeyword[] = [];
        const CHUNK_SIZE = 16 * 1024 * 1024; // 16 MB chunked streaming slice

        for (let i = 0; i < totalFiles; i++) {
          const file = files[i];

          // Validate non-empty file size
          if (file.size === 0) {
            throw new Error('PARSE_ERROR: Cannot ingest empty CSV file (0 bytes)');
          }

          const targetWorkerId = workerPool?.getAvailableWorkerId?.() ?? undefined;
          const fileSize = file.size;
          const totalChunks = Math.max(1, Math.ceil(fileSize / CHUNK_SIZE));
          const targetCPA = useSieveStore.getState().thresholds.targetCPA;

          for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
            const startByte = chunkIdx * CHUNK_SIZE;
            const endByte = Math.min(startByte + CHUNK_SIZE, fileSize);
            const isFinal = chunkIdx === totalChunks - 1;

            const sliceBlob = file.slice(startByte, endByte);
            const chunkBuffer = await sliceBlob.arrayBuffer();

            // Auto-detect currency from initial file chunk if not manually overridden
            if (chunkIdx === 0) {
              const headerSample = chunkBuffer.slice(0, Math.min(32768, chunkBuffer.byteLength));
              useSieveStore.getState().autoDetectCurrency(headerSample);
            }

            if (workerPool) {
              const taskId = `task_${Date.now()}_${i}_${chunkIdx}`;
              const res = await workerPool.executeIngestion(
                taskId,
                chunkBuffer,
                isFinal,
                targetWorkerId,
                targetCPA
              );
              if (res.keywords && res.keywords.length > 0) {
                allKeywords.push(...res.keywords);
              }
            } else if (isFinal) {
              const text = await file.text();
              const parsed = parseCsvTextToRecords(text, targetCPA);
              if (parsed.records && parsed.records.length > 0) {
                allKeywords.push(...parsed.records);
              }
            }

            const fileProgress = (chunkIdx + 1) / totalChunks;
            const overallProgress = Math.min(
              99,
              Math.round(((i + fileProgress) / totalFiles) * 100)
            );
            setIngesting(true, overallProgress);
          }
        }

        if (allKeywords.length === 0 && files.length > 0) {
          for (const f of files) {
            const text = await f.text();
            const parsed = parseCsvTextToRecords(text, useSieveStore.getState().thresholds.targetCPA);
            if (parsed.records && parsed.records.length > 0) {
              allKeywords.push(...parsed.records);
            }
          }
        }

        if (allKeywords.length > 0) {
          useSieveStore.getState().handleParseSuccess({ records: allKeywords });
        }

        onIngestComplete?.(files);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to process files via worker pool';
        setErrorMessage(msg);
        setStoreErrorMessage(msg);
      } finally {
        setIngesting(false, 100);
      }
    },
    [workerPool, onIngestComplete, setIngesting, addIngestedFiles, setStoreErrorMessage]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    processFiles(droppedFiles);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  return (
    <div className={`w-full ${className}`}>
      <ArchivalNoticeBanner className="mb-6" />
      <div
        data-testid="file-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 overflow-hidden group select-none ${
          isDragOver
            ? 'border-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-950/40'
            : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900/80'
        }`}
      >
        {/* Ambient Sieve Brand Logo Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden select-none">
          <img
            src="/sieve.svg"
            alt=""
            aria-hidden="true"
            data-testid="dropzone-watermark"
            className={`w-64 h-64 object-contain pointer-events-none transition-all duration-300 ease-out select-none ${
              isDragOver
                ? 'opacity-25 scale-110 filter drop-shadow-[0_0_30px_rgba(16,185,129,0.35)]'
                : 'opacity-[0.04] group-hover:opacity-[0.08] scale-100 group-hover:scale-105'
            }`}
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileInputChange}
        />

        <div className="relative z-10 flex flex-col items-center text-center">
          <div
            className={`p-4 rounded-full mb-3 transition-all duration-150 ease-out ${
              isDragOver
                ? 'bg-emerald-500/20 text-emerald-400 scale-110'
                : 'bg-zinc-800/80 text-zinc-400 group-hover:text-zinc-200 group-hover:bg-zinc-800'
            }`}
          >
            <UploadCloud className="w-8 h-8" />
          </div>

          <h3 className="text-sm font-semibold text-zinc-100 mb-1">
            Drag &amp; drop search term CSV reports here
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm mb-4">
            Supports Google Ads, Amazon PPC, and Microsoft Advertising export formats. Up to 600MB
            processed in background workers.
          </p>

          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 group-hover:bg-zinc-700 group-hover:text-white transition-all duration-150 ease-out active:scale-95">
            <FileText className="w-3.5 h-3.5" />
            Select CSV Files
          </span>
        </div>

        {isIngesting && (
          <div className="relative z-10 w-full mt-4 max-w-md">
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>Streaming into WebAssembly Pipeline...</span>
              <span className="font-mono tabular-nums text-emerald-400 font-semibold">{ingestionProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-150 ease-out"
                style={{ width: `${ingestionProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {(errorMessage || storeError) && (
        <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs transition-opacity duration-150">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage || storeError}</span>
        </div>
      )}
    </div>
  );
};

