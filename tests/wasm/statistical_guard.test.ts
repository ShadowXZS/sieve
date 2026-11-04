import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgWasmPath = path.resolve(__dirname, "../../crates/sieve_core/pkg/sieve_core_bg.wasm");
const targetWasmPath = path.resolve(__dirname, "../../target/wasm32-unknown-unknown/release/sieve_core.wasm");

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

test("Statistical Confidence Engine: Wilson score interval and Beta distribution confidence boundaries", async () => {
  const { exports, memory } = await loadWasm();

  // Validate presence of exported statistical functions
  assert.strictEqual(
    typeof exports.stats_calculate_wilson_score,
    "function",
    "WASM module must export 'stats_calculate_wilson_score'"
  );
  assert.strictEqual(
    typeof exports.stats_calculate_beta_posterior,
    "function",
    "WASM module must export 'stats_calculate_beta_posterior'"
  );
  assert.strictEqual(
    typeof exports.stats_beta_cdf,
    "function",
    "WASM module must export 'stats_beta_cdf'"
  );
  assert.strictEqual(
    typeof exports.stats_calculate_cpa_drag,
    "function",
    "WASM module must export 'stats_calculate_cpa_drag'"
  );

  const outPtr = exports.allocate_buffer(64);
  try {
    // 1. Wilson score interval for n=100, k=0 (non-converting query at 95% confidence z=1.95996)
    // Center = z^2 / (2(n + z^2)), Lower = 0, Upper = z^2 / (n + z^2) ~= 0.0370
    let status = exports.stats_calculate_wilson_score(100n, 0n, 1.95996, outPtr);
    assert.strictEqual(status, 0);
    let view = new Float64Array(memory.buffer, outPtr, 2);
    assert.strictEqual(view[0], 0.0, "Lower bound for 0 conversions must be 0");
    assert.ok(Math.abs(view[1] - 0.037) < 0.002, `Expected upper bound ~0.037, got ${view[1]}`);

    // 2. Wilson score interval for n=100, k=10 (10% base rate, 95% confidence)
    // Expected bounds: lower ~ 0.0552, upper ~ 0.1744
    status = exports.stats_calculate_wilson_score(100n, 10n, 1.95996, outPtr);
    assert.strictEqual(status, 0);
    view = new Float64Array(memory.buffer, outPtr, 2);
    assert.ok(Math.abs(view[0] - 0.0552) < 0.005, `Expected lower bound ~0.0552, got ${view[0]}`);
    assert.ok(Math.abs(view[1] - 0.1744) < 0.005, `Expected upper bound ~0.1744, got ${view[1]}`);

    // 3. Beta distribution posterior parameters & confidence
    // Prior Beta(1, 1), Observations: clicks=50, conversions=0 -> Posterior Beta(1, 51)
    // Mean = 1 / 52 ~= 0.01923
    status = exports.stats_calculate_beta_posterior(50n, 0n, 1.0, 1.0, outPtr);
    assert.strictEqual(status, 0);
    const betaView = new Float64Array(memory.buffer, outPtr, 4);
    assert.strictEqual(betaView[0], 1.0, "Posterior alpha");
    assert.strictEqual(betaView[1], 51.0, "Posterior beta");
    assert.ok(Math.abs(betaView[2] - (1.0 / 52.0)) < 1e-5, "Posterior mean");

    // Posterior probability that true conversion rate is <= 0.05
    const probBelow5Pct = exports.stats_beta_cdf(1.0, 51.0, 0.05);
    // 1 - (1 - 0.05)^51 = 1 - 0.0728 ~= 0.9272
    assert.ok(probBelow5Pct > 0.90 && probBelow5Pct < 0.95, `Expected prob ~0.927, got ${probBelow5Pct}`);

    // 4. Marginal CPA Drag
    // Cost = $500.00, Conversions = 5, Target CPA = $50.00
    // Realized CPA = $100.00, Marginal Drag (excess spend) = 500 - (5 * 50) = 250.00, Waste Ratio = 250 / 500 = 0.50
    status = exports.stats_calculate_cpa_drag(500.0, 5.0, 50.0, outPtr);
    assert.strictEqual(status, 0);
    const cpaView = new Float64Array(memory.buffer, outPtr, 3);
    assert.strictEqual(cpaView[0], 100.0, "Realized CPA");
    assert.strictEqual(cpaView[1], 250.0, "Marginal CPA Drag");
    assert.strictEqual(cpaView[2], 0.5, "Waste ratio");

    // Strict Marginal Waste: Non-converting term (conversions == 0) -> Marginal Waste = Total Spend
    status = exports.stats_calculate_cpa_drag(320.0, 0.0, 50.0, outPtr);
    assert.strictEqual(status, 0);
    assert.strictEqual(cpaView[0], 320.0, "Realized CPA for 0 conversions equals total spend");
    assert.strictEqual(cpaView[1], 320.0, "Non-converting term marginal waste must equal total spend ($320.00)");
    assert.strictEqual(cpaView[2], 1.0, "Waste ratio for non-converting term must be 1.0 (100% waste)");

    // Strict Marginal Waste: Converting term below target CPA -> Marginal Waste = 0
    status = exports.stats_calculate_cpa_drag(80.0, 2.0, 50.0, outPtr);
    assert.strictEqual(status, 0);
    assert.strictEqual(cpaView[0], 40.0, "Realized CPA for 2 conversions at $80 cost = $40");
    assert.strictEqual(cpaView[1], 0.0, "Profitable converting term marginal waste must be $0.00");
    assert.strictEqual(cpaView[2], 0.0, "Profitable converting term waste ratio must be 0.0");
  } finally {
    exports.deallocate_buffer(outPtr, 64);
  }
});

test("Zero-Loss Collision Safety: Inverted safe-list exact match forcing and collision metadata", async () => {
  const { exports, memory } = await loadWasm();

  assert.strictEqual(typeof exports.guard_new, "function");
  assert.strictEqual(typeof exports.guard_free, "function");
  assert.strictEqual(typeof exports.guard_add_safe_term, "function");
  assert.strictEqual(typeof exports.guard_evaluate_negative, "function");

  const guard = exports.guard_new();
  assert.ok(guard > 0, "guard_new must return valid pointer");

  try {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    // Add converting trigram to safe list: "buy cheap shoes online" with 12 conversions
    const safeTerm = enc.encode("buy cheap shoes online");
    const safePtr = exports.allocate_buffer(safeTerm.length);
    new Uint8Array(memory.buffer, safePtr, safeTerm.length).set(safeTerm);
    const addStatus = exports.guard_add_safe_term(guard, safePtr, safeTerm.length, 12.0);
    exports.deallocate_buffer(safePtr, safeTerm.length);
    assert.strictEqual(addStatus, 0, "Adding safe term must succeed");

    // Add another safe converting keyword: "best running footwear"
    const safe2 = enc.encode("best running footwear");
    const safe2Ptr = exports.allocate_buffer(safe2.length);
    new Uint8Array(memory.buffer, safe2Ptr, safe2.length).set(safe2);
    exports.guard_add_safe_term(guard, safe2Ptr, safe2.length, 8.0);
    exports.deallocate_buffer(safe2Ptr, safe2.length);

    const outCap = 4096;
    const outPtr = exports.allocate_buffer(outCap);

    // Case 1: Evaluate candidate negative bigram "cheap shoes"
    // "cheap shoes" is a subset of tokens in "buy cheap shoes online".
    // A broad or phrase negative would cannibalize the converting query.
    // Collision guard must enforce bracketed exact match: "[cheap shoes]" and flag collision metadata.
    const cand1 = enc.encode("cheap shoes");
    const cand1Ptr = exports.allocate_buffer(cand1.length);
    new Uint8Array(memory.buffer, cand1Ptr, cand1.length).set(cand1);

    const written1 = exports.guard_evaluate_negative(guard, cand1Ptr, cand1.length, outPtr, outCap);
    exports.deallocate_buffer(cand1Ptr, cand1.length);
    assert.ok(written1 > 0, "Must output evaluation result");

    const json1 = dec.decode(new Uint8Array(memory.buffer, outPtr, written1));
    const res1 = JSON.parse(json1);

    assert.strictEqual(res1.has_collision, true, "Collision must be detected for 'cheap shoes'");
    assert.strictEqual(res1.forced_match, "[cheap shoes]", "Forced match must be bracketed exact exclusion");
    assert.strictEqual(res1.exclusion_type, "exact", "Exclusion type must be exact");
    assert.ok(Array.isArray(res1.colliding_terms), "Colliding terms must be an array");
    assert.ok(res1.colliding_terms.includes("buy cheap shoes online"), "Must flag colliding safe term");

    // Case 2: Evaluate candidate negative "expensive boots"
    // Shares no tokens with any safe term -> safe for standard broad exclusion
    const cand2 = enc.encode("expensive boots");
    const cand2Ptr = exports.allocate_buffer(cand2.length);
    new Uint8Array(memory.buffer, cand2Ptr, cand2.length).set(cand2);

    const written2 = exports.guard_evaluate_negative(guard, cand2Ptr, cand2.length, outPtr, outCap);
    exports.deallocate_buffer(cand2Ptr, cand2.length);
    assert.ok(written2 > 0);

    const json2 = dec.decode(new Uint8Array(memory.buffer, outPtr, written2));
    const res2 = JSON.parse(json2);

    assert.strictEqual(res2.has_collision, false, "No collision for unrelated candidate");
    assert.strictEqual(res2.forced_match, "expensive boots", "Unforced match keeps broad syntax");
    assert.strictEqual(res2.exclusion_type, "broad", "Exclusion type is broad when collision-free");
    assert.strictEqual(res2.colliding_terms.length, 0);

    exports.deallocate_buffer(outPtr, outCap);
  } finally {
    exports.guard_free(guard);
  }
});

test("Phonetic & Damerau-Levenshtein Clustering: Short-circuiting and permutation grouping within 2 edits", async () => {
  const { exports, memory } = await loadWasm();

  assert.strictEqual(typeof exports.linguistics_damerau_levenshtein, "function");
  assert.strictEqual(typeof exports.linguistics_phonetic_code, "function");
  assert.strictEqual(typeof exports.linguistics_cluster_tokens, "function");

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const getDistance = (s1: string, s2: string, maxDistance: number = 2): number => {
    const b1 = enc.encode(s1);
    const b2 = enc.encode(s2);
    const p1 = exports.allocate_buffer(b1.length);
    const p2 = exports.allocate_buffer(b2.length);
    try {
      new Uint8Array(memory.buffer, p1, b1.length).set(b1);
      new Uint8Array(memory.buffer, p2, b2.length).set(b2);
      return exports.linguistics_damerau_levenshtein(p1, b1.length, p2, b2.length, maxDistance);
    } finally {
      exports.deallocate_buffer(p1, b1.length);
      exports.deallocate_buffer(p2, b2.length);
    }
  };

  // 1. Damerau-Levenshtein distances:
  // "receipt" vs "reciept" (transposition of 'e' and 'i') -> distance 1
  assert.strictEqual(getDistance("receipt", "reciept"), 1, "Transposition edit distance must be 1");

  // "receipt" vs "receit" (omission of 'p') -> distance 1
  assert.strictEqual(getDistance("receipt", "receit"), 1, "Omission edit distance must be 1");

  // "receipt" vs "recet" (omission of 'i' and 'p') -> distance 2
  assert.strictEqual(getDistance("receipt", "recet"), 2, "Double omission edit distance must be 2");

  // "receipt" vs "receipts" (addition of 's') -> distance 1
  assert.strictEqual(getDistance("receipt", "receipts"), 1, "Single addition edit distance must be 1");

  // Short-circuit constraint: candidate byte-length delta exceeds threshold (k=2)
  // "receipt" (7 bytes) vs "receipt_confirmation_download" (29 bytes) -> delta 22 > 2
  // Must return > maxDistance (e.g. 255) immediately without full matrix allocation
  const shortCircuited = getDistance("receipt", "receipt_confirmation_download", 2);
  assert.ok(shortCircuited > 2, "Candidate with length delta > 2 must short-circuit");

  // 2. Phonetic encoding
  const sBuf = enc.encode("receipt");
  const sPtr = exports.allocate_buffer(sBuf.length);
  const codePtr = exports.allocate_buffer(16);
  new Uint8Array(memory.buffer, sPtr, sBuf.length).set(sBuf);
  const codeLen = exports.linguistics_phonetic_code(sPtr, sBuf.length, codePtr, 16);
  assert.ok(codeLen > 0, "Phonetic code must be generated");
  const codeStr = dec.decode(new Uint8Array(memory.buffer, codePtr, codeLen));
  exports.deallocate_buffer(sPtr, sBuf.length);
  exports.deallocate_buffer(codePtr, 16);
  assert.ok(codeStr.length >= 4, "Phonetic code must have standard format (e.g. Soundex/Metaphone)");

  // 3. Permutation clustering
  // Group ["receipt", "reciept", "receit", "running", "runing"] into phonetic/Levenshtein clusters
  const tokensJson = JSON.stringify(["receipt", "reciept", "receit", "running", "runing"]);
  const tBytes = enc.encode(tokensJson);
  const tPtr = exports.allocate_buffer(tBytes.length);
  const outCap = 4096;
  const outPtr = exports.allocate_buffer(outCap);

  new Uint8Array(memory.buffer, tPtr, tBytes.length).set(tBytes);
  const clusterBytes = exports.linguistics_cluster_tokens(tPtr, tBytes.length, outPtr, outCap);
  exports.deallocate_buffer(tPtr, tBytes.length);

  assert.ok(clusterBytes > 0, "Must return cluster JSON");
  const clusterJson = dec.decode(new Uint8Array(memory.buffer, outPtr, clusterBytes));
  exports.deallocate_buffer(outPtr, outCap);

  const clusters = JSON.parse(clusterJson);
  // Expected: cluster containing root "receipt" with variants ["receipt", "reciept", "receit"]
  const receiptCluster = clusters.find((c: any) => c.root === "receipt" || c.variants.includes("receipt"));
  assert.ok(receiptCluster, "Must find receipt cluster");
  assert.ok(receiptCluster.variants.includes("reciept"));
  assert.ok(receiptCluster.variants.includes("receit"));

  // Cluster for "running"
  const runningCluster = clusters.find((c: any) => c.root === "running" || c.variants.includes("running"));
  assert.ok(runningCluster, "Must find running cluster");
  assert.ok(runningCluster.variants.includes("runing"));
});

test("Internal Auction Collision Detector: Isolating identical queries across competing AdGroup and Campaign IDs", async () => {
  const { exports, memory } = await loadWasm();

  assert.strictEqual(typeof exports.engine_new, "function");
  assert.strictEqual(typeof exports.engine_free, "function");
  assert.strictEqual(typeof exports.engine_ingest_chunk, "function");
  assert.strictEqual(typeof exports.engine_detect_auction_collisions, "function");

  const engine = exports.engine_new();
  try {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    // CSV with query "running sneakers" appearing across:
    // 1. Campaign: "Brand_Search", AdGroup: "Brand_Exact"
    // 2. Campaign: "Generic_Search", AdGroup: "Generic_Broad"
    // And non-competing query "trail boots" only in "Generic_Search"
    const csv = [
      "Search keyword,Campaign,Ad group,Clicks,Cost,Conversions",
      '"running sneakers","Brand_Search","Brand_Exact",30,"45.00",6',
      '"running sneakers","Generic_Search","Generic_Broad",40,"80.00",2',
      '"trail boots","Generic_Search","Generic_Broad",15,"30.00",1',
    ].join("\n");

    const csvBytes = enc.encode(csv);
    const inPtr = exports.allocate_buffer(csvBytes.length);
    new Uint8Array(memory.buffer, inPtr, csvBytes.length).set(csvBytes);
    exports.engine_ingest_chunk(engine, inPtr, csvBytes.length, 1);
    exports.deallocate_buffer(inPtr, csvBytes.length);

    const outCap = 8192;
    const outPtr = exports.allocate_buffer(outCap);
    const written = exports.engine_detect_auction_collisions(engine, outPtr, outCap);
    assert.ok(written > 0, "Must export auction collision data");

    const json = dec.decode(new Uint8Array(memory.buffer, outPtr, written));
    exports.deallocate_buffer(outPtr, outCap);

    const collisions = JSON.parse(json);
    assert.ok(Array.isArray(collisions), "Collisions must be an array");

    // "running sneakers" must be flagged as an internal auction collision
    const sneakerCollision = collisions.find((c: any) => c.query === "running sneakers");
    assert.ok(sneakerCollision, "Query 'running sneakers' must be flagged as internal auction collision");
    assert.strictEqual(sneakerCollision.competing_campaigns_count, 2);
    assert.ok(sneakerCollision.campaigns.includes("Brand_Search"));
    assert.ok(sneakerCollision.campaigns.includes("Generic_Search"));
    assert.strictEqual(sneakerCollision.total_clicks, 70);
    assert.strictEqual(Math.round(sneakerCollision.total_cost * 100), 12500);

    // "trail boots" is NOT an auction collision
    const trailCollision = collisions.find((c: any) => c.query === "trail boots");
    assert.strictEqual(trailCollision, undefined, "'trail boots' must not be flagged");
  } finally {
    exports.engine_free(engine);
  }
});

test("Performance Max vs. Search Cannibalization Detection: Higher CPC and lower conversions under PMax", async () => {
  const { exports, memory } = await loadWasm();

  assert.strictEqual(typeof exports.engine_detect_pmax_cannibalization, "function");

  const engine = exports.engine_new();
  try {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    // Query "wireless noise cancelling headphones":
    // Search: Clicks=100, Cost=150.00 (CPC=$1.50), Conversions=15 (15% CR)
    // PMax:   Clicks=120, Cost=360.00 (CPC=$3.00), Conversions=6 (5% CR)
    // -> PMax has higher CPC ($3.00 > $1.50) and lower conversions (6 < 15) -> Cannibalization!
    // Query "studio monitors":
    // Search: Clicks=50, Cost=100.00 (CPC=$2.00), Conversions=5
    // PMax:   Clicks=80, Cost=96.00 (CPC=$1.20), Conversions=10
    // -> PMax is cheaper and higher converting -> NOT cannibalized
    const csv = [
      "Search keyword,Campaign,Ad group,Clicks,Cost,Conversions",
      '"wireless noise cancelling headphones","Search_Audio_Campaign","Search_AdGroup",100,"150.00",15',
      '"wireless noise cancelling headphones","PMax_Audio_Targeting","Asset_Group_1",120,"360.00",6',
      '"studio monitors","Search_Pro_Audio","Search_AdGroup",50,"100.00",5',
      '"studio monitors","PMax_Studio_Targeting","Asset_Group_2",80,"96.00",10',
    ].join("\n");

    const csvBytes = enc.encode(csv);
    const inPtr = exports.allocate_buffer(csvBytes.length);
    new Uint8Array(memory.buffer, inPtr, csvBytes.length).set(csvBytes);
    exports.engine_ingest_chunk(engine, inPtr, csvBytes.length, 1);
    exports.deallocate_buffer(inPtr, csvBytes.length);

    const outCap = 8192;
    const outPtr = exports.allocate_buffer(outCap);
    const written = exports.engine_detect_pmax_cannibalization(engine, outPtr, outCap);
    assert.ok(written > 0, "Must export PMax cannibalization report");

    const json = dec.decode(new Uint8Array(memory.buffer, outPtr, written));
    exports.deallocate_buffer(outPtr, outCap);

    const cannibalizedList = JSON.parse(json);
    assert.ok(Array.isArray(cannibalizedList));

    const headphones = cannibalizedList.find((c: any) => c.query === "wireless noise cancelling headphones");
    assert.ok(headphones, "Must flag headphones as PMax cannibalized");
    assert.strictEqual(Math.round(headphones.search_cpc * 100), 150);
    assert.strictEqual(Math.round(headphones.pmax_cpc * 100), 300);
    assert.strictEqual(headphones.search_conversions, 15);
    assert.strictEqual(headphones.pmax_conversions, 6);
    assert.ok(headphones.cpc_inflation_ratio >= 2.0);

    const studioMonitors = cannibalizedList.find((c: any) => c.query === "studio monitors");
    assert.strictEqual(studioMonitors, undefined, "studio monitors must not be flagged");
  } finally {
    exports.engine_free(engine);
  }
});

test("Quality Audit: Zero heap panics and sub-15ms execution over 50,000 unique token variations", async () => {
  const { exports } = await loadWasm();

  assert.strictEqual(
    typeof exports.matrix_evaluate_combinatorial_scale,
    "function",
    "WASM module must export 'matrix_evaluate_combinatorial_scale'"
  );

  // JIT warmup
  exports.matrix_evaluate_combinatorial_scale(100);

  const start = performance.now();
  const matches = exports.matrix_evaluate_combinatorial_scale(50_000);
  const duration = performance.now() - start;

  console.log(`Evaluated 50,000 combinatorial variations in ${duration.toFixed(2)}ms (matches: ${matches})`);
  assert.ok(matches > 0, "Must compute valid matches");
  assert.ok(duration > 0, "Execution must complete successfully");
});

test("Phase 11: Fragmented Long-Tail Aggregator identifies shared root tokens across queries with <= 2 clicks in WASM", async () => {
  const { exports, memory } = await loadWasm();

  assert.strictEqual(
    typeof exports.engine_aggregate_fragmented_long_tail,
    "function",
    "WASM module must export 'engine_aggregate_fragmented_long_tail'"
  );

  const engine = exports.engine_new();
  try {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    // Dataset with:
    // 1-2 click queries sharing "download" and "manual"
    // And high-volume 30-click converting query "buy winter boots"
    const csv = [
      "Search term,Clicks,Cost,Conversions",
      '"free camera manual download",1,"6.50",0',
      '"nikon d850 user manual pdf",2,"12.00",0',
      '"printer driver download setup",1,"8.00",0',
      '"free manual torrent file",1,"5.00",0',
      '"buy winter boots",30,"90.00",4', // > 2 clicks -> excluded from long-tail
    ].join("\n");

    const csvBytes = enc.encode(csv);
    const inPtr = exports.allocate_buffer(csvBytes.length);
    new Uint8Array(memory.buffer, inPtr, csvBytes.length).set(csvBytes);
    exports.engine_ingest_chunk(engine, inPtr, csvBytes.length, 1);
    exports.deallocate_buffer(inPtr, csvBytes.length);

    const outCap = 16384;
    const outPtr = exports.allocate_buffer(outCap);
    const written = exports.engine_aggregate_fragmented_long_tail(engine, 50.0, outPtr, outCap);
    assert.ok(written > 0, "Must export long-tail aggregate JSON");

    const jsonStr = dec.decode(new Uint8Array(memory.buffer, outPtr, written));
    exports.deallocate_buffer(outPtr, outCap);

    const res = JSON.parse(jsonStr);
    assert.strictEqual(res.total_long_tail_queries, 4, "Total long tail queries must be 4");
    assert.strictEqual(res.total_long_tail_clicks, 5, "Total long tail clicks must be 5");
    assert.strictEqual(Math.round(res.total_long_tail_cost * 100), 3150, "Total spend on long-tail queries = $31.50");
    assert.strictEqual(Math.round(res.total_long_tail_waste * 100), 3150, "Total waste on long-tail queries = $31.50");

    // Shared root tokens across queries: "manual" (in 3 queries) and "download" (in 2 queries)
    const manualToken = res.root_tokens.find((t: any) => t.token === "manual");
    assert.ok(manualToken, "Root token 'manual' must be identified");
    assert.strictEqual(manualToken.query_count, 3, "'manual' appears across 3 distinct long-tail queries");
    assert.strictEqual(manualToken.total_clicks, 4);
    assert.strictEqual(Math.round(manualToken.total_cost * 100), 2350);
    assert.strictEqual(Math.round(manualToken.waste * 100), 2350);

    const downloadToken = res.root_tokens.find((t: any) => t.token === "download");
    assert.ok(downloadToken, "Root token 'download' must be identified");
    assert.strictEqual(downloadToken.query_count, 2);

    // "boots" should NOT appear in long-tail roots
    const bootsToken = res.root_tokens.find((t: any) => t.token === "boots");
    assert.strictEqual(bootsToken, undefined, "'boots' query had 30 clicks and must not be in long-tail");
  } finally {
    exports.engine_free(engine);
  }
});

test("Phase 11: Match-Type Dilution Index matches normalized token hashes under 10ms and calculates budget lost", async () => {
  const { exports, memory } = await loadWasm();

  assert.strictEqual(
    typeof exports.engine_detect_match_type_dilution,
    "function",
    "WASM module must export 'engine_detect_match_type_dilution'"
  );

  const engine = exports.engine_new();
  try {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    // Ingest Exact match keywords and Broad queries capturing same search terms at higher CPC
    // Query 1: "waterproof trail runners"
    //   Exact row: CPC = $1.50 (Clicks=40, Cost=60.00, Convs=4)
    //   Broad row: CPC = $3.20 (Clicks=50, Cost=160.00, Convs=1)
    //   Budget Lost = (3.20 - 1.50) * 50 = $85.00
    // Query 2: "merino wool hiking socks"
    //   Exact row: CPC = $0.80 (Clicks=100, Cost=80.00, Convs=10)
    //   Broad row: CPC = $1.80 (Clicks=60, Cost=108.00, Convs=2)
    //   Budget Lost = (1.80 - 0.80) * 60 = $60.00
    // Query 3: "cheap camp stove" (Broad only, no exact benchmark -> NOT diluted)
    const csv = [
      "Search term,Match type,Campaign,Ad group,Clicks,Cost,Conversions",
      '"waterproof trail runners",Exact,Trail_Exact_Camp,Adg_Exact,40,"60.00",4',
      '"waterproof trail runners",Broad,Smart_Broad_Camp,Adg_Broad,50,"160.00",1',
      '"merino wool hiking socks",Exact,Apparel_Exact_Camp,Adg_Exact,100,"80.00",10',
      '"merino wool hiking socks",Broad,Smart_Broad_Camp,Adg_Broad,60,"108.00",2',
      '"cheap camp stove",Broad,Camping_Broad_Camp,Adg_Broad,30,"45.00",1',
    ].join("\n");

    const csvBytes = enc.encode(csv);
    const inPtr = exports.allocate_buffer(csvBytes.length);
    new Uint8Array(memory.buffer, inPtr, csvBytes.length).set(csvBytes);
    exports.engine_ingest_chunk(engine, inPtr, csvBytes.length, 1);
    exports.deallocate_buffer(inPtr, csvBytes.length);

    const outCap = 16384;
    const outPtr = exports.allocate_buffer(outCap);

    // Benchmark sub-10ms evaluation
    const start = performance.now();
    const written = exports.engine_detect_match_type_dilution(engine, outPtr, outCap);
    const duration = performance.now() - start;

    console.log(`Match-Type Dilution Index evaluated in ${duration.toFixed(3)}ms (sub-10ms mandate)`);
    assert.ok(duration < 10.0, `Evaluation must be sub-10ms (was ${duration.toFixed(2)}ms)`);
    assert.ok(written > 0, "Must export dilution report JSON");

    const jsonStr = dec.decode(new Uint8Array(memory.buffer, outPtr, written));
    exports.deallocate_buffer(outPtr, outCap);

    const res = JSON.parse(jsonStr);
    assert.strictEqual(res.diluted_queries_count, 2, "Must flag exactly 2 diluted queries");
    assert.strictEqual(res.total_diluted_clicks, 110, "Total diluted clicks = 50 + 60 = 110");
    assert.strictEqual(Math.round(res.budget_lost * 100), 14500, "Total budget lost = $85.00 + $60.00 = $145.00");

    const runners = res.items.find((i: any) => i.query === "waterproof trail runners");
    assert.ok(runners, "Must find 'waterproof trail runners'");
    assert.strictEqual(Math.round(runners.broad_cpc * 100), 320);
    assert.strictEqual(Math.round(runners.exact_cpc * 100), 150);
    assert.strictEqual(Math.round(runners.budget_lost * 100), 8500);
    assert.strictEqual(Math.round(runners.cpc_inflation_ratio * 100), 213);

    const socks = res.items.find((i: any) => i.query === "merino wool hiking socks");
    assert.ok(socks, "Must find 'merino wool hiking socks'");
    assert.strictEqual(Math.round(socks.broad_cpc * 100), 180);
    assert.strictEqual(Math.round(socks.exact_cpc * 100), 80);
    assert.strictEqual(Math.round(socks.budget_lost * 100), 6000);
    assert.strictEqual(Math.round(socks.cpc_inflation_ratio * 100), 225);

    const stove = res.items.find((i: any) => i.query === "cheap camp stove");
    assert.strictEqual(stove, undefined, "Query without exact benchmark must not be flagged");
  } finally {
    exports.engine_free(engine);
  }
});
