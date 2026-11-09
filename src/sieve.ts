/**
 * Sieve WebAssembly Bridge
 *
 * Provides a deterministic, zero-allocation memory bridge between JavaScript
 * and the Rust sieve_core WebAssembly pipeline.
 * Physical line ceiling: <= 250 lines.
 */

import { SieveStreamingSession } from './sieve_session.ts';

export { SieveStreamingSession };

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

export interface SieveCoreWasmExports {
  memory: WebAssembly.Memory;
  alloc: (size: number) => number;
  dealloc: (ptr: number, size: number) => void;
  sieve_pipeline_new: () => number;
  sieve_pipeline_free: (ptr: number) => void;
  sieve_pipeline_reset: (ptr: number) => void;
  sieve_pipeline_set_filter: (ptr: number, col: number, op: number, queryPtr: number, queryLen: number) => number;
  sieve_pipeline_process_chunk: (ptr: number, inPtr: number, inLen: number, outPtr: number, outCap: number, statsPtr: number) => number;
  sieve_filter_csv: (inPtr: number, inLen: number, col: number, op: number, queryPtr: number, queryLen: number, outPtr: number, outCap: number, statsPtr: number) => number;
}

export class SieveWasmBridge {
  private instance: WebAssembly.Instance;
  private memory: WebAssembly.Memory;

  private wasmAlloc: (size: number) => number;
  private wasmDealloc: (ptr: number, size: number) => void;
  private wasmPipelineNew: () => number;
  private wasmPipelineFree: (ptr: number) => void;
  private wasmPipelineReset: (ptr: number) => void;
  private wasmPipelineSetFilter: (ptr: number, col: number, op: number, queryPtr: number, queryLen: number) => number;
  private wasmPipelineProcessChunk: (ptr: number, inPtr: number, inLen: number, outPtr: number, outCap: number, statsPtr: number) => number;
  private wasmFilterCsv: (inPtr: number, inLen: number, col: number, op: number, queryPtr: number, queryLen: number, outPtr: number, outCap: number, statsPtr: number) => number;

  constructor(instance: WebAssembly.Instance) {
    this.instance = instance;
    const exports = instance.exports as unknown as SieveCoreWasmExports;

    if (!exports.memory || !(exports.memory instanceof WebAssembly.Memory)) {
      throw new Error('WASM module must export linear memory');
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

  private static createDefaultImports(): WebAssembly.Imports {
    return {
      './sieve_core_bg.js': { __wbindgen_init_externref_table: () => {} },
      __wbindgen_placeholder__: { __wbindgen_init_externref_table: () => {} },
      wbg: {},
      env: {},
    };
  }

  public static async init(wasmSource: BufferSource | WebAssembly.Module): Promise<SieveWasmBridge> {
    const imports = SieveWasmBridge.createDefaultImports();
    let instance: WebAssembly.Instance;
    if (wasmSource instanceof WebAssembly.Module) {
      instance = await WebAssembly.instantiate(wasmSource, imports);
    } else {
      const result = await WebAssembly.instantiate(wasmSource, imports);
      instance = result.instance;
    }
    return new SieveWasmBridge(instance);
  }

  public static initSync(module: WebAssembly.Module): SieveWasmBridge {
    const instance = new WebAssembly.Instance(module, SieveWasmBridge.createDefaultImports());
    return new SieveWasmBridge(instance);
  }

  public alloc(size: number): number {
    const ptr = this.wasmAlloc(size);
    if (ptr === 0 && size > 0) {
      throw new Error(`Failed to allocate ${size} bytes in WebAssembly memory`);
    }
    return ptr;
  }

  public dealloc(ptr: number, size: number): void {
    if (ptr !== 0 && size > 0) {
      this.wasmDealloc(ptr, size);
    }
  }

  public readMemory(ptr: number, length: number): Uint8Array {
    return new Uint8Array(this.memory.buffer, ptr, length).slice();
  }

  public writeMemory(ptr: number, data: Uint8Array): void {
    const dest = new Uint8Array(this.memory.buffer, ptr, data.length);
    dest.set(data);
  }

  public withMemory<T>(data: Uint8Array, fn: (ptr: number) => T): T {
    const ptr = this.alloc(data.length);
    try {
      this.writeMemory(ptr, data);
      return fn(ptr);
    } finally {
      this.dealloc(ptr, data.length);
    }
  }

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
    const statsPtr = this.alloc(32);

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

  public createStreamingPipeline(): SieveStreamingSession {
    const pipelinePtr = this.wasmPipelineNew();
    if (pipelinePtr === 0) {
      throw new Error('Failed to create SievePipeline instance');
    }
    return new SieveStreamingSession(this, pipelinePtr);
  }

  public internalGetMemory(): WebAssembly.Memory {
    return this.memory;
  }
  public internalProcessChunk(pipelinePtr: number, inPtr: number, inLen: number, outPtr: number, outCap: number, statsPtr: number): number {
    return this.wasmPipelineProcessChunk(pipelinePtr, inPtr, inLen, outPtr, outCap, statsPtr);
  }
  public internalSetFilter(pipelinePtr: number, col: number, op: number, queryPtr: number, queryLen: number): number {
    return this.wasmPipelineSetFilter(pipelinePtr, col, op, queryPtr, queryLen);
  }
  public internalReset(pipelinePtr: number): void {
    this.wasmPipelineReset(pipelinePtr);
  }
  public internalFree(pipelinePtr: number): void {
    this.wasmPipelineFree(pipelinePtr);
  }
}
