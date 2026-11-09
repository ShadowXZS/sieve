/**
 * Real-Time Threshold Recalculation Controls
 * Live non-blocking throttled slider controls for statistical confidence,
 * CPA drag targets, marginal waste boundaries, and click thresholds.
 */
import React, { useCallback, useRef, useState, useEffect } from 'react';
import { Sliders, Percent, Target, MousePointerClick } from 'lucide-react';
import { useSieveStore, type SieveThresholds } from '../../state/useSieveStore.ts';
import { formatCurrency } from '../../utils/currency.ts';
import type { SieveWorkerPool } from '../../workers/pool.ts';

export interface ThresholdControlsProps {
  workerPool?: SieveWorkerPool;
  className?: string;
}

export const ThresholdControls: React.FC<ThresholdControlsProps> = ({ workerPool, className = '' }) => {
  const { thresholds, updateThresholds, currency } = useSieveStore();

  const [localConfidence, setLocalConfidence] = useState<number>(() => thresholds.confidenceScore ?? 0.8);
  const [localWaste, setLocalWaste] = useState<number>(() => thresholds.maxMarginalWaste ?? 100000);
  const [localCPA, setLocalCPA] = useState<number>(() => thresholds.targetCPA ?? 50);
  const [localClicks, setLocalClicks] = useState<number>(() => thresholds.minClicks ?? 5);

  const pendingUpdates = useRef<Partial<SieveThresholds>>({});
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!debounceTimer.current) {
      setLocalConfidence(thresholds.confidenceScore ?? 0.8);
      setLocalWaste(thresholds.maxMarginalWaste ?? 100000);
      setLocalCPA(thresholds.targetCPA ?? 50);
      setLocalClicks(thresholds.minClicks ?? 5);
    }
  }, [thresholds.confidenceScore, thresholds.maxMarginalWaste, thresholds.targetCPA, thresholds.minClicks]);

  useEffect(() => () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  }, []);

  const dispatchWorkerRecalculation = useCallback((t: SieveThresholds) => {
    if (!workerPool) return;
    workerPool.execute({
      type: 'REFILTER_THRESHOLDS',
      requestId: `recalc_${Date.now()}`,
      minClicks: t.minClicks,
      confidenceThreshold: t.confidenceScore ?? t.minConfidence ?? 0.8,
      targetCPA: t.targetCPA,
    }).catch(() => {});
  }, [workerPool]);

  const scheduleDebouncedCommit = useCallback((updates: Partial<SieveThresholds>) => {
    Object.assign(pendingUpdates.current, updates);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      const batched = { ...pendingUpdates.current };
      pendingUpdates.current = {};
      updateThresholds(batched);
      const nextThresholds = { ...useSieveStore.getState().thresholds, ...batched };
      dispatchWorkerRecalculation(nextThresholds);
    }, 5);
  }, [updateThresholds, dispatchWorkerRecalculation]);

  const handleConfidenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLocalConfidence(val);
    scheduleDebouncedCommit({ confidenceScore: val });
  };
  const handleWasteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLocalWaste(val);
    scheduleDebouncedCommit({ maxMarginalWaste: val });
  };
  const handleTargetCPAChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLocalCPA(val);
    scheduleDebouncedCommit({ targetCPA: val });
  };
  const handleMinClicksChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setLocalClicks(val);
    scheduleDebouncedCommit({ minClicks: val });
  };

  return (
    <div
      data-testid="threshold-controls"
      className={`p-5 rounded-xl bg-zinc-900/70 border border-zinc-800 shadow-lg backdrop-blur-md transition-all duration-150 ease-out ${className}`}
      style={{ contain: 'content' }}
    >
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Threshold Controls</h3>
            <p className="text-[11px] text-zinc-400">Live WASM pointer re-evaluations under &lt; 10ms</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-zinc-950/40 border border-zinc-850/60 transition-all duration-150 ease-out hover:border-zinc-700/60">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="confidence-slider" className="flex items-center gap-1.5 font-medium text-zinc-300">
              <Percent className="w-3.5 h-3.5 text-indigo-400" />
              <span>Confidence Threshold</span>
            </label>
            <span className="font-mono tabular-nums text-indigo-400 font-semibold min-w-10 text-right">
              {Math.round(localConfidence * 100)}%
            </span>
          </div>
          <input
            id="confidence-slider"
            type="range"
            aria-label="Confidence Threshold"
            min="0.5"
            max="0.99"
            step="0.01"
            value={localConfidence}
            onChange={handleConfidenceChange}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 transition-all duration-150 ease-out"
          />
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono tabular-nums">
            <span>50% (Exploratory)</span>
            <span>99% (Strict)</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 p-3 rounded-lg bg-zinc-950/40 border border-zinc-850/60 transition-all duration-150 ease-out hover:border-zinc-700/60">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="waste-slider" className="flex items-center gap-1.5 font-medium text-zinc-300">
              <span className="w-3.5 h-3.5 flex items-center justify-center font-bold text-xs text-rose-400 font-mono select-none">
                {currency}
              </span>
              <span>Max Marginal Waste</span>
            </label>
            <span className="font-mono tabular-nums text-rose-400 font-semibold min-w-16 text-right">
              {formatCurrency(localWaste, currency, true)}
            </span>
          </div>
          <input
            id="waste-slider"
            type="range"
            aria-label="Max Marginal Waste"
            min="50"
            max="10000"
            step="50"
            value={localWaste}
            onChange={handleWasteChange}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-500 outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 transition-all duration-150 ease-out"
          />
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono tabular-nums">
            <span>{formatCurrency(50, currency, true)}</span>
            <span>{formatCurrency(10000, currency, true)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 p-3 rounded-lg bg-zinc-950/40 border border-zinc-850/60 transition-all duration-150 ease-out hover:border-zinc-700/60">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="cpa-slider" className="flex items-center gap-1.5 font-medium text-zinc-300">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              <span>Target Account CPA</span>
            </label>
            <span className="font-mono tabular-nums text-emerald-400 font-semibold min-w-10 text-right">
              {formatCurrency(localCPA, currency, true)}
            </span>
          </div>
          <input
            id="cpa-slider"
            type="range"
            aria-label="Target Account CPA"
            min="10"
            max="300"
            step="5"
            value={localCPA}
            onChange={handleTargetCPAChange}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 transition-all duration-150 ease-out"
          />
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono tabular-nums">
            <span>{formatCurrency(10, currency, true)}</span>
            <span>{formatCurrency(300, currency, true)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 p-3 rounded-lg bg-zinc-950/40 border border-zinc-850/60 transition-all duration-150 ease-out hover:border-zinc-700/60">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="clicks-slider" className="flex items-center gap-1.5 font-medium text-zinc-300">
              <MousePointerClick className="w-3.5 h-3.5 text-amber-400" />
              <span>Min Non-Converting Clicks</span>
            </label>
            <span className="font-mono tabular-nums text-amber-400 font-semibold min-w-16 text-right">
              {localClicks} clicks
            </span>
          </div>
          <input
            id="clicks-slider"
            type="range"
            aria-label="Min Non-Converting Clicks"
            min="1"
            max="50"
            step="1"
            value={localClicks}
            onChange={handleMinClicksChange}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500 outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 transition-all duration-150 ease-out"
          />
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono tabular-nums">
            <span>1</span>
            <span>50</span>
          </div>
        </div>
      </div>
    </div>
  );
};
