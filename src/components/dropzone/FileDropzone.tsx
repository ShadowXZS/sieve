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

  const { isIngesting, ingestionProgress, setIngesting, addIngestedFiles } = useSieveStore();

  const processFiles = useCallback(
    async (files: File[]) => {
      setErrorMessage(null);

      // Validate files
      const nonCsv = files.find(
        (f) => !f.name.toLowerCase().endsWith('.csv') && f.type !== 'text/csv'
      );
      if (nonCsv) {
        setErrorMessage('Only CSV files are supported');
        return;
      }

      if (files.length === 0) return;

      setIngesting(true, 0);
      addIngestedFiles(files);

      try {
        const totalFiles = files.length;
        for (let i = 0; i < totalFiles; i++) {
          const file = files[i];
          const arrayBuffer = await file.arrayBuffer();

          if (workerPool) {
            const taskId = `task_${Date.now()}_${i}`;
            await workerPool.executeIngestion(taskId, arrayBuffer, true);
          }

          setIngesting(true, Math.round(((i + 1) / totalFiles) * 100));
        }

        onIngestComplete?.(files);
      } catch (err: any) {
        setErrorMessage(err?.message || 'Failed to process files via worker pool');
      } finally {
        setIngesting(false, 100);
      }
    },
    [workerPool, onIngestComplete, setIngesting, addIngestedFiles]
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
        className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
          isDragOver
            ? 'border-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-950/40'
            : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900/80'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileInputChange}
        />

        <div className="flex flex-col items-center text-center">
          <div
            className={`p-4 rounded-full mb-3 transition-colors ${
              isDragOver ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800/80 text-zinc-400'
            }`}
          >
            <UploadCloud className="w-8 h-8" />
          </div>

          <h3 className="text-sm font-semibold text-zinc-100 mb-1">
            Drag & drop search term CSV reports here
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm mb-4">
            Supports Google Ads, Amazon PPC, and Microsoft Advertising export formats. Up to 500MB
            processed in background workers.
          </p>

          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors">
            <FileText className="w-3.5 h-3.5" />
            Select CSV Files
          </span>
        </div>

        {isIngesting && (
          <div className="w-full mt-4 max-w-md">
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>Streaming into WebAssembly Pipeline...</span>
              <span className="font-mono text-emerald-400">{ingestionProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-200"
                style={{ width: `${ingestionProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};

