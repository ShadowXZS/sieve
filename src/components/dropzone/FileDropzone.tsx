/**
 * Multi-File Dropzone Component
 *
 * Provides drag-and-drop CSV file ingestion with client-side mime validation,
 * zero-copy ArrayBuffer extraction, and asynchronous worker pool dispatch.
 * Physical line ceiling: <= 250 lines.
 */

import React from 'react';
import { UploadCloud, FileText, AlertCircle } from 'lucide-react';
import type { SieveWorkerPool } from '../../workers/pool.ts';
import { ArchivalNoticeBanner } from './ArchivalNoticeBanner.tsx';
import { useFileIngestion } from './useFileIngestion.ts';

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
  const {
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
  } = useFileIngestion({ workerPool, onIngestComplete });

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
            Supports Google Ads, Amazon PPC, and Microsoft Advertising export formats. Completely processed in background workers in browser.
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
