/**
 * Multithreaded Ingestion Worker Pool
 * Manages background worker threads with zero-copy transferable buffers,
 * granular progress event dispatching, and fallback onerror/onmessageerror handlers.
 * Line ceiling: <= 250 lines.
 */

import {
  type WorkerIngestMessage,
  type IngestCommand,
  handleWorkerIngestMessage,
} from './ingestion.worker.ts';
import type { PersistedNegativeKeyword } from './protocol.ts';

export type { WorkerIngestMessage, IngestCommand };

export interface WorkerPoolOptions {
  concurrency?: number;
}

export interface IngestChunkResult {
  recordBatches: Uint8Array[];
  recordCount: number;
  keywords: PersistedNegativeKeyword[];
}

export interface IngestOptions {
  totalBytes?: number;
  bytesProcessed?: number;
  targetCPA?: number;
  onProgress?: (msg: WorkerIngestMessage) => void;
  onError?: (err: Error) => void;
}

interface WorkerSlot {
  id: number;
  busy: boolean;
  postMessage: (cmd: IngestCommand, transfer?: Transferable[]) => void;
  terminate: () => void;
  onerror: ((e: ErrorEvent) => void) | null;
  onmessageerror: ((e: MessageEvent) => void) | null;
}

function createWorkerSlot(
  id: number,
  onMessage: (msg: WorkerIngestMessage) => void,
  onError: (err: Error) => void
): WorkerSlot {
  if (typeof Worker !== 'undefined' && typeof window !== 'undefined') {
    try {
      const worker = new Worker(new URL('./ingestion.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<WorkerIngestMessage>) => onMessage(e.data);
      worker.onerror = (e: ErrorEvent) => {
        const errorMsg = e.message || 'Worker initialization failed: Worker thread execution crashed. Click to retry.';
        onError(new Error(errorMsg));
      };
      worker.onmessageerror = () => {
        onError(new Error('Worker initialization failed: Message deserialization error. Click to retry.'));
      };
      return {
        id,
        busy: false,
        postMessage: (cmd, transfer) => worker.postMessage(cmd, transfer || []),
        terminate: () => worker.terminate(),
        onerror: null,
        onmessageerror: null,
      };
    } catch {
      // Fall through to simulated message port
    }
  }

  const channel = new MessageChannel();
  channel.port2.onmessage = (e: MessageEvent<IngestCommand>) => {
    void handleWorkerIngestMessage(e.data, (msg, transfer) => {
      channel.port2.postMessage(msg, transfer || []);
    });
  };

  const slot: WorkerSlot = {
    id,
    busy: false,
    onerror: null,
    onmessageerror: null,
    postMessage: (cmd, transfer) => {
      channel.port1.postMessage(cmd, transfer || []);
    },
    terminate: () => {
      channel.port1.close();
      channel.port2.close();
    },
  };

  channel.port1.onmessage = (e: MessageEvent<WorkerIngestMessage>) => onMessage(e.data);
  channel.port1.onmessageerror = () => {
    slot.onmessageerror?.(new MessageEvent('messageerror'));
    onError(new Error('Worker initialization failed: Message deserialization error. Click to retry.'));
  };

  return slot;
}

export class IngestionWorkerPool {
  public readonly concurrency: number;
  private workers: WorkerSlot[] = [];
  private currentIdx = 0;
  private isTerminated = false;

  constructor(options?: WorkerPoolOptions) {
    const hardware = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
    this.concurrency = Math.min(16, Math.max(1, options?.concurrency ?? hardware));
  }

  public getAvailableWorkerId(): number {
    return this.currentIdx % Math.max(1, this.concurrency);
  }

  public async executeChunk(
    _taskId: string,
    chunkBuffer: ArrayBuffer,
    isFinal: boolean,
    options?: IngestOptions
  ): Promise<IngestChunkResult> {
    if (this.isTerminated) throw new Error('Worker initialization failed: Worker pool terminated. Click to retry.');

    return new Promise<IngestChunkResult>((resolve, reject) => {
      let resolved = false;
      const worker = createWorkerSlot(
        this.getAvailableWorkerId(),
        (msg: WorkerIngestMessage) => {
          if (resolved) return;
          options?.onProgress?.(msg);
          if (msg.type === 'PROGRESS') {
            // Forward progress
          } else if (msg.type === 'SUCCESS') {
            resolved = true;
            worker.terminate();
            resolve({
              recordBatches: msg.recordBatches,
              recordCount: msg.recordCount,
              keywords: msg.keywords,
            });
          } else if (msg.type === 'ERROR') {
            resolved = true;
            worker.terminate();
            const err = new Error(msg.message);
            options?.onError?.(err);
            reject(err);
          }
        },
        (err: Error) => {
          if (resolved) return;
          resolved = true;
          worker.terminate();
          options?.onError?.(err);
          reject(err);
        }
      );

      const command: IngestCommand = {
        type: 'INGEST_CHUNK',
        chunkBuffer,
        isFinal,
        totalBytes: options?.totalBytes ?? chunkBuffer.byteLength,
        bytesProcessed: options?.bytesProcessed ?? 0,
        targetCPA: options?.targetCPA,
      };

      try {
        worker.postMessage(command, [chunkBuffer]);
      } catch (err: unknown) {
        resolved = true;
        worker.terminate();
        const msg = err instanceof Error ? err.message : String(err);
        const error = new Error(`Worker initialization failed: ${msg}. Click to retry.`);
        options?.onError?.(error);
        reject(error);
      }
    });
  }

  public async executeIngestion(
    taskId: string,
    chunkBuffer: ArrayBuffer,
    isFinal: boolean,
    _workerId?: number,
    targetCPA?: number,
    onProgress?: (msg: WorkerIngestMessage) => void
  ): Promise<{ statusCode: number; workerId: number; bytesConsumed: number; keywords: PersistedNegativeKeyword[] }> {
    const byteLength = chunkBuffer.byteLength;
    const result = await this.executeChunk(taskId, chunkBuffer, isFinal, { targetCPA, onProgress });
    return {
      statusCode: 0,
      workerId: 0,
      bytesConsumed: byteLength,
      keywords: result.keywords,
    };
  }

  public async terminate(): Promise<void> {
    this.isTerminated = true;
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }
}

export { IngestionWorkerPool as WorkerPool };
export { IngestionWorkerPool as SieveWorkerPool };
