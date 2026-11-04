/**
 * Mathematical Accuracy & Marginal CPA Drag Audit Test Suite (Phase: Red)
 *
 * Verifies strict Marginal Waste calculations:
 * 1. Non-converting terms (conversions === 0): marginalWaste = spend (Total Spend).
 * 2. Converting terms (conversions > 0):
 *    allowableSpend = conversions * targetCPA
 *    marginalWaste = Math.max(0, spend - allowableSpend)
 * 3. Profitable converting traffic (spend <= allowableSpend): marginalWaste = 0.00.
 * 4. Division-by-zero protection across 0 clicks, 0 conversions, and 0 spend.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateMarginalWaste } from '../../src/state/useSieveStore.ts';

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

test('Math Audit: Non-converting terms (conversions === 0) assign 100% of spend as marginal waste', () => {
  const spend = 52.3;
  const conversions = 0;
  const targetCPA = 50.0;

  const allowableSpend = conversions * targetCPA;
  assert.strictEqual(allowableSpend, 0, 'Allowable spend for 0 conversions must be 0.00');

  const marginalWaste = calculateMarginalWaste(spend, conversions, targetCPA);
  assert.strictEqual(marginalWaste, 52.3, 'When conversions === 0 and spend === 52.30, marginalWaste must be exactly $52.30');
  assert.notStrictEqual(marginalWaste, 0.0, 'Marginal waste on non-converting spend must NOT be $0.00');
});

test('Math Audit: Converting terms exceeding target CPA compute correct allowable spend and marginal waste', () => {
  const spend = 150.0;
  const conversions = 2;
  const targetCPA = 50.0;

  const allowableSpend = conversions * targetCPA;
  assert.strictEqual(allowableSpend, 100.0, 'When conversions === 2 and targetCPA === 50.00, allowableSpend must be $100.00');

  const marginalWaste = calculateMarginalWaste(spend, conversions, targetCPA);
  assert.strictEqual(marginalWaste, 50.0, 'When spend === 150.00 and allowableSpend === 100.00, marginalWaste must be $50.00');
});

test('Math Audit: Profitable traffic below target CPA yields exactly $0.00 marginal waste', () => {
  const spend = 90.0;
  const conversions = 3;
  const targetCPA = 50.0;

  const allowableSpend = conversions * targetCPA;
  assert.strictEqual(allowableSpend, 150.0, 'Allowable spend for 3 conversions at $50 target CPA must be $150.00');

  const marginalWaste = calculateMarginalWaste(spend, conversions, targetCPA);
  assert.strictEqual(marginalWaste, 0.0, 'When spend ($90.00) <= allowableSpend ($150.00), marginalWaste must be exactly $0.00');
});

test('Math Audit: Division-by-zero protection prevents NaN and Infinity', async () => {
  // Test store math protection
  const zeroClicksWaste = calculateMarginalWaste(0, 0, 50.0);
  assert.strictEqual(Number.isNaN(zeroClicksWaste), false, '0 clicks/spend must not return NaN');
  assert.strictEqual(Number.isFinite(zeroClicksWaste), true, '0 clicks/spend must be finite');
  assert.strictEqual(zeroClicksWaste, 0.0);

  const zeroTargetWaste = calculateMarginalWaste(100.0, 0, 0);
  assert.strictEqual(Number.isNaN(zeroTargetWaste), false, '0 target CPA must not return NaN');
  assert.strictEqual(Number.isFinite(zeroTargetWaste), true, '0 target CPA must be finite');
  assert.strictEqual(zeroTargetWaste, 100.0);

  // Test Rust WASM calculation
  const { exports, memory } = await loadWasm();
  const outPtr = exports.allocate_buffer(24);
  try {
    // 0 conversions and 0 cost
    const status = exports.stats_calculate_cpa_drag(0.0, 0.0, 0.0, outPtr);
    assert.strictEqual(status, 0);
    const view = new Float64Array(memory.buffer, outPtr, 3);
    const realizedCPA = view[0];
    const marginalDrag = view[1];
    const wasteRatio = view[2];

    assert.strictEqual(Number.isNaN(realizedCPA), false, 'WASM realized CPA must not be NaN');
    assert.strictEqual(Number.isFinite(realizedCPA), true, 'WASM realized CPA must be finite');
    assert.strictEqual(Number.isNaN(marginalDrag), false, 'WASM marginal drag must not be NaN');
    assert.strictEqual(Number.isFinite(marginalDrag), true, 'WASM marginal drag must be finite');
    assert.strictEqual(Number.isNaN(wasteRatio), false, 'WASM waste ratio must not be NaN');
    assert.strictEqual(Number.isFinite(wasteRatio), true, 'WASM waste ratio must be finite');
  } finally {
    exports.deallocate_buffer(outPtr, 24);
  }
});

