/**
 * Ingestion Worker: Zero-Copy Analytical Stream Ingestion
 * Emits granular progress heartbeats and prevents synchronous thread stalls.
 * Line ceiling: <= 250 lines.
 */

import * as arrow from 'apache-arrow';
import type { PersistedNegativeKeyword } from './protocol.ts';
import type { SearchTermRecord, CurrencyMicros } from '../domain/types/index.ts';
import { parseSearchTermReport } from '../adapters/parsers/search_term_parser.ts';
import { ConversionShieldEngine } from '../domain/engines/shield_engine.ts';

export type WorkerIngestMessage =
  | { type: 'PROGRESS'; stage: string; percent: number }
  | {
      type: 'SUCCESS';
      recordBatches: Uint8Array[];
      recordCount: number;
      keywords: PersistedNegativeKeyword[];
    }
  | { type: 'ERROR'; message: string; stack?: string };

export type IngestCommand =
  | {
      type: 'INGEST_CHUNK';
      chunkBuffer: ArrayBuffer;
      isFinal: boolean;
      totalBytes: number;
      bytesProcessed: number;
      targetCPA?: number;
    }
  | { type: 'RESET' };

export async function handleWorkerIngestMessage(
  cmd: IngestCommand,
  postFn: (msg: WorkerIngestMessage, transferables?: Transferable[]) => void
): Promise<void> {
  try {
    if (cmd.type === 'RESET') {
      postFn({ type: 'PROGRESS', stage: 'Transferable Memory Ingestion', percent: 0 });
      return;
    }

    const { chunkBuffer, totalBytes, bytesProcessed, targetCPA } = cmd;
    if (!chunkBuffer || chunkBuffer.byteLength < 8) {
      throw new Error('PARSE_ERROR: Cannot ingest empty or corrupted CSV payload (< 8 bytes)');
    }

    const initialPercent = totalBytes > 0
      ? Math.min(Math.round((bytesProcessed / totalBytes) * 100), 20)
      : 10;
    postFn({
      type: 'PROGRESS',
      stage: 'Transferable Memory Ingestion',
      percent: initialPercent,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const u8 = new Uint8Array(chunkBuffer);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(u8);

    postFn({
      type: 'PROGRESS',
      stage: 'Transferable Memory Ingestion',
      percent: Math.min(50, Math.max(initialPercent + 25, 45)),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const records = parseSearchTermReport(text);
    if (!records || records.length === 0) {
      throw new Error('PARSE_ERROR: No valid search term records found in CSV');
    }

    postFn({
      type: 'PROGRESS',
      stage: 'Transferable Memory Ingestion',
      percent: 80,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const targetCpaVal = typeof targetCPA === 'number' ? targetCPA : 50;
    const targetCpaMicros = (BigInt(Math.round(targetCpaVal)) * 1_000_000n) as CurrencyMicros;
    const shield = new ConversionShieldEngine({ minNonConvertingClicks: 1 });
    const rules = shield.emitQualifiedNegativeCandidates(records, targetCpaMicros);
    const ruleMap = new Map<string, (typeof rules)[number]>();
    for (const r of rules) {
      ruleMap.set(r.candidateTerm.replace(/[\[\]"']/g, '').toLowerCase().trim(), r);
    }

    const keywords: PersistedNegativeKeyword[] = records.map((r, i) => {
      const rule = ruleMap.get(r.rawQuery.toLowerCase().trim());
      const cost = Number(r.spendMicros) / 1_000_000;
      return {
        id: `kw_${Date.now()}_${i}`,
        sha256Hash: `hash_${i}`,
        keyword: r.rawQuery,
        matchType: (rule?.recommendedMatchType?.toLowerCase() as 'broad' | 'phrase' | 'exact') || 'broad',
        confidenceScore: rule?.confidenceScore ?? (r.clicks > 0 ? 0.85 : 0.7),
        marginalWaste: rule ? Number(rule.marginalWasteMicros ?? 0n) / 1_000_000 : cost,
        hasCollision: rule?.verdict === 'EXACT_BRACKET_LOCK',
        clicks: Number(r.clicks),
        cost,
        conversions: r.conversions,
        createdAt: Date.now(),
      };
    });

    const arrowTable = new arrow.Table({
      query: arrow.vectorFromArray(records.map((r: SearchTermRecord) => r.rawQuery)),
      campaign: arrow.vectorFromArray(records.map((r: SearchTermRecord) => r.campaignName)),
      adgroup: arrow.vectorFromArray(records.map((r: SearchTermRecord) => r.adGroupName)),
      clicks: arrow.makeVector(new Float64Array(records.map((r: SearchTermRecord) => r.clicks))),
      cost: arrow.makeVector(new Float64Array(records.map((r: SearchTermRecord) => Number(r.spendMicros) / 1_000_000))),
      conversions: arrow.makeVector(new Float64Array(records.map((r: SearchTermRecord) => r.conversions))),
      has_collision: arrow.vectorFromArray(records.map((r: SearchTermRecord) => Boolean(r.hasCollision))),
    });
    const ipcBytes = arrow.tableToIPC(arrowTable, 'stream');

    postFn({
      type: 'PROGRESS',
      stage: 'Transferable Memory Ingestion',
      percent: 100,
    });

    postFn(
      {
        type: 'SUCCESS',
        recordBatches: [ipcBytes],
        recordCount: records.length,
        keywords,
      },
      [ipcBytes.buffer]
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    postFn({
      type: 'ERROR',
      message: `Worker initialization failed: ${msg}. Click to retry.`,
      stack,
    });
  }
}

if (typeof self !== 'undefined' && 'postMessage' in self && typeof window === 'undefined') {
  self.addEventListener('message', (e: MessageEvent<IngestCommand>) => {
    void handleWorkerIngestMessage(e.data, (msg, transferables) => {
      (self as unknown as Worker).postMessage(msg, transferables || []);
    });
  });
}
