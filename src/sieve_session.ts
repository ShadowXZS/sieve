/**
 * Sieve Streaming Session
 * Stateful streaming chunk processor over WebAssembly pipeline instance.
 * Physical line ceiling: <= 250 lines.
 */

import type { SieveWasmBridge, FilterOp, ChunkResult } from './sieve.ts';

export class SieveStreamingSession {
  private bridge: SieveWasmBridge;
  private pipelinePtr: number;
  private destroyed = false;

  constructor(bridge: SieveWasmBridge, pipelinePtr: number) {
    this.bridge = bridge;
    this.pipelinePtr = pipelinePtr;
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('SieveStreamingSession has been destroyed');
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
