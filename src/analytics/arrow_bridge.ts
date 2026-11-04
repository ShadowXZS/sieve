/**
 * Sieve Apache Arrow IPC Bridge
 *
 * Implements zero-copy conversion of WebAssembly linear memory columnar layouts
 * into Apache Arrow RecordBatches and Tables, with zero serialization overhead.
 */

import * as arrow from 'apache-arrow';

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

/**
 * Parses the 80-byte header from WebAssembly linear memory.
 */
export function parseColumnarHeader(
  buffer: ArrayBuffer,
  offset: number = 0
): SieveColumnarHeader {
  const u32 = new Uint32Array(buffer, offset, 20);
  return {
    magic: u32[0],
    version: u32[1],
    rowCount: u32[2],
    queryOffsetsPos: u32[3],
    queryOffsetsLen: u32[4],
    queryDataPos: u32[5],
    queryDataLen: u32[6],
    campaignOffsetsPos: u32[7],
    campaignOffsetsLen: u32[8],
    campaignDataPos: u32[9],
    campaignDataLen: u32[10],
    adgroupOffsetsPos: u32[11],
    adgroupOffsetsLen: u32[12],
    adgroupDataPos: u32[13],
    adgroupDataLen: u32[14],
    clicksPos: u32[15],
    costPos: u32[16],
    conversionsPos: u32[17],
    hasCollisionPos: u32[18],
  };
}

/**
 * Converts WASM linear memory columnar buffer directly into an Apache Arrow Table
 * using zero-copy TypedArray views.
 */
export function convertWasmMemoryToArrowTable(
  buffer: ArrayBuffer,
  offset: number = 0
): arrow.Table {
  const header = parseColumnarHeader(buffer, offset);
  const rowCount = header.rowCount;

  if (header.magic !== 0x53494556 || rowCount === 0) {
    return new arrow.Table({
      query: arrow.vectorFromArray([]),
      campaign: arrow.vectorFromArray([]),
      adgroup: arrow.vectorFromArray([]),
      clicks: arrow.makeVector(new Float64Array(0)),
      cost: arrow.makeVector(new Float64Array(0)),
      conversions: arrow.makeVector(new Float64Array(0)),
      has_collision: arrow.vectorFromArray([]),
    });
  }

  // Zero-copy typed array views directly over the WASM linear memory buffer
  const queryOffsets = new Int32Array(
    buffer,
    offset + header.queryOffsetsPos,
    rowCount + 1
  );
  const queryData = new Uint8Array(
    buffer,
    offset + header.queryDataPos,
    header.queryDataLen
  );

  const campaignOffsets = new Int32Array(
    buffer,
    offset + header.campaignOffsetsPos,
    rowCount + 1
  );
  const campaignData = new Uint8Array(
    buffer,
    offset + header.campaignDataPos,
    header.campaignDataLen
  );

  const adgroupOffsets = new Int32Array(
    buffer,
    offset + header.adgroupOffsetsPos,
    rowCount + 1
  );
  const adgroupData = new Uint8Array(
    buffer,
    offset + header.adgroupDataPos,
    header.adgroupDataLen
  );

  const clicks = new Float64Array(buffer, offset + header.clicksPos, rowCount);
  const cost = new Float64Array(buffer, offset + header.costPos, rowCount);
  const conversions = new Float64Array(buffer, offset + header.conversionsPos, rowCount);
  const hasCollision = new Uint8Array(buffer, offset + header.hasCollisionPos, rowCount);

  // Build Apache Arrow vectors wrapping the typed arrays with zero memory copies
  const queryVector = arrow.makeVector({
    type: new arrow.Utf8(),
    offset: 0,
    length: rowCount,
    nullCount: 0,
    data: queryData,
    valueOffsets: queryOffsets,
  });

  const campaignVector = arrow.makeVector({
    type: new arrow.Utf8(),
    offset: 0,
    length: rowCount,
    nullCount: 0,
    data: campaignData,
    valueOffsets: campaignOffsets,
  });

  const adgroupVector = arrow.makeVector({
    type: new arrow.Utf8(),
    offset: 0,
    length: rowCount,
    nullCount: 0,
    data: adgroupData,
    valueOffsets: adgroupOffsets,
  });

  const clicksVector = arrow.makeVector(clicks);
  const costVector = arrow.makeVector(cost);
  const conversionsVector = arrow.makeVector(conversions);
  const collisionVector = arrow.vectorFromArray(Array.from(hasCollision, (v) => v !== 0));

  return new arrow.Table({
    query: queryVector,
    campaign: campaignVector,
    adgroup: adgroupVector,
    clicks: clicksVector,
    cost: costVector,
    conversions: conversionsVector,
    has_collision: collisionVector,
  });
}

/**
 * Converts WASM linear memory into an Apache Arrow RecordBatch.
 */
export function convertWasmMemoryToArrowBatch(
  buffer: ArrayBuffer,
  offset: number = 0
): arrow.RecordBatch {
  const table = convertWasmMemoryToArrowTable(buffer, offset);
  const batches = table.batches;
  if (batches.length > 0) {
    return batches[0];
  }

  // Construct from columns
  const schema = table.schema;
  const vectors: arrow.Vector[] = [];
  for (let i = 0; i < schema.fields.length; i++) {
    vectors.push(table.getChildAt(i)!);
  }
  return new arrow.RecordBatch(schema, {
    length: table.numRows,
    data: arrow.makeData({
      type: new arrow.Struct(schema.fields),
      length: table.numRows,
      children: vectors.map((v) => v.data[0]),
    }),
  });
}

/**
 * Serializes an Arrow Table or RecordBatch into an Arrow IPC stream byte array.
 */
export function serializeToArrowIPC(
  tableOrBatch: arrow.Table | arrow.RecordBatch
): Uint8Array {
  if (tableOrBatch instanceof arrow.Table) {
    return arrow.tableToIPC(tableOrBatch, 'stream');
  }
  const table = new arrow.Table(tableOrBatch);
  return arrow.tableToIPC(table, 'stream');
}

