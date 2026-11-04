/**
 * Sieve Reactive UI State Store (Zustand)
 *
 * Provides real-time reactive state management for ingested keyword datasets,
 * dynamic threshold filters, KPI metrics, multi-currency support, and file ingestion tracking.
 * Optimized for sub-10ms state updates to maintain 60/120 FPS UI performance.
 */

import { create } from 'zustand';
import type {
  PersistedNegativeKeyword,
  FragmentedLongTailResult,
  MatchTypeDilutionResult,
} from '../workers/protocol.ts';
import {
  type SupportedCurrency,
  SUPPORTED_CURRENCIES,
  DEFAULT_CURRENCY,
  detectCurrencyFromData,
} from '../utils/currency.ts';

export type { SupportedCurrency, FragmentedLongTailResult, MatchTypeDilutionResult };
export { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY };

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

export interface SqlQueryResult {
  columns: string[];
  rows: Array<Record<string, any>>;
  rowCount: number;
  executionTimeMs: number;
  query: string;
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
  currency: SupportedCurrency;
  isCurrencyManual: boolean;
  isIngesting: boolean;
  ingestionProgress: number;
  ingestedFiles: IngestedFileInfo[];
  selectedKeyword: PersistedNegativeKeyword | null;
  errorMessage: string | null;
  longTailResult: FragmentedLongTailResult | null;
  dilutionResult: MatchTypeDilutionResult | null;
  isAnalyticalDrawerOpen: boolean;
  activeAnalyticalTab: 'long-tail' | 'dilution';
  isPowerQueryOpen: boolean;
  powerQuerySql: string;
  sqlQueryResult: SqlQueryResult | null;
  isQueryRunning: boolean;
  sqlQueryError: string | null;
  fileLoaded: boolean;

  // Actions
  setFileLoaded: (loaded: boolean) => void;
  setKeywords: (keywords: PersistedNegativeKeyword[]) => void;
  updateThresholds: (partial: Partial<SieveThresholds>) => void;
  setCurrency: (currency: SupportedCurrency, isManual?: boolean) => void;
  autoDetectCurrency: (data: string | ArrayBuffer | Uint8Array) => SupportedCurrency | null;
  setIngesting: (isIngesting: boolean, progress?: number) => void;
  setErrorMessage: (msg: string | null) => void;
  addIngestedFiles: (files: File[]) => void;
  setSelectedKeyword: (kw: PersistedNegativeKeyword | null) => void;
  setLongTailResult: (res: FragmentedLongTailResult | null) => void;
  setDilutionResult: (res: MatchTypeDilutionResult | null) => void;
  setAnalyticalDrawerOpen: (isOpen: boolean, tab?: 'long-tail' | 'dilution') => void;
  setActiveAnalyticalTab: (tab: 'long-tail' | 'dilution') => void;
  setPowerQueryOpen: (isOpen: boolean) => void;
  setPowerQuerySql: (sql: string) => void;
  setSqlQueryResult: (result: SqlQueryResult | null) => void;
  setIsQueryRunning: (isRunning: boolean) => void;
  setSqlQueryError: (error: string | null) => void;
  resetPowerQuery: () => void;
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
 * - Non-converting terms (Conversions <= 0): Marginal Waste = Total Spend.
 * - Converting terms (Conversions > 0): Marginal Waste = Math.max(0, Total Spend - (Conversions * Target CPA)).
 *
 * Mathematical Invariants:
 * - Sanitizes all inputs: Zero NaN, Zero Infinity, Zero negative numbers.
 * - Enforces zero-decimal rounding for JPY ('¥12,450'), standard 2-decimal formatting for others.
 */
export function calculateMarginalWaste(
  cost: number | undefined,
  conversions: number | undefined,
  targetCPA: number,
  fallbackWaste: number = 0,
  currency?: SupportedCurrency
): number {
  const safeCost = typeof cost === 'number' && Number.isFinite(cost) ? Math.max(0, cost) : undefined;
  const safeConversions =
    typeof conversions === 'number' && Number.isFinite(conversions) ? Math.max(0, conversions) : undefined;
  const safeTargetCPA =
    typeof targetCPA === 'number' && Number.isFinite(targetCPA) ? Math.max(0, targetCPA) : 0;

  if (safeCost !== undefined && safeConversions !== undefined) {
    let waste = 0;
    if (safeConversions <= 0) {
      waste = safeCost;
    } else {
      waste = Math.max(0, safeCost - safeConversions * safeTargetCPA);
    }
    return currency === '¥' ? Math.round(waste) : Math.round(waste * 100) / 100;
  }

  const safeFallback =
    typeof fallbackWaste === 'number' && Number.isFinite(fallbackWaste) ? Math.max(0, fallbackWaste) : 0;
  return currency === '¥' ? Math.round(safeFallback) : Math.round(safeFallback * 100) / 100;
}

function filterAndComputeKPI(
  keywords: PersistedNegativeKeyword[],
  thresholds: SieveThresholds,
  currency: SupportedCurrency = DEFAULT_CURRENCY
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
      k.marginalWaste = calculateMarginalWaste(k.cost, k.conversions, targetCPA, k.marginalWaste, currency);
    } else if (currency === '¥' && typeof k.marginalWaste === 'number') {
      k.marginalWaste = Math.round(k.marginalWaste);
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
  const roundedWaste = currency === '¥' ? Math.round(totalWaste) : Math.round(totalWaste * 100) / 100;

  const kpi: KPISummary = {
    totalKeywords: filteredLen,
    totalWaste: Number.isFinite(roundedWaste) ? roundedWaste : 0,
    collisionCount,
    avgConfidence:
      filteredLen > 0 && Number.isFinite(totalConfidence)
        ? Math.round((totalConfidence / filteredLen) * 1000) / 1000
        : 0,
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
  currency: DEFAULT_CURRENCY,
  isCurrencyManual: false,
  isIngesting: false,
  ingestionProgress: 0,
  ingestedFiles: [],
  selectedKeyword: null,
  errorMessage: null,
  longTailResult: null,
  dilutionResult: null,
  isAnalyticalDrawerOpen: false,
  activeAnalyticalTab: 'long-tail',
  isPowerQueryOpen: false,
  powerQuerySql: 'SELECT query, campaign, clicks, cost, conversions FROM search_terms ORDER BY cost DESC LIMIT 20;',
  sqlQueryResult: null,
  isQueryRunning: false,
  sqlQueryError: null,
  fileLoaded: false,

  setFileLoaded: (loaded: boolean) => {
    set({ fileLoaded: loaded });
  },

  setKeywords: (keywords: PersistedNegativeKeyword[]) => {
    const { thresholds, currency } = get();
    const { filtered, kpi } = filterAndComputeKPI(keywords, thresholds, currency);
    set({
      keywords,
      filteredKeywords: filtered,
      kpi,
      fileLoaded: keywords.length > 0,
    });
  },

  updateThresholds: (partial: Partial<SieveThresholds>) => {
    const nextThresholds = { ...get().thresholds, ...partial };
    const { keywords, currency } = get();
    const { filtered, kpi } = filterAndComputeKPI(keywords, nextThresholds, currency);
    set({
      thresholds: nextThresholds,
      filteredKeywords: filtered,
      kpi,
    });
  },

  setCurrency: (currency: SupportedCurrency, isManual: boolean = true) => {
    const { keywords, thresholds } = get();
    const { filtered, kpi } = filterAndComputeKPI(keywords, thresholds, currency);
    set({
      currency,
      isCurrencyManual: isManual,
      filteredKeywords: filtered,
      kpi,
    });
  },

  autoDetectCurrency: (data: string | ArrayBuffer | Uint8Array) => {
    if (get().isCurrencyManual) {
      return get().currency;
    }
    const detected = detectCurrencyFromData(data);
    if (detected) {
      get().setCurrency(detected, false);
      return detected;
    }
    return null;
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

  setLongTailResult: (res: FragmentedLongTailResult | null) => {
    set({ longTailResult: res });
  },

  setDilutionResult: (res: MatchTypeDilutionResult | null) => {
    set({ dilutionResult: res });
  },

  setAnalyticalDrawerOpen: (isOpen: boolean, tab?: 'long-tail' | 'dilution') => {
    set((state) => ({
      isAnalyticalDrawerOpen: isOpen,
      activeAnalyticalTab: tab || state.activeAnalyticalTab,
    }));
  },

  setActiveAnalyticalTab: (tab: 'long-tail' | 'dilution') => {
    set({ activeAnalyticalTab: tab });
  },

  setPowerQueryOpen: (isOpen: boolean) => {
    set({ isPowerQueryOpen: isOpen });
  },

  setPowerQuerySql: (sql: string) => {
    set({ powerQuerySql: sql });
  },

  setSqlQueryResult: (result: SqlQueryResult | null) => {
    set({ sqlQueryResult: result, sqlQueryError: null, isQueryRunning: false });
  },

  setIsQueryRunning: (isRunning: boolean) => {
    set({ isQueryRunning: isRunning });
  },

  setSqlQueryError: (error: string | null) => {
    set({ sqlQueryError: error, isQueryRunning: false });
  },

  resetPowerQuery: () => {
    set({
      sqlQueryResult: null,
      sqlQueryError: null,
      isQueryRunning: false,
    });
  },

  reset: () => {
    set({
      keywords: [],
      filteredKeywords: [],
      thresholds: { ...DEFAULT_THRESHOLDS },
      kpi: EMPTY_KPI,
      currency: DEFAULT_CURRENCY,
      isCurrencyManual: false,
      isIngesting: false,
      ingestionProgress: 0,
      ingestedFiles: [],
      selectedKeyword: null,
      errorMessage: null,
      longTailResult: null,
      dilutionResult: null,
      isAnalyticalDrawerOpen: false,
      activeAnalyticalTab: 'long-tail',
      isPowerQueryOpen: false,
      sqlQueryResult: null,
      isQueryRunning: false,
      sqlQueryError: null,
      fileLoaded: false,
    });
  },
}));
