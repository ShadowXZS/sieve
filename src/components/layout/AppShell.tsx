/**
 * AppShell Layout Component (Layout Symmetry Mandate)
 *
 * Establishes bilateral visual symmetry across all major viewports.
 * Enforces standardized horizontal margin structures (max-w-7xl mx-auto px-4 sm:px-6 lg:px-8)
 * and houses the centered analytical workbench layout.
 */

import React from 'react';

export interface AppShellProps {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  header,
  footer = (
    <footer className="text-center py-4 text-xs text-zinc-500 font-mono">
      Sieve © 2026
    </footer>
  ),
  children,
  className = '',
}) => {
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
        {children}
      </main>

      {/* Bilaterally Aligned Persistent Footer */}
      {footer}
    </div>
  );
};

