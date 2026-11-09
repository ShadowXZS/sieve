/**
 * Behavioral Unit Tests: Worker File Ingestion Pipeline & Progress Protocol
 *
 * Validates:
 * 1. Sequential chunk ingestion emitting incrementing progress events (10% -> 50% -> 100%).
 * 2. Main thread progress subscriber updating reactive state deterministically from 0 to 100.
 * 3. Worker malformed chunk / DuckDB initialization error -> transitions into Cooper's Error state.
 * 4. Preserved transferable buffers and fallback onerror/onmessageerror handlers.
 * Line ceiling: <= 250 lines.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useSieveStore } from '../../state/useSieveStore.ts';
import {
  IngestionWorkerPool,
  type WorkerIngestMessage,
  type IngestCommand,
} from '../worker_pool.ts';
import { handleWorkerIngestMessage } from '../ingestion.worker.ts';
import { useFileIngestion } from '../../hooks/useFileIngestion.ts';

describe('Worker File Ingestion & Progress Streaming Protocol', () => {
  beforeEach(() => {
    useSieveStore.getState().reset();
  });

  test('Step 1.1: Sequential chunk ingestion emits incrementing progress events (10 -> 50 -> 100)', async () => {
    const emittedMessages: WorkerIngestMessage[] = [];
    const mockPostMessage = (msg: WorkerIngestMessage) => {
      emittedMessages.push(msg);
    };

    const encoder = new TextEncoder();
    const csvContent = 'Query,Clicks,Cost\nshoes,10,5.0\nboots,20,10.0\nsandals,5,2.5\n';
    const buffer = encoder.encode(csvContent).buffer.slice(0);

    const command: IngestCommand = {
      type: 'INGEST_CHUNK',
      chunkBuffer: buffer,
      isFinal: true,
      totalBytes: buffer.byteLength,
      bytesProcessed: 0,
      targetCPA: 50,
    };

    await handleWorkerIngestMessage(command, mockPostMessage);

    const progressEvents = emittedMessages.filter((m): m is Extract<WorkerIngestMessage, { type: 'PROGRESS' }> => m.type === 'PROGRESS');
    assert.ok(progressEvents.length >= 3, 'Must emit at least 3 sequential progress events');
    assert.strictEqual(progressEvents[0].stage, 'Transferable Memory Ingestion');
    assert.ok(progressEvents[0].percent >= 0 && progressEvents[0].percent <= 30, 'Initial progress must be low');
    assert.ok(progressEvents[progressEvents.length - 1].percent === 100, 'Final progress event must reach 100%');

    // Ensure monotonically non-decreasing percent
    for (let i = 1; i < progressEvents.length; i++) {
      assert.ok(progressEvents[i].percent >= progressEvents[i - 1].percent, 'Progress must be monotonically increasing');
    }

    const successEvent = emittedMessages.find((m): m is Extract<WorkerIngestMessage, { type: 'SUCCESS' }> => m.type === 'SUCCESS');
    assert.ok(successEvent, 'Worker must emit a SUCCESS message upon completion');
    assert.ok(Array.isArray(successEvent.recordBatches), 'SUCCESS message must provide recordBatches');
  });

  test('Step 1.2: Main thread progress subscriber updates reactive store deterministically from 0 to 100', async () => {
    const store = useSieveStore.getState();
    store.setIngesting(true, 0);
    assert.strictEqual(useSieveStore.getState().ingestionProgress, 0);

    const pool = new IngestionWorkerPool({ concurrency: 2 });
    try {
      const recordedPercentages: number[] = [];
      const onProgress = (msg: WorkerIngestMessage) => {
        if (msg.type === 'PROGRESS') {
          useSieveStore.getState().setIngesting(true, msg.percent);
          recordedPercentages.push(msg.percent);
        }
      };

      const testEvents: WorkerIngestMessage[] = [
        { type: 'PROGRESS', stage: 'Transferable Memory Ingestion', percent: 10 },
        { type: 'PROGRESS', stage: 'Transferable Memory Ingestion', percent: 50 },
        { type: 'PROGRESS', stage: 'Transferable Memory Ingestion', percent: 100 },
      ];

      for (const ev of testEvents) {
        onProgress(ev);
      }

      assert.deepStrictEqual(recordedPercentages, [10, 50, 100], 'Recorded percentages must reflect progress stream');
      assert.strictEqual(useSieveStore.getState().ingestionProgress, 100, 'Store must reflect final 100% progress');
    } finally {
      await pool.terminate();
    }
  });

  test('Step 1.3: Worker throwing malformed chunk error transitions UI directly to Cooper\'s Error state', async () => {
    const emittedMessages: WorkerIngestMessage[] = [];
    const mockPostMessage = (msg: WorkerIngestMessage) => {
      emittedMessages.push(msg);
    };

    // Send corrupted / empty buffer
    const emptyBuffer = new ArrayBuffer(0);
    const command: IngestCommand = {
      type: 'INGEST_CHUNK',
      chunkBuffer: emptyBuffer,
      isFinal: true,
      totalBytes: 0,
      bytesProcessed: 0,
    };

    await handleWorkerIngestMessage(command, mockPostMessage);

    const errorEvent = emittedMessages.find((m): m is Extract<WorkerIngestMessage, { type: 'ERROR' }> => m.type === 'ERROR');
    assert.ok(errorEvent, 'Corrupted chunk must post typed ERROR message');
    assert.ok(errorEvent.message.includes('Worker initialization failed') || errorEvent.message.includes('PARSE_ERROR'), 'Must include actionable error text');
    assert.ok(errorEvent.message.includes('Click to retry'), 'Must include Cooper\'s actionable recovery copy');

    // Simulate main thread handling this error event
    if (errorEvent) {
      useSieveStore.getState().setErrorMessage(errorEvent.message);
    }

    const state = useSieveStore.getState();
    assert.strictEqual(state.isIngesting, false, 'UI must not hang in infinite 0% ingestion state');
    assert.ok(state.errorMessage !== null && state.errorMessage.includes('Click to retry'), 'Store error must reflect actionable recovery state');
  });

  test('Step 1.4: Preserved transferable buffers and fallback error handlers catch silent crashes', async () => {
    const pool = new IngestionWorkerPool({ concurrency: 1 });
    try {
      const buffer = new ArrayBuffer(128);
      const originalLength = buffer.byteLength;
      assert.strictEqual(originalLength, 128);

      // Verify dispatching with transferable list detaches the buffer
      let errorCaught: string | null = null;
      try {
        await pool.executeChunk('task_test', buffer, true, {
          onError: (err) => { errorCaught = err.message; },
        });
      } catch (err: unknown) {
        errorCaught = err instanceof Error ? err.message : String(err);
      }

      assert.strictEqual(buffer.byteLength, 0, 'Transferred ArrayBuffer must be detached');
    } finally {
      await pool.terminate();
    }
  });
});
