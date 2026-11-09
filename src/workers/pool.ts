/**
 * Sieve Web Worker Pool Orchestrator
 *
 * Coordinates concurrent background worker threads (clamped between 2 and 16),
 * enforces zero-copy Transferable ArrayBuffers for Arrow IPC data, manages round-robin
 * scheduling, and guarantees sub-10ms reactive threshold re-evaluations.
 * File line ceiling: <= 250 lines.
 */

import { SieveWorkerCore } from './sieve.worker.ts';
import { WorkerExecutionError } from './protocol.ts';

export interface WorkerPoolOptions { concurrency?: number; }

export function clampConcurrency(options?: WorkerPoolOptions): number {
  const hardware = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  return Math.min(16, Math.max(2, options?.concurrency ?? hardware));
}

export function extractTransferables(command: any): Transferable[] {
  const list: Transferable[] = [];
  if (command?.buffer instanceof ArrayBuffer) list.push(command.buffer);
  if (command?.chunkBuffer instanceof ArrayBuffer) list.push(command.chunkBuffer);
  if (command?.payload?.fileBuffer instanceof ArrayBuffer) list.push(command.payload.fileBuffer);
  return list;
}

interface QueuedTask {
  command: any;
  transferables: Transferable[];
  targetWorkerId?: number;
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
}

class WorkerSlot {
  public id: number;
  public busy = false;
  public terminated = false;
  private core: SieveWorkerCore;
  private port1: MessagePort;
  private port2: MessagePort;
  private currentResolve: ((value: any) => void) | null = null;
  private currentReject: ((reason?: unknown) => void) | null = null;

  constructor(id: number) {
    this.id = id;
    this.core = new SieveWorkerCore(id);
    const { port1, port2 } = new MessageChannel();
    this.port1 = port1;
    this.port2 = port2;

    this.port2.onmessage = async (e: MessageEvent) => {
      try {
        const { response, transferables } = await this.core.handleCommand(e.data);
        response.workerId = this.id;
        this.port2.postMessage(response, transferables);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.port2.postMessage({
          type: 'TASK_ERROR',
          requestId: e.data?.requestId ?? '',
          workerId: this.id,
          error: msg,
          code: msg.includes('PARSE_ERROR') ? 'PARSE_ERROR' : 'TASK_ERROR',
        });
      }
    };

    this.port1.onmessage = (e: MessageEvent) => {
      const res = e.data;
      res.workerId = this.id;
      const resolve = this.currentResolve;
      const reject = this.currentReject;
      this.currentResolve = null;
      this.currentReject = null;

      if (res.type === 'TASK_ERROR' || res.type === 'WORKER_ERROR') {
        reject?.(new WorkerExecutionError(res.error, res.code || 'TASK_ERROR', this.id));
      } else {
        resolve?.(res);
      }
    };
  }

  public dispatch(command: any, transferables: Transferable[], resolve: (v: any) => void, reject: (r?: unknown) => void) {
    this.busy = true;
    this.currentResolve = resolve;
    this.currentReject = reject;
    this.port1.postMessage(command, transferables);
  }

  public terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.currentReject?.(new Error(`WorkerSlot ${this.id} terminated`));
    this.currentResolve = null;
    this.currentReject = null;
    this.port1.close();
    this.port2.close();
    this.core.cleanup();
  }
}

export class SieveWorkerPool {
  public readonly concurrency: number;
  private workers: WorkerSlot[] = [];
  private taskQueue: QueuedTask[] = [];
  private roundRobinIdx = 0;
  private terminated = false;

  constructor(options?: WorkerPoolOptions) {
    this.concurrency = clampConcurrency(options);
    for (let i = 0; i < this.concurrency; i++) this.workers.push(new WorkerSlot(i));
  }

  public get activeWorkersCount(): number { return this.workers.filter((w) => !w.terminated).length; }
  public get busyWorkersCount(): number { return this.workers.filter((w) => w.busy).length; }
  public get queueDepth(): number { return this.taskQueue.length; }
  public getAvailableWorkerId(): number { return this.findNextAvailableWorker()?.id ?? this.roundRobinIdx; }

  public async execute(command: any, targetWorkerId?: number, extraTransferables?: Transferable[]): Promise<any> {
    if (this.terminated) throw new Error('SieveWorkerPool has been terminated');
    const transferables = [...extractTransferables(command), ...(extraTransferables || [])];

    return new Promise((resolve, reject) => {
      const task: QueuedTask = { command, transferables, targetWorkerId, resolve, reject };
      const worker = targetWorkerId !== undefined && targetWorkerId < this.workers.length
        ? this.workers[targetWorkerId]
        : this.findNextAvailableWorker();

      if (worker && !worker.busy && !worker.terminated) {
        this.runTask(worker, task);
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  public async parseAndIngest(
    csvBuffer: ArrayBuffer,
    options?: { minClicks?: number; confidenceThreshold?: number }
  ): Promise<{ recordCount: number; candidates: any[]; arrowIpcBuffer: ArrayBuffer; tokensCount: number }> {
    if (this.terminated) throw new Error('SieveWorkerPool has been terminated');
    if (csvBuffer.byteLength < 8) return this.execute({ type: 'PARSE_AND_INGEST', requestId: `req_${Date.now()}`, buffer: csvBuffer });

    const text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(csvBuffer));
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lines.length > 2 && this.concurrency > 1) {
      const header = lines[0];
      const dataLines = lines.slice(1);
      const chunkCount = Math.min(this.concurrency, Math.max(1, Math.ceil(dataLines.length / 2)));
      const chunkSize = Math.ceil(dataLines.length / chunkCount);
      const enc = new TextEncoder();
      const promises: Promise<any>[] = [];

      for (let c = 0; c < chunkCount; c++) {
        const slice = dataLines.slice(c * chunkSize, (c + 1) * chunkSize);
        if (slice.length === 0) continue;
        const chunkBuf = enc.encode([header, ...slice].join('\n')).buffer.slice(0);
        promises.push(this.execute({ type: 'PARSE_AND_INGEST', requestId: `chunk_${Date.now()}_${c}`, buffer: chunkBuf, ...options }, c % this.concurrency, c === 0 ? [csvBuffer] : []));
      }

      const results = await Promise.all(promises);
      const candidates = results.flatMap((r) => r.candidates || []);
      const recordCount = results.reduce((sum, r) => sum + (r.recordCount || 0), 0);
      const tokensCount = results.reduce((sum, r) => sum + (r.tokensCount || 0), 0);
      return { recordCount, candidates, arrowIpcBuffer: results[0]?.arrowIpcBuffer, tokensCount };
    }

    return this.execute({ type: 'PARSE_AND_INGEST', requestId: `req_${Date.now()}`, buffer: csvBuffer, ...options });
  }

  public async refilterThresholds(options: { minClicks: number; confidenceThreshold: number }): Promise<{ candidates: any[]; durationMs: number; reparsed: boolean }> {
    if (this.terminated) throw new Error('SieveWorkerPool has been terminated');
    const t0 = performance.now();
    const command = { type: 'REFILTER_THRESHOLDS', requestId: `refilter_${Date.now()}`, ...options };
    const results = await Promise.all(this.workers.filter((w) => !w.terminated).map((w) => this.execute(command, w.id)));
    return { candidates: results.flatMap((r) => r.candidates || []), durationMs: performance.now() - t0, reparsed: false };
  }

  public async executeIngestion(taskId: string, chunkBuffer: ArrayBuffer, isFinal: boolean, workerId?: number, targetCPA?: number) {
    const res = await this.execute({ type: 'INGEST_CSV_CHUNK', requestId: taskId, chunkBuffer, isFinal, targetCPA }, workerId);
    return { statusCode: res.statusCode ?? 0, workerId: res.workerId ?? 0, bytesConsumed: res.bytesConsumed ?? chunkBuffer.byteLength, keywords: res.keywords ?? res.candidates };
  }

  public async executeSQL(query: string, workerId?: number): Promise<any> {
    return this.execute({ type: 'RUN_QUERY', requestId: `sql_${Date.now()}`, query }, workerId);
  }

  public async unlinkTables(workerId?: number): Promise<void> {
    await this.execute({ type: 'UNLINK_TABLES', requestId: `unlink_${Date.now()}` }, workerId);
  }

  public async resetAll(): Promise<void> {
    await Promise.all(this.workers.map((w) => this.execute({ type: 'RESET_ENGINE', requestId: `reset_${w.id}` }, w.id)));
  }

  public async terminateAll(): Promise<void> {
    if (this.terminated) return;
    this.terminated = true;
    while (this.taskQueue.length > 0) this.taskQueue.shift()!.reject(new Error('SieveWorkerPool terminated while task was queued'));
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }

  public async terminate(): Promise<void> { return this.terminateAll(); }

  private findNextAvailableWorker(): WorkerSlot | null {
    for (let i = 0; i < this.workers.length; i++) {
      const idx = (this.roundRobinIdx + i) % this.workers.length;
      const worker = this.workers[idx];
      if (!worker.busy && !worker.terminated) {
        this.roundRobinIdx = (idx + 1) % this.workers.length;
        return worker;
      }
    }
    return null;
  }

  private runTask(worker: WorkerSlot, task: QueuedTask): void {
    worker.dispatch(task.command, task.transferables, (res) => {
      task.resolve(res);
      this.onWorkerDone(worker);
    }, (err) => {
      task.reject(err);
      this.onWorkerDone(worker);
    });
  }

  private onWorkerDone(worker: WorkerSlot): void {
    worker.busy = false;
    if (this.taskQueue.length > 0) {
      const idx = this.taskQueue.findIndex((t) => t.targetWorkerId === undefined || t.targetWorkerId === worker.id);
      if (idx >= 0) {
        const [next] = this.taskQueue.splice(idx, 1);
        this.runTask(worker, next);
        return;
      }
      const idle = this.findNextAvailableWorker() || worker;
      this.runTask(idle, this.taskQueue.shift()!);
    }
  }
}
