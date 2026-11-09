/**
 * Behavioral Unit Tests: Multithreaded Web Worker Orchestrator & Worker Pool
 *
 * Strict TDD test suite validating SieveWorkerPool orchestration, transferable zero-copy
 * ArrayBuffers, sub-10ms parameter re-evaluations, error recovery, and thread clamping.
 * File line ceiling: <= 250 lines.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SieveWorkerPool } from './pool.ts';

const sampleCsv = [
  'Search term,Match type,Campaign,Ad group,Impressions,Clicks,Cost,Conversions,Conv. value',
  'running shoes,Exact match,Search - Shoes,Running,1500,120,$144.50,12,$360.00',
  'trail hiking boots,Phrase match,Search - Boots,Hiking,800,40,$80.00,0,$0.00',
  'best outdoor sandals,Broad match,Search - Sandals,Sandals,500,25,$50.00,0,$0.00',
  'cheap running shoes,Broad match,Search - Shoes,Running,400,15,$30.00,0,$0.00',
  'free running shoes,Broad match,Search - Shoes,Running,300,8,$12.00,0,$0.00',
].join('\n');

test('Red Test 1: Given an incoming PARSE_AND_INGEST request with a raw CSV buffer, verify the pool chunks work, transfers ArrayBuffers, and aggregates results into a unified payload without thread starvation', async () => {
  const pool = new SieveWorkerPool({ concurrency: 4 });
  try {
    const enc = new TextEncoder();
    const csvBytes = enc.encode(sampleCsv);
    const buffer = csvBytes.buffer.slice(0);
    const originalByteLength = buffer.byteLength;
    assert.ok(originalByteLength > 0, 'Buffer must have initial non-zero byteLength');

    const result = await pool.parseAndIngest(buffer);

    // ZERO-COPY INVARIANT: Input buffer was transferred and detached
    assert.strictEqual(buffer.byteLength, 0, 'Raw CSV buffer must be detached post-transfer');

    // Unified payload verification
    assert.ok(result.recordCount >= 5, 'Must parse and ingest all valid search term records');
    assert.ok(result.candidates.length > 0, 'Must extract negative keyword candidates');
    assert.ok(result.arrowIpcBuffer instanceof ArrayBuffer, 'Must return transferable Arrow IPC buffer');
    assert.ok(result.arrowIpcBuffer.byteLength > 0, 'Arrow IPC buffer must contain serialized data');
    assert.strictEqual(pool.busyWorkersCount, 0, 'No thread starvation; all workers must return to idle');
  } finally {
    await pool.terminateAll();
  }
});

test('Red Test 2: Given a REFILTER_THRESHOLDS message with modified minClicks and confidenceThreshold, verify the pool re-evaluates rules and returns filtered candidates without re-triggering file parsing', async () => {
  const pool = new SieveWorkerPool({ concurrency: 2 });
  try {
    const enc = new TextEncoder();
    const buffer = enc.encode(sampleCsv).buffer.slice(0);
    await pool.parseAndIngest(buffer);

    // Reactive parameter re-evaluation under 10ms
    const t0 = performance.now();
    const refilterResult = await pool.refilterThresholds({
      minClicks: 20,
      confidenceThreshold: 0.7,
    });
    const duration = performance.now() - t0;

    assert.ok(duration < 10, `Re-evaluation took ${duration.toFixed(2)}ms, must complete under 10ms`);
    assert.ok(refilterResult.candidates.length > 0, 'Must return filtered negative candidates');
    for (const cand of refilterResult.candidates) {
      assert.ok(cand.clicks >= 20, `Candidate ${cand.keyword} clicks (${cand.clicks}) must be >= 20`);
      assert.ok(cand.confidenceScore >= 0.7, `Candidate ${cand.keyword} confidence (${cand.confidenceScore}) must be >= 0.7`);
    }
    assert.strictEqual(refilterResult.reparsed, false, 'Must not re-trigger raw file parsing');
  } finally {
    await pool.terminateAll();
  }
});

test('Red Test 3: Verify worker pool teardown (terminateAll()) terminates all active worker instances and purges references, preventing memory leaks', async () => {
  const pool = new SieveWorkerPool({ concurrency: 3 });
  assert.strictEqual(pool.activeWorkersCount, 3, 'Must have 3 active worker instances');

  await pool.terminateAll();

  assert.strictEqual(pool.activeWorkersCount, 0, 'Active workers count must be 0 post-termination');
  assert.strictEqual(pool.busyWorkersCount, 0, 'Busy workers count must be 0 post-termination');
  assert.strictEqual(pool.queueDepth, 0, 'Task queue depth must be 0 post-termination');

  // Verify subsequent dispatch is rejected
  const dummyBuf = new ArrayBuffer(64);
  await assert.rejects(
    pool.parseAndIngest(dummyBuf),
    /terminated/i,
    'Dispatching on terminated pool must reject'
  );
});

test('Red Test 4: Verify worker error recovery: if a worker encounters a malformed input row, it emits a typed TASK_ERROR event without crashing the pool', async () => {
  const pool = new SieveWorkerPool({ concurrency: 2 });
  try {
    const malformedBuf = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]).buffer;

    let caughtError: any = null;
    try {
      await pool.parseAndIngest(malformedBuf);
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'Malformed payload must reject with error');
    assert.ok(
      caughtError.code === 'TASK_ERROR' || caughtError.code === 'PARSE_ERROR' || caughtError.message.includes('PARSE_ERROR'),
      `Error must be typed TASK_ERROR or PARSE_ERROR: ${caughtError.code || caughtError.message}`
    );

    // Pool must remain alive and operational for subsequent requests
    const enc = new TextEncoder();
    const validBuf = enc.encode(sampleCsv).buffer.slice(0);
    const recoveryResult = await pool.parseAndIngest(validBuf);
    assert.ok(recoveryResult.recordCount > 0, 'Pool must recover and process valid requests');
    assert.strictEqual(pool.activeWorkersCount, 2, 'All worker slots must remain active');
  } finally {
    await pool.terminateAll();
  }
});

test('Deterministic Thread Capping: Clamps thread concurrency between 2 and 16', async () => {
  const minPool = new SieveWorkerPool({ concurrency: 1 });
  assert.strictEqual(minPool.concurrency, 2, 'Pool concurrency must clamp to minimum of 2');
  await minPool.terminateAll();

  const maxPool = new SieveWorkerPool({ concurrency: 32 });
  assert.strictEqual(maxPool.concurrency, 16, 'Pool concurrency must clamp to maximum of 16');
  await maxPool.terminateAll();
});
