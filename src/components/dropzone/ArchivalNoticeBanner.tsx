/**
 * Archival Notice Banner Component
 *
 * Displays a permanent, un-dismissible archival disclaimer banner directly
 * above the file ingestion dropzone, notifying users that the project is concluded
 * and outputs must not be used for live financial decisions or production PPC campaigns.
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
          <h2 className="text-sm sm:text-base font-bold tracking-tight text-amber-300">
            ⚠️ CRITICAL NOTICE: PROJECT CONCLUDED / ARCHIVAL STATE
          </h2>
          <p className="text-xs sm:text-sm font-semibold tracking-wide text-amber-400">
            DO NOT USE OUTPUTS FOR LIVE FINANCIAL DECISIONS OR PRODUCTION PPC CAMPAIGNS.
          </p>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            While the interface and core pipelines demonstrate what is possible with client-side WebAssembly, the calculations, reconciliations, and outputs from this tool are not verified for production accuracy. Use this repository strictly as an educational case study and architectural reference for in-browser data processing.
          </p>
        </div>
      </div>
    </div>
  );
};
