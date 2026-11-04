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
import { Cpu, Database, ShieldCheck } from 'lucide-react';

export interface BrandHeaderProps {
  workerConcurrency?: number;
  onOpenPrivacyModal?: () => void;
  className?: string;
}

export const BrandHeader: React.FC<BrandHeaderProps> = ({
  workerConcurrency = 4,
  onOpenPrivacyModal,
  className = '',
}) => {

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

        {onOpenPrivacyModal && (
          <button
            type="button"
            onClick={onOpenPrivacyModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-800/50 transition-all duration-150 ease-out active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 shadow-sm"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Zero-Telemetry Audit</span>
            <span className="sm:hidden">Audit</span>
          </button>
        )}
      </div>
    </header>
  );
};
