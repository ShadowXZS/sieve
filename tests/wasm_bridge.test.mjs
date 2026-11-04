import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.resolve(__dirname, "../target/wasm32-unknown-unknown/release/sieve_core.wasm");

/**
 * Loads and instantiates the release sieve_core.wasm module.
 */
async function loadWasmModule() {
  const wasmBuffer = await fs.readFile(wasmPath);
  const wasmModule = await WebAssembly.compile(wasmBuffer);
  const instance = await WebAssembly.instantiate(wasmModule, {});
  return { instance, memory: instance.exports.memory, exports: instance.exports };
}

test("WASM Memory Allocator Contract: alloc and dealloc", async () => {
  const { exports, memory } = await loadWasmModule();

  assert.strictEqual(typeof exports.alloc, "function", "Module must export 'alloc'");
  assert.strictEqual(typeof exports.dealloc, "function", "Module must export 'dealloc'");

  // 1. Zero size returns null pointer (0)
  const zeroPtr = exports.alloc(0);
  assert.strictEqual(zeroPtr, 0, "alloc(0) must return null pointer (0)");

  // 2. Normal allocation
  const allocSize = 1024;
  const ptr = exports.alloc(allocSize);
  assert.ok(ptr > 0, "alloc must return non-zero pointer");
  assert.strictEqual(ptr % 8, 0, "Allocated pointer must be 8-byte aligned");

  // 3. Write and verify memory integrity
  const testBytes = new Uint8Array(allocSize);
  for (let i = 0; i < allocSize; i++) {
    testBytes[i] = i % 256;
  }
  const wasmMemView = new Uint8Array(memory.buffer, ptr, allocSize);
  wasmMemView.set(testBytes);

  for (let i = 0; i < allocSize; i++) {
    assert.strictEqual(wasmMemView[i], i % 256, `Byte at index ${i} must match`);
  }

  // 4. Deallocation does not crash
  exports.dealloc(ptr, allocSize);
  exports.dealloc(0, 0); // Safe no-op on null/zero
});

test("Deterministic CSV Filter: Exact Match and Column Selection", async () => {
  const { exports, memory } = await loadWasmModule();

  const csv = "id,status,region,amount\n101,PENDING,US-EAST,45.50\n102,CONFIRMED,EU-WEST,120.00\n103,PENDING,AP-SOUTH,90.25\n104,CANCELLED,US-EAST,12.00\n105,CONFIRMED,US-WEST,340.00\n";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const csvBytes = encoder.encode(csv);
  const queryBytes = encoder.encode("CONFIRMED");

  const inPtr = exports.alloc(csvBytes.length);
  const queryPtr = exports.alloc(queryBytes.length);
  const outCap = csvBytes.length * 2;
  const outPtr = exports.alloc(outCap);
  const statsPtr = exports.alloc(32); // 4 * u64 (32 bytes)

  try {
    new Uint8Array(memory.buffer, inPtr, csvBytes.length).set(csvBytes);
    new Uint8Array(memory.buffer, queryPtr, queryBytes.length).set(queryBytes);

    // Filter on column 1 ("status"), op 1 (ExactMatch)
    const status = exports.sieve_filter_csv(
      inPtr,
      csvBytes.length,
      1, // col 1: status
      1, // op 1: ExactMatch
      queryPtr,
      queryBytes.length,
      outPtr,
      outCap,
      statsPtr
    );

    assert.strictEqual(status, 0, "Status must indicate success");

    const stats = new BigUint64Array(memory.buffer, statsPtr, 4);
    const totalRecords = stats[0];
    const matchedRecords = stats[1];
    const bytesConsumed = stats[2];
    const bytesWritten = stats[3];

    assert.strictEqual(totalRecords, 6n, "Header + 5 records = 6 total records");
    assert.strictEqual(matchedRecords, 2n, "Expected 2 records with CONFIRMED status");
    assert.strictEqual(bytesConsumed, BigInt(csvBytes.length), "Must consume all input bytes");
    assert.ok(bytesWritten > 0n, "Must have written matched bytes");

    const resultText = decoder.decode(new Uint8Array(memory.buffer, outPtr, Number(bytesWritten)));
    assert.ok(resultText.includes("102,CONFIRMED,EU-WEST,120.00\n"));
    assert.ok(resultText.includes("105,CONFIRMED,US-WEST,340.00\n"));
    assert.ok(!resultText.includes("PENDING"));
    assert.ok(!resultText.includes("CANCELLED"));
  } finally {
    exports.dealloc(inPtr, csvBytes.length);
    exports.dealloc(queryPtr, queryBytes.length);
    exports.dealloc(outPtr, outCap);
    exports.dealloc(statsPtr, 32);
  }
});

test("Filter Operations: Case-Insensitive, Contains, StartsWith", async () => {
  const { exports, memory } = await loadWasmModule();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const csv = "name,role,email\nAlice Cooper,Admin,alice@example.com\nBob Dylan,ENGINEER,bob@work.io\nCharlie Parker,engineer,charlie@work.io\n";
  const csvBytes = encoder.encode(csv);

  const runFilter = (col, op, query) => {
    const queryBytes = encoder.encode(query);
    const inPtr = exports.alloc(csvBytes.length);
    const queryPtr = exports.alloc(queryBytes.length);
    const outCap = 1024;
    const outPtr = exports.alloc(outCap);
    const statsPtr = exports.alloc(32);

    try {
      new Uint8Array(memory.buffer, inPtr, csvBytes.length).set(csvBytes);
      new Uint8Array(memory.buffer, queryPtr, queryBytes.length).set(queryBytes);

      exports.sieve_filter_csv(inPtr, csvBytes.length, col, op, queryPtr, queryBytes.length, outPtr, outCap, statsPtr);

      const stats = new BigUint64Array(memory.buffer, statsPtr, 4);
      const matched = stats[1];
      const bytesWritten = Number(stats[3]);
      const text = decoder.decode(new Uint8Array(memory.buffer, outPtr, bytesWritten));
      return { matched, text };
    } finally {
      exports.dealloc(inPtr, csvBytes.length);
      exports.dealloc(queryPtr, queryBytes.length);
      exports.dealloc(outPtr, outCap);
      exports.dealloc(statsPtr, 32);
    }
  };

  // Case-insensitive exact match: role = "engineer"
  const r1 = runFilter(1, 5 /* ExactMatchCaseInsensitive */, "engineer");
  assert.strictEqual(r1.matched, 2n);
  assert.ok(r1.text.includes("Bob Dylan"));
  assert.ok(r1.text.includes("Charlie Parker"));

  // StartsWith: name starts with "Al"
  const r2 = runFilter(0, 3 /* StartsWith */, "Al");
  assert.strictEqual(r2.matched, 1n);
  assert.ok(r2.text.includes("Alice Cooper"));

  // Contains: email contains "@work.io"
  const r3 = runFilter(2, 2 /* Contains */, "@work.io");
  assert.strictEqual(r3.matched, 2n);
  assert.ok(r3.text.includes("bob@work.io"));
  assert.ok(r3.text.includes("charlie@work.io"));
});

test("Stateful Streaming Pipeline: Multi-chunk feeding and reset", async () => {
  const { exports, memory } = await loadWasmModule();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const pipelinePtr = exports.sieve_pipeline_new();
  assert.ok(pipelinePtr > 0, "sieve_pipeline_new must return valid instance pointer");

  try {
    const query = encoder.encode("target");
    const queryPtr = exports.alloc(query.length);
    new Uint8Array(memory.buffer, queryPtr, query.length).set(query);

    // Set filter: col 1, ExactMatch
    exports.sieve_pipeline_set_filter(pipelinePtr, 1, 1, queryPtr, query.length);
    exports.dealloc(queryPtr, query.length);

    // Chunk 1
    const chunk1 = encoder.encode("id,type,val\n1,target,10\n2,other,20\n");
    const in1Ptr = exports.alloc(chunk1.length);
    const out1Ptr = exports.alloc(1024);
    const stats1Ptr = exports.alloc(32);
    new Uint8Array(memory.buffer, in1Ptr, chunk1.length).set(chunk1);

    const s1 = exports.sieve_pipeline_process_chunk(pipelinePtr, in1Ptr, chunk1.length, out1Ptr, 1024, stats1Ptr);
    assert.strictEqual(s1, 0);

    const stats1 = new BigUint64Array(memory.buffer, stats1Ptr, 4);
    assert.strictEqual(stats1[0], 3n, "3 total records in chunk 1");
    assert.strictEqual(stats1[1], 1n, "1 matched record in chunk 1");
    const text1 = decoder.decode(new Uint8Array(memory.buffer, out1Ptr, Number(stats1[3])));
    assert.ok(text1.includes("1,target,10\n"));

    exports.dealloc(in1Ptr, chunk1.length);
    exports.dealloc(out1Ptr, 1024);
    exports.dealloc(stats1Ptr, 32);

    // Chunk 2
    const chunk2 = encoder.encode("3,target,30\n4,target,40\n");
    const in2Ptr = exports.alloc(chunk2.length);
    const out2Ptr = exports.alloc(1024);
    const stats2Ptr = exports.alloc(32);
    new Uint8Array(memory.buffer, in2Ptr, chunk2.length).set(chunk2);

    const s2 = exports.sieve_pipeline_process_chunk(pipelinePtr, in2Ptr, chunk2.length, out2Ptr, 1024, stats2Ptr);
    assert.strictEqual(s2, 0);

    const stats2 = new BigUint64Array(memory.buffer, stats2Ptr, 4);
    assert.strictEqual(stats2[0], 5n, "Cumulative 5 total records");
    assert.strictEqual(stats2[1], 3n, "Cumulative 3 matched records");

    exports.dealloc(in2Ptr, chunk2.length);
    exports.dealloc(out2Ptr, 1024);
    exports.dealloc(stats2Ptr, 32);

    // Reset pipeline
    exports.sieve_pipeline_reset(pipelinePtr);

    // Chunk after reset
    const chunk3 = encoder.encode("10,target,99\n");
    const in3Ptr = exports.alloc(chunk3.length);
    const out3Ptr = exports.alloc(1024);
    const stats3Ptr = exports.alloc(32);
    new Uint8Array(memory.buffer, in3Ptr, chunk3.length).set(chunk3);

    exports.sieve_pipeline_process_chunk(pipelinePtr, in3Ptr, chunk3.length, out3Ptr, 1024, stats3Ptr);
    const stats3 = new BigUint64Array(memory.buffer, stats3Ptr, 4);
    assert.strictEqual(stats3[0], 1n, "Total records reset to 1");
    assert.strictEqual(stats3[1], 1n, "Matched records reset to 1");

    exports.dealloc(in3Ptr, chunk3.length);
    exports.dealloc(out3Ptr, 1024);
    exports.dealloc(stats3Ptr, 32);
  } finally {
    exports.sieve_pipeline_free(pipelinePtr);
  }
});

test("Zero Allocation & Quoted CSV field handling via csv-core", async () => {
  const { exports, memory } = await loadWasmModule();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // CSV with commas inside quoted fields and quotes escaped as double quotes
  const csv = 'id,company,notes\n1,"Acme, Inc.",Standard client\n2,"Globex, LLC","Quoted ""special"" note"\n3,"Initech","No comma"\n';
  const csvBytes = encoder.encode(csv);
  const queryBytes = encoder.encode("Acme, Inc.");

  const inPtr = exports.alloc(csvBytes.length);
  const queryPtr = exports.alloc(queryBytes.length);
  const outCap = 1024;
  const outPtr = exports.alloc(outCap);
  const statsPtr = exports.alloc(32);

  try {
    new Uint8Array(memory.buffer, inPtr, csvBytes.length).set(csvBytes);
    new Uint8Array(memory.buffer, queryPtr, queryBytes.length).set(queryBytes);

    // Filter col 1: ExactMatch for unescaped field "Acme, Inc."
    const status = exports.sieve_filter_csv(
      inPtr,
      csvBytes.length,
      1,
      1,
      queryPtr,
      queryBytes.length,
      outPtr,
      outCap,
      statsPtr
    );

    assert.strictEqual(status, 0);
    const stats = new BigUint64Array(memory.buffer, statsPtr, 4);
    assert.strictEqual(stats[1], 1n, "Must match 1 row despite comma inside quotes");

    const text = decoder.decode(new Uint8Array(memory.buffer, outPtr, Number(stats[3])));
    assert.ok(text.includes('1,"Acme, Inc.",Standard client\n'));
  } finally {
    exports.dealloc(inPtr, csvBytes.length);
    exports.dealloc(queryPtr, queryBytes.length);
    exports.dealloc(outPtr, outCap);
    exports.dealloc(statsPtr, 32);
  }
});

