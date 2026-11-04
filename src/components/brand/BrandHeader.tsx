/**
 * BrandHeader Component (Phase 7 - Brand Symmetry)
 *
 * Implements a balanced 3-part layout (Brand | Context | Badges & Actions)
 * adhering to bilateral symmetry with 150ms spring micro-interactions.
 */

import React from 'react';
import { SieveLogo } from './SieveLogo.tsx';
import { Cpu, Database, Sparkles } from 'lucide-react';

export interface BrandHeaderProps {
  workerConcurrency?: number;
  onLoadDemo?: () => void;
  className?: string;
}

export const BrandHeader: React.FC<BrandHeaderProps> = ({
  workerConcurrency = 4,
  onLoadDemo,
  className = '',
}) => {
  return (
    <header
      role="banner"
      data-testid="brand-header"
      className={`h-16 border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-40 transition-colors duration-150 ${className}`}
    >
      {/* Part 1: Brand (Left Anchor) */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center p-1.5 shadow-sm shadow-emerald-500/10 group cursor-pointer hover:border-emerald-500/40 transition-all duration-150 ease-out active:scale-95">
          <SieveLogo
            size="md"
            alt="Sieve Brand Logo"
            data-testid="header-sieve-logo"
            className="group-hover:scale-105"
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold tracking-tight text-zinc-100 text-sm">SIEVE</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
              Phase 7
            </span>
          </div>
          <p className="hidden xs:block text-[10px] text-zinc-400 font-mono">
            Negative Exclusion Engine
          </p>
        </div>
      </div>

      {/* Part 2: Context (Center Anchor) */}
      <div className="hidden md:flex flex-col items-center text-center">
        <div className="text-xs font-medium text-zinc-300 tracking-wide flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>WASM Analytical Pipeline</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">
          Zero-Copy Linear Memory • Bayesian Posteriori
        </span>
      </div>

      {/* Part 3: Badges & Actions (Right Anchor) */}
      <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-400">
          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
          <span>Workers: {workerConcurrency} threads</span>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-400">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>Dexie Tier</span>
        </div>

        {onLoadDemo && (
          <button
            type="button"
            onClick={onLoadDemo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all duration-150 ease-out active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Load 10k Demo</span>
            <span className="sm:hidden">10k Demo</span>
          </button>
        )}
      </div>
    </header>
  );
};
