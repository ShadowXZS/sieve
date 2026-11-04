import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useSieveStore } from '../../src/state/useSieveStore.ts';
import { SieveWorkerPool } from '../../src/workers/pool.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgWasmPath = path.resolve(__dirname, '../../crates/sieve_core/pkg/sieve_core_bg.wasm');
const targetWasmPath = path.resolve(__dirname, '../../target/wasm32-unknown-unknown/release/sieve_core.wasm');

async function loadWasm() {
  let wasmBuffer: Buffer;
  try {
    wasmBuffer = await fs.readFile(pkgWasmPath);
  } catch {
    wasmBuffer = await fs.readFile(targetWasmPath);
  }
  const wasmModule = await WebAssembly.compile(new Uint8Array(wasmBuffer));
  const exports: Record<string, any> = {};
  const imports = {
    './sieve_core_bg.js': {
      __wbindgen_init_externref_table: function () {
        if (exports.__wbindgen_externrefs) {
          exports.__wbindgen_externrefs.set(0, undefined);
          exports.__wbindgen_externrefs.set(1024, undefined);
          exports.__wbindgen_externrefs.set(1025, null);
          exports.__wbindgen_externrefs.set(1026, true);
          exports.__wbindgen_externrefs.set(1027, false);
        }
      },
    },
    wbg: {},
    env: {},
  };
  const instance = await WebAssembly.instantiate(wasmModule, imports);
  Object.assign(exports, instance.exports);
  if (typeof exports.__wbindgen_start === 'function') {
    exports.__wbindgen_start();
  }
  const memory = exports.memory as WebAssembly.Memory;
  return { instance, exports, memory };
}

test('Schema Detector: Ingestion of raw Google Ads exports containing 2 preamble metadata rows', async () => {
  const { exports, memory } = await loadWasm();

  const googleRawWithPreamble = [
    'Search term report',
    'October 1 - October 31',
    'Search term,Campaign,Ad group,Impressions,Clicks,Cost,Conversions',
    '"cheap running shoes",Winter Sale,Footwear,150,20,"45.00",0',
    '"waterproof boots",Winter Sale,Footwear,200,10,"25.00",1',
  ].join('\n');

  const bytes = new TextEncoder().encode(googleRawWithPreamble);

  // Schema sniffing must identify Google Ads (1)
  const sniffPtr = exports.allocate_buffer(bytes.length);
  new Uint8Array(memory.buffer, sniffPtr, bytes.length).set(bytes);
  const detectedSchema = exports.detect_schema(sniffPtr, bytes.length);
  exports.deallocate_buffer(sniffPtr, bytes.length);

  assert.strictEqual(detectedSchema, 1, 'Google Ads schema (1) must be detected despite preamble rows');

  // Ingestion into engine must skip preambles and parse records
  const engine = exports.engine_new();
  try {
    const inPtr = exports.allocate_buffer(bytes.length);
    new Uint8Array(memory.buffer, inPtr, bytes.length).set(bytes);
    const status = exports.engine_ingest_chunk(engine, inPtr, bytes.length, 1);
    exports.deallocate_buffer(inPtr, bytes.length);

    assert.strictEqual(status, 0, 'Ingestion must succeed with code 0');

    // Export query records
    const outCap = 64 * 1024;
    const outPtr = exports.allocate_buffer(outCap);
    const written = exports.engine_export_query_records(engine, outPtr, outCap);
    assert.ok(written > 0, 'Must export parsed query records');

    const jsonStr = new TextDecoder().decode(new Uint8Array(memory.buffer, outPtr, written));
    exports.deallocate_buffer(outPtr, outCap);

    const records = JSON.parse(jsonStr);
    assert.strictEqual(records.length, 2, 'Must contain 2 query records');
    assert.ok(records.some((r: any) => r.query === 'cheap running shoes'));
    assert.ok(records.some((r: any) => r.query === 'waterproof boots'));
  } finally {
    exports.engine_free(engine);
  }
});

test('Schema Detector: Ingestion of UTF-8 BOM-prefixed CSV byte buffers', async () => {
  const { exports, memory } = await loadWasm();

  const csvContent = 'Search term,Campaign,Ad group,Clicks,Cost,Conversions\n"nike shoes",CampA,AdgB,10,"20.00",1\n';
  const csvBytes = new TextEncoder().encode(csvContent);

  // Prepend UTF-8 BOM: 0xEF, 0xBB, 0xBF
  const bomBytes = new Uint8Array(3 + csvBytes.length);
  bomBytes[0] = 0xef;
  bomBytes[1] = 0xbb;
  bomBytes[2] = 0xbf;
  bomBytes.set(csvBytes, 3);

  // Schema sniffing with BOM
  const sniffPtr = exports.allocate_buffer(bomBytes.length);
  new Uint8Array(memory.buffer, sniffPtr, bomBytes.length).set(bomBytes);
  const detectedSchema = exports.detect_schema(sniffPtr, bomBytes.length);
  exports.deallocate_buffer(sniffPtr, bomBytes.length);

  assert.strictEqual(detectedSchema, 1, 'Schema detection must succeed through UTF-8 BOM');

  // Ingestion with BOM
  const engine = exports.engine_new();
  try {
    const inPtr = exports.allocate_buffer(bomBytes.length);
    new Uint8Array(memory.buffer, inPtr, bomBytes.length).set(bomBytes);
    const status = exports.engine_ingest_chunk(engine, inPtr, bomBytes.length, 1);
    exports.deallocate_buffer(inPtr, bomBytes.length);

    assert.strictEqual(status, 0, 'Ingestion of UTF-8 BOM buffer must succeed with code 0');
  } finally {
    exports.engine_free(engine);
  }
});

test('Schema Detector: Worker properly emits error messages via postMessage on invalid file, triggering alert state in useSieveStore', async () => {
  useSieveStore.getState().reset();
  const pool = new SieveWorkerPool({ concurrency: 1 });

  try {
    // Corrupted binary payload (< 8 bytes or non-text garbage)
    const corruptedBuffer = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01]).buffer;

    let caughtError: any = null;
    try {
      await pool.executeIngestion('invalid-task-1', corruptedBuffer, true);
    } catch (err: any) {
      caughtError = err;
      // Ingestion pipeline records error in useSieveStore
      (useSieveStore.getState() as any).setErrorMessage?.(err?.message || 'Invalid CSV structure');
    }

    assert.ok(caughtError !== null, 'Worker must reject invalid binary file with an error');
    assert.ok(
      caughtError.message.includes('PARSE_ERROR') || caughtError.code === 'PARSE_ERROR',
      `Error must indicate parse failure: ${caughtError.message}`
    );

    // Verify useSieveStore alert/toast state is triggered and ingestion state reset
    const storeState = useSieveStore.getState() as any;
    assert.strictEqual(storeState.isIngesting, false, 'Ingesting flag must be false');
    assert.ok(
      typeof storeState.errorMessage === 'string' && storeState.errorMessage.length > 0,
      'useSieveStore must have an active errorMessage alert state'
    );
  } finally {
    await pool.terminate();
  }
});

test('Schema Detector: Accurate Cost column resolution avoiding "Cost / conv." and "Avg. CPC" overwrites', async () => {
  const { exports, memory } = await loadWasm();

  // Typical Google Ads export structure with both Cost and Cost / conv.
  const csvWithCostPerConv = [
    'Search term,Campaign,Ad group,Impressions,Clicks,Cost,Avg. CPC,Conversions,Cost / conv.',
    '"zero conversion waste term",Campaign A,AdGroup B,100,25,"150.00","6.00",0,--',
    '"profitable converting term",Campaign A,AdGroup B,200,40,"80.00","2.00",4,"20.00"',
  ].join('\n');

  const engine = exports.engine_new();
  try {
    const bytes = new TextEncoder().encode(csvWithCostPerConv);
    const inPtr = exports.allocate_buffer(bytes.length);
    new Uint8Array(memory.buffer, inPtr, bytes.length).set(bytes);
    const status = exports.engine_ingest_chunk(engine, inPtr, bytes.length, 1);
    exports.deallocate_buffer(inPtr, bytes.length);

    assert.strictEqual(status, 0, 'Ingestion must succeed');

    const outCap = 64 * 1024;
    const outPtr = exports.allocate_buffer(outCap);
    const written = exports.engine_export_query_records(engine, outPtr, outCap);
    assert.ok(written > 0, 'Must export records');

    const jsonStr = new TextDecoder().decode(new Uint8Array(memory.buffer, outPtr, written));
    exports.deallocate_buffer(outPtr, outCap);

    const records = JSON.parse(jsonStr);
    assert.strictEqual(records.length, 2);

    const wasteTerm = records.find((r: any) => r.query === 'zero conversion waste term');
    assert.ok(wasteTerm, 'Waste term must exist');
    assert.strictEqual(wasteTerm.clicks, 25);
    assert.strictEqual(wasteTerm.conversions, 0);
    // Cost must be $150.00, NOT $0.00 from "--" in Cost / conv.
    assert.strictEqual(wasteTerm.cost, 150.0, 'Cost must accurately resolve to 150.00, not 0.00 from Cost / conv.');

    const convertingTerm = records.find((r: any) => r.query === 'profitable converting term');
    assert.ok(convertingTerm, 'Converting term must exist');
    assert.strictEqual(convertingTerm.cost, 80.0, 'Cost must accurately resolve to 80.00, not 20.00 from Cost / conv.');
  } finally {
    exports.engine_free(engine);
  }
});

