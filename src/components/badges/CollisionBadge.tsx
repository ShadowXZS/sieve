/**
 * Collision Badge Component
 *
 * Visual indicator representing conflict-guarded negative keywords where exact-match
 * bracket forcing `[keyword]` was locked to protect converting queries.
 * Displays interactive hover tooltip detailing colliding safe terms.
 */

import React, { useState } from 'react';
import type { PersistedNegativeKeyword } from '../../workers/protocol.ts';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

export interface CollisionBadgeProps {
  keyword: PersistedNegativeKeyword;
  className?: string;
}

export const CollisionBadge: React.FC<CollisionBadgeProps> = ({ keyword, className = '' }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!keyword.hasCollision) {
    return (
      <span
        data-testid="safe-badge"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 transition-colors duration-150 ease-out ${className}`}
      >
        <ShieldCheck className="w-3 h-3 text-emerald-400" />
        Safe
      </span>
    );
  }

  const collidingTerms = keyword.collidingSafeTerms || [];

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
    >
      <button
        type="button"
        data-testid="collision-badge"
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/70 text-amber-300 border border-amber-600/60 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 cursor-help transition-all duration-150 ease-out hover:bg-amber-900/80 active:scale-95 ${className}`}
        aria-label="Collision Guard: Exact Match Locked"
      >
        <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span>Exact Match Locked</span>
      </button>

      {showTooltip && (
        <div
          role="tooltip"
          className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 text-xs rounded-lg shadow-xl bg-zinc-900 text-zinc-100 border border-zinc-700/80 pointer-events-none transition-all duration-150 ease-out backdrop-blur-md"
        >
          <div className="font-semibold text-amber-400 mb-1 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" />
            Impacted Converting Queries:
          </div>
          <p className="text-zinc-400 text-[11px] mb-2 leading-relaxed">
            Broad match would cannibalize high-converting search volume. Locked to exact brackets{' '}
            <code className="text-amber-300 font-mono">[{keyword.keyword}]</code>.
          </p>
          {collidingTerms.length > 0 ? (
            <ul className="space-y-1 max-h-36 overflow-y-auto pl-1">
              {collidingTerms.map((term, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-1.5 text-zinc-200 font-mono text-[11px] bg-zinc-950/80 px-2 py-1 rounded border border-zinc-800"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="truncate">{term}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-zinc-500 italic">Collision protection active</div>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-700" />
        </div>
      )}
    </div>
  );
};

