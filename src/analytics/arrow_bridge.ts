/**
 * Sieve Apache Arrow IPC Bridge
 *
 * Implements zero-copy conversion of domain entities and WASM linear memory
 * into Apache Arrow RecordBatches, Tables, and IPC streaming byte buffers.
 * Guarantees zero float hazards by enforcing Uint64 micro-units for currency.
 */

import * as arrow from 'apache-arrow';
import type { SearchTermRecord, AggregatedTokenMetric } from '../domain/types/index.ts';

export interface SieveColumnarHeader {
  magic: number;
  version: number;
  rowCount: number;
  queryOffsetsPos: number;
  queryOffsetsLen: number;
  queryDataPos: number;
  queryDataLen: number;
  campaignOffsetsPos: number;
  campaignOffsetsLen: number;
  campaignDataPos: number;
  campaignDataLen: number;
  adgroupOffsetsPos: number;
  adgroupOffsetsLen: number;
  adgroupDataPos: number;
  adgroupDataLen: number;
  clicksPos: number;
  costPos: number;
  conversionsPos: number;
  hasCollisionPos: number;
}

export function parseColumnarHeader(buffer: ArrayBuffer, offset: number = 0): SieveColumnarHeader {
  const u = new Uint32Array(buffer, offset, 20);
  return {
    magic: u[0], version: u[1], rowCount: u[2],
    queryOffsetsPos: u[3], queryOffsetsLen: u[4], queryDataPos: u[5], queryDataLen: u[6],
    campaignOffsetsPos: u[7], campaignOffsetsLen: u[8], campaignDataPos: u[9], campaignDataLen: u[10],
    adgroupOffsetsPos: u[11], adgroupOffsetsLen: u[12], adgroupDataPos: u[13], adgroupDataLen: u[14],
    clicksPos: u[15], costPos: u[16], conversionsPos: u[17], hasCollisionPos: u[18],
  };
}

export function convertWasmMemoryToArrowTable(buffer: ArrayBuffer, offset: number = 0): arrow.Table {
  const h = parseColumnarHeader(buffer, offset);
  if (h.magic !== 0x53494556 || h.rowCount === 0) {
    return new arrow.Table({
      query: arrow.vectorFromArray([]), campaign: arrow.vectorFromArray([]), adgroup: arrow.vectorFromArray([]),
      clicks: arrow.makeVector(new Float64Array(0)), cost: arrow.makeVector(new Float64Array(0)),
      conversions: arrow.makeVector(new Float64Array(0)), has_collision: arrow.vectorFromArray([]),
    });
  }
  const strVec = (offPos: number, dataPos: number, dataLen: number) =>
    arrow.makeVector({
      type: new arrow.Utf8(), offset: 0, length: h.rowCount, nullCount: 0,
      data: new Uint8Array(buffer, offset + dataPos, dataLen),
      valueOffsets: new Int32Array(buffer, offset + offPos, h.rowCount + 1),
    });
  return new arrow.Table({
    query: strVec(h.queryOffsetsPos, h.queryDataPos, h.queryDataLen),
    campaign: strVec(h.campaignOffsetsPos, h.campaignDataPos, h.campaignDataLen),
    adgroup: strVec(h.adgroupOffsetsPos, h.adgroupDataPos, h.adgroupDataLen),
    clicks: arrow.makeVector(new Float64Array(buffer, offset + h.clicksPos, h.rowCount)),
    cost: arrow.makeVector(new Float64Array(buffer, offset + h.costPos, h.rowCount)),
    conversions: arrow.makeVector(new Float64Array(buffer, offset + h.conversionsPos, h.rowCount)),
    has_collision: arrow.vectorFromArray(Array.from(new Uint8Array(buffer, offset + h.hasCollisionPos, h.rowCount), (v) => v !== 0)),
  });
}

export function convertWasmMemoryToArrowBatch(buffer: ArrayBuffer, offset: number = 0): arrow.RecordBatch {
  const table = convertWasmMemoryToArrowTable(buffer, offset);
  if (table.batches.length > 0) return table.batches[0];
  const vectors = table.schema.fields.map((_, i) => table.getChildAt(i)!);
  return new arrow.RecordBatch(table.schema, arrow.makeData({
    type: new arrow.Struct(table.schema.fields), length: table.numRows, children: vectors.map((v) => v.data[0]),
  }) as any);
}

export function serializeToArrowIPC(tableOrBatch: arrow.Table | arrow.RecordBatch): Uint8Array {
  const table = tableOrBatch instanceof arrow.Table ? tableOrBatch : new arrow.Table(tableOrBatch);
  return arrow.tableToIPC(table, 'stream');
}

/**
 * Converts domain SearchTermRecord items into an 11-column Apache Arrow Table.
 * Uses exact 64-bit integer vectors for currency micros to prevent float truncation.
 */
function toSafeBigInt(val: bigint | number | undefined | null, fallback: bigint = 0n): bigint {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') {
    return Number.isFinite(val) && !Number.isNaN(val) ? BigInt(Math.round(val)) : fallback;
  }
  return fallback;
}

export function recordsToArrowTable(records: readonly SearchTermRecord[]): arrow.Table {
  const n = records.length;
  const queries = new Array<string>(n);
  const campaigns = new Array<string>(n);
  const adgroups = new Array<string>(n);
  const matchTypes = new Array<string>(n);
  const impressions = new Uint32Array(n);
  const clicks = new Uint32Array(n);
  const spendMicros = new BigUint64Array(n);
  const conversions = new Float64Array(n);
  const revenueMicros = new BigUint64Array(n);
  const cpcMicros = new BigUint64Array(n);
  const isSafe = new Array<boolean>(n);

  for (let i = 0; i < n; i++) {
    const r = records[i];
    queries[i] = r.rawQuery || r.normalizedQuery || '';
    campaigns[i] = r.campaignName || '';
    adgroups[i] = r.adGroupName || '';
    matchTypes[i] = r.matchType || 'BROAD';
    impressions[i] = r.impressions || 0;
    clicks[i] = r.clicks || 0;
    spendMicros[i] = toSafeBigInt(r.spendMicros);
    conversions[i] = r.conversions || 0;
    revenueMicros[i] = toSafeBigInt(r.revenueMicros);
    cpcMicros[i] = toSafeBigInt(r.averageCpcMicros);
    const anyR = r as unknown as Record<string, unknown>;
    isSafe[i] = typeof anyR.is_safe === 'boolean'
      ? anyR.is_safe
      : typeof anyR.isSafe === 'boolean'
        ? anyR.isSafe
        : r.hasCollision !== undefined
          ? !r.hasCollision
          : true;
  }

  return new arrow.Table({
    query: arrow.vectorFromArray(queries, new arrow.Utf8()),
    campaign: arrow.vectorFromArray(campaigns, new arrow.Utf8()),
    adgroup: arrow.vectorFromArray(adgroups, new arrow.Utf8()),
    match_type: arrow.vectorFromArray(matchTypes, new arrow.Utf8()),
    impressions: arrow.makeVector(impressions),
    clicks: arrow.makeVector(clicks),
    spend_micros: arrow.makeVector(spendMicros),
    conversions: arrow.makeVector(conversions),
    revenue_micros: arrow.makeVector(revenueMicros),
    cpc_micros: arrow.makeVector(cpcMicros),
    is_safe: arrow.vectorFromArray(isSafe, new arrow.Bool()),
  });
}

/**
 * Builds a transferable Arrow IPC stream buffer for search term records.
 */
export function recordsToArrowIpc(records: readonly SearchTermRecord[]): Uint8Array {
  return serializeToArrowIPC(recordsToArrowTable(records));
}

/**
 * Converts AggregatedTokenMetric items into a token_matrix Apache Arrow Table.
 */
export function tokensToArrowTable(tokens: readonly AggregatedTokenMetric[]): arrow.Table {
  const n = tokens.length;
  const tokenTexts = new Array<string>(n);
  const occurrences = new Uint32Array(n);
  const totalClicks = new Uint32Array(n);
  const totalSpendMicros = new BigUint64Array(n);
  const conversions = new Float64Array(n);
  const wilsonUpperBounds = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const t = tokens[i];
    const anyT = t as unknown as Record<string, unknown>;
    tokenTexts[i] = t.tokenText || (anyT.token_text as string) || (anyT.token as string) || '';
    occurrences[i] = t.occurrences || 0;
    totalClicks[i] = t.totalClicks || (anyT.total_clicks as number) || 0;
    totalSpendMicros[i] = toSafeBigInt(t.totalSpendMicros ?? (anyT.total_spend_micros as bigint | number));
    conversions[i] = t.conversions || 0;
    wilsonUpperBounds[i] = t.wilsonScoreUpperBound ?? (anyT.wilson_upper_bound as number) ?? (anyT.wilson_score_upper as number) ?? 0;
  }

  return new arrow.Table({
    token_text: arrow.vectorFromArray(tokenTexts, new arrow.Utf8()),
    occurrences: arrow.makeVector(occurrences),
    total_clicks: arrow.makeVector(totalClicks),
    total_spend_micros: arrow.makeVector(totalSpendMicros),
    conversions: arrow.makeVector(conversions),
    wilson_upper_bound: arrow.makeVector(wilsonUpperBounds),
  });
}

/**
 * Builds a transferable Arrow IPC stream buffer for the token matrix table.
 */
export function tokensToArrowIpc(tokens: readonly AggregatedTokenMetric[]): Uint8Array {
  return serializeToArrowIPC(tokensToArrowTable(tokens));
}

export const tokenMatrixToArrowTable = tokensToArrowTable;
export const tokenMatrixToArrowIpc = tokensToArrowIpc;
