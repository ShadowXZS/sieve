/**
 * AppShell Layout Component (Layout Symmetry Mandate)
 *
 * Establishes bilateral visual symmetry across all major viewports.
 * Enforces standardized horizontal margin structures (max-w-7xl mx-auto px-4 sm:px-6 lg:px-8)
 * and houses the centered analytical workbench layout.
 */

import React from 'react';
import { useSieveStore } from '../../state/useSieveStore.ts';
import { BrandHeader } from '../brand/BrandHeader.tsx';
import { FileDropzone } from '../dropzone/FileDropzone.tsx';
import { ThresholdControls } from '../sliders/ThresholdControls.tsx';
import { ExecutiveDashboard } from '../dashboard/ExecutiveDashboard.tsx';
import { KeywordVirtualGrid } from '../grid/KeywordVirtualGrid.tsx';

export interface AppShellProps {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  dashboard?: React.ReactNode;
  powerQueryDrawer?: React.ReactNode;
  className?: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  header = <BrandHeader />,
  footer = (
    <footer className="text-center py-4 text-xs text-zinc-500 font-mono">
      Sieve © 2026
    </footer>
  ),
  children,
  dashboard,
  powerQueryDrawer,
  className = '',
}) => {
  const fileLoaded = useSieveStore((s) => s.fileLoaded);

  return (
    <div
      data-testid="app-shell"
      className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200 antialiased"
    >
      {/* Top Application Header */}
      {header}

      {/* Centered Bilateral Workbench Container */}
      <main
        role="main"
        className={`flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 ${className}`}
      >
        {children ? (
          children
        ) : !fileLoaded ? (
          <section aria-label="File Ingestion">
            <FileDropzone />
          </section>
        ) : (
          <>
            <section aria-label="Threshold Controls">
              <ThresholdControls />
            </section>
            <section aria-label="Executive Analytics Dashboard" className="space-y-6">
              {dashboard ?? <ExecutiveDashboard />}
            </section>
            <section aria-label="Negative Keyword Rules" className="h-[550px] flex flex-col">
              <KeywordVirtualGrid />
            </section>
          </>
        )}
      </main>

      {/* Bilaterally Aligned Persistent Footer */}
      {footer}

      {/* Power Query Drawer Mount */}
      {powerQueryDrawer}
    </div>
  );
};

