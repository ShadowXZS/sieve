/**
 * Summary KPI Dashboard Component
 *
 * Displays top-level financial, statistical, and safety metrics derived from
 * the Sieve WebAssembly aggregation and Bayesian scoring pipeline.
 */

import React from 'react';
import { DollarSign, ShieldAlert, Sparkles, Filter } from 'lucide-react';
import { useSieveStore } from '../../state/useSieveStore.ts';

export interface SummaryDashboardProps {
  className?: string;
}

export const SummaryDashboard: React.FC<SummaryDashboardProps> = ({ className = '' }) => {
  const { kpi } = useSieveStore();

  const formattedWaste = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(kpi.totalWaste);

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {/* Waste Salvaged */}
      <div className="flex flex-col p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm">
        <div className="flex items-center justify-between text-zinc-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Identified Waste</span>
          <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold font-mono text-zinc-100 mb-1">{formattedWaste}</div>
        <div className="text-[11px] text-zinc-500">
          Marginal CPA drag across non-converting tokens
        </div>
      </div>

      {/* Negative Candidates */}
      <div className="flex flex-col p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm">
        <div className="flex items-center justify-between text-zinc-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Negative Candidates</span>
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Filter className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold font-mono text-zinc-100 mb-1">
          {kpi.totalKeywords.toLocaleString()}
        </div>
        <div className="text-[11px] text-zinc-500">Qualified exclusion rules meeting thresholds</div>
      </div>

      {/* Collision Guards */}
      <div className="flex flex-col p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm">
        <div className="flex items-center justify-between text-zinc-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Exact Locked</span>
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
            <ShieldAlert className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold font-mono text-amber-400 mb-1">
          {kpi.collisionCount.toLocaleString()}
        </div>
        <div className="text-[11px] text-zinc-500">
          Inverted safe-list overrides protecting conversions
        </div>
      </div>

      {/* Mean Confidence */}
      <div className="flex flex-col p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm">
        <div className="flex items-center justify-between text-zinc-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Mean Confidence</span>
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold font-mono text-indigo-400 mb-1">
          {(kpi.avgConfidence * 100).toFixed(1)}%
        </div>
        <div className="text-[11px] text-zinc-500">Beta posterior and Wilson score certainty</div>
      </div>
    </div>
  );
};

