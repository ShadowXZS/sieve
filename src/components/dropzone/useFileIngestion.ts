/**
 * File Ingestion & Drag-Drop Hook
 * Handles chunked streaming slice extraction and worker pool dispatch.
 * Physical line ceiling: <= 250 lines.
 */

import { useState, useCallback, useRef } from 'react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import type { SieveWorkerPool } from '../../workers/pool.ts';
import { parseCsvTextToRecords } from '../../utils/csvParser.ts';
import type { PersistedNegativeKeyword } from '../../workers/protocol.ts';

export interface UseFileIngestionOptions {
  workerPool?: SieveWorkerPool;
  onIngestComplete?: (files: File[]) => void;
}

export function useFileIngestion({ workerPool, onIngestComplete }: UseFileIngestionOptions = {}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isIngesting,
    ingestionProgress,
    setIngesting,
    addIngestedFiles,
    errorMessage: storeError,
    setErrorMessage: setStoreErrorMessage,
  } = useSieveStore();

  const processFiles = useCallback(
    async (files: File[]) => {
      setErrorMessage(null);
      setStoreErrorMessage(null);

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

        for (let i = 0; i < totalFiles; i++) {
          const file = files[i];
          if (file.size === 0) throw new Error('PARSE_ERROR: Cannot ingest empty CSV file (0 bytes)');

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
    processFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  return {
    isDragOver,
    errorMessage,
    storeError,
    isIngesting,
    ingestionProgress,
    fileInputRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInputChange,
  };
}
