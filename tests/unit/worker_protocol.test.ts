import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PlatformSchema,
  getTransferables,
} from '../../src/workers/protocol.ts';
import type {
  WorkerCommand,
  WorkerResponse,
} from '../../src/workers/protocol.ts';
import { SieveWorkerPool } from '../../src/workers/pool.ts';

test('Worker Protocol & Transferable ArrayBuffer Integrity: Buffer detachment post-dispatch', async () => {
  // 1. Create a 4MB binary payload simulating a search query report chunk
  const payloadSize = 4 * 1024 * 1024; // 4MB
  const buffer = new ArrayBuffer(payloadSize);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < 100; i++) {
    view[i] = i & 0xff;
  }

  assert.strictEqual(buffer.byteLength, payloadSize, 'Buffer must initially have full byteLength');

  const command: WorkerCommand = {
    type: 'INGEST_CSV_CHUNK',
    requestId: 'req-transfer-test-1',
    chunkBuffer: buffer,
    isFinal: true,
  };

  // Extract transferables
  const transferables = getTransferables(command);
  assert.strictEqual(transferables.length, 1, 'Should identify chunkBuffer as transferable');
  assert.strictEqual(transferables[0], buffer, 'Transferable must be the exact buffer instance');

  // Simulate worker message dispatch with transferable detachment
  // Using node:worker_threads MessageChannel to verify real detachment semantics
  const { MessageChannel } = await import('node:worker_threads');
  const { port1, port2 } = new MessageChannel();

  try {
    const receivedPromise = new Promise<{ buf: ArrayBuffer }>((resolve) => {
      port2.once('message', (msg) => resolve(msg));
    });

    port1.postMessage({ buf: command.chunkBuffer }, [command.chunkBuffer]);

    // Detachment verification: Buffer in main thread must have byteLength == 0 immediately post-transfer
    assert.strictEqual(
      buffer.byteLength,
      0,
      'Transferable ArrayBuffer must be completely detached from main thread post-dispatch'
    );

    const received = await receivedPromise;
    assert.strictEqual(
      received.buf.byteLength,
      payloadSize,
      'Transferred ArrayBuffer must retain full byteLength on receiving thread'
    );
  } finally {
    port1.close();
    port2.close();
  }
});

test('Worker Pool: Hardware concurrency sizing, round-robin dispatch, and queuing', async () => {
  // Hardware concurrency limit testing (e.g. pool of 4 workers)
  const poolSize = 4;
  const pool = new SieveWorkerPool({ concurrency: poolSize });

  assert.strictEqual(pool.concurrency, poolSize, 'Pool must configure specified concurrency');
  assert.strictEqual(pool.activeWorkersCount, poolSize, 'Pool must initialize all worker instances');
  assert.strictEqual(pool.busyWorkersCount, 0, 'No workers should initially be marked busy');

  try {
    // Dispatch 12 concurrent ingestion tasks across 4 workers
    const taskCount = 12;
    const sampleCsv = 'Search keyword,Clicks,Cost,Conversions\n"shoes",10,"20.00",2\n';
    const enc = new TextEncoder();

    const taskPromises: Promise<any>[] = [];
    const executionWorkerIds: number[] = [];

    for (let i = 0; i < taskCount; i++) {
      const csvBytes = enc.encode(sampleCsv);
      const chunkBuf = csvBytes.buffer.slice(0); // isolated copy

      taskPromises.push(
        pool.executeIngestion(`task-${i}`, chunkBuf, true).then((res) => {
          executionWorkerIds.push(res.workerId);
          return res;
        })
      );
    }

    const results = await Promise.all(taskPromises);

    assert.strictEqual(results.length, taskCount, 'All 12 queued tasks must complete successfully');
    for (const res of results) {
      assert.strictEqual(res.statusCode, 0, 'Every ingestion task must succeed with status code 0');
    }

    // Verify round-robin load distribution across all 4 worker threads
    const countsPerWorker = new Map<number, number>();
    for (const id of executionWorkerIds) {
      countsPerWorker.set(id, (countsPerWorker.get(id) || 0) + 1);
    }

    assert.strictEqual(
      countsPerWorker.size,
      poolSize,
      'All workers in pool must participate in execution'
    );
    for (const [id, count] of countsPerWorker.entries()) {
      assert.ok(
        count >= 2,
        `Worker ${id} handled ${count} tasks, verifying balanced round-robin distribution`
      );
    }

    // Verify queue drains to 0 and all workers return to idle state
    assert.strictEqual(pool.queueDepth, 0, 'Worker pool queue depth must be zero after completion');
    assert.strictEqual(pool.busyWorkersCount, 0, 'All workers must return to idle state');
  } finally {
    await pool.terminate();
  }
});

test('Worker Error Boundary: Graceful handling of invalid schemas and corrupted binary payloads', async () => {
  const pool = new SieveWorkerPool({ concurrency: 2 });

  try {
    // 1. Corrupted / unparseable binary buffer
    const corruptedBuffer = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02, 0x03]).buffer;

    let caughtError: Error | null = null;
    try {
      await pool.executeIngestion('corrupt-task-1', corruptedBuffer, true);
    } catch (err: any) {
      caughtError = err;
    }

    // Error boundary must reject with structured, typed error event rather than hanging
    assert.ok(caughtError !== null, 'Corrupted binary block must trigger worker error');
    assert.ok(
      caughtError.message.includes('PARSE_ERROR') || caughtError.message.includes('INVALID_SCHEMA'),
      `Error message must indicate schema or parse failure: ${caughtError.message}`
    );

    // 2. Pool must remain healthy and operational after an individual worker error
    const validCsv = 'Search keyword,Clicks,Cost,Conversions\n"running shoes",15,"30.00",3\n';
    const validBuffer = new TextEncoder().encode(validCsv).buffer.slice(0);

    const recoveryResult = await pool.executeIngestion('recovery-task-2', validBuffer, true);
    assert.strictEqual(
      recoveryResult.statusCode,
      0,
      'Pool must remain fully functional and recover after error event'
    );
  } finally {
    await pool.terminate();
  }
});

test('Worker Lifecycle & Termination: WebAssembly instance cleanup prevents background thread leaks', async () => {
  const pool = new SieveWorkerPool({ concurrency: 3 });

  // Warm up workers with a task
  const testCsv = 'Search keyword,Clicks,Cost,Conversions\n"sneakers",5,"10.00",1\n';
  const buf = new TextEncoder().encode(testCsv).buffer.slice(0);
  await pool.executeIngestion('warmup-task', buf, true);

  assert.strictEqual(pool.activeWorkersCount, 3, 'All 3 workers active');

  // Terminate pool
  await pool.terminate();

  assert.strictEqual(pool.activeWorkersCount, 0, 'No active workers remain post-termination');
  assert.strictEqual(pool.busyWorkersCount, 0, 'No busy workers post-termination');

  // Further executions must immediately reject
  const postTermBuf = new TextEncoder().encode(testCsv).buffer.slice(0);
  await assert.rejects(
    pool.executeIngestion('post-term-task', postTermBuf, true),
    /terminated/,
    'Executing on terminated pool must reject'
  );
});

test('Quality Audit: Mock 100MB data ingestion via worker pool with zero-copy buffer detachment', async () => {
  const pool = new SieveWorkerPool({ concurrency: 4 });

  try {
    // Generate 100MB of synthetic CSV data split into 4 concurrent chunks of 25MB each
    const chunkSize = 25 * 1024 * 1024; // 25 MB
    const totalChunks = 4;
    const header = 'Search keyword,Clicks,Cost,Conversions\n';
    const row = '"nike air zoom pegasus running shoe 2026",10,"25.00",1\n';
    const enc = new TextEncoder();
    const rowBytes = enc.encode(row);
    const headerBytes = enc.encode(header);

    const chunkBuffers: ArrayBuffer[] = [];
    for (let c = 0; c < totalChunks; c++) {
      const u8 = new Uint8Array(chunkSize);
      u8.set(headerBytes, 0);
      let offset = headerBytes.length;
      while (offset + rowBytes.length <= chunkSize) {
        u8.set(rowBytes, offset);
        offset += rowBytes.length;
      }
      chunkBuffers.push(u8.buffer);
    }

    const start = performance.now();

    // Verify buffer lengths before dispatch
    for (const b of chunkBuffers) {
      assert.strictEqual(b.byteLength, chunkSize, 'Buffer must be intact before dispatch');
    }

    // Measure event loop responsiveness while worker pool executes
    let tickCount = 0;
    const tickInterval = setInterval(() => {
      tickCount++;
    }, 10);

    const ingestPromises = chunkBuffers.map((buf, idx) =>
      pool.executeIngestion(`100mb-chunk-${idx}`, buf, idx === totalChunks - 1)
    );

    // Verify immediate detachment of all 4 buffers
    for (const b of chunkBuffers) {
      assert.strictEqual(
        b.byteLength,
        0,
        'ArrayBuffer must be detached immediately upon dispatch to worker pool'
      );
    }

    const results = await Promise.all(ingestPromises);
    clearInterval(tickInterval);
    const totalDuration = performance.now() - start;

    console.log(
      `Ingested 100MB across ${totalChunks} workers in ${totalDuration.toFixed(2)}ms (Main thread ticks: ${tickCount})`
    );

    for (const res of results) {
      assert.strictEqual(res.statusCode, 0, 'Each 25MB chunk must complete with status 0');
    }

    // Verify main thread was not blocked (ticks should have run during ingestion)
    assert.ok(tickCount >= 1, 'Main thread event loop remained responsive during 100MB ingestion');
  } finally {
    await pool.terminate();
  }
});
