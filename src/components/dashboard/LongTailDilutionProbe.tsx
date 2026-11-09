/**
 * Long-Tail & Match Dilution Diagnostic Probe Workbench Component
 * Dual-column balanced layout with Match Dilution Index table, reactive summary badges, search filtering, and Cooper's 5 States.
 */
import React, { useState, useMemo } from 'react';
import { Layers, GitBranch, ArrowRight, TrendingUp, Search, CheckCircle2 } from 'lucide-react';
import { useSieveStore, formatCurrencyMicros, toMicros } from '../../state/useSieveStore.ts';
import { MatchDilutionEngine } from '../../domain/engines/dilution_engine.ts';
import { NgramTokenizerEngine } from '../../domain/engines/tokenizer_engine.ts';
import { isSyntacticStopword } from '../../domain/engines/stopwords.ts';
import type { DilutionSummary, AggregatedTokenMetric, SearchTermRecord, QueryString, ClickCount, ImpressionCount, CurrencyMicros, PlatformMatchType } from '../../domain/types/index.ts';

export interface LongTailDilutionProbeProps {
  className?: string;
  onOpenDrawer?: (tab: 'long-tail' | 'dilution') => void;
}

export const LongTailDilutionProbe: React.FC<LongTailDilutionProbeProps> = ({ className = '', onOpenDrawer }) => {
  const store = useSieveStore();
  const { keywords, filteredKeywords, thresholds, currency, fileLoaded, isLoading, isIngesting, setAnalyticalDrawerOpen } = store;
  const storeDilution = (store as { dilutionSummary?: DilutionSummary | null }).dilutionSummary;
  const storeRoots = (store as { topBleedRoots?: readonly AggregatedTokenMetric[] | null }).topBleedRoots;
  const isPartialExplicit = Boolean((store as { isPartial?: boolean }).isPartial);

  const [filterQuery, setFilterQuery] = useState('');
  const activeKeywords = useMemo(() => (filteredKeywords.length > 0 ? filteredKeywords : keywords), [filteredKeywords, keywords]);

  const { dilutionSummary, topBleedRoots, totalLtWasteMicros, totalLtQueries, isPartialDetected } = useMemo(() => {
    let summary = storeDilution;
    let roots = storeRoots ?? [];
    let ltWaste = 0n as CurrencyMicros;
    let ltQueries = 0;
    const targetCpaMicros = toMicros(thresholds.targetCPA ?? 50);

    const searchTerms: SearchTermRecord[] = activeKeywords.map((k, idx) => {
      const q = (k.keyword || `term_${idx}`) as QueryString;
      const clicks = (k.clicks ?? 0) as ClickCount;
      const spendMicros = toMicros(k.cost !== undefined ? k.cost : (k.marginalWaste ?? 0));
      const isExact = k.matchType === 'exact' || (k.keyword.startsWith('[') && k.keyword.endsWith(']'));
      return {
        id: k.id || k.sha256Hash || `kw_${idx}`,
        rawQuery: q,
        normalizedQuery: q.toLowerCase().replace(/[\[\]]/g, '') as QueryString,
        campaignName: k.firstSeenCampaign || k.campaignId || 'campaign',
        adGroupName: k.adGroupId || 'adgroup',
        matchType: (isExact ? 'EXACT' : 'BROAD') as PlatformMatchType,
        clicks,
        impressions: 0 as unknown as ImpressionCount,
        conversions: k.conversions ?? 0,
        spendMicros,
        revenueMicros: 0n as CurrencyMicros,
        averageCpcMicros: clicks > 0 ? ((spendMicros / BigInt(Math.round(clicks))) as CurrencyMicros) : (0n as CurrencyMicros),
        hasCollision: Boolean(k.hasCollision),
      };
    });

    if (!summary) {
      summary = activeKeywords.length > 0 ? new MatchDilutionEngine().detectDilution(searchTerms) : {
        dilutionIndexPercent: 0, totalBudgetLostMicros: 0n as CurrencyMicros, dilutedQueryCount: 0, averageInflationRatio: 0, pairs: [], totalDilutedClicks: 0 as ClickCount,
      };
    }
    if (!storeRoots && activeKeywords.length > 0) {
      const bleedTerms = searchTerms.filter((t) => t.clicks <= 2);
      ltQueries = bleedTerms.length;
      for (const t of bleedTerms) {
        ltWaste = (ltWaste + (t.conversions <= 0 ? t.spendMicros : (t.spendMicros > targetCpaMicros ? t.spendMicros - targetCpaMicros : 0n))) as CurrencyMicros;
      }
      roots = new NgramTokenizerEngine().topBleedRoots(searchTerms, 10);
    } else if (storeRoots) {
      ltQueries = storeRoots.reduce((s, r) => s + r.occurrences, 0);
      ltWaste = storeRoots.reduce((s, r) => (s + r.totalSpendMicros) as CurrencyMicros, 0n as CurrencyMicros);
    }

    const filteredRoots = roots.filter((r) => !isSyntacticStopword(r.tokenText.toLowerCase().trim()) && (r.classification === 'COMMERCIAL' || r.classification === 'INFORMATIONAL' || r.classification === 'BRAND'));
    const adGroups = new Set(searchTerms.map((s) => s.adGroupName));
    const dilutedAdGroups = new Set(summary.pairs.map((p) => searchTerms.find((s) => s.rawQuery === p.broadQuery)?.adGroupName || 'default'));

    return {
      dilutionSummary: summary, topBleedRoots: filteredRoots, totalLtWasteMicros: ltWaste, totalLtQueries: ltQueries,
      isPartialDetected: isPartialExplicit || (summary.dilutedQueryCount > 0 && adGroups.size > 1 && dilutedAdGroups.size < adGroups.size),
    };
  }, [storeDilution, storeRoots, isPartialExplicit, activeKeywords, thresholds.targetCPA]);

  const isStateBlank = !fileLoaded && activeKeywords.length === 0 && !storeDilution;
  const isStateLoading = isLoading || isIngesting;
  const isStateEmpty = !isStateLoading && !isStateBlank && (dilutionSummary.dilutedQueryCount === 0 || dilutionSummary.totalBudgetLostMicros === 0n);

  const filteredPairs = useMemo(() => {
    if (!filterQuery.trim()) return dilutionSummary.pairs;
    const q = filterQuery.toLowerCase();
    return dilutionSummary.pairs.filter((p) => p.exactQuery.toLowerCase().includes(q) || p.broadQuery.toLowerCase().includes(q));
  }, [dilutionSummary.pairs, filterQuery]);

  const handleOpen = (tab: 'long-tail' | 'dilution') => (onOpenDrawer ? onOpenDrawer(tab) : setAnalyticalDrawerOpen(true, tab));

  return (
    <div data-testid="longtail-dilution-probe" className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
      {/* Slot 1: Fragmented Long-Tail Aggregator */}
      <div data-testid="longtail-aggregator-slot" className="flex flex-col justify-between p-4 sm:p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-rose-500/30 hover:bg-zinc-900/80 group">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400"><Layers className="w-4 h-4" /></div>
              <div><h3 className="text-xs font-semibold uppercase tracking-wider text-rose-400">Fragmented Long-Tail Aggregator</h3><p className="text-[11px] text-zinc-400">Collective waste across queries with &le; 2 clicks</p></div>
            </div>
            {!isStateBlank && !isStateLoading && (
              <span data-testid="longtail-query-badge" className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold tabular-nums bg-rose-500/10 text-rose-400 border border-rose-500/20">
                {totalLtQueries.toLocaleString()} queries
              </span>
            )}
          </div>
          {isStateLoading ? (<div className="space-y-3 py-4 animate-pulse"><div className="h-8 bg-zinc-800 rounded w-1/2" /><div className="h-4 bg-zinc-800/60 rounded w-3/4" /></div>) : isStateBlank ? (
            <div className="py-8 text-center text-xs text-zinc-500 font-sans">Upload Search Term CSV to inspect long-tail bleed and dilution.</div>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-2">
                <div><div className="text-2xl font-bold font-mono tabular-nums text-zinc-100">{formatCurrencyMicros(totalLtWasteMicros, currency)}</div><div className="text-[11px] font-mono tabular-nums text-rose-400/90 mt-0.5">{topBleedRoots.length} shared root tokens identified</div></div>
              </div>
              {topBleedRoots.length > 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-800/60">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium block mb-1.5">Top Root Bleed Tokens</span>
                  <div className="flex flex-wrap gap-1.5" data-testid="longtail-root-pills">
                    {topBleedRoots.slice(0, 5).map((rt) => (
                      <span key={rt.tokenText} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800/80 border border-zinc-700/60 text-zinc-200">
                        <span className="font-semibold text-rose-300">{rt.tokenText}</span>
                        <span className="text-[10px] text-zinc-500 font-normal">({formatCurrencyMicros(rt.totalSpendMicros, currency)})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <button type="button" data-testid="open-longtail-drawer-btn" onClick={() => handleOpen('long-tail')} disabled={isStateBlank || isStateLoading} className="mt-4 flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800/50 hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none text-zinc-200 border border-zinc-700/60 transition-all duration-150 ease-out active:scale-[0.99] group/btn">
          <span className="flex items-center gap-1.5"><span>Inspect Root Tokens</span><span className="text-zinc-500">({topBleedRoots.length})</span></span>
          <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover/btn:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Slot 2: Match-Type Dilution Index */}
      <div data-testid="match-dilution-slot" className="flex flex-col justify-between p-4 sm:p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-amber-500/30 hover:bg-zinc-900/80 group">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400"><GitBranch className="w-4 h-4" /></div>
              <div><h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">Match-Type Dilution Index</h3><p className="text-[11px] text-zinc-400">Budget lost when broad/phrase captures exact searches</p></div>
            </div>
            {!isStateBlank && !isStateLoading && !isStateEmpty && (
              <span data-testid="dilution-index-badge" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold tabular-nums bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <TrendingUp className="w-3 h-3" />{dilutionSummary.dilutionIndexPercent.toFixed(1)}% Dilution
              </span>
            )}
          </div>
          {isStateLoading ? (<div data-testid="probe-skeleton" className="space-y-3 py-4 animate-pulse"><div className="h-8 bg-zinc-800 rounded w-1/2" /><div className="h-4 bg-zinc-800/60 rounded w-3/4" /></div>) : isStateBlank ? (
            <div className="py-8 text-center text-xs text-zinc-500 font-sans">Upload Search Term CSV to inspect long-tail bleed and dilution.</div>
          ) : isStateEmpty ? (
            <div className="py-6 flex items-start gap-2.5 text-xs text-emerald-400/90 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Zero match dilution detected; broad and exact clearing CPCs are fully isolated.</span>
            </div>
          ) : (
            <>
              {/* Summary Badges Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60 mb-3 text-center">
                <div className="p-1"><span className="text-[9px] uppercase tracking-wider text-amber-400 font-semibold block">DILUTION INDEX</span><span className="text-xs font-bold font-mono tabular-nums text-amber-300">{dilutionSummary.dilutionIndexPercent.toFixed(1)}%</span></div>
                <div className="p-1"><span className="text-[9px] uppercase tracking-wider text-rose-400 font-semibold block">BUDGET LOST</span><span className="text-xs font-bold font-mono tabular-nums text-rose-400">{formatCurrencyMicros(dilutionSummary.totalBudgetLostMicros, currency)}</span></div>
                <div className="p-1"><span className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold block">DILUTED QUERIES</span><span className="text-xs font-bold font-mono tabular-nums text-zinc-200">{dilutionSummary.dilutedQueryCount}</span></div>
                <div className="p-1"><span className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold block">AVG CPC INFLATION</span><span className="text-xs font-bold font-mono tabular-nums text-rose-400">{dilutionSummary.averageInflationRatio.toFixed(2)}x</span></div>
              </div>

              {/* Search Filter Box */}
              <div className="relative mb-2.5">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <input type="text" placeholder="Filter queries..." value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50" />
              </div>

              {/* Diluted Query Table */}
              <div className="rounded-lg border border-zinc-800/80 overflow-hidden bg-zinc-950/40 text-[11px] font-mono">
                <div className="grid grid-cols-12 gap-1.5 px-2.5 py-1.5 bg-zinc-950 border-b border-zinc-800 text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">
                  <div className="col-span-4">Query</div><div className="col-span-2 text-center">Exact</div><div className="col-span-2 text-center">Broad</div><div className="col-span-2 text-center">Inflation</div><div className="col-span-2 text-right">Lost</div>
                </div>
                <div className="divide-y divide-zinc-800/40 max-h-32 overflow-y-auto">
                  {filteredPairs.map((pair) => (
                    <div key={pair.broadQuery + pair.exactQuery} className="grid grid-cols-12 gap-1.5 items-center px-2.5 py-1.5 hover:bg-zinc-850/40 transition-colors">
                      <div className="col-span-4 font-semibold text-zinc-200 truncate" title={pair.exactQuery}>{pair.exactQuery}</div>
                      <div className="col-span-2 text-center tabular-nums text-emerald-400">{formatCurrencyMicros(pair.exactCpcMicros, currency)}</div>
                      <div className="col-span-2 text-center tabular-nums text-amber-400">{formatCurrencyMicros(pair.broadCpcMicros, currency)}</div>
                      <div className="col-span-2 text-center tabular-nums text-rose-400 font-semibold">{pair.cpcInflationRatio.toFixed(2)}x</div>
                      <div className="col-span-2 text-right tabular-nums font-bold text-rose-400">-{formatCurrencyMicros(pair.budgetLostMicros, currency)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <button type="button" data-testid="open-dilution-drawer-btn" onClick={() => handleOpen('dilution')} disabled={isStateBlank || isStateLoading} className="mt-4 flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800/50 hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none text-zinc-200 border border-zinc-700/60 transition-all duration-150 ease-out active:scale-[0.99] group/btn">
          <span className="flex items-center gap-1.5"><span>Inspect Dilution Bleed</span><span className="text-zinc-500">({dilutionSummary.pairs.length})</span></span>
          <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover/btn:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};
