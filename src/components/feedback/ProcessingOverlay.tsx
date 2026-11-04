/**
 * ProcessingOverlay Feedback Component (Phase 7 - Micro-interactions)
 *
 * Full-viewport or container modal overlay utilizing a centered vector pulse
 * animation with SieveLogo, tabular numerical progress, and zero layout shift.
 */

import React from 'react';
import { SieveLogo } from '../brand/SieveLogo.tsx';

export interface ProcessingOverlayProps {
  isProcessing: boolean;
  progress?: number;
  statusMessage?: string;
  className?: string;
}

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({
  isProcessing,
  progress = 0,
  statusMessage = 'Processing CSV Data via WebAssembly...',
  className = '',
}) => {
  if (!isProcessing) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="processing-overlay"
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md transition-opacity duration-150 ease-out ${className}`}
    >
      <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl max-w-sm w-full text-center transition-all duration-150 ease-out scale-100">
        {/* Centered Vector Brand Pulse Animation */}
        <div className="relative mb-5 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse" />
          <div className="relative p-3 rounded-2xl bg-zinc-950 border border-zinc-800 shadow-inner">
            <SieveLogo size="hero" animate={true} alt="Sieve Engine Processing" />
          </div>
        </div>

        <h3 className="text-sm font-semibold text-zinc-100 mb-1 tracking-tight">
          WebAssembly Linear Engine Active
        </h3>
        <p className="text-xs text-zinc-400 max-w-xs mb-4 leading-relaxed">
          {statusMessage}
        </p>

        {/* Progress Bar with Tabular Numerals */}
        <div className="w-full space-y-1.5">
          <div className="flex justify-between text-xs font-mono tabular-nums text-zinc-400">
            <span>Transferable Memory Ingestion</span>
            <span className="text-emerald-400 font-semibold">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-850 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-150 ease-out shadow-sm shadow-emerald-500/50"
              style={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

