/**
 * SIEVE Domain Core: Match-Type Dilution & Cannibalization Engine
 *
 * Implements IMatchDilutionPort adhering strictly to Clean Architecture:
 * - Cross-references search queries across match types (Exact vs. Broad/Phrase)
 * - Identifies hijacked clicks cannibalized by loose match types
 * - Calculates CPC inflation ratios and exact budget lost in CurrencyMicros
 * - Evaluates overall account Match Dilution Index and weighted inflation
 *
 * Operating constraints: <= 200 lines, pure headless arithmetic, zero UI/DOM.
 */

import type { IMatchDilutionPort } from '../ports/dilution_port.ts';
import type {
  DilutedQueryPair,
  DilutionSummary,
  DilutionDetectionConfig,
  DilutionSeverity,
  SearchTermRecord,
  CurrencyMicros,
  ClickCount,
  QueryString,
} from '../types/index.ts';

function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/[\[\]"']/g, '').replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
}

interface ExactBenchmark {
  readonly record: SearchTermRecord;
  readonly query: QueryString;
  clicks: number;
  spendMicros: bigint;
  averageCpcMicros: CurrencyMicros;
}

export class MatchDilutionEngine implements IMatchDilutionPort {
  identifyHijackedClicks(_exactRecord: SearchTermRecord, broadRecord: SearchTermRecord): ClickCount {
    return Math.max(0, broadRecord.clicks) as ClickCount;
  }

  calculateInflationRatio(exactCpcMicros: CurrencyMicros, broadCpcMicros: CurrencyMicros): number {
    return exactCpcMicros <= 0n ? 0.0 : Number(broadCpcMicros) / Number(exactCpcMicros);
  }

  calculateLostBudget(
    exactCpcMicros: CurrencyMicros,
    broadCpcMicros: CurrencyMicros,
    hijackedClicks: ClickCount
  ): CurrencyMicros {
    if (broadCpcMicros <= exactCpcMicros || hijackedClicks <= 0) return 0n as CurrencyMicros;
    return (BigInt(Math.round(hijackedClicks)) * (broadCpcMicros - exactCpcMicros)) as CurrencyMicros;
  }

  classifySeverity(inflationRatio: number): DilutionSeverity {
    if (inflationRatio > 1.75) return 'CRITICAL';
    if (inflationRatio >= 1.30) return 'SEVERE';
    if (inflationRatio >= 1.10) return 'MODERATE';
    return 'NEGLIGIBLE';
  }

  findDilutedPairs(
    exactRecords: readonly SearchTermRecord[],
    broadRecords: readonly SearchTermRecord[],
    config?: DilutionDetectionConfig
  ): readonly DilutedQueryPair[] {
    const exactBenchmarks = new Map<string, ExactBenchmark>();

    for (const record of exactRecords) {
      if (record.matchType !== 'EXACT') continue;
      const key = normalizeQuery(record.normalizedQuery || record.rawQuery);
      if (!key) continue;

      let b = exactBenchmarks.get(key);
      if (!b) {
        b = { record, query: record.rawQuery, clicks: 0, spendMicros: 0n, averageCpcMicros: record.averageCpcMicros };
        exactBenchmarks.set(key, b);
      }
      b.clicks += record.clicks;
      b.spendMicros += record.spendMicros;
      if (b.clicks > 0 && b.spendMicros > 0n) {
        b.averageCpcMicros = (b.spendMicros / BigInt(Math.round(b.clicks))) as CurrencyMicros;
      }
    }

    const pairs: DilutedQueryPair[] = [];

    for (const broadRecord of broadRecords) {
      if (broadRecord.matchType === 'EXACT' || broadRecord.clicks <= 0) continue;
      const key = normalizeQuery(broadRecord.normalizedQuery || broadRecord.rawQuery);
      const benchmark = exactBenchmarks.get(key);
      if (!benchmark || benchmark.averageCpcMicros <= 0n) continue;

      const exactCpc = benchmark.averageCpcMicros;
      const broadCpc = broadRecord.averageCpcMicros > 0n
        ? broadRecord.averageCpcMicros
        : broadRecord.spendMicros > 0n
          ? ((broadRecord.spendMicros / BigInt(Math.round(broadRecord.clicks))) as CurrencyMicros)
          : (0n as CurrencyMicros);

      if (broadCpc <= exactCpc) continue;

      const hijackedClicks = this.identifyHijackedClicks(benchmark.record, broadRecord);
      if (hijackedClicks <= 0) continue;

      const inflationRatio = this.calculateInflationRatio(exactCpc, broadCpc);
      const budgetLost = this.calculateLostBudget(exactCpc, broadCpc, hijackedClicks);
      if (budgetLost <= 0n) continue;

      if (config?.minInflationRatio !== undefined && inflationRatio < config.minInflationRatio) continue;
      if (config?.minHijackedClicks !== undefined && hijackedClicks < config.minHijackedClicks) continue;
      if (config?.minBudgetLostMicros !== undefined && budgetLost < config.minBudgetLostMicros) continue;

      pairs.push({
        exactQuery: benchmark.query,
        broadQuery: broadRecord.rawQuery,
        exactCpcMicros: exactCpc,
        broadCpcMicros: broadCpc,
        cpcInflationRatio: inflationRatio,
        hijackedClicks,
        budgetLostMicros: budgetLost,
        severity: this.classifySeverity(inflationRatio),
      });
    }

    return pairs.sort((a, b) =>
      b.budgetLostMicros > a.budgetLostMicros ? 1 : b.budgetLostMicros < a.budgetLostMicros ? -1 : 0
    );
  }

  detectDilution(
    searchTerms: readonly SearchTermRecord[],
    config?: DilutionDetectionConfig
  ): DilutionSummary {
    const exactRecords: SearchTermRecord[] = [];
    const broadRecords: SearchTermRecord[] = [];
    let totalAnalyzedSpend = 0n;

    for (const term of searchTerms) {
      totalAnalyzedSpend += term.spendMicros;
      if (term.matchType === 'EXACT') exactRecords.push(term);
      else broadRecords.push(term);
    }

    const pairs = this.findDilutedPairs(exactRecords, broadRecords, config);
    let totalBudgetLost = 0n;
    let totalDilutedSpend = 0n;
    let totalDilutedClicks = 0;
    let weightedInflationSum = 0;

    for (const pair of pairs) {
      totalBudgetLost += pair.budgetLostMicros;
      totalDilutedSpend += pair.broadCpcMicros * BigInt(Math.round(pair.hijackedClicks));
      totalDilutedClicks += pair.hijackedClicks;
      weightedInflationSum += pair.cpcInflationRatio * pair.hijackedClicks;
    }

    const dilutionIndexPercent = totalAnalyzedSpend > 0n
      ? Math.min(100.0, (Number(totalDilutedSpend) / Number(totalAnalyzedSpend)) * 100)
      : 0.0;

    const averageInflationRatio = totalDilutedClicks > 0
      ? weightedInflationSum / totalDilutedClicks
      : 0.0;

    return {
      dilutionIndexPercent,
      totalBudgetLostMicros: totalBudgetLost as CurrencyMicros,
      dilutedQueryCount: pairs.length,
      averageInflationRatio,
      pairs,
      totalDilutedClicks: totalDilutedClicks as ClickCount,
      totalDilutedSpendMicros: totalDilutedSpend as CurrencyMicros,
    };
  }
}
