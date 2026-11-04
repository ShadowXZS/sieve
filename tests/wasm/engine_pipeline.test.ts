import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Attempt to locate wasm binary (from wasm-pack pkg or cargo release target)
const pkgWasmPath = path.resolve(__dirname, "../../crates/sieve_core/pkg/sieve_core_bg.wasm");
const targetWasmPath = path.resolve(__dirname, "../../target/wasm32-unknown-unknown/release/sieve_core.wasm");

async function loadWasm() {
  let wasmBuffer: Buffer;
  try {
    wasmBuffer = await fs.readFile(pkgWasmPath);
  } catch {
    wasmBuffer = await fs.readFile(targetWasmPath);
  }
  const wasmModule = await WebAssembly.compile(wasmBuffer);
  const exports: Record<string, any> = {};
  const imports = {
    "./sieve_core_bg.js": {
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
  if (typeof exports.__wbindgen_start === "function") {
    exports.__wbindgen_start();
  }
  const memory = exports.memory as WebAssembly.Memory;
  return { instance, exports, memory };
}

export const PlatformSchema = {
  Unknown: 0,
  GoogleAds: 1,
  AmazonPPC: 2,
  MicrosoftAdvertising: 3,
} as const;
export type PlatformSchema = typeof PlatformSchema[keyof typeof PlatformSchema];

test("Linear Memory Allocation ABI: allocate_buffer & deallocate_buffer", async () => {
  const { exports, memory } = await loadWasm();

  assert.strictEqual(
    typeof exports.allocate_buffer,
    "function",
    "WASM module must export 'allocate_buffer'"
  );
  assert.strictEqual(
    typeof exports.deallocate_buffer,
    "function",
    "WASM module must export 'deallocate_buffer'"
  );

  // Zero size allocation returns null pointer (0)
  const zeroPtr = exports.allocate_buffer(0);
  assert.strictEqual(zeroPtr, 0, "allocate_buffer(0) must return 0");

  // Non-zero allocation returns 8-byte aligned pointer
  const size = 64 * 1024; // 64 KiB
  const ptr = exports.allocate_buffer(size);
  assert.ok(ptr > 0, "allocate_buffer must return valid non-null pointer");
  assert.strictEqual(ptr % 8, 0, "allocate_buffer pointer must be 8-byte aligned");

  // Write and verify linear memory block
  const pattern = new Uint8Array(size);
  for (let i = 0; i < size; i++) pattern[i] = (i * 31) & 0xff;

  new Uint8Array(memory.buffer, ptr, size).set(pattern);
  const readBack = new Uint8Array(memory.buffer, ptr, size);
  for (let i = 0; i < size; i++) {
    assert.strictEqual(readBack[i], pattern[i], `Byte mismatch at index ${i}`);
  }

  // Deallocate buffer
  exports.deallocate_buffer(ptr, size);
  exports.deallocate_buffer(0, 0); // null safe no-op
});

test("Platform Schema Detection: Google Ads, Amazon PPC, and Microsoft Advertising (with BOM and localized currency)", async () => {
  const { exports, memory } = await loadWasm();

  assert.strictEqual(
    typeof exports.detect_schema,
    "function",
    "WASM module must export 'detect_schema'"
  );

  const testSchemaSniff = (headerBytes: Uint8Array): PlatformSchema => {
    const ptr = exports.allocate_buffer(headerBytes.length);
    try {
      new Uint8Array(memory.buffer, ptr, headerBytes.length).set(headerBytes);
      return exports.detect_schema(ptr, headerBytes.length) as PlatformSchema;
    } finally {
      exports.deallocate_buffer(ptr, headerBytes.length);
    }
  };

  // 1. Google Ads header (with Euro localized currency and comma decimal format in data)
  const googleHeader = new TextEncoder().encode(
    'Search keyword,Campaign,Ad group,Currency,Clicks,Impressions,Cost,Conversions\n"running shoes",Camp1,Adg1,EUR,15,200,"12,50 €",2.0\n'
  );
  assert.strictEqual(
    testSchemaSniff(googleHeader),
    PlatformSchema.GoogleAds,
    "Failed to detect Google Ads schema"
  );

  // 2. Amazon PPC header
  const amazonHeader = new TextEncoder().encode(
    'Date,Portfolio name,Currency,Campaign Name,Ad Group Name,Targeting,Customer Search Term,Impressions,Clicks,Click-Thru Rate (CTR),Cost Per Click (CPC),Spend,7 Day Total Sales\n'
  );
  assert.strictEqual(
    testSchemaSniff(amazonHeader),
    PlatformSchema.AmazonPPC,
    "Failed to detect Amazon PPC schema"
  );

  // 3. Microsoft Advertising header with UTF-16LE Byte Order Mark (BOM: 0xFF, 0xFE)
  const msHeaderStr = "Search term\tCampaign Name\tAd Group\tClicks\tSpend\tAll Conv.\n";
  const msHeaderUtf16 = new Uint8Array(2 + msHeaderStr.length * 2);
  msHeaderUtf16[0] = 0xff; // BOM LE
  msHeaderUtf16[1] = 0xfe;
  for (let i = 0; i < msHeaderStr.length; i++) {
    const code = msHeaderStr.charCodeAt(i);
    msHeaderUtf16[2 + i * 2] = code & 0xff;
    msHeaderUtf16[3 + i * 2] = (code >> 8) & 0xff;
  }
  assert.strictEqual(
    testSchemaSniff(msHeaderUtf16),
    PlatformSchema.MicrosoftAdvertising,
    "Failed to detect Microsoft Advertising schema with UTF-16LE BOM"
  );
});

test("N-Gram Radix Trie Aggregation: Unigrams, Bigrams, and Trigrams metrics", async () => {
  const { exports, memory } = await loadWasm();

  assert.strictEqual(typeof exports.engine_new, "function");
  assert.strictEqual(typeof exports.engine_free, "function");
  assert.strictEqual(typeof exports.engine_ingest_chunk, "function");
  assert.strictEqual(typeof exports.engine_export_ngram_metrics, "function");

  const engine = exports.engine_new();
  assert.ok(engine > 0, "engine_new must return valid instance pointer");

  try {
    // Feed Google Ads CSV chunk:
    // query "running shoes" -> unigram "running", "shoes", bigram "running shoes"
    // query "trail running shoes" -> unigram "trail", "running", "shoes", bigram "trail running", "running shoes", trigram "trail running shoes"
    const csv = [
      "Search keyword,Clicks,Cost,Conversions",
      '"running shoes",10,"20.00",2',
      '"trail running shoes",5,"15.00",1',
      '"Total: Account",15,"35.00",3', // Summary row
    ].join("\n");

    const csvBytes = new TextEncoder().encode(csv);
    const inPtr = exports.allocate_buffer(csvBytes.length);
    new Uint8Array(memory.buffer, inPtr, csvBytes.length).set(csvBytes);

    const ingestStatus = exports.engine_ingest_chunk(engine, inPtr, csvBytes.length, 1);
    exports.deallocate_buffer(inPtr, csvBytes.length);
    assert.strictEqual(ingestStatus, 0, "Ingestion must succeed");

    // Export and verify Unigrams (n=1)
    const outCap = 64 * 1024;
    const outPtr = exports.allocate_buffer(outCap);
    const bytesWritten = exports.engine_export_ngram_metrics(engine, 1, outPtr, outCap);
    assert.ok(bytesWritten > 0, "Must export unigram metrics");

    const jsonStr = new TextDecoder().decode(new Uint8Array(memory.buffer, outPtr, bytesWritten));
    exports.deallocate_buffer(outPtr, outCap);

    const unigrams = JSON.parse(jsonStr);
    // "shoes" appears in both rows (10+5=15 clicks, 20+15=35 cost, 2+1=3 conversions)
    const shoes = unigrams.find((u: any) => u.token === "shoes");
    assert.ok(shoes, "Unigram 'shoes' must exist");
    assert.strictEqual(shoes.clicks, 15);
    assert.strictEqual(Math.round(shoes.cost * 100), 3500);
    assert.strictEqual(shoes.conversions, 3);

    // "trail" appears only in second row (5 clicks, 15 cost, 1 conversion)
    const trail = unigrams.find((u: any) => u.token === "trail");
    assert.ok(trail, "Unigram 'trail' must exist");
    assert.strictEqual(trail.clicks, 5);
    assert.strictEqual(Math.round(trail.cost * 100), 1500);

    // Export and verify Bigrams (n=2)
    const outBigramPtr = exports.allocate_buffer(outCap);
    const bigramBytes = exports.engine_export_ngram_metrics(engine, 2, outBigramPtr, outCap);
    const bigrams = JSON.parse(new TextDecoder().decode(new Uint8Array(memory.buffer, outBigramPtr, bigramBytes)));
    exports.deallocate_buffer(outBigramPtr, outCap);

    const runningShoes = bigrams.find((b: any) => b.token === "running shoes");
    assert.ok(runningShoes, "Bigram 'running shoes' must exist");
    assert.strictEqual(runningShoes.clicks, 15);
    assert.strictEqual(Math.round(runningShoes.cost * 100), 3500);

    // Export and verify Trigrams (n=3)
    const outTrigramPtr = exports.allocate_buffer(outCap);
    const trigramBytes = exports.engine_export_ngram_metrics(engine, 3, outTrigramPtr, outCap);
    const trigrams = JSON.parse(new TextDecoder().decode(new Uint8Array(memory.buffer, outTrigramPtr, trigramBytes)));
    exports.deallocate_buffer(outTrigramPtr, outCap);

    const trailRunningShoes = trigrams.find((t: any) => t.token === "trail running shoes");
    assert.ok(trailRunningShoes, "Trigram 'trail running shoes' must exist");
    assert.strictEqual(trailRunningShoes.clicks, 5);
  } finally {
    exports.engine_free(engine);
  }
});

test("Deterministic Reporting Gap Tracking: Summary Row vs Aggregated Queries", async () => {
  const { exports, memory } = await loadWasm();

  assert.strictEqual(typeof exports.engine_get_reporting_gap, "function");

  const engine = exports.engine_new();
  try {
    // Total row states 50 clicks and 100.00 cost.
    // Query rows sum to 10 + 25 = 35 clicks and 20.00 + 40.00 = 60.00 cost.
    // Gap: 50 - 35 = 15 clicks, 100.00 - 60.00 = 40.00 cost.
    const csv = [
      "Search keyword,Clicks,Cost,Conversions",
      '"nike pegasus",10,"20.00",1',
      '"adidas ultraboost",25,"40.00",2',
      '"Total: Account",50,"100.00",5', // Summary row
    ].join("\n");

    const csvBytes = new TextEncoder().encode(csv);
    const inPtr = exports.allocate_buffer(csvBytes.length);
    new Uint8Array(memory.buffer, inPtr, csvBytes.length).set(csvBytes);
    exports.engine_ingest_chunk(engine, inPtr, csvBytes.length, 1);
    exports.deallocate_buffer(inPtr, csvBytes.length);

    const gapPtr = exports.allocate_buffer(64); // space for gap struct
    const status = exports.engine_get_reporting_gap(engine, gapPtr);
    assert.strictEqual(status, 0, "Reporting gap query must succeed");

    // Layout: 6 x f64 or u64:
    // [0]: summary_clicks, [1]: aggregated_clicks, [2]: gap_clicks
    // [3]: summary_cost,   [4]: aggregated_cost,   [5]: gap_cost
    const gapView = new Float64Array(memory.buffer, gapPtr, 6);
    const summaryClicks = gapView[0];
    const aggregatedClicks = gapView[1];
    const gapClicks = gapView[2];
    const summaryCost = gapView[3];
    const aggregatedCost = gapView[4];
    const gapCost = gapView[5];

    exports.deallocate_buffer(gapPtr, 64);

    assert.strictEqual(summaryClicks, 50, "Summary clicks");
    assert.strictEqual(aggregatedClicks, 35, "Aggregated query clicks");
    assert.strictEqual(gapClicks, 15, "Clicks reporting gap");

    assert.strictEqual(Math.round(summaryCost * 100), 10000, "Summary cost");
    assert.strictEqual(Math.round(aggregatedCost * 100), 6000, "Aggregated cost");
    assert.strictEqual(Math.round(gapCost * 100), 4000, "Cost reporting gap");
  } finally {
    exports.engine_free(engine);
  }
});

test("High-Throughput V8 Ingestion: Ingest 80MB mock CSV buffer in under 1200ms", async () => {
  const { exports, memory } = await loadWasm();

  const engine = exports.engine_new();
  assert.ok(engine > 0);

  try {
    // Generate an 80MB mock CSV payload:
    // Row pattern: "best running shoes for men 2026",12,"24.50",1\n
    // ~55 bytes per row -> ~1.5 million rows for 80MB
    const rowTemplate = '"best running shoes for men 2026",12,"24.50",1\n';
    const header = "Search keyword,Clicks,Cost,Conversions\n";
    const targetSize = 80 * 1024 * 1024; // 80 MB

    const buffer = new Uint8Array(targetSize);
    const enc = new TextEncoder();
    const headerBytes = enc.encode(header);
    buffer.set(headerBytes, 0);

    const rowBytes = enc.encode(rowTemplate);
    let offset = headerBytes.length;
    while (offset + rowBytes.length <= targetSize) {
      buffer.set(rowBytes, offset);
      offset += rowBytes.length;
    }

    const inPtr = exports.allocate_buffer(offset);
    assert.ok(inPtr > 0, "Failed to allocate 80MB in WASM linear memory");

    new Uint8Array(memory.buffer, inPtr, offset).set(buffer.subarray(0, offset));

    const start = performance.now();
    const status = exports.engine_ingest_chunk(engine, inPtr, offset, 1);
    const duration = performance.now() - start;

    exports.deallocate_buffer(inPtr, offset);

    assert.strictEqual(status, 0, "80MB Ingestion must succeed");
    console.log(`Ingested ${(offset / (1024 * 1024)).toFixed(2)} MB in ${duration.toFixed(2)}ms`);
    assert.ok(
      duration < 1200,
      `Ingestion took ${duration.toFixed(2)}ms, exceeding the 1200ms budget`
    );
  } finally {
    exports.engine_free(engine);
  }
});

test("Quality Audit: Zero Allocation Leaks under 900,000 Synthetic Rows", async () => {
  const { exports, memory } = await loadWasm();

  const engine = exports.engine_new();
  try {
    const enc = new TextEncoder();
    const header = "Search keyword,Clicks,Cost,Conversions\n";
    const headerBytes = enc.encode(header);
    const rowTemplate = '"performance running sneaker",5,"10.50",1\n';
    const rowBytes = enc.encode(rowTemplate);

    const rowCount = 900_000;
    const batchRows = 100_000;
    const batchSize = headerBytes.length + batchRows * rowBytes.length;

    const batchBuf = new Uint8Array(batchSize);
    batchBuf.set(headerBytes, 0);
    let offset = headerBytes.length;
    for (let r = 0; r < batchRows; r++) {
      batchBuf.set(rowBytes, offset);
      offset += rowBytes.length;
    }

    // Record initial memory pages
    const initialPages = memory.buffer.byteLength / 65536;

    // Stream 9 batches of 100,000 rows = 900,000 rows
    for (let b = 0; b < rowCount / batchRows; b++) {
      const inPtr = exports.allocate_buffer(offset);
      new Uint8Array(memory.buffer, inPtr, offset).set(batchBuf);
      const status = exports.engine_ingest_chunk(engine, inPtr, offset, b === (rowCount / batchRows) - 1 ? 1 : 0);
      assert.strictEqual(status, 0);
      exports.deallocate_buffer(inPtr, offset);
    }

    // Verify memory has not ballooned
    const finalPages = memory.buffer.byteLength / 65536;
    console.log(`900,000 rows processed. WASM memory pages: initial=${initialPages}, final=${finalPages}`);
    assert.ok(finalPages - initialPages < 100, "Memory must not leak under 900,000 synthetic rows");

    // Verify aggregates accurately calculated
    const outPtr = exports.allocate_buffer(1024);
    const bytesWritten = exports.engine_export_ngram_metrics(engine, 1, outPtr, 1024);
    const unigrams = JSON.parse(new TextDecoder().decode(new Uint8Array(memory.buffer, outPtr, bytesWritten)));
    exports.deallocate_buffer(outPtr, 1024);

    const sneaker = unigrams.find((u: any) => u.token === "sneaker");
    assert.ok(sneaker, "Token 'sneaker' must exist");
    assert.strictEqual(sneaker.clicks, 900_000 * 5);
  } finally {
    exports.engine_free(engine);
  }
});

