/**
 * Archival Notice Banner Component
 *
 * Displays an informational cautionary disclaimer banner directly
 * above the file ingestion dropzone, notifying users that the project is created through AI.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ArchivalNoticeBannerProps {
  className?: string;
}

export const ArchivalNoticeBanner: React.FC<ArchivalNoticeBannerProps> = ({
  className = '',
}) => {
  return (
    <div
      role="region"
      aria-label="Archival Notice"
      data-testid="archival-notice-banner"
      className={`w-full rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 sm:p-5 text-amber-200 shadow-lg shadow-amber-950/10 backdrop-blur-sm ${className}`}
    >
      <div className="flex items-start gap-3.5">
        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0 mt-0.5">
          <AlertTriangle className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="flex-1 space-y-1.5 min-w-0">
          <h3 className="text-xs sm:text-sm font-semibold text-amber-300">
            Development Transparency & Local-Compute Notice
          </h3>
          <p className="text-xs sm:text-sm font-medium leading-relaxed text-amber-200">
            This application's core codebase and local analytics pipelines were synthesized using advanced Meta-Prompting engineering workflows. The application itself runs completely deterministically inside your browser.
          </p>
          <p className="text-xs sm:text-sm font-medium leading-relaxed text-amber-200">
            Please use the data as a reference and not make financial decisions based on it.
          </p>
          <p className="text-xs sm:text-sm font-medium leading-relaxed text-amber-200">
            Zero-Cloud Privacy Guarantee: Because the resulting engine is entirely local-first, no AI models process your data at runtime. Your raw marketing files, cost metrics, and search queries stay strictly inside your browser's WebAssembly memory. There is zero data egress, zero external telemetry, and zero cloud tracking.
          </p>
        </div>
      </div>
    </div>
  );
};
