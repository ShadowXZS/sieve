/**
 * Match-Type Dilution Audit Card Component
 * Reactive binding to DilutionSummary with Cooper's 5 UI States & zero-drift micros.
 */
import React, { useMemo } from 'react';
import { GitBranch, ArrowRight, TrendingUp, CheckCircle2 } from 'lucide-react';
import { useSieveStore, formatCurrencyMicros, toMicros } from '../../state/useSieveStore.ts';
import { MatchDilutionEngine } from '../../domain/engines/dilution_engine.ts';
import type { DilutionSummary, SearchTermRecord, QueryString, ClickCount, ImpressionCount, CurrencyMicros, PlatformMatchType } from '../../domain/types/index.ts';

export interface DilutionAuditCardProps {
  className?: string;
  onOpenDrawer?: () => void;
}

export const DilutionAuditCard: React.FC<DilutionAuditCardProps> = ({ className = '', onOpenDrawer }) => {
  const store = useSieveStore();
  const { keywords, filteredKeywords, currency, fileLoaded, isLoading, isIngesting, setAnalyticalDrawerOpen } = store;
  const storeDilution = (store as { dilutionSummary?: DilutionSummary | null }).dilutionSummary;
  const isPartialExplicit = Boolean((store as { isPartial?: boolean }).isPartial);

  const activeKeywords = useMemo(() => (filteredKeywords.length > 0 ? filteredKeywords : keywords), [filteredKeywords, keywords]);

  const { dilutionSummary, isPartialDetected } = useMemo(() => {
    if (storeDilution) return { dilutionSummary: storeDilution, isPartialDetected: isPartialExplicit };
    if (activeKeywords.length === 0) {
      return {
        dilutionSummary: {
          dilutionIndexPercent: 0,
          totalBudgetLostMicros: 0n as CurrencyMicros,
          dilutedQueryCount: 0,
          averageInflationRatio: 0,
          pairs: [],
          totalDilutedClicks: 0 as ClickCount,
          totalDilutedSpendMicros: 0n as CurrencyMicros,
        },
        isPartialDetected: false,
      };
    }
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
        averageCpcMicros: clicks > 0 ? ((spendMicros / BigInt(clicks)) as CurrencyMicros) : (0n as CurrencyMicros),
        hasCollision: Boolean(k.hasCollision),
      };
    });
    const summary = new MatchDilutionEngine().detectDilution(searchTerms);
    const adGroups = new Set(searchTerms.map((s) => s.adGroupName));
    const dilutedAdGroups = new Set(summary.pairs.map((p) => searchTerms.find((s) => s.rawQuery === p.broadQuery)?.adGroupName || 'default'));
    return { dilutionSummary: summary, isPartialDetected: isPartialExplicit || (summary.dilutedQueryCount > 0 && adGroups.size > 1 && dilutedAdGroups.size < adGroups.size) };
  }, [storeDilution, isPartialExplicit, activeKeywords]);

  const isStateBlank = !fileLoaded && activeKeywords.length === 0 && !storeDilution;
  const isStateLoading = isLoading || isIngesting;
  const isStateEmpty = !isStateLoading && !isStateBlank && (dilutionSummary.dilutedQueryCount === 0 || dilutionSummary.totalBudgetLostMicros === 0n);

  const handleOpen = () => (onOpenDrawer ? onOpenDrawer() : setAnalyticalDrawerOpen(true, 'dilution'));
  const hijackedClicks = dilutionSummary.totalDilutedClicks ?? dilutionSummary.pairs.reduce((sum, p) => sum + p.hijackedClicks, 0);

  return (
    <div
      data-testid="dilution-audit-card"
      className={`h-full flex flex-col justify-between p-4 sm:p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-sm transition-all duration-150 ease-out hover:border-amber-500/30 hover:bg-zinc-900/80 group ${className}`}
    >
      <div>
        <div className="flex items-center justify-between text-zinc-400 mb-2.5 pb-2.5 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <GitBranch className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-amber-400 group-hover:text-amber-300 transition-colors">
              Match Dilution Audit
            </span>
          </div>
          {isPartialDetected && !isStateLoading && !isStateBlank && (
            <span data-testid="dilution-partial-badge" className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Partial: Ad group subset
            </span>
          )}
          {!isStateBlank && !isStateLoading && !isStateEmpty && (
            <span data-testid="dilution-pct-badge" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <TrendingUp className="w-2.5 h-2.5" />
              {dilutionSummary.dilutionIndexPercent.toFixed(1)}% Dilution
            </span>
          )}
        </div>

        {isStateLoading ? (
          <div data-testid="dilution-skeleton" className="space-y-3 py-4 animate-pulse">
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
            <span>Zero match dilution detected; broad and exact clearing CPCs are fully isolated.</span>
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold font-mono tabular-nums text-amber-400 mb-1">
              {formatCurrencyMicros(dilutionSummary.totalBudgetLostMicros, currency)}
            </div>
            <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-zinc-300 mb-3">
              <span className="text-rose-400 font-semibold">{dilutionSummary.averageInflationRatio.toFixed(2)}x CPC Inflation</span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400">{hijackedClicks} hijacked clicks</span>
            </div>

            {dilutionSummary.pairs.length > 0 && (
              <div className="mt-2 pt-2 border-t border-zinc-800/60">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1.5">Top Diluted Queries</div>
                <div className="flex flex-wrap gap-1.5" data-testid="dilution-queries-pills">
                  {dilutionSummary.pairs.slice(0, 3).map((pair) => (
                    <span
                      key={pair.broadQuery + pair.exactQuery}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800/80 border border-zinc-700/60 text-zinc-200"
                      title={`Exact CPC: ${formatCurrencyMicros(pair.exactCpcMicros, currency)} vs Broad: ${formatCurrencyMicros(pair.broadCpcMicros, currency)}`}
                    >
                      <span className="font-semibold text-amber-300 truncate max-w-[120px]">{pair.exactQuery}</span>
                      <span className="text-[10px] text-rose-400 font-semibold">-{formatCurrencyMicros(pair.budgetLostMicros, currency)}</span>
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
        data-testid="open-dilution-details-btn"
        className="mt-4 flex items-center justify-between w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/60 hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none text-zinc-200 border border-zinc-700/60 transition-all duration-150 ease-out active:scale-[0.99] group/btn"
      >
        <span className="flex items-center gap-1.5">
          <span>Inspect Dilution Bleed</span>
          <span className="text-zinc-500">({dilutionSummary.pairs.length})</span>
        </span>
        <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover/btn:translate-x-0.5 transition-transform" />
      </button>
    </div>
  );
};
