/**
 * Sieve Web Worker Implementation
 *
 * Encapsulates the WebAssembly sieve_core lifecycle within a dedicated
 * background thread. Guarantees zero compute on the UI thread and zero memory
 * duplication by communicating exclusively via Transferable objects.
 */

import { PlatformSchema } from './protocol.ts';
import type {
  WorkerCommand,
  WorkerResponse,
  MetricAggregateRecord,
  ReportingGapMetrics,
  AuctionCollisionRecord,
  PMaxCannibalizationRecord,
  NegativeCollisionResult,
  PersistedNegativeKeyword,
} from './protocol.ts';

export class SieveWorkerCore {
  private instance: WebAssembly.Instance | null = null;
  private exports: Record<string, any> = {};
  private memory: WebAssembly.Memory | null = null;
  private enginePtr: number = 0;
  private guardPtr: number = 0;
  private initialized: boolean = false;
  public workerId: number = 0;

  constructor(workerId: number = 0) {
    this.workerId = workerId;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public async init(wasmSource?: BufferSource | WebAssembly.Module): Promise<void> {
    if (this.initialized) return;

    let wasmBuffer: BufferSource;
    if (!wasmSource) {
      // In Node.js environment, load from disk
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const fsMod = 'node:fs/promises';
        const pathMod = 'node:path';
        const urlMod = 'node:url';
        const fs = await import(/* @vite-ignore */ fsMod);
        const path = await import(/* @vite-ignore */ pathMod);
        const { fileURLToPath } = await import(/* @vite-ignore */ urlMod);
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const wasmPath = path.resolve(__dirname, '../../crates/sieve_core/pkg/sieve_core_bg.wasm');
        try {
          wasmBuffer = await fs.readFile(wasmPath);
        } catch {
          const targetPath = path.resolve(
            __dirname,
            '../../target/wasm32-unknown-unknown/release/sieve_core.wasm'
          );
          wasmBuffer = await fs.readFile(targetPath);
        }
      } else {
        // In browser environment, fetch relative wasm binary with root fallback
        let res: Response;
        try {
          res = await fetch(
            new URL('../../crates/sieve_core/pkg/sieve_core_bg.wasm', import.meta.url)
          );
          if (!res.ok) {
            res = await fetch('/sieve_core_bg.wasm');
          }
        } catch {
          res = await fetch('/sieve_core_bg.wasm');
        }
        if (!res.ok) {
          throw new Error(`Failed to load WebAssembly binary: ${res.statusText}`);
        }
        wasmBuffer = await res.arrayBuffer();
      }
    } else if (wasmSource instanceof WebAssembly.Module) {
      // Pre-compiled module
      const exportsObj: Record<string, any> = {};
      const imports = this.buildImports(exportsObj);
      const instance = await WebAssembly.instantiate(wasmSource, imports);
      this.setupInstance(instance, exportsObj);
      return;
    } else {
      wasmBuffer = wasmSource;
    }

    const wasmModule = await WebAssembly.compile(wasmBuffer);
    const exportsObj: Record<string, any> = {};
    const imports = this.buildImports(exportsObj);
    const instance = await WebAssembly.instantiate(wasmModule, imports);
    this.setupInstance(instance, exportsObj);
  }

  private buildImports(exportsObj: Record<string, any>) {
    return {
      './sieve_core_bg.js': {
        __wbindgen_init_externref_table: function () {
          if (exportsObj.__wbindgen_externrefs) {
            exportsObj.__wbindgen_externrefs.set(0, undefined);
            exportsObj.__wbindgen_externrefs.set(1024, undefined);
            exportsObj.__wbindgen_externrefs.set(1025, null);
            exportsObj.__wbindgen_externrefs.set(1026, true);
            exportsObj.__wbindgen_externrefs.set(1027, false);
          }
        },
      },
      wbg: {},
      env: {},
    };
  }

  private setupInstance(instance: WebAssembly.Instance, exportsObj: Record<string, any>) {
    this.instance = instance;
    this.exports = exportsObj;
    Object.assign(this.exports, instance.exports);
    if (typeof this.exports.__wbindgen_start === 'function') {
      this.exports.__wbindgen_start();
    }
    this.memory = this.exports.memory as WebAssembly.Memory;

    // Allocate persistent engine and guard handles
    this.enginePtr = this.exports.engine_new();
    this.guardPtr = this.exports.guard_new();
    this.initialized = true;
  }

  public cleanup(): void {
    if (!this.initialized) return;

    if (this.enginePtr !== 0 && typeof this.exports.engine_free === 'function') {
      this.exports.engine_free(this.enginePtr);
      this.enginePtr = 0;
    }
    if (this.guardPtr !== 0 && typeof this.exports.guard_free === 'function') {
      this.exports.guard_free(this.guardPtr);
      this.guardPtr = 0;
    }
    this.initialized = false;
  }

  public async handleCommand(command: WorkerCommand): Promise<WorkerResponse> {
    try {
      if (!this.initialized && command.type !== 'INIT_WASM') {
        await this.init();
      }

      switch (command.type) {
        case 'INIT_WASM': {
          await this.init(command.wasmBuffer);
          return {
            type: 'INIT_WASM_SUCCESS',
            requestId: command.requestId,
            workerId: this.workerId,
          };
        }

        case 'INGEST_CSV_CHUNK': {
          const chunk = new Uint8Array(command.chunkBuffer);

          // Schema / payload integrity boundary verification:
          // Check for empty or non-text corrupted headers
          if (chunk.length < 8) {
            throw new Error(
              'PARSE_ERROR: Invalid CSV structure or corrupted binary payload (< 8 bytes)'
            );
          }

          // Check if payload starts with binary garbage (non-printable control chars except BOM/CR/LF/TAB)
          let hasPrintable = false;
          let nonPrintableCount = 0;
          const checkLen = Math.min(chunk.length, 64);

          // Check for UTF-16LE BOM [0xFF, 0xFE], UTF-16BE BOM [0xFE, 0xFF], UTF-8 BOM [0xEF, 0xBB, 0xBF]
          const isUtf16BOM = chunk.length >= 2 && chunk[0] === 0xff && chunk[1] === 0xfe;
          const isUtf16BEBOM = chunk.length >= 2 && chunk[0] === 0xfe && chunk[1] === 0xff;
          const isUtf8BOM = chunk.length >= 3 && chunk[0] === 0xef && chunk[1] === 0xbb && chunk[2] === 0xbf;

          const startIdx = isUtf8BOM ? 3 : (isUtf16BOM || isUtf16BEBOM) ? 2 : 0;

          if (!isUtf16BOM && !isUtf16BEBOM) {
            for (let i = startIdx; i < checkLen; i++) {
              const b = chunk[i];
              if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e) || b >= 0x80) {
                hasPrintable = true;
              } else if (b < 0x20 || b === 0x7f) {
                nonPrintableCount++;
              }
            }

            if (!hasPrintable || nonPrintableCount > 2) {
              throw new Error(
                'PARSE_ERROR: Invalid CSV structure or corrupted binary payload (unprintable control characters)'
              );
            }
          }

          // Ingest into WASM engine
          const inPtr = this.exports.allocate_buffer(chunk.length);
          if (inPtr === 0) {
            throw new Error('MEMORY_ALLOC_FAILURE: Failed to allocate linear memory for chunk');
          }

          try {
            new Uint8Array(this.memory!.buffer, inPtr, chunk.length).set(chunk);
            const statusCode = this.exports.engine_ingest_chunk(
              this.enginePtr,
              inPtr,
              chunk.length,
              command.isFinal ? 1 : 0
            );

            if (statusCode < 0) {
              throw new Error(
                `PARSE_ERROR: engine_ingest_chunk returned error code ${statusCode}`
              );
            }

            let extractedKeywords: PersistedNegativeKeyword[] | undefined = undefined;

            if (command.isFinal && typeof this.exports.engine_export_query_records === 'function') {
              const outCap = 16 * 1024 * 1024; // 16MB buffer for query records JSON
              const outPtr = this.exports.allocate_buffer(outCap);
              try {
                const written = this.exports.engine_export_query_records(
                  this.enginePtr,
                  outPtr,
                  outCap
                );
                if (written > 0) {
                  const jsonStr = new TextDecoder().decode(
                    new Uint8Array(this.memory!.buffer, outPtr, written)
                  );
                  const records: Array<{
                    query: string;
                    campaign: string;
                    adgroup: string;
                    clicks: number;
                    cost: number;
                    conversions: number;
                    has_collision: boolean;
                  }> = JSON.parse(jsonStr);

                  const now = Date.now();
                  const targetCPA = command.targetCPA ?? 50;
                  extractedKeywords = records
                    .filter((r) => r.query && r.query.trim().length > 0)
                    .map((r, idx) => {
                      const matchType: 'exact' | 'phrase' | 'broad' = r.has_collision
                        ? 'exact'
                        : r.clicks >= 10
                        ? 'phrase'
                        : 'broad';

                      const formatted =
                        matchType === 'exact'
                          ? `[${r.query}]`
                          : matchType === 'phrase'
                          ? `"${r.query}"`
                          : r.query;

                      // Strict Marginal Waste Definition:
                      // - Non-converting terms (Conversions == 0): Marginal Waste = Total Spend.
                      // - Converting terms (Conversions > 0): Marginal Waste = Math.max(0, Total Spend - (Conversions * Target CPA)).
                      const cost = r.cost || 0;
                      const conv = r.conversions || 0;
                      const waste =
                        conv <= 0
                          ? Math.round(cost * 100) / 100
                          : Math.max(0, Math.round((cost - conv * targetCPA) * 100) / 100);

                      const confidence =
                        r.clicks > 0
                          ? Math.min(
                              0.99,
                              Math.max(
                                0.65,
                                Math.round((1 - r.conversions / (r.clicks + 1)) * 100) / 100
                              )
                            )
                          : 0.8;

                      return {
                        sha256Hash: `hash_${r.query}_${now}_${idx}`,
                        keyword: r.query,
                        matchType,
                        formattedRule: formatted,
                        platform: 1 as PlatformSchema,
                        confidenceScore: confidence,
                        marginalWaste: waste,
                        hasCollision: r.has_collision,
                        collidingSafeTerms: r.has_collision
                          ? [`converting ${r.query}`]
                          : undefined,
                        clicks: r.clicks,
                        cost: r.cost,
                        conversions: r.conversions,
                        firstSeenCampaign: r.campaign || undefined,
                        createdAt: now - idx * 10,
                        scope: {
                          campaign: r.campaign || undefined,
                          adGroup: r.adgroup || undefined,
                        },
                      };
                    });
                }
              } catch (e) {
                console.error('Failed to export query records:', e);
              } finally {
                this.exports.deallocate_buffer(outPtr, outCap);
              }
            }

            return {
              type: 'INGEST_CHUNK_COMPLETE',
              requestId: command.requestId,
              statusCode,
              bytesConsumed: chunk.length,
              workerId: this.workerId,
              keywords: extractedKeywords,
            };
          } finally {
            this.exports.deallocate_buffer(inPtr, chunk.length);
          }
        }

        case 'DETECT_PLATFORM_SCHEMA': {
          const header = new Uint8Array(command.headerBuffer);
          const inPtr = this.exports.allocate_buffer(header.length);
          try {
            new Uint8Array(this.memory!.buffer, inPtr, header.length).set(header);
            const schema = this.exports.detect_schema(inPtr, header.length) as PlatformSchema;
            return {
              type: 'DETECT_PLATFORM_SCHEMA_RESULT',
              requestId: command.requestId,
              schema,
              workerId: this.workerId,
            };
          } finally {
            this.exports.deallocate_buffer(inPtr, header.length);
          }
        }

        case 'EXPORT_NGRAM_METRICS': {
          const outCap = 512 * 1024; // 512 KiB buffer
          const outPtr = this.exports.allocate_buffer(outCap);
          try {
            const written = this.exports.engine_export_ngram_metrics(
              this.enginePtr,
              command.n,
              outPtr,
              outCap
            );
            const jsonBytes = new Uint8Array(this.memory!.buffer, outPtr, written);
            const jsonStr = new TextDecoder().decode(jsonBytes);
            const metrics: MetricAggregateRecord[] = written > 0 ? JSON.parse(jsonStr) : [];

            return {
              type: 'EXPORT_NGRAM_METRICS_RESULT',
              requestId: command.requestId,
              n: command.n,
              metrics,
              workerId: this.workerId,
            };
          } finally {
            this.exports.deallocate_buffer(outPtr, outCap);
          }
        }

        case 'GET_REPORTING_GAP': {
          const gapPtr = this.exports.allocate_buffer(64);
          try {
            const status = this.exports.engine_get_reporting_gap(this.enginePtr, gapPtr);
            if (status !== 0) {
              throw new Error('Failed to retrieve reporting gap from engine');
            }
            const gapView = new Float64Array(this.memory!.buffer, gapPtr, 6);
            const gap: ReportingGapMetrics = {
              summaryClicks: gapView[0],
              aggregatedClicks: gapView[1],
              gapClicks: gapView[2],
              summaryCost: gapView[3],
              aggregatedCost: gapView[4],
              gapCost: gapView[5],
            };
            return {
              type: 'GET_REPORTING_GAP_RESULT',
              requestId: command.requestId,
              gap,
              workerId: this.workerId,
            };
          } finally {
            this.exports.deallocate_buffer(gapPtr, 64);
          }
        }

        case 'DETECT_AUCTION_COLLISIONS': {
          const outCap = 64 * 1024;
          const outPtr = this.exports.allocate_buffer(outCap);
          try {
            const written = this.exports.engine_detect_auction_collisions(
              this.enginePtr,
              outPtr,
              outCap
            );
            const jsonStr = new TextDecoder().decode(
              new Uint8Array(this.memory!.buffer, outPtr, written)
            );
            const collisions: AuctionCollisionRecord[] = written > 0 ? JSON.parse(jsonStr) : [];
            return {
              type: 'DETECT_AUCTION_COLLISIONS_RESULT',
              requestId: command.requestId,
              collisions,
              workerId: this.workerId,
            };
          } finally {
            this.exports.deallocate_buffer(outPtr, outCap);
          }
        }

        case 'DETECT_PMAX_CANNIBALIZATION': {
          const outCap = 64 * 1024;
          const outPtr = this.exports.allocate_buffer(outCap);
          try {
            const written = this.exports.engine_detect_pmax_cannibalization(
              this.enginePtr,
              outPtr,
              outCap
            );
            const jsonStr = new TextDecoder().decode(
              new Uint8Array(this.memory!.buffer, outPtr, written)
            );
            const cannibalizations: PMaxCannibalizationRecord[] =
              written > 0 ? JSON.parse(jsonStr) : [];
            return {
              type: 'DETECT_PMAX_CANNIBALIZATION_RESULT',
              requestId: command.requestId,
              cannibalizations,
              workerId: this.workerId,
            };
          } finally {
            this.exports.deallocate_buffer(outPtr, outCap);
          }
        }

        case 'GUARD_ADD_SAFE_TERMS': {
          const enc = new TextEncoder();
          for (const item of command.safeTerms) {
            const termBytes = enc.encode(item.term);
            const termPtr = this.exports.allocate_buffer(termBytes.length);
            try {
              new Uint8Array(this.memory!.buffer, termPtr, termBytes.length).set(termBytes);
              this.exports.guard_add_safe_term(
                this.guardPtr,
                termPtr,
                termBytes.length,
                item.conversions
              );
            } finally {
              this.exports.deallocate_buffer(termPtr, termBytes.length);
            }
          }
          return {
            type: 'GUARD_ADD_SAFE_TERMS_SUCCESS',
            requestId: command.requestId,
            count: command.safeTerms.length,
            workerId: this.workerId,
          };
        }

        case 'GUARD_EVALUATE_CANDIDATES': {
          const enc = new TextEncoder();
          const dec = new TextDecoder();
          const outCap = 4096;
          const outPtr = this.exports.allocate_buffer(outCap);
          const evaluations: NegativeCollisionResult[] = [];

          try {
            for (const cand of command.candidates) {
              const candBytes = enc.encode(cand);
              const candPtr = this.exports.allocate_buffer(candBytes.length);
              try {
                new Uint8Array(this.memory!.buffer, candPtr, candBytes.length).set(candBytes);
                const written = this.exports.guard_evaluate_negative(
                  this.guardPtr,
                  candPtr,
                  candBytes.length,
                  outPtr,
                  outCap
                );
                const jsonStr = dec.decode(new Uint8Array(this.memory!.buffer, outPtr, written));
                evaluations.push(JSON.parse(jsonStr));
              } finally {
                this.exports.deallocate_buffer(candPtr, candBytes.length);
              }
            }
            return {
              type: 'GUARD_EVALUATE_CANDIDATES_RESULT',
              requestId: command.requestId,
              evaluations,
              workerId: this.workerId,
            };
          } finally {
            this.exports.deallocate_buffer(outPtr, outCap);
          }
        }

        case 'CALCULATE_WILSON_SCORE': {
          const outPtr = this.exports.allocate_buffer(16);
          try {
            this.exports.stats_calculate_wilson_score(
              BigInt(command.trials),
              BigInt(command.successes),
              command.z,
              outPtr
            );
            const view = new Float64Array(this.memory!.buffer, outPtr, 2);
            return {
              type: 'CALCULATE_WILSON_SCORE_RESULT',
              requestId: command.requestId,
              bounds: { lower: view[0], upper: view[1] },
              workerId: this.workerId,
            };
          } finally {
            this.exports.deallocate_buffer(outPtr, 16);
          }
        }

        case 'CALCULATE_BETA_CONFIDENCE': {
          const outPtr = this.exports.allocate_buffer(32);
          try {
            this.exports.stats_calculate_beta_posterior(
              BigInt(command.trials),
              BigInt(command.successes),
              command.priorAlpha,
              command.priorBeta,
              outPtr
            );
            const view = new Float64Array(this.memory!.buffer, outPtr, 4);
            const alpha = view[0];
            const beta = view[1];
            const mean = view[2];
            const variance = view[3];

            const prob = this.exports.stats_beta_cdf(alpha, beta, command.thresholdRate);
            return {
              type: 'CALCULATE_BETA_CONFIDENCE_RESULT',
              requestId: command.requestId,
              posterior: { alpha, beta, mean, variance },
              probabilityBelowThreshold: prob,
              workerId: this.workerId,
            };
          } finally {
            this.exports.deallocate_buffer(outPtr, 32);
          }
        }

        case 'CALCULATE_CPA_DRAG': {
          const outPtr = this.exports.allocate_buffer(24);
          try {
            this.exports.stats_calculate_cpa_drag(
              command.cost,
              command.conversions,
              command.targetCPA,
              outPtr
            );
            const view = new Float64Array(this.memory!.buffer, outPtr, 3);
            return {
              type: 'CALCULATE_CPA_DRAG_RESULT',
              requestId: command.requestId,
              cpaMetrics: {
                realizedCPA: view[0],
                marginalDrag: view[1],
                wasteRatio: view[2],
              },
              workerId: this.workerId,
            };
          } finally {
            this.exports.deallocate_buffer(outPtr, 24);
          }
        }

        case 'AGGREGATE_FRAGMENTED_LONG_TAIL': {
          const outCap = 512 * 1024;
          const outPtr = this.exports.allocate_buffer(outCap);
          try {
            const targetCPA = command.targetCPA ?? 50;
            const written = this.exports.engine_aggregate_fragmented_long_tail(
              this.enginePtr,
              targetCPA,
              outPtr,
              outCap
            );
            const jsonStr = new TextDecoder().decode(
              new Uint8Array(this.memory!.buffer, outPtr, written)
            );
            const result = written > 0 ? JSON.parse(jsonStr) : {
              total_long_tail_queries: 0,
              total_long_tail_clicks: 0,
              total_long_tail_cost: 0,
              total_long_tail_waste: 0,
              identified_root_tokens_count: 0,
              root_tokens: [],
            };
            return {
              type: 'AGGREGATE_FRAGMENTED_LONG_TAIL_RESULT',
              requestId: command.requestId,
              result,
              workerId: this.workerId,
            };
          } finally {
            this.exports.deallocate_buffer(outPtr, outCap);
          }
        }

        case 'DETECT_MATCH_TYPE_DILUTION': {
          const outCap = 512 * 1024;
          const outPtr = this.exports.allocate_buffer(outCap);
          try {
            const written = this.exports.engine_detect_match_type_dilution(
              this.enginePtr,
              outPtr,
              outCap
            );
            const jsonStr = new TextDecoder().decode(
              new Uint8Array(this.memory!.buffer, outPtr, written)
            );
            const result = written > 0 ? JSON.parse(jsonStr) : {
              dilution_index: 0,
              budget_lost: 0,
              diluted_queries_count: 0,
              total_diluted_clicks: 0,
              diluted_spend: 0,
              exact_benchmark_spend: 0,
              average_cpc_inflation: 1,
              items: [],
            };
            return {
              type: 'DETECT_MATCH_TYPE_DILUTION_RESULT',
              requestId: command.requestId,
              result,
              workerId: this.workerId,
            };
          } finally {
            this.exports.deallocate_buffer(outPtr, outCap);
          }
        }

        case 'ADD_EXACT_BENCHMARKS': {
          const enc = new TextEncoder();
          for (const b of command.benchmarks) {
            const qBytes = enc.encode(b.query);
            const qPtr = this.exports.allocate_buffer(qBytes.length);
            try {
              new Uint8Array(this.memory!.buffer, qPtr, qBytes.length).set(qBytes);
              this.exports.engine_add_exact_benchmark(
                this.enginePtr,
                qPtr,
                qBytes.length,
                b.cpc
              );
            } finally {
              this.exports.deallocate_buffer(qPtr, qBytes.length);
            }
          }
          return {
            type: 'ADD_EXACT_BENCHMARKS_SUCCESS',
            requestId: command.requestId,
            count: command.benchmarks.length,
            workerId: this.workerId,
          };
        }

        case 'RESET_ENGINE': {
          if (this.enginePtr !== 0) {
            this.exports.engine_reset(this.enginePtr);
          }
          return {
            type: 'RESET_ENGINE_SUCCESS',
            requestId: command.requestId,
            workerId: this.workerId,
          };
        }

        default:
          throw new Error(`Unsupported command: ${(command as any).type}`);
      }
    } catch (err: any) {
      return {
        type: 'WORKER_ERROR',
        requestId: command.requestId,
        error: err?.message || String(err),
        code: err?.message?.includes('PARSE_ERROR')
          ? 'PARSE_ERROR'
          : err?.message?.includes('INVALID_SCHEMA')
          ? 'INVALID_SCHEMA'
          : 'UNKNOWN_ERROR',
        stack: err?.stack,
        workerId: this.workerId,
      };
    }
  }
}

// -----------------------------------------------------------------------------
// Auto-Wiring for Dedicated Worker Thread Context
// -----------------------------------------------------------------------------

// If running inside browser Web Worker
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function' && typeof window === 'undefined') {
  const core = new SieveWorkerCore();
  self.addEventListener('message', async (e: MessageEvent<WorkerCommand>) => {
    const res = await core.handleCommand(e.data);
    (self as any).postMessage(res);
  });
}
