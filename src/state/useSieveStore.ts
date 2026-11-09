/**
 * Sieve Reactive UI State Store (Zustand)
 * Manages keyword datasets, thresholds, and financial metrics in CurrencyMicros.
 */
import { create } from 'zustand';
import type { PersistedNegativeKeyword, FragmentedLongTailResult, MatchTypeDilutionResult } from '../workers/protocol.ts';
import { type SupportedCurrency, SUPPORTED_CURRENCIES, DEFAULT_CURRENCY, detectCurrencyFromData } from '../utils/currency.ts';
import type { CurrencyMicros, SearchTermRecord, SpendWaterfallSpectrum, ConvexReallocationYield, BidElasticitySpectrum, PlatformMatchType, ClickCount, ImpressionCount, QueryString } from '../domain/types/index.ts';
import { EconometricEngine } from '../domain/engines/econometric_engine.ts';

export type { SupportedCurrency, FragmentedLongTailResult, MatchTypeDilutionResult };
export { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY };

export interface SieveThresholds { confidenceScore?: number; maxMarginalWaste?: number; minClicks: number; targetCPA: number; minSpend?: number; minConfidence?: number; }
export interface KPISummary {
  totalKeywords: number; totalWaste: number; collisionCount: number; avgConfidence: number; exactLockedCount: number;
  totalWasteMicros?: CurrencyMicros; actionableWasteMicros?: CurrencyMicros; totalSpendMicros?: CurrencyMicros; securedSpendMicros?: CurrencyMicros;
  exploratorySpendMicros?: CurrencyMicros; filterMatchedVolumeMicros?: CurrencyMicros; protectedConversions?: number; highRiskClicks?: number;
  incrementalConversions?: number; projectedConversions?: number; roasLiftPercent?: number; annualizedRecoveryMicros?: CurrencyMicros;
  optimalBidCeilingMicros?: CurrencyMicros; wastePercentage?: number; processedRows?: number;
}
export interface SqlQueryResult { columns: string[]; rows: Array<Record<string, unknown>>; rowCount: number; executionTimeMs: number; query: string; }
export interface IngestedFileInfo { name: string; size: number; recordsCount?: number; }
export interface SieveMetricsMicros {
  totalSpendMicros: CurrencyMicros; wasteSpendMicros: CurrencyMicros; securedSpendMicros: CurrencyMicros; exploratorySpendMicros: CurrencyMicros;
  actionableWasteMicros: CurrencyMicros; filterMatchedVolumeMicros: CurrencyMicros; protectedConversions: number; highRiskClicks: number;
  incrementalConversions: number; projectedConversions: number; annualizedRecoveryMicros: CurrencyMicros; optimalBidCeilingMicros: CurrencyMicros;
  roasLiftPercent: number; wastePercentage: number; cpaDragMicros: CurrencyMicros; exactLockedCount: number;
}
export interface SieveState {
  keywords: PersistedNegativeKeyword[]; filteredKeywords: PersistedNegativeKeyword[]; records: PersistedNegativeKeyword[]; filteredRecords: PersistedNegativeKeyword[];
  thresholds: SieveThresholds; kpi: KPISummary; summary: KPISummary; currency: SupportedCurrency; isCurrencyManual: boolean;
  isIngesting: boolean; isLoading: boolean; ingestionProgress: number; ingestedFiles: IngestedFileInfo[]; selectedKeyword: PersistedNegativeKeyword | null;
  errorMessage: string | null; longTailResult: FragmentedLongTailResult | null; dilutionResult: MatchTypeDilutionResult | null;
  isAnalyticalDrawerOpen: boolean; activeAnalyticalTab: 'long-tail' | 'dilution'; isPowerQueryOpen: boolean; powerQuerySql: string;
  sqlQueryResult: SqlQueryResult | null; isQueryRunning: boolean; sqlQueryError: string | null; fileLoaded: boolean;
  setFileLoaded: (loaded: boolean) => void; setKeywords: (keywords: PersistedNegativeKeyword[]) => void; setRecords: (records: PersistedNegativeKeyword[]) => void;
  handleParseSuccess: (payload: { records: PersistedNegativeKeyword[]; summary?: Partial<KPISummary>; currency?: SupportedCurrency }) => void;
  onParseSuccess: (payload: { records: PersistedNegativeKeyword[]; summary?: Partial<KPISummary>; currency?: SupportedCurrency }) => void;
  clearDataset: () => void; updateThresholds: (partial: Partial<SieveThresholds>) => void; setCurrency: (currency: SupportedCurrency, isManual?: boolean) => void;
  autoDetectCurrency: (data: string | ArrayBuffer | Uint8Array) => SupportedCurrency | null; setIngesting: (isIngesting: boolean, progress?: number) => void;
  setIsLoading: (isLoading: boolean) => void; setErrorMessage: (msg: string | null) => void; addIngestedFiles: (files: File[]) => void;
  setSelectedKeyword: (kw: PersistedNegativeKeyword | null) => void; setLongTailResult: (res: FragmentedLongTailResult | null) => void; setDilutionResult: (res: MatchTypeDilutionResult | null) => void;
  setAnalyticalDrawerOpen: (isOpen: boolean, tab?: 'long-tail' | 'dilution') => void; setActiveAnalyticalTab: (tab: 'long-tail' | 'dilution') => void;
  setPowerQueryOpen: (isOpen: boolean) => void; setPowerQuerySql: (sql: string) => void; setSqlQueryResult: (result: SqlQueryResult | null) => void;
  setIsQueryRunning: (isRunning: boolean) => void; setSqlQueryError: (error: string | null) => void; resetPowerQuery: () => void; reset: () => void;
  getSummaryMetrics: () => SieveMetricsMicros; getSpendWaterfall: () => SpendWaterfallSpectrum; getReallocationYield: () => ConvexReallocationYield; getBidElasticitySpectrum: () => BidElasticitySpectrum;
}

export function toMicros(val: number | string | bigint | undefined | null): CurrencyMicros {
  if (val === undefined || val === null) return 0n as CurrencyMicros;
  if (typeof val === 'bigint') return val as CurrencyMicros;
  if (typeof val === 'number') return (!Number.isFinite(val) || val <= 0) ? (0n as CurrencyMicros) : (BigInt(Math.round(val * 1_000_000)) as CurrencyMicros);
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? (BigInt(Math.round(n * 1_000_000)) as CurrencyMicros) : (0n as CurrencyMicros);
}
export function fromMicros(micros: CurrencyMicros): number { return Number(micros) / 1_000_000; }

export function formatCurrencyMicros(micros: CurrencyMicros, currency: SupportedCurrency = '$', compact: boolean = false): string {
  const isNeg = micros < 0n; const abs = isNeg ? -micros : micros; const whole = abs / 1_000_000n; const frac = abs % 1_000_000n;
  if (compact && abs >= 1_000_000_000_000n) return `${isNeg ? '-' : ''}${currency}${(Number(abs) / 1_000_000_000_000).toFixed(1)}M`;
  const loc = currency === '¥' ? 'ja-JP' : (currency === '₹' ? 'en-IN' : (currency === '£' ? 'en-GB' : 'en-US'));
  if (currency === '¥') return `${isNeg ? '-' : ''}¥${Number(frac >= 500_000n ? whole + 1n : whole).toLocaleString(loc)}`;
  const cents = (frac + 5_000n) / 10_000n; let finalWhole = whole; let finalCents = cents;
  if (cents >= 100n) { finalWhole += 1n; finalCents = 0n; }
  return `${isNeg ? '-' : ''}${currency}${Number(finalWhole).toLocaleString(loc)}.${finalCents.toString().padStart(2, '0')}`;
}

export function calculateMarginalWaste(cost?: number, conversions?: number, targetCPA: number = 50, fallbackWaste: number = 0, currency?: SupportedCurrency): number {
  const c = typeof cost === 'number' && Number.isFinite(cost) ? Math.max(0, cost) : undefined;
  const cv = typeof conversions === 'number' && Number.isFinite(conversions) ? Math.max(0, conversions) : undefined;
  const t = typeof targetCPA === 'number' && Number.isFinite(targetCPA) ? Math.max(0, targetCPA) : 0;
  if (c !== undefined && cv !== undefined) return currency === '¥' ? Math.round(cv <= 0 ? c : Math.max(0, c - cv * t)) : Math.round((cv <= 0 ? c : Math.max(0, c - cv * t)) * 100) / 100;
  const safe = typeof fallbackWaste === 'number' && Number.isFinite(fallbackWaste) ? Math.max(0, fallbackWaste) : 0;
  return currency === '¥' ? Math.round(safe) : Math.round(safe * 100) / 100;
}

const econometricEngine = new EconometricEngine();

function deriveDomainMetrics(keywords: PersistedNegativeKeyword[], thresholds: SieveThresholds, currency: SupportedCurrency): { filtered: PersistedNegativeKeyword[]; kpi: KPISummary; metrics: SieveMetricsMicros } {
  const minConf = thresholds.confidenceScore ?? thresholds.minConfidence ?? 0.8;
  const maxWaste = thresholds.maxMarginalWaste ?? 100000;
  const targetCPA = thresholds.targetCPA ?? 50; const targetCpaMicros = toMicros(targetCPA);
  const filtered: PersistedNegativeKeyword[] = []; let totalConfidence = 0;
  for (let i = 0; i < keywords.length; i++) {
    const k = keywords[i];
    if (k.cost !== undefined && k.conversions !== undefined) k.marginalWaste = calculateMarginalWaste(k.cost, k.conversions, targetCPA, k.marginalWaste, currency);
    if ((k.confidenceScore ?? 0) >= minConf && (k.marginalWaste ?? 0) <= maxWaste) { filtered.push(k); totalConfidence += (k.confidenceScore ?? 0); }
  }
  const active = filtered.length > 0 ? filtered : keywords;
  const searchTerms: SearchTermRecord[] = active.map((k, idx) => {
    const q = (k.keyword || `term_${idx}`) as QueryString;
    const clicks = (k.clicks ?? 0) as ClickCount; const spendMicros = toMicros(k.cost !== undefined ? k.cost : (k.marginalWaste !== undefined ? k.marginalWaste : 0));
    return {
      id: k.id || k.sha256Hash || `kw_${idx}`, rawQuery: q, normalizedQuery: q.toLowerCase() as QueryString,
      campaignName: k.firstSeenCampaign || k.campaignId || 'campaign', adGroupName: k.adGroupId || 'adgroup',
      matchType: (k.matchType ? k.matchType.toUpperCase() as PlatformMatchType : 'BROAD'),
      clicks, impressions: 0 as ImpressionCount, conversions: k.conversions ?? 0, spendMicros, revenueMicros: 0n as CurrencyMicros,
      averageCpcMicros: clicks > 0 ? ((spendMicros / BigInt(clicks)) as CurrencyMicros) : (0n as CurrencyMicros), hasCollision: Boolean(k.hasCollision),
    };
  });
  const waterfall = econometricEngine.computeSpendWaterfall(searchTerms, targetCpaMicros);
  const baselineConvs = searchTerms.reduce((s, t) => s + (t.conversions || 0), 0);
  const yieldModel = econometricEngine.computeConvexReallocationYield(waterfall.wasteSpendMicros, waterfall.totalSpendMicros, baselineConvs > 0 ? baselineConvs : 100_000, targetCpaMicros, { gammaDamping: 0.75, annualizationMultiplier: 12 });
  const elasticity = econometricEngine.mapElasticitySpectrum(searchTerms, targetCpaMicros);
  let collisionCount = 0; let exactLockedCount = 0; let protectedConversions = 0;
  for (const k of active) {
    if (k.hasCollision) collisionCount++;
    if (k.matchType === 'exact') exactLockedCount++;
    if (k.hasCollision || (k.conversions && k.conversions > 0)) protectedConversions += (k.conversions || 0);
  }
  if (protectedConversions === 0 && collisionCount > 0) protectedConversions = collisionCount;
  const filterMatchedVolumeMicros = BigInt(keywords.filter((k) => (k.conversions ?? 0) <= 0).reduce((s, k) => s + Math.round((k.cost ?? k.marginalWaste ?? 0) * 1_000_000), 0)) as CurrencyMicros;
  const highRiskClicks = searchTerms.filter((t) => t.conversions <= 0 && t.clicks > 0 && t.spendMicros < targetCpaMicros).reduce((s, t) => s + t.clicks, 0);
  const wastePercentage = waterfall.totalSpendMicros > 0n ? Number((waterfall.wasteSpendMicros * 1000n) / waterfall.totalSpendMicros) / 10 : 0.0;
  const cpaDragMicros = baselineConvs > 0 ? ((waterfall.wasteSpendMicros / BigInt(baselineConvs)) as CurrencyMicros) : waterfall.wasteSpendMicros;
  const metrics: SieveMetricsMicros = {
    totalSpendMicros: waterfall.totalSpendMicros, wasteSpendMicros: waterfall.wasteSpendMicros, securedSpendMicros: waterfall.securedSpendMicros,
    exploratorySpendMicros: waterfall.exploratorySpendMicros, actionableWasteMicros: waterfall.wasteSpendMicros, filterMatchedVolumeMicros,
    protectedConversions, highRiskClicks, incrementalConversions: yieldModel.incrementalConversions ?? 0, projectedConversions: yieldModel.projectedConversions ?? 0,
    annualizedRecoveryMicros: yieldModel.annualizedRecoveryMicros ?? (0n as CurrencyMicros), optimalBidCeilingMicros: elasticity.optimalBidCeilingMicros,
    roasLiftPercent: Math.round(yieldModel.projectedRoasLift * 1000) / 10, wastePercentage, cpaDragMicros, exactLockedCount,
  };
  const rawWasteFloat = Number(waterfall.wasteSpendMicros) / 1_000_000;
  const roundedWaste = currency === '¥' ? Math.round(rawWasteFloat) : Math.round(rawWasteFloat * 100) / 100;
  const avgConfidence = filtered.length > 0 ? Math.round((totalConfidence / filtered.length) * 1000) / 1000 : 0;
  const kpi: KPISummary = {
    totalKeywords: filtered.length, totalWaste: Number.isFinite(roundedWaste) ? roundedWaste : 0, totalWasteMicros: waterfall.wasteSpendMicros,
    actionableWasteMicros: waterfall.wasteSpendMicros, totalSpendMicros: waterfall.totalSpendMicros, securedSpendMicros: waterfall.securedSpendMicros,
    exploratorySpendMicros: waterfall.exploratorySpendMicros, filterMatchedVolumeMicros, collisionCount, avgConfidence, exactLockedCount,
    protectedConversions, highRiskClicks, incrementalConversions: metrics.incrementalConversions, projectedConversions: metrics.projectedConversions,
    roasLiftPercent: metrics.roasLiftPercent, annualizedRecoveryMicros: metrics.annualizedRecoveryMicros, optimalBidCeilingMicros: metrics.optimalBidCeilingMicros, wastePercentage,
  };
  return { filtered, kpi, metrics };
}

const EMPTY_KPI: KPISummary = {
  totalKeywords: 0, totalWaste: 0, totalWasteMicros: 0n as CurrencyMicros, actionableWasteMicros: 0n as CurrencyMicros,
  totalSpendMicros: 0n as CurrencyMicros, securedSpendMicros: 0n as CurrencyMicros, exploratorySpendMicros: 0n as CurrencyMicros,
  filterMatchedVolumeMicros: 0n as CurrencyMicros, collisionCount: 0, avgConfidence: 0, exactLockedCount: 0, protectedConversions: 0,
  highRiskClicks: 0, incrementalConversions: 0, projectedConversions: 0, roasLiftPercent: 0, annualizedRecoveryMicros: 0n as CurrencyMicros,
  optimalBidCeilingMicros: 0n as CurrencyMicros, wastePercentage: 0,
};

export const useSieveStore = create<SieveState>((set, get) => ({
  keywords: [], filteredKeywords: [], records: [], filteredRecords: [], thresholds: { confidenceScore: 0.8, maxMarginalWaste: 100000, minClicks: 5, targetCPA: 50 },
  kpi: EMPTY_KPI, summary: EMPTY_KPI, currency: DEFAULT_CURRENCY, isCurrencyManual: false, isIngesting: false, isLoading: false, ingestionProgress: 0,
  ingestedFiles: [], selectedKeyword: null, errorMessage: null, longTailResult: null, dilutionResult: null, isAnalyticalDrawerOpen: false, activeAnalyticalTab: 'long-tail',
  isPowerQueryOpen: false, powerQuerySql: 'SELECT query, campaign, clicks, cost, conversions FROM search_terms ORDER BY cost DESC LIMIT 20;', sqlQueryResult: null,
  isQueryRunning: false, sqlQueryError: null, fileLoaded: false,
  setFileLoaded: (loaded) => set({ fileLoaded: loaded }),
  handleParseSuccess: (payload) => {
    const raw = payload.records || []; const cur = payload.currency || get().currency || DEFAULT_CURRENCY;
    const { filtered, kpi } = deriveDomainMetrics(raw, get().thresholds, cur);
    const finalKPI = payload.summary ? { ...kpi, ...payload.summary, totalWasteMicros: payload.summary.totalWaste !== undefined ? toMicros(payload.summary.totalWaste) : kpi.totalWasteMicros, actionableWasteMicros: payload.summary.totalWaste !== undefined ? toMicros(payload.summary.totalWaste) : kpi.actionableWasteMicros } : kpi;
    set({ records: raw, keywords: raw, filteredRecords: raw, filteredKeywords: raw, kpi: finalKPI, summary: finalKPI, currency: cur, fileLoaded: raw.length > 0, isLoading: false, isIngesting: false, errorMessage: null });
  },
  onParseSuccess: (p) => get().handleParseSuccess(p),
  clearDataset: () => set({ fileLoaded: false, records: [], keywords: [], filteredRecords: [], filteredKeywords: [], isLoading: false, isIngesting: false, kpi: { ...EMPTY_KPI }, summary: { ...EMPTY_KPI }, selectedKeyword: null, errorMessage: null, longTailResult: null, dilutionResult: null, ingestedFiles: [], sqlQueryResult: null, sqlQueryError: null, isQueryRunning: false }),
  setKeywords: (kw) => { const { filtered, kpi } = deriveDomainMetrics(kw, get().thresholds, get().currency); set({ records: kw, keywords: kw, filteredRecords: filtered, filteredKeywords: filtered, kpi, summary: kpi, fileLoaded: kw.length > 0, isLoading: false, isIngesting: false }); },
  setRecords: (r) => get().setKeywords(r),
  setIsLoading: (isLoading) => set({ isLoading, isIngesting: isLoading }),
  updateThresholds: (partial) => { const next = { ...get().thresholds, ...partial }; const source = get().records.length > 0 ? get().records : get().keywords; const { filtered, kpi } = deriveDomainMetrics(source, next, get().currency); set({ thresholds: next, filteredRecords: filtered, filteredKeywords: filtered, kpi, summary: kpi }); },
  setCurrency: (currency, isManual = true) => { const source = get().records.length > 0 ? get().records : get().keywords; const { filtered, kpi } = deriveDomainMetrics(source, get().thresholds, currency); set({ currency, isCurrencyManual: isManual, filteredRecords: filtered, filteredKeywords: filtered, kpi, summary: kpi }); },
  autoDetectCurrency: (d) => { if (get().isCurrencyManual) return get().currency; const det = detectCurrencyFromData(d); if (det) { get().setCurrency(det, false); return det; } return null; },
  setIngesting: (isIngesting, progress = 0) => set({ isIngesting, isLoading: isIngesting, ingestionProgress: progress }),
  setErrorMessage: (msg) => set({ errorMessage: msg, isIngesting: false, isLoading: false }),
  addIngestedFiles: (f) => set((s) => ({ ingestedFiles: [...s.ingestedFiles, ...f.map((x) => ({ name: x.name, size: x.size }))] })),
  setSelectedKeyword: (kw) => set({ selectedKeyword: kw }), setLongTailResult: (res) => set({ longTailResult: res }), setDilutionResult: (res) => set({ dilutionResult: res }),
  setAnalyticalDrawerOpen: (isOpen, tab) => set((s) => ({ isAnalyticalDrawerOpen: isOpen, activeAnalyticalTab: tab || s.activeAnalyticalTab })),
  setActiveAnalyticalTab: (tab) => set({ activeAnalyticalTab: tab }), setPowerQueryOpen: (isOpen) => set({ isPowerQueryOpen: isOpen }),
  setPowerQuerySql: (sql) => set({ powerQuerySql: sql }), setSqlQueryResult: (r) => set({ sqlQueryResult: r, sqlQueryError: null, isQueryRunning: false }),
  setIsQueryRunning: (r) => set({ isQueryRunning: r }), setSqlQueryError: (e) => set({ sqlQueryError: e, isQueryRunning: false }),
  resetPowerQuery: () => set({ sqlQueryResult: null, sqlQueryError: null, isQueryRunning: false }),
  reset: () => { get().clearDataset(); set({ thresholds: { confidenceScore: 0.8, maxMarginalWaste: 100000, minClicks: 5, targetCPA: 50 }, currency: DEFAULT_CURRENCY, isCurrencyManual: false, isAnalyticalDrawerOpen: false, activeAnalyticalTab: 'long-tail', isPowerQueryOpen: false }); },
  getSummaryMetrics: () => deriveDomainMetrics(get().records.length > 0 ? get().records : get().keywords, get().thresholds, get().currency).metrics,
  getSpendWaterfall: () => { const m = get().getSummaryMetrics(); return { totalSpendMicros: m.totalSpendMicros, wasteSpendMicros: m.wasteSpendMicros, securedSpendMicros: m.securedSpendMicros, exploratorySpendMicros: m.exploratorySpendMicros }; },
  getReallocationYield: () => { const m = get().getSummaryMetrics(); return econometricEngine.computeConvexReallocationYield(m.wasteSpendMicros, m.totalSpendMicros, 100_000, toMicros(get().thresholds.targetCPA ?? 50), { gammaDamping: 0.75, annualizationMultiplier: 12 }); },
  getBidElasticitySpectrum: () => {
    const active = get().records.length > 0 ? get().records : get().keywords;
    const terms: SearchTermRecord[] = active.map((k, i) => {
      const q = (k.keyword || `kw_${i}`) as QueryString;
      return { id: `kw_${i}`, rawQuery: q, normalizedQuery: q.toLowerCase() as QueryString, campaignName: 'c', adGroupName: 'a', matchType: 'BROAD', clicks: (k.clicks ?? 0) as ClickCount, impressions: 0 as ImpressionCount, conversions: (k.conversions ?? 0), spendMicros: toMicros(k.cost ?? k.marginalWaste ?? 0), revenueMicros: 0n as CurrencyMicros, averageCpcMicros: 0n as CurrencyMicros };
    });
    return econometricEngine.mapElasticitySpectrum(terms, toMicros(get().thresholds.targetCPA ?? 50));
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.data && typeof event.data === 'object') {
      if (event.data.type === 'PARSE_SUCCESS' && event.data.payload) useSieveStore.getState().handleParseSuccess(event.data.payload);
      else if (event.data.type === 'PARSE_ERROR') useSieveStore.getState().setErrorMessage(event.data.payload?.message || 'CSV parse error');
    }
  });
}
