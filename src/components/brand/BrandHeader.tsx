/**
 * BrandHeader Component
 *
 * Implements bilateral header symmetry with brand prominence on the left,
 * multi-currency manual override toggle, and system telemetry/status actions
 * on the right with 150ms spring transitions.
 */

import React from 'react';
import { SieveLogo } from './SieveLogo.tsx';
import { CurrencySelector } from './CurrencySelector.tsx';
import { Cpu, Database, ShieldCheck, Terminal, RotateCcw } from 'lucide-react';
import { useSieveStore } from '../../state/useSieveStore.ts';

export interface BrandHeaderProps {
  workerConcurrency?: number;
  onOpenPrivacyModal?: () => void;
  onOpenPowerQuery?: () => void;
  onClearDataset?: () => void;
  zeroLeakAttested?: boolean;
  className?: string;
}

export const BrandHeader: React.FC<BrandHeaderProps> = ({
  workerConcurrency = 4,
  onOpenPrivacyModal,
  onOpenPowerQuery,
  onClearDataset,
  zeroLeakAttested = true,
  className = '',
}) => {
  const fileLoaded = useSieveStore((s) => s.fileLoaded);
  const setPowerQueryOpen = useSieveStore((s) => s.setPowerQueryOpen);
  const handlePowerQueryClick = onOpenPowerQuery || (() => setPowerQueryOpen(true));

  return (
    <header
      role="banner"
      data-testid="brand-header"
      className={`h-16 border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-40 transition-colors duration-150 ${className}`}
    >
      {/* Brand (Left Anchor) */}
      <div className="flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center p-2 shadow-sm shadow-emerald-500/10 group cursor-pointer hover:border-emerald-500/40 transition-all duration-150 ease-out active:scale-95">
          <SieveLogo
            size="md"
            alt="Sieve Brand Logo"
            data-testid="header-sieve-logo"
            className="group-hover:scale-105"
          />
        </div>
        <div>
          <span className="font-black tracking-wider text-zinc-100 text-2xl leading-none block">
            SIEVE
          </span>
          <p className="hidden xs:block text-[11px] text-zinc-400 font-mono tracking-tight mt-0.5">
            Negative Exclusion Engine
          </p>
        </div>
      </div>

      {/* Badges & Actions (Right Anchor) */}
      <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
        {/* Multi-Currency Manual Override Toggle */}
        <CurrencySelector />

        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-400">
          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
          <span>Workers: {workerConcurrency} threads</span>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-400">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>Dexie Tier</span>
        </div>

        {/* DuckDB Power Query Trigger */}
        <button
          type="button"
          data-testid="header-power-query-btn"
          onClick={handlePowerQueryClick}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-950/80 hover:bg-zinc-850 text-zinc-300 hover:text-emerald-300 border border-zinc-800 hover:border-zinc-700 transition-all duration-150 ease-out active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 shadow-sm"
          title="Open DuckDB Power Query Drawer"
        >
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Power Query</span>
          <span className="px-1 py-0.2 rounded text-[10px] font-mono bg-zinc-800 text-emerald-400 border border-zinc-700">SQL</span>
        </button>

        {onOpenPrivacyModal && (
          <button
            type="button"
            data-testid="header-zero-leak-badge"
            onClick={onOpenPrivacyModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-800/50 transition-all duration-150 ease-out active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 shadow-sm"
            title="Local Cryptographic Zero-Leak Attestation: 0 Bytes Egress"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Zero-Leak Attestation</span>
            <span className="px-1 py-0.2 rounded text-[10px] font-mono bg-emerald-900/60 text-emerald-300 border border-emerald-700/60">0 B</span>
          </button>
        )}

        {fileLoaded && onClearDataset && (
          <button
            type="button"
            data-testid="header-clear-dataset-btn"
            onClick={onClearDataset}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-800/50 transition-all duration-150 ease-out active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 shadow-sm"
            title="Clear current dataset and reset store"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Clear Dataset</span>
          </button>
        )}

        {/* GitHub Repository Link */}
        <a
          href="https://github.com/ShadowXZS/sieve"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="header-github-link"
          aria-label="GitHub Repository (ShadowXZS/sieve)"
          className="flex items-center justify-center p-2 rounded-lg text-zinc-400 hover:text-zinc-100 bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all duration-150 ease-out active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shadow-sm"
          title="GitHub Repository: https://github.com/ShadowXZS/sieve"
        >
          <svg
            className="w-4 h-4 fill-current"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            />
          </svg>
        </a>
      </div>
    </header>
  );
};
