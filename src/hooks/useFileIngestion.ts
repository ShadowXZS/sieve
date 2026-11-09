/**
 * File Ingestion Hook & Main Thread Ingestion Coordinator
 * Reconciles message passing between main thread and worker threads,
 * guarantees deterministic progress updates, and transitions to Cooper's Error state.
 * Line ceiling: <= 250 lines.
 */

import { useState, useCallback, useRef } from 'react';
import { useSieveStore } from '../state/useSieveStore.ts';
import { IngestionWorkerPool, type WorkerIngestMessage } from '../workers/worker_pool.ts';
import type { PersistedNegativeKeyword } from '../workers/protocol.ts';
import { parseCsvTextToRecords } from '../utils/csvParser.ts';

export interface UseFileIngestionOptions {
  workerPool?: {
    executeIngestion?: (
      taskId: string,
      chunkBuffer: ArrayBuffer,
      isFinal: boolean,
      workerId?: number,
      targetCPA?: number,
      onProgress?: (msg: WorkerIngestMessage) => void
    ) => Promise<{ keywords?: PersistedNegativeKeyword[] }>;
    executeChunk?: (
      taskId: string,
      chunkBuffer: ArrayBuffer,
      isFinal: boolean,
      options?: { onProgress?: (msg: WorkerIngestMessage) => void; targetCPA?: number }
    ) => Promise<{ keywords?: PersistedNegativeKeyword[] }>;
  };
  onIngestComplete?: (files: File[]) => void;
}

export function useFileIngestion({ workerPool, onIngestComplete }: UseFileIngestionOptions = {}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFiles, setLastFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isIngesting,
    ingestionProgress,
    setIngesting,
    addIngestedFiles,
    errorMessage: storeError,
    setErrorMessage: setStoreErrorMessage,
    handleParseSuccess,
  } = useSieveStore();

  const processFiles = useCallback(
    async (files: File[]) => {
      setErrorMessage(null);
      setStoreErrorMessage(null);
      setLastFiles(files);

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
        const allKeywords: PersistedNegativeKeyword[] = [];
        const CHUNK_SIZE = 16 * 1024 * 1024;
        const pool = workerPool || new IngestionWorkerPool({ concurrency: 2 });

        for (let i = 0; i < totalFiles; i++) {
          const file = files[i];
          if (file.size === 0) {
            throw new Error('Worker initialization failed: PARSE_ERROR: Cannot ingest empty CSV file (0 bytes). Click to retry.');
          }

          const fileSize = file.size;
          const totalChunks = Math.max(1, Math.ceil(fileSize / CHUNK_SIZE));
          const targetCPA = useSieveStore.getState().thresholds.targetCPA;

          for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
            const startByte = chunkIdx * CHUNK_SIZE;
            const endByte = Math.min(startByte + CHUNK_SIZE, fileSize);
            const isFinal = chunkIdx === totalChunks - 1;

            const sliceBlob = file.slice(startByte, endByte);
            const chunkBuffer = await sliceBlob.arrayBuffer();

            if (chunkIdx === 0) {
              const headerSample = chunkBuffer.slice(0, Math.min(32768, chunkBuffer.byteLength));
              useSieveStore.getState().autoDetectCurrency(headerSample);
            }

            const taskId = `task_${Date.now()}_${i}_${chunkIdx}`;
            const onWorkerProgress = (msg: WorkerIngestMessage) => {
              if (msg.type === 'PROGRESS') {
                const chunkWeight = 1 / totalChunks;
                const fileBase = i / totalFiles;
                const chunkRelative = (msg.percent / 100) * chunkWeight;
                const computed = Math.min(99, Math.round((fileBase + chunkRelative / totalFiles) * 100));
                setIngesting(true, Math.max(useSieveStore.getState().ingestionProgress, computed));
              }
            };

            let resKeywords: PersistedNegativeKeyword[] = [];
            if ('executeChunk' in pool && typeof pool.executeChunk === 'function') {
              const res = await pool.executeChunk(taskId, chunkBuffer, isFinal, {
                totalBytes: fileSize,
                bytesProcessed: startByte,
                targetCPA,
                onProgress: onWorkerProgress,
              });
              resKeywords = res.keywords || [];
            } else if ('executeIngestion' in pool && typeof pool.executeIngestion === 'function') {
              const res = await pool.executeIngestion(taskId, chunkBuffer, isFinal, undefined, targetCPA, onWorkerProgress);
              resKeywords = res.keywords || [];
            } else {
              const text = await file.text();
              const parsed = parseCsvTextToRecords(text, targetCPA);
              resKeywords = parsed.records || [];
            }

            if (resKeywords.length > 0) {
              allKeywords.push(...resKeywords);
            }

            const fileProgress = (chunkIdx + 1) / totalChunks;
            const overallProgress = Math.min(99, Math.round(((i + fileProgress) / totalFiles) * 100));
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
          handleParseSuccess({ records: allKeywords });
        }

        setIngesting(false, 100);
        onIngestComplete?.(files);
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        const msg = raw.includes('Click to retry')
          ? raw
          : `Worker initialization failed: ${raw}. Click to retry.`;
        setErrorMessage(msg);
        setStoreErrorMessage(msg);
        setIngesting(false, 0);
      }
    },
    [workerPool, onIngestComplete, setIngesting, addIngestedFiles, setStoreErrorMessage, handleParseSuccess]
  );

  const retry = useCallback(() => {
    if (lastFiles.length > 0) {
      void processFiles(lastFiles);
    }
  }, [lastFiles, processFiles]);

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
    void processFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void processFiles(Array.from(e.target.files));
    }
  };

  return {
    isDragOver,
    errorMessage,
    storeError,
    isIngesting,
    ingestionProgress,
    fileInputRef,
    retry,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInputChange,
  };
}
