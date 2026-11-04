/**
 * Sieve Reactive UI State Store (Zustand)
 *
 * Provides real-time reactive state management for ingested keyword datasets,
 * dynamic threshold filters, KPI metrics, and file ingestion tracking.
 * Optimized for sub-10ms state updates to maintain 60/120 FPS UI performance.
 */

import { create } from 'zustand';
import type { PersistedNegativeKeyword } from '../workers/protocol.ts';

export interface SieveThresholds {
  confidenceScore: number;
  maxMarginalWaste: number;
  minClicks: number;
  targetCPA: number;
}

export interface KPISummary {
  totalKeywords: number;
  totalWaste: number;
  collisionCount: number;
  avgConfidence: number;
  exactLockedCount: number;
}

export interface IngestedFileInfo {
  name: string;
  size: number;
  recordsCount?: number;
}

export interface SieveState {
  keywords: PersistedNegativeKeyword[];
  filteredKeywords: PersistedNegativeKeyword[];
  thresholds: SieveThresholds;
  kpi: KPISummary;
  isIngesting: boolean;
  ingestionProgress: number;
  ingestedFiles: IngestedFileInfo[];
  selectedKeyword: PersistedNegativeKeyword | null;
  errorMessage: string | null;

  // Actions
  setKeywords: (keywords: PersistedNegativeKeyword[]) => void;
  updateThresholds: (partial: Partial<SieveThresholds>) => void;
  setIngesting: (isIngesting: boolean, progress?: number) => void;
  setErrorMessage: (msg: string | null) => void;
  addIngestedFiles: (files: File[]) => void;
  setSelectedKeyword: (kw: PersistedNegativeKeyword | null) => void;
  reset: () => void;
}

const DEFAULT_THRESHOLDS: SieveThresholds = {
  confidenceScore: 0.8,
  maxMarginalWaste: 100000,
  minClicks: 5,
  targetCPA: 50,
};

/**
 * Strict Marginal Waste Definition:
 * - Non-converting terms (Conversions == 0): Marginal Waste = Total Spend.
 * - Converting terms (Conversions > 0): Marginal Waste = Math.max(0, Total Spend - (Conversions * Target CPA)).
 */
export function calculateMarginalWaste(
  cost: number | undefined,
  conversions: number | undefined,
  targetCPA: number,
  fallbackWaste: number = 0
): number {
  if (cost !== undefined && conversions !== undefined) {
    if (conversions <= 0) {
      return Math.round(cost * 100) / 100;
    }
    return Math.max(0, Math.round((cost - conversions * targetCPA) * 100) / 100);
  }
  return fallbackWaste;
}

function filterAndComputeKPI(
  keywords: PersistedNegativeKeyword[],
  thresholds: SieveThresholds
): { filtered: PersistedNegativeKeyword[]; kpi: KPISummary } {
  const minConfidence = thresholds.confidenceScore;
  const maxWaste = thresholds.maxMarginalWaste;
  const targetCPA = thresholds.targetCPA;
  const filtered: PersistedNegativeKeyword[] = [];
  const len = keywords.length;

  let totalWaste = 0;
  let totalConfidence = 0;
  let collisionCount = 0;
  let exactLockedCount = 0;

  for (let i = 0; i < len; i++) {
    const k = keywords[i];
    if (k.cost !== undefined && k.conversions !== undefined) {
      k.marginalWaste = calculateMarginalWaste(k.cost, k.conversions, targetCPA, k.marginalWaste);
    }
    if (k.confidenceScore >= minConfidence && k.marginalWaste <= maxWaste) {
      filtered.push(k);
      totalWaste += k.marginalWaste || 0;
      totalConfidence += k.confidenceScore || 0;
      if (k.hasCollision) collisionCount++;
      if (k.matchType === 'exact') exactLockedCount++;
    }
  }

  const filteredLen = filtered.length;
  const kpi: KPISummary = {
    totalKeywords: filteredLen,
    totalWaste: Math.round(totalWaste * 100) / 100,
    collisionCount,
    avgConfidence: filteredLen > 0 ? Math.round((totalConfidence / filteredLen) * 1000) / 1000 : 0,
    exactLockedCount,
  };

  return { filtered, kpi };
}

const EMPTY_KPI: KPISummary = {
  totalKeywords: 0,
  totalWaste: 0,
  collisionCount: 0,
  avgConfidence: 0,
  exactLockedCount: 0,
};

export const useSieveStore = create<SieveState>((set, get) => ({
  keywords: [],
  filteredKeywords: [],
  thresholds: { ...DEFAULT_THRESHOLDS },
  kpi: EMPTY_KPI,
  isIngesting: false,
  ingestionProgress: 0,
  ingestedFiles: [],
  selectedKeyword: null,
  errorMessage: null,

  setKeywords: (keywords: PersistedNegativeKeyword[]) => {
    const thresholds = get().thresholds;
    const { filtered, kpi } = filterAndComputeKPI(keywords, thresholds);
    set({
      keywords,
      filteredKeywords: filtered,
      kpi,
    });
  },

  updateThresholds: (partial: Partial<SieveThresholds>) => {
    const nextThresholds = { ...get().thresholds, ...partial };
    const all = get().keywords;
    const { filtered, kpi } = filterAndComputeKPI(all, nextThresholds);
    set({
      thresholds: nextThresholds,
      filteredKeywords: filtered,
      kpi,
    });
  },

  setIngesting: (isIngesting: boolean, progress: number = 0) => {
    set({ isIngesting, ingestionProgress: progress });
  },

  setErrorMessage: (msg: string | null) => {
    set({ errorMessage: msg, isIngesting: false });
  },

  addIngestedFiles: (files: File[]) => {
    const nextFiles: IngestedFileInfo[] = files.map((f) => ({
      name: f.name,
      size: f.size,
    }));
    set((state) => ({
      ingestedFiles: [...state.ingestedFiles, ...nextFiles],
    }));
  },

  setSelectedKeyword: (kw: PersistedNegativeKeyword | null) => {
    set({ selectedKeyword: kw });
  },

  reset: () => {
    set({
      keywords: [],
      filteredKeywords: [],
      thresholds: { ...DEFAULT_THRESHOLDS },
      kpi: EMPTY_KPI,
      isIngesting: false,
      ingestionProgress: 0,
      ingestedFiles: [],
      selectedKeyword: null,
      errorMessage: null,
    });
  },
}));
