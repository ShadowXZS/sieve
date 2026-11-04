/**
 * Sieve WebAssembly Bridge
 *
 * Provides a deterministic, zero-allocation memory bridge between JavaScript
 * and the Rust sieve_core WebAssembly pipeline.
 */

export enum FilterOp {
  PassThrough = 0,
  ExactMatch = 1,
  Contains = 2,
  StartsWith = 3,
  EndsWith = 4,
  ExactMatchCaseInsensitive = 5,
  ContainsCaseInsensitive = 6,
  NotEmpty = 7,
}

export interface SieveStats {
  totalRecords: bigint;
  matchedRecords: bigint;
  bytesConsumed: bigint;
  bytesWritten: bigint;
}

export interface ChunkResult extends SieveStats {
  statusCode: number;
  output: Uint8Array;
}

export class SieveWasmBridge {
  private instance: WebAssembly.Instance;
  private memory: WebAssembly.Memory;

  // Exported C-ABI functions
  private wasmAlloc: (size: number) => number;
  private wasmDealloc: (ptr: number, size: number) => void;
  private wasmPipelineNew: () => number;
  private wasmPipelineFree: (ptr: number) => void;
  private wasmPipelineReset: (ptr: number) => void;
  private wasmPipelineSetFilter: (
    ptr: number,
    col: number,
    op: number,
    queryPtr: number,
    queryLen: number
  ) => number;
  private wasmPipelineProcessChunk: (
    ptr: number,
    inPtr: number,
    inLen: number,
    outPtr: number,
    outCap: number,
    statsPtr: number
  ) => number;
  private wasmFilterCsv: (
    inPtr: number,
    inLen: number,
    col: number,
    op: number,
    queryPtr: number,
    queryLen: number,
    outPtr: number,
    outCap: number,
    statsPtr: number
  ) => number;

  constructor(instance: WebAssembly.Instance) {
    this.instance = instance;
    const exports = instance.exports as Record<string, any>;

    if (!exports.memory || !(exports.memory instanceof WebAssembly.Memory)) {
      throw new Error("WASM module must export linear memory");
    }
    this.memory = exports.memory;
    this.wasmAlloc = exports.alloc;
    this.wasmDealloc = exports.dealloc;
    this.wasmPipelineNew = exports.sieve_pipeline_new;
    this.wasmPipelineFree = exports.sieve_pipeline_free;
    this.wasmPipelineReset = exports.sieve_pipeline_reset;
    this.wasmPipelineSetFilter = exports.sieve_pipeline_set_filter;
    this.wasmPipelineProcessChunk = exports.sieve_pipeline_process_chunk;
    this.wasmFilterCsv = exports.sieve_filter_csv;
  }

  public static async init(wasmSource: BufferSource | WebAssembly.Module): Promise<SieveWasmBridge> {
    let instance: WebAssembly.Instance;
    if (wasmSource instanceof WebAssembly.Module) {
      instance = await WebAssembly.instantiate(wasmSource, {});
    } else {
      const result = await WebAssembly.instantiate(wasmSource, {});
      instance = result.instance;
    }
    return new SieveWasmBridge(instance);
  }

  public static initSync(module: WebAssembly.Module): SieveWasmBridge {
    const instance = new WebAssembly.Instance(module, {});
    return new SieveWasmBridge(instance);
  }

  /**
   * Allocate memory in WebAssembly linear memory.
   */
  public alloc(size: number): number {
    const ptr = this.wasmAlloc(size);
    if (ptr === 0 && size > 0) {
      throw new Error(`Failed to allocate ${size} bytes in WebAssembly memory`);
    }
    return ptr;
  }

  /**
   * Deallocate memory in WebAssembly linear memory.
   */
  public dealloc(ptr: number, size: number): void {
    if (ptr !== 0 && size > 0) {
      this.wasmDealloc(ptr, size);
    }
  }

  /**
   * Read byte slice from linear memory.
   */
  public readMemory(ptr: number, length: number): Uint8Array {
    return new Uint8Array(this.memory.buffer, ptr, length).slice();
  }

  /**
   * Write byte slice into linear memory at ptr.
   */
  public writeMemory(ptr: number, data: Uint8Array): void {
    const dest = new Uint8Array(this.memory.buffer, ptr, data.length);
    dest.set(data);
  }

  /**
   * Scoped memory buffer lifecycle helper.
   */
  public withMemory<T>(data: Uint8Array, fn: (ptr: number) => T): T {
    const ptr = this.alloc(data.length);
    try {
      this.writeMemory(ptr, data);
      return fn(ptr);
    } finally {
      this.dealloc(ptr, data.length);
    }
  }

  /**
   * One-shot deterministic CSV filter execution.
   */
  public filterCsv(
    csvData: Uint8Array,
    column: number,
    op: FilterOp,
    query: Uint8Array,
    outputCapacity: number = csvData.length
  ): { status: number; output: Uint8Array; stats: SieveStats } {
    const inPtr = this.alloc(csvData.length);
    const queryPtr = this.alloc(query.length);
    const outPtr = this.alloc(outputCapacity);
    const statsPtr = this.alloc(32); // 4 * 8-byte u64 metrics

    try {
      this.writeMemory(inPtr, csvData);
      this.writeMemory(queryPtr, query);

      const status = this.wasmFilterCsv(
        inPtr,
        csvData.length,
        column,
        op,
        queryPtr,
        query.length,
        outPtr,
        outputCapacity,
        statsPtr
      );

      const statsView = new BigUint64Array(this.memory.buffer, statsPtr, 4);
      const totalRecords = statsView[0];
      const matchedRecords = statsView[1];
      const bytesConsumed = statsView[2];
      const bytesWritten = statsView[3];

      const outputBytes = this.readMemory(outPtr, Number(bytesWritten));

      return {
        status,
        output: outputBytes,
        stats: {
          totalRecords,
          matchedRecords,
          bytesConsumed,
          bytesWritten,
        },
      };
    } finally {
      this.dealloc(inPtr, csvData.length);
      this.dealloc(queryPtr, query.length);
      this.dealloc(outPtr, outputCapacity);
      this.dealloc(statsPtr, 32);
    }
  }

  /**
   * Creates a stateful streaming pipeline instance.
   */
  public createStreamingPipeline(): SieveStreamingSession {
    const pipelinePtr = this.wasmPipelineNew();
    if (pipelinePtr === 0) {
      throw new Error("Failed to create SievePipeline instance");
    }
    return new SieveStreamingSession(this, pipelinePtr);
  }

  // Internal access for SieveStreamingSession
  internalGetMemory(): WebAssembly.Memory {
    return this.memory;
  }
  internalProcessChunk(
    pipelinePtr: number,
    inPtr: number,
    inLen: number,
    outPtr: number,
    outCap: number,
    statsPtr: number
  ): number {
    return this.wasmPipelineProcessChunk(pipelinePtr, inPtr, inLen, outPtr, outCap, statsPtr);
  }
  internalSetFilter(
    pipelinePtr: number,
    col: number,
    op: number,
    queryPtr: number,
    queryLen: number
  ): number {
    return this.wasmPipelineSetFilter(pipelinePtr, col, op, queryPtr, queryLen);
  }
  internalReset(pipelinePtr: number): void {
    this.wasmPipelineReset(pipelinePtr);
  }
  internalFree(pipelinePtr: number): void {
    this.wasmPipelineFree(pipelinePtr);
  }
}

export class SieveStreamingSession {
  private bridge: SieveWasmBridge;
  private pipelinePtr: number;
  private destroyed = false;

  constructor(bridge: SieveWasmBridge, pipelinePtr: number) {
    this.bridge = bridge;
    this.pipelinePtr = pipelinePtr;
  }

  private assertNotDestroyed() {
    if (this.destroyed) {
      throw new Error("SieveStreamingSession has been destroyed");
    }
  }

  public setFilter(col: number, op: FilterOp, query: Uint8Array): void {
    this.assertNotDestroyed();
    this.bridge.withMemory(query, (queryPtr) => {
      this.bridge.internalSetFilter(this.pipelinePtr, col, op, queryPtr, query.length);
    });
  }

  public reset(): void {
    this.assertNotDestroyed();
    this.bridge.internalReset(this.pipelinePtr);
  }

  public processChunk(chunk: Uint8Array, outputCap: number = chunk.length): ChunkResult {
    this.assertNotDestroyed();
    const inPtr = this.bridge.alloc(chunk.length);
    const outPtr = this.bridge.alloc(outputCap);
    const statsPtr = this.bridge.alloc(32);

    try {
      this.bridge.writeMemory(inPtr, chunk);
      const statusCode = this.bridge.internalProcessChunk(
        this.pipelinePtr,
        inPtr,
        chunk.length,
        outPtr,
        outputCap,
        statsPtr
      );

      const mem = this.bridge.internalGetMemory();
      const statsView = new BigUint64Array(mem.buffer, statsPtr, 4);
      const totalRecords = statsView[0];
      const matchedRecords = statsView[1];
      const bytesConsumed = statsView[2];
      const bytesWritten = statsView[3];

      const output = this.bridge.readMemory(outPtr, Number(bytesWritten));

      return {
        statusCode,
        totalRecords,
        matchedRecords,
        bytesConsumed,
        bytesWritten,
        output,
      };
    } finally {
      this.bridge.dealloc(inPtr, chunk.length);
      this.bridge.dealloc(outPtr, outputCap);
      this.bridge.dealloc(statsPtr, 32);
    }
  }

  public destroy(): void {
    if (!this.destroyed) {
      this.destroyed = true;
      this.bridge.internalFree(this.pipelinePtr);
      this.pipelinePtr = 0;
    }
  }
}

