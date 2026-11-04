/**
 * Sieve Web Worker Pool
 *
 * Manages concurrent WebAssembly worker allocation, hardware concurrency scaling,
 * round-robin task dispatch, and zero-copy transferable memory queues.
 */

import { getTransferables } from './protocol.ts';
import type {
  WorkerCommand,
  WorkerResponse,
  IngestChunkCompleteResponse,
  WorkerErrorResponse,
  FragmentedLongTailResult,
  MatchTypeDilutionResult,
} from './protocol.ts';
import { SieveWorkerCore } from './sieve.worker.ts';

export interface WorkerPoolOptions {
  concurrency?: number;
}

interface QueuedTask {
  command: WorkerCommand;
  transferables: Transferable[];
  targetWorkerId?: number;
  resolve: (value: WorkerResponse) => void;
  reject: (reason?: any) => void;
}

class WorkerSlot {
  public id: number;
  public busy: boolean = false;
  private core: SieveWorkerCore;
  private port1: MessagePort;
  private port2: MessagePort;
  private currentReject: ((reason?: any) => void) | null = null;
  private currentResolve: ((value: WorkerResponse) => void) | null = null;
  public terminated: boolean = false;

  constructor(id: number) {
    this.id = id;
    this.core = new SieveWorkerCore(id);

    const channel = new MessageChannel();
    this.port1 = channel.port1;
    this.port2 = channel.port2;

    this.port2.onmessage = async (e: MessageEvent<WorkerCommand>) => {
      try {
        const res = await this.core.handleCommand(e.data);
        res.workerId = this.id;
        const transferables = (res as any).rawBuffer ? [(res as any).rawBuffer] : [];
        this.port2.postMessage(res, transferables);
      } catch (err: any) {
        const errorRes: WorkerErrorResponse = {
          type: 'WORKER_ERROR',
          requestId: e.data.requestId,
          error: err?.message || String(err),
          code: 'WORKER_INTERNAL_ERROR',
          workerId: this.id,
        };
        this.port2.postMessage(errorRes);
      }
    };

    this.port1.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const res = e.data;
      res.workerId = this.id;
      const resolve = this.currentResolve;
      const reject = this.currentReject;
      this.currentResolve = null;
      this.currentReject = null;

      if (res.type === 'WORKER_ERROR') {
        const err = new Error(res.error);
        (err as any).code = res.code;
        (err as any).workerId = this.id;
        reject?.(err);
      } else {
        resolve?.(res);
      }
    };
  }

  public async init(): Promise<void> {
    await this.core.init();
  }

  public dispatch(
    command: WorkerCommand,
    transferables: Transferable[],
    resolve: (value: WorkerResponse) => void,
    reject: (reason?: any) => void
  ) {
    this.busy = true;
    this.currentResolve = resolve;
    this.currentReject = reject;
    this.port1.postMessage(command, transferables);
  }

  public terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.port1.close();
    this.port2.close();
    this.core.cleanup();
  }
}

export class SieveWorkerPool {
  public readonly concurrency: number;
  private workers: WorkerSlot[] = [];
  private taskQueue: QueuedTask[] = [];
  private roundRobinIdx: number = 0;
  private terminated: boolean = false;
  private lastActiveWorkerId: number = 0;

  constructor(options?: WorkerPoolOptions) {
    const defaultConcurrency =
      typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? Math.max(1, navigator.hardwareConcurrency)
        : 4;

    this.concurrency = options?.concurrency ?? defaultConcurrency;

    for (let i = 0; i < this.concurrency; i++) {
      this.workers.push(new WorkerSlot(i));
    }
  }

  public get activeWorkersCount(): number {
    return this.workers.filter((w) => !w.terminated).length;
  }

  public get busyWorkersCount(): number {
    return this.workers.filter((w) => w.busy).length;
  }

  public get queueDepth(): number {
    return this.taskQueue.length;
  }

  public getAvailableWorkerId(): number {
    const idle = this.findNextAvailableWorker();
    return idle ? idle.id : this.roundRobinIdx;
  }

  public async execute(command: WorkerCommand, targetWorkerId?: number): Promise<WorkerResponse> {
    if (this.terminated) {
      throw new Error('SieveWorkerPool has been terminated');
    }

    const transferables = getTransferables(command);

    return new Promise<WorkerResponse>((resolve, reject) => {
      const task: QueuedTask = { command, transferables, targetWorkerId, resolve, reject };

      if (targetWorkerId !== undefined && targetWorkerId >= 0 && targetWorkerId < this.workers.length) {
        const targetWorker = this.workers[targetWorkerId];
        if (!targetWorker.busy && !targetWorker.terminated) {
          this.runTaskOnWorker(targetWorker, task);
        } else {
          this.taskQueue.push(task);
        }
      } else {
        // Attempt to schedule immediately on an idle worker
        const idleWorker = this.findNextAvailableWorker();
        if (idleWorker) {
          this.runTaskOnWorker(idleWorker, task);
        } else {
          this.taskQueue.push(task);
        }
      }
    });
  }

  public async executeIngestion(
    taskId: string,
    chunkBuffer: ArrayBuffer,
    isFinal: boolean,
    workerId?: number,
    targetCPA?: number
  ): Promise<{
    statusCode: number;
    workerId: number;
    bytesConsumed?: number;
    keywords?: import('./protocol.ts').PersistedNegativeKeyword[];
  }> {
    const command: WorkerCommand = {
      type: 'INGEST_CSV_CHUNK',
      requestId: taskId,
      chunkBuffer,
      isFinal,
      targetCPA,
    };

    const res = await this.execute(command, workerId);
    if (res.type === 'INGEST_CHUNK_COMPLETE') {
      const completeRes = res as IngestChunkCompleteResponse;
      this.lastActiveWorkerId = res.workerId ?? workerId ?? 0;
      return {
        statusCode: completeRes.statusCode,
        workerId: res.workerId ?? 0,
        bytesConsumed: completeRes.bytesConsumed,
        keywords: completeRes.keywords,
      };
    } else if (res.type === 'WORKER_ERROR') {
      const err = new Error((res as WorkerErrorResponse).error);
      (err as any).code = (res as WorkerErrorResponse).code;
      (err as any).workerId = res.workerId;
      throw err;
    } else {
      throw new Error(`Unexpected worker response type: ${res.type}`);
    }
  }

  public async executeSQL(
    query: string,
    workerId?: number
  ): Promise<{
    columns: string[];
    rows: Array<Record<string, any>>;
    rowCount: number;
    executionTimeMs: number;
  }> {
    const targetWorker = workerId ?? this.lastActiveWorkerId ?? 0;
    const res = await this.execute(
      {
        type: 'EXECUTE_SQL_QUERY',
        requestId: `sql_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        query,
      },
      targetWorker
    );
    if (res.type === 'EXECUTE_SQL_QUERY_RESULT') {
      const sqlRes = res as import('./protocol.ts').ExecuteSqlQueryResponse;
      return {
        columns: sqlRes.columns,
        rows: sqlRes.rows,
        rowCount: sqlRes.rowCount,
        executionTimeMs: sqlRes.executionTimeMs,
      };
    } else if (res.type === 'WORKER_ERROR') {
      const err = new Error((res as import('./protocol.ts').WorkerErrorResponse).error);
      (err as any).code = (res as any).code;
      (err as any).workerId = res.workerId;
      throw err;
    }
    throw new Error(`Unexpected worker response type for EXECUTE_SQL_QUERY: ${res.type}`);
  }

  public async unlinkTables(workerId?: number): Promise<void> {
    const targetWorker = workerId ?? this.lastActiveWorkerId ?? 0;
    await this.execute(
      {
        type: 'UNLINK_TABLES',
        requestId: `unlink_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      },
      targetWorker
    );
  }

  public async resetAll(): Promise<void> {
    for (let i = 0; i < this.concurrency; i++) {
      try {
        await this.execute(
          {
            type: 'RESET_ENGINE',
            requestId: `reset_${Date.now()}_${i}`,
          },
          i
        );
      } catch {}
    }
  }

  public async aggregateFragmentedLongTail(targetCPA?: number): Promise<FragmentedLongTailResult> {
    const res = await this.execute({
      type: 'AGGREGATE_FRAGMENTED_LONG_TAIL',
      requestId: `long_tail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      targetCPA,
    });
    if (res.type === 'AGGREGATE_FRAGMENTED_LONG_TAIL_RESULT') {
      return (res as any).result;
    }
    throw new Error(`Unexpected response for AGGREGATE_FRAGMENTED_LONG_TAIL: ${res.type}`);
  }

  public async detectMatchTypeDilution(): Promise<MatchTypeDilutionResult> {
    const res = await this.execute({
      type: 'DETECT_MATCH_TYPE_DILUTION',
      requestId: `dilution_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    });
    if (res.type === 'DETECT_MATCH_TYPE_DILUTION_RESULT') {
      return (res as any).result;
    }
    throw new Error(`Unexpected response for DETECT_MATCH_TYPE_DILUTION: ${res.type}`);
  }

  public async addExactBenchmarks(benchmarks: Array<{ query: string; cpc: number }>): Promise<void> {
    const res = await this.execute({
      type: 'ADD_EXACT_BENCHMARKS',
      requestId: `add_benchmarks_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      benchmarks,
    });
    if (res.type !== 'ADD_EXACT_BENCHMARKS_SUCCESS') {
      throw new Error(`Unexpected response for ADD_EXACT_BENCHMARKS: ${res.type}`);
    }
  }

  private findNextAvailableWorker(): WorkerSlot | null {
    for (let i = 0; i < this.concurrency; i++) {
      const idx = (this.roundRobinIdx + i) % this.concurrency;
      const worker = this.workers[idx];
      if (!worker.busy && !worker.terminated) {
        this.roundRobinIdx = (idx + 1) % this.concurrency;
        return worker;
      }
    }
    return null;
  }

  private runTaskOnWorker(worker: WorkerSlot, task: QueuedTask): void {
    worker.dispatch(
      task.command,
      task.transferables,
      (res: WorkerResponse) => {
        task.resolve(res);
        this.onWorkerTaskDone(worker);
      },
      (err: any) => {
        task.reject(err);
        this.onWorkerTaskDone(worker);
      }
    );
  }

  private onWorkerTaskDone(worker: WorkerSlot): void {
    worker.busy = false;

    if (this.taskQueue.length > 0) {
      // Find first task targeted to this worker or unassigned
      const taskIdx = this.taskQueue.findIndex(
        (t) => t.targetWorkerId === undefined || t.targetWorkerId === worker.id
      );
      if (taskIdx >= 0) {
        const [nextTask] = this.taskQueue.splice(taskIdx, 1);
        this.runTaskOnWorker(worker, nextTask);
        return;
      }

      this.roundRobinIdx = (worker.id + 1) % this.concurrency;
      const nextWorker = this.findNextAvailableWorker() || worker;
      const nextTask = this.taskQueue.shift()!;
      this.runTaskOnWorker(nextWorker, nextTask);
    }
  }

  public async terminate(): Promise<void> {
    if (this.terminated) return;
    this.terminated = true;

    // Drain and reject queued tasks
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift()!;
      task.reject(new Error('SieveWorkerPool terminated while task was queued'));
    }

    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
  }
}
