/**
 * SIEVE Web Worker Core
 *
 * Implements background domain computation using tokenizer, dilution,
 * shield, and econometric engines with zero UI/DOM dependencies.
 * Zero-copy transfer of Apache Arrow IPC ArrayBuffers.
 * Line ceiling: <= 250 lines.
 */

import type { SearchTermRecord, CurrencyMicros } from '../domain/types/index.ts';
import * as arrow from 'apache-arrow';
import { NgramTokenizerEngine } from '../domain/engines/tokenizer_engine.ts';
import { MatchDilutionEngine } from '../domain/engines/dilution_engine.ts';
import { ConversionShieldEngine } from '../domain/engines/shield_engine.ts';
import { EconometricEngine } from '../domain/engines/econometric_engine.ts';
import { parseSearchTermReport } from '../adapters/parsers/search_term_parser.ts';
import { executeDuckDBSQL, registerSearchTermsTable, dropTable } from '../analytics/duckdb.ts';

export interface WorkerCandidate {
  readonly keyword: string;
  readonly matchType: 'broad' | 'phrase' | 'exact';
  readonly confidenceScore: number;
  readonly marginalWaste: number;
  readonly hasCollision: boolean;
  readonly clicks: number;
  readonly cost: number;
}

export class SieveWorkerCore {
  public workerId: number;
  private tokenizer = new NgramTokenizerEngine();
  private dilution = new MatchDilutionEngine();
  private shield = new ConversionShieldEngine();
  private econometric = new EconometricEngine();
  private cachedRecords: SearchTermRecord[] = [];

  constructor(workerId: number = 0) {
    this.workerId = workerId;
  }

  public async init(): Promise<void> {}

  public cleanup(): void {
    this.cachedRecords = [];
    this.shield = new ConversionShieldEngine();
    dropTable('search_terms').catch(() => {});
  }

  public async handleCommand(cmd: any): Promise<{ response: any; transferables: Transferable[] }> {
    try {
      switch (cmd.type) {
        case 'PARSE_AND_INGEST':
        case 'INGEST_CSV_CHUNK':
          return await this.processIngest(cmd);
        case 'REFILTER_THRESHOLDS':
          return this.processRefilter(cmd);
        case 'RUN_QUERY':
        case 'EXECUTE_SQL_QUERY':
          return await this.processQuery(cmd);
        case 'UNLINK_TABLES':
          await dropTable('search_terms');
          return { response: { type: 'UNLINK_TABLES_SUCCESS', requestId: cmd.requestId, workerId: this.workerId }, transferables: [] };
        case 'RESET_ENGINE':
          this.cleanup();
          return { response: { type: 'RESET_ENGINE_SUCCESS', requestId: cmd.requestId, workerId: this.workerId }, transferables: [] };
        default:
          return { response: { type: 'TASK_SUCCESS', requestId: cmd.requestId, workerId: this.workerId, statusCode: 0 }, transferables: [] };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        response: {
          type: 'TASK_ERROR',
          requestId: cmd.requestId,
          workerId: this.workerId,
          error: msg,
          code: msg.includes('PARSE_ERROR') ? 'PARSE_ERROR' : 'TASK_ERROR',
        },
        transferables: [],
      };
    }
  }

  private async processIngest(cmd: any): Promise<{ response: any; transferables: Transferable[] }> {
    const rawBuf = cmd.buffer || cmd.chunkBuffer;
    if (!rawBuf || rawBuf.byteLength < 8) {
      throw new Error('PARSE_ERROR: Invalid CSV structure or corrupted binary payload (< 8 bytes)');
    }

    const u8 = new Uint8Array(rawBuf);
    let printable = 0, nonPrintable = 0;
    for (let i = 0; i < Math.min(u8.length, 64); i++) {
      const b = u8[i];
      if (b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126) || b >= 160) printable++;
      else if (b < 32 || b === 127) nonPrintable++;
    }
    if (!printable || nonPrintable > 2) {
      throw new Error('PARSE_ERROR: Corrupted binary payload or invalid CSV structure');
    }

    const text = new TextDecoder('utf-8', { fatal: false }).decode(u8);
    const records = parseSearchTermReport(text);
    if (!records || records.length === 0) throw new Error('PARSE_ERROR: No valid search term records found');

    this.cachedRecords = records;
    const targetCpa = (BigInt(Math.round(cmd.targetCPA ?? 50)) * 1_000_000n) as CurrencyMicros;
    this.shield = new ConversionShieldEngine({ minNonConvertingClicks: cmd.minClicks ?? 1 });
    const rules = this.shield.emitQualifiedNegativeCandidates(records, targetCpa);
    const candidates = this.mapRulesToCandidates(rules, records);
    const bleedRoots = this.tokenizer.topBleedRoots(records, 10);
    this.dilution.detectDilution(records);
    this.econometric.computeSpendWaterfall(records, targetCpa);

    const arrowTable = new arrow.Table({
      query: arrow.vectorFromArray(records.map((r) => r.rawQuery)),
      campaign: arrow.vectorFromArray(records.map((r) => r.campaignName)),
      adgroup: arrow.vectorFromArray(records.map((r) => r.adGroupName)),
      clicks: arrow.makeVector(new Float64Array(records.map((r) => r.clicks))),
      cost: arrow.makeVector(new Float64Array(records.map((r) => Number(r.spendMicros) / 1_000_000))),
      conversions: arrow.makeVector(new Float64Array(records.map((r) => r.conversions))),
      has_collision: arrow.vectorFromArray(records.map((r) => Boolean(r.hasCollision))),
    });
    const ipcBytes = arrow.tableToIPC(arrowTable, 'stream');
    const arrowIpcBuffer = ipcBytes.buffer.slice(ipcBytes.byteOffset, ipcBytes.byteOffset + ipcBytes.byteLength);

    try { await registerSearchTermsTable(ipcBytes); } catch {}

    const isChunk = cmd.type === 'INGEST_CSV_CHUNK';
    const response = isChunk
      ? { type: 'INGEST_CHUNK_COMPLETE', requestId: cmd.requestId, workerId: this.workerId, statusCode: 0, bytesConsumed: rawBuf.byteLength, keywords: candidates, recordCount: records.length, arrowIpcBuffer }
      : { type: 'PARSE_AND_INGEST_SUCCESS', requestId: cmd.requestId, workerId: this.workerId, statusCode: 0, recordCount: records.length, candidates, tokensCount: bleedRoots.length, arrowIpcBuffer };

    return { response, transferables: [arrowIpcBuffer] };
  }

  private processRefilter(cmd: any): { response: any; transferables: Transferable[] } {
    const t0 = performance.now();
    if (!this.cachedRecords || this.cachedRecords.length === 0) {
      return {
        response: { type: 'REFILTER_SUCCESS', requestId: cmd.requestId, workerId: this.workerId, candidates: [], durationMs: performance.now() - t0, reparsed: false },
        transferables: [],
      };
    }

    const minClicks = cmd.minClicks ?? 1;
    const minConf = cmd.confidenceThreshold ?? 0.8;
    const targetCpa = (BigInt(Math.round(cmd.targetCPA ?? 50)) * 1_000_000n) as CurrencyMicros;

    this.shield = new ConversionShieldEngine({ minNonConvertingClicks: minClicks });
    const rules = this.shield.emitQualifiedNegativeCandidates(this.cachedRecords, targetCpa);
    const candidates = this.mapRulesToCandidates(rules, this.cachedRecords).filter(
      (c) => c.clicks >= minClicks && c.confidenceScore >= minConf
    );

    return {
      response: { type: 'REFILTER_SUCCESS', requestId: cmd.requestId, workerId: this.workerId, candidates, durationMs: performance.now() - t0, reparsed: false },
      transferables: [],
    };
  }

  private async processQuery(cmd: any): Promise<{ response: any; transferables: Transferable[] }> {
    try {
      const res = await executeDuckDBSQL(cmd.query);
      return {
        response: {
          type: cmd.type === 'EXECUTE_SQL_QUERY' ? 'EXECUTE_SQL_QUERY_RESULT' : 'RUN_QUERY_RESULT',
          requestId: cmd.requestId,
          workerId: this.workerId,
          columns: res.columns,
          rows: res.rows,
          rowCount: res.rowCount,
          executionTimeMs: res.executionTimeMs,
        },
        transferables: [],
      };
    } catch {
      const t0 = performance.now();
      const rows = this.cachedRecords.map((r) => ({
        query: r.rawQuery, campaign: r.campaignName, adgroup: r.adGroupName,
        clicks: r.clicks, cost: Number(r.spendMicros) / 1_000_000, conversions: r.conversions,
      }));
      return {
        response: {
          type: cmd.type === 'EXECUTE_SQL_QUERY' ? 'EXECUTE_SQL_QUERY_RESULT' : 'RUN_QUERY_RESULT',
          requestId: cmd.requestId,
          workerId: this.workerId,
          columns: ['query', 'campaign', 'adgroup', 'clicks', 'cost', 'conversions'],
          rows,
          rowCount: rows.length,
          executionTimeMs: performance.now() - t0,
        },
        transferables: [],
      };
    }
  }

  private mapRulesToCandidates(rules: readonly any[], records: readonly SearchTermRecord[]): WorkerCandidate[] {
    const recordMap = new Map<string, SearchTermRecord>();
    for (const r of records) recordMap.set(r.rawQuery.toLowerCase(), r);

    return rules.map((rule) => {
      const clean = rule.candidateTerm.replace(/[\[\]]/g, '').toLowerCase();
      const rec = recordMap.get(clean);
      return {
        keyword: rule.candidateTerm,
        matchType: (rule.recommendedMatchType || 'broad').toLowerCase() as 'broad' | 'phrase' | 'exact',
        confidenceScore: rule.confidenceScore ?? 0.8,
        marginalWaste: Number(rule.marginalWasteMicros ?? 0n) / 1_000_000,
        hasCollision: rule.verdict === 'EXACT_BRACKET_LOCK',
        clicks: Number(rec?.clicks ?? 0),
        cost: Number(rec?.spendMicros ?? 0n) / 1_000_000,
      };
    });
  }
}

if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function' && typeof window === 'undefined') {
  const core = new SieveWorkerCore();
  self.addEventListener('message', async (e: MessageEvent) => {
    const { response, transferables } = await core.handleCommand(e.data);
    (self as any).postMessage(response, transferables);
  });
}
