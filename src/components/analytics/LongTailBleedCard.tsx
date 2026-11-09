/**
 * Long-Tail Bleed Diagnostic Card Component
 * Reactive binding to NgramTokenizerEngine topBleedRoots with Stopword Suppression & Cooper's 5 States.
 */
import React, { useMemo } from 'react';
import { Layers, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useSieveStore, formatCurrencyMicros, toMicros } from '../../state/useSieveStore.ts';
import { NgramTokenizerEngine } from '../../domain/engines/tokenizer_engine.ts';
import { isSyntacticStopword } from '../../domain/engines/stopwords.ts';
import type { AggregatedTokenMetric, SearchTermRecord, QueryString, ClickCount, CurrencyMicros, PlatformMatchType } from '../../domain/types/index.ts';

export interface LongTailBleedCardProps {
  className?: string;
  onOpenDrawer?: () => void;
}

export const LongTailBleedCard: React.FC<LongTailBleedCardProps> = ({ className = '', onOpenDrawer }) => {
  const store = useSieveStore();
  const { keywords, filteredKeywords, thresholds, currency, fileLoaded, isLoading, isIngesting, setAnalyticalDrawerOpen } = store;
  const storeRoots = (store as { topBleedRoots?: readonly AggregatedTokenMetric[] | null }).topBleedRoots;
  const isPartialExplicit = Boolean((store as { isPartial?: boolean }).isPartial);

  const activeKeywords = useMemo(() => (filteredKeywords.length > 0 ? filteredKeywords : keywords), [filteredKeywords, keywords]);

  const { topBleedRoots, totalQueries, totalWasteMicros, isPartialDetected } = useMemo(() => {
    let rawRoots: readonly AggregatedTokenMetric[] = storeRoots ?? [];
    let qCount = 0;
    let wasteMicros = 0n as CurrencyMicros;
    const targetCpaMicros = toMicros(thresholds.targetCPA ?? 50);

    if (!storeRoots && activeKeywords.length > 0) {
      const searchTerms: SearchTermRecord[] = activeKeywords.map((k, idx) => {
        const q = (k.keyword || `term_${idx}`) as QueryString;
        const clicks = (k.clicks ?? 0) as ClickCount;
        const spendMicros = toMicros(k.cost !== undefined ? k.cost : (k.marginalWaste ?? 0));
        return {
          id: k.id || k.sha256Hash || `kw_${idx}`,
          rawQuery: q,
          normalizedQuery: q.toLowerCase().replace(/[\[\]]/g, '') as QueryString,
          campaignName: k.firstSeenCampaign || k.campaignId || 'campaign',
          adGroupName: k.adGroupId || 'adgroup',
          matchType: (k.matchType ? (k.matchType.toUpperCase() as PlatformMatchType) : 'BROAD'),
          clicks,
          impressions: 0 as any,
          conversions: k.conversions ?? 0,
          spendMicros,
          revenueMicros: 0n as CurrencyMicros,
          averageCpcMicros: clicks > 0 ? ((spendMicros / BigInt(clicks)) as CurrencyMicros) : (0n as CurrencyMicros),
          hasCollision: Boolean(k.hasCollision),
        };
      });

      const bleedTerms = searchTerms.filter((t) => t.clicks <= 2);
      qCount = bleedTerms.length;
      for (const t of bleedTerms) {
        wasteMicros = (wasteMicros + (t.conversions <= 0 ? t.spendMicros : (t.spendMicros > targetCpaMicros ? t.spendMicros - targetCpaMicros : 0n))) as CurrencyMicros;
      }
      rawRoots = new NgramTokenizerEngine().topBleedRoots(searchTerms, 10);
    } else if (storeRoots) {
      qCount = storeRoots.reduce((s, r) => s + r.occurrences, 0);
      wasteMicros = storeRoots.reduce((s, r) => (s + r.totalSpendMicros) as CurrencyMicros, 0n as CurrencyMicros);
    }

    // STRICT STOPWORD SUPPRESSION: Only COMMERCIAL, INFORMATIONAL, or BRAND; never prepositions/articles/conjunctions
    const filteredRoots = rawRoots.filter((root) => {
      const token = root.tokenText.toLowerCase().trim();
      if (isSyntacticStopword(token)) return false;
      return root.classification === 'COMMERCIAL' || root.classification === 'INFORMATIONAL' || root.classification === 'BRAND';
    });

    return {
      topBleedRoots: filteredRoots,
      totalQueries: qCount,
      totalWasteMicros: wasteMicros,
      isPartialDetected: isPartialExplicit || (filteredRoots.length > 0 && activeKeywords.some((k) => (k.clicks ?? 0) > 2)),
    };
  }, [storeRoots, isPartialExplicit, activeKeywords, thresholds.targetCPA]);

  const isStateBlank = !fileLoaded && activeKeywords.length === 0 && !storeRoots?.length;
  const isStateLoading = isLoading || isIngesting;
  const isStateEmpty = !isStateLoading && !isStateBlank && topBleedRoots.length === 0;

  const handleOpen = () => (onOpenDrawer ? onOpenDrawer() : setAnalyticalDrawerOpen(true, 'long-tail'));

  return (
    <div
      data-testid="long-tail-bleed-card"
      className={`h-full flex flex-col justify-between p-4 sm:p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-rose-500/30 hover:bg-zinc-900/80 group ${className}`}
    >
      <div>
        <div className="flex items-center justify-between text-zinc-400 mb-2.5 pb-2.5 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-rose-400 group-hover:text-rose-300 transition-colors">
              Long-Tail Bleed
            </span>
          </div>
          {isPartialDetected && !isStateLoading && !isStateBlank && (
            <span data-testid="longtail-partial-badge" className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Partial: Ad group subset
            </span>
          )}
          {!isStateBlank && !isStateLoading && !isStateEmpty && (
            <span data-testid="long-tail-query-badge" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              {totalQueries.toLocaleString()} queries (&le;2 clicks)
            </span>
          )}
        </div>

        {isStateLoading ? (
          <div data-testid="longtail-skeleton" className="space-y-3 py-4 animate-pulse">
            <div className="h-8 bg-zinc-800 rounded w-1/2" />
            <div className="h-4 bg-zinc-800/60 rounded w-3/4" />
            <div className="h-6 bg-zinc-800/40 rounded w-full" />
          </div>
        ) : isStateBlank ? (
          <div className="py-8 text-center text-xs text-zinc-500 font-sans">
            Upload Search Term CSV to inspect long-tail bleed and dilution.
          </div>
        ) : isStateEmpty ? (
          <div className="py-6 flex items-start gap-2.5 text-xs text-emerald-400/90 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>Zero long-tail bleed detected; search queries are fully consolidated.</span>
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold font-mono tabular-nums text-zinc-100 mb-1">
              {formatCurrencyMicros(totalWasteMicros, currency)}
            </div>
            <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-rose-400 mb-3">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span>{topBleedRoots.length} shared root tokens causing waste</span>
            </div>

            {topBleedRoots.length > 0 && (
              <div className="mt-2 pt-2 border-t border-zinc-800/60">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1.5">Top Bleed Roots</div>
                <div className="flex flex-wrap gap-1.5" data-testid="long-tail-roots-pills">
                  {topBleedRoots.slice(0, 4).map((root) => (
                    <span
                      key={root.tokenText}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800/80 border border-zinc-700/60 text-zinc-200"
                      title={`${root.occurrences} queries, ${formatCurrencyMicros(root.totalSpendMicros, currency)} spend`}
                    >
                      <span className="font-semibold text-rose-300">{root.tokenText}</span>
                      <span className="text-[10px] text-zinc-500 font-normal">({formatCurrencyMicros(root.totalSpendMicros, currency)})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={handleOpen}
        disabled={isStateBlank || isStateLoading}
        data-testid="open-long-tail-details-btn"
        className="mt-4 flex items-center justify-between w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/60 hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none text-zinc-200 border border-zinc-700/60 transition-all duration-150 ease-out active:scale-[0.99] group/btn"
      >
        <span className="flex items-center gap-1.5">
          <span>Inspect Root Tokens</span>
          <span className="text-zinc-500">({topBleedRoots.length})</span>
        </span>
        <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover/btn:translate-x-0.5 transition-transform" />
      </button>
    </div>
  );
};
