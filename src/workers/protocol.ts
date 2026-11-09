/**
 * SIEVE Web Worker Message Protocol Contracts
 *
 * Discriminated unions enforcing zero-copy Transferable ArrayBuffer semantics
 * across Web Worker threads for high-throughput columnar Arrow IPC data processing.
 */

export const PlatformSchema = { Unknown: 0, GoogleAds: 1, AmazonPPC: 2, MicrosoftAdvertising: 3 } as const;
export type PlatformSchema = (typeof PlatformSchema)[keyof typeof PlatformSchema];

export interface MetricAggregateRecord { readonly token: string; readonly clicks: number; readonly impressions: number; readonly cost: number; readonly conversions: number; readonly conversion_value: number; }
export interface ReportingGapMetrics { readonly summaryClicks: number; readonly aggregatedClicks: number; readonly gapClicks: number; readonly summaryCost: number; readonly aggregatedCost: number; readonly gapCost: number; }
export interface AuctionCollisionRecord { readonly query: string; readonly competing_campaigns_count: number; readonly campaigns: string[]; readonly total_clicks: number; readonly total_cost: number; }
export interface PMaxCannibalizationRecord { readonly query: string; readonly search_cpc: number; readonly pmax_cpc: number; readonly search_conversions: number; readonly pmax_conversions: number; readonly cpc_inflation_ratio: number; }
export interface NegativeCollisionResult { readonly candidate: string; readonly has_collision: boolean; readonly forced_match: string; readonly exclusion_type: 'exact' | 'broad'; readonly colliding_terms: string[]; }
export interface WilsonScoreBounds { readonly lower: number; readonly upper: number; }
export interface BetaPosteriorMetrics { readonly alpha: number; readonly beta: number; readonly mean: number; readonly variance: number; }
export interface CPADragMetrics { readonly realizedCPA: number; readonly marginalDrag: number; readonly wasteRatio: number; }
export interface LongTailRootTokenRecord { readonly token: string; readonly query_count: number; readonly total_clicks: number; readonly total_cost: number; readonly total_conversions: number; readonly waste: number; }
export interface FragmentedLongTailResult { readonly total_long_tail_queries: number; readonly total_long_tail_clicks: number; readonly total_long_tail_cost: number; readonly total_long_tail_waste: number; readonly identified_root_tokens_count: number; readonly root_tokens: LongTailRootTokenRecord[]; }
export interface DilutedQueryRecord { readonly query: string; readonly broad_cpc: number; readonly exact_cpc: number; readonly clicks: number; readonly budget_lost: number; readonly cpc_inflation_ratio: number; }
export interface MatchTypeDilutionResult { readonly dilution_index: number; readonly budget_lost: number; readonly diluted_queries_count: number; readonly total_diluted_clicks: number; readonly diluted_spend: number; readonly exact_benchmark_spend: number; readonly average_cpc_inflation: number; readonly items: DilutedQueryRecord[]; }
export interface DeltaComparisonResult { readonly newKeywords: PersistedNegativeKeyword[]; readonly identicalKeywordsCount: number; readonly durationMs: number; }

export interface PersistedNegativeKeyword {
  readonly id?: string;
  readonly sha256Hash: string;
  readonly keyword: string;
  readonly matchType: 'broad' | 'phrase' | 'exact';
  readonly formattedRule?: string;
  readonly platform?: PlatformSchema;
  readonly confidenceScore: number;
  marginalWaste?: number;
  readonly hasCollision: boolean;
  readonly collidingSafeTerms?: string[];
  readonly collidingTerm?: string;
  readonly clicks?: number;
  readonly cost?: number;
  readonly conversions?: number;
  readonly linguisticFingerprint?: string;
  readonly clusterId?: string;
  readonly campaignId?: string;
  readonly adGroupId?: string;
  readonly firstSeenCampaign?: string;
  readonly createdAt: number;
  readonly scope?: { readonly campaign?: string; readonly adGroup?: string };
}

export interface BaseCommand { readonly requestId: string; }
export interface InitWasmCommand extends BaseCommand { readonly type: 'INIT_WASM'; readonly wasmBuffer?: ArrayBuffer; }
export interface IngestCsvChunkCommand extends BaseCommand { readonly type: 'INGEST_CSV_CHUNK'; readonly chunkBuffer: ArrayBuffer; readonly isFinal: boolean; readonly targetCPA?: number; }
export interface IngestPayload { readonly fileBuffer: ArrayBuffer; readonly fileSize: number; readonly fileName: string; }
export interface IngestFileCommand extends BaseCommand { readonly type: 'INGEST_FILE'; readonly payload: IngestPayload; readonly targetCPA?: number; }
export interface DetectPlatformSchemaCommand extends BaseCommand { readonly type: 'DETECT_PLATFORM_SCHEMA'; readonly headerBuffer: ArrayBuffer; }
export interface ExportNGramMetricsCommand extends BaseCommand { readonly type: 'EXPORT_NGRAM_METRICS'; readonly n: 1 | 2 | 3; }
export interface GetReportingGapCommand extends BaseCommand { readonly type: 'GET_REPORTING_GAP'; }
export interface DetectAuctionCollisionsCommand extends BaseCommand { readonly type: 'DETECT_AUCTION_COLLISIONS'; }
export interface DetectPMaxCannibalizationCommand extends BaseCommand { readonly type: 'DETECT_PMAX_CANNIBALIZATION'; }
export interface GuardAddSafeTermsCommand extends BaseCommand { readonly type: 'GUARD_ADD_SAFE_TERMS'; readonly safeTerms: Array<{ readonly term: string; readonly conversions: number }>; }
export interface GuardEvaluateCandidatesCommand extends BaseCommand { readonly type: 'GUARD_EVALUATE_CANDIDATES'; readonly candidates: string[]; }
export interface CalculateWilsonScoreCommand extends BaseCommand { readonly type: 'CALCULATE_WILSON_SCORE'; readonly trials: bigint | number; readonly successes: bigint | number; readonly z: number; }
export interface CalculateBetaConfidenceCommand extends BaseCommand { readonly type: 'CALCULATE_BETA_CONFIDENCE'; readonly trials: bigint | number; readonly successes: bigint | number; readonly priorAlpha: number; readonly priorBeta: number; readonly thresholdRate: number; }
export interface CalculateCPADragCommand extends BaseCommand { readonly type: 'CALCULATE_CPA_DRAG'; readonly cost: number; readonly conversions: number; readonly targetCPA: number; }
export interface AggregateFragmentedLongTailCommand extends BaseCommand { readonly type: 'AGGREGATE_FRAGMENTED_LONG_TAIL'; readonly targetCPA?: number; }
export interface DetectMatchTypeDilutionCommand extends BaseCommand { readonly type: 'DETECT_MATCH_TYPE_DILUTION'; }
export interface AddExactBenchmarksCommand extends BaseCommand { readonly type: 'ADD_EXACT_BENCHMARKS'; readonly benchmarks: Array<{ readonly query: string; readonly cpc: number }>; }
export interface ResetEngineCommand extends BaseCommand { readonly type: 'RESET_ENGINE'; }
export interface ExecuteSqlQueryCommand extends BaseCommand { readonly type: 'EXECUTE_SQL_QUERY'; readonly query: string; }
export interface UnlinkTablesCommand extends BaseCommand { readonly type: 'UNLINK_TABLES'; }
export interface ParseRequestCommand extends BaseCommand { readonly type: 'PARSE_REQUEST'; readonly buffer: ArrayBuffer; readonly targetCPA?: number; }

export type WorkerCommand =
  | InitWasmCommand | IngestCsvChunkCommand | IngestFileCommand | DetectPlatformSchemaCommand
  | ExportNGramMetricsCommand | GetReportingGapCommand | DetectAuctionCollisionsCommand | DetectPMaxCannibalizationCommand
  | GuardAddSafeTermsCommand | GuardEvaluateCandidatesCommand | CalculateWilsonScoreCommand | CalculateBetaConfidenceCommand
  | CalculateCPADragCommand | AggregateFragmentedLongTailCommand | DetectMatchTypeDilutionCommand | AddExactBenchmarksCommand
  | ResetEngineCommand | ExecuteSqlQueryCommand | UnlinkTablesCommand | ParseRequestCommand;

export type WorkerCommandType = WorkerCommand['type'];

export interface BaseWorkerResponse { readonly requestId: string; readonly type: WorkerEventType; workerId?: number; }
export interface InitWasmSuccessResponse extends BaseWorkerResponse { readonly type: 'INIT_WASM_SUCCESS'; }
export interface IngestChunkProgressResponse extends BaseWorkerResponse { readonly type: 'INGEST_CHUNK_PROGRESS'; readonly bytesConsumed: number; readonly bytesProcessed?: number; readonly estimatedRows?: number; }
export interface IngestProgressResponse extends BaseWorkerResponse { readonly type: 'INGEST_PROGRESS'; readonly bytesProcessed: number; readonly estimatedRows: number; readonly totalBytes: number; readonly percent: number; }
export interface IngestChunkCompleteResponse extends BaseWorkerResponse { readonly type: 'INGEST_CHUNK_COMPLETE'; readonly statusCode: number; readonly bytesConsumed?: number; readonly keywords?: PersistedNegativeKeyword[]; readonly arrowIpcBuffer?: ArrayBuffer; }
export interface DetectPlatformSchemaResponse extends BaseWorkerResponse { readonly type: 'DETECT_PLATFORM_SCHEMA_RESULT'; readonly schema: PlatformSchema; }
export interface ExportNGramMetricsResponse extends BaseWorkerResponse { readonly type: 'EXPORT_NGRAM_METRICS_RESULT'; readonly n: 1 | 2 | 3; readonly metrics: MetricAggregateRecord[]; readonly rawBuffer?: ArrayBuffer; }
export interface GetReportingGapResponse extends BaseWorkerResponse { readonly type: 'GET_REPORTING_GAP_RESULT'; readonly gap: ReportingGapMetrics; }
export interface DetectAuctionCollisionsResponse extends BaseWorkerResponse { readonly type: 'DETECT_AUCTION_COLLISIONS_RESULT'; readonly collisions: AuctionCollisionRecord[]; }
export interface DetectPMaxCannibalizationResponse extends BaseWorkerResponse { readonly type: 'DETECT_PMAX_CANNIBALIZATION_RESULT'; readonly cannibalizations: PMaxCannibalizationRecord[]; }
export interface GuardAddSafeTermsSuccessResponse extends BaseWorkerResponse { readonly type: 'GUARD_ADD_SAFE_TERMS_SUCCESS'; readonly count: number; }
export interface GuardEvaluateCandidatesResponse extends BaseWorkerResponse { readonly type: 'GUARD_EVALUATE_CANDIDATES_RESULT'; readonly evaluations: NegativeCollisionResult[]; }
export interface CalculateWilsonScoreResponse extends BaseWorkerResponse { readonly type: 'CALCULATE_WILSON_SCORE_RESULT'; readonly bounds: WilsonScoreBounds; }
export interface CalculateBetaConfidenceResponse extends BaseWorkerResponse { readonly type: 'CALCULATE_BETA_CONFIDENCE_RESULT'; readonly posterior: BetaPosteriorMetrics; readonly probabilityBelowThreshold: number; }
export interface CalculateCPADragResponse extends BaseWorkerResponse { readonly type: 'CALCULATE_CPA_DRAG_RESULT'; readonly cpaMetrics: CPADragMetrics; }
export interface AggregateFragmentedLongTailResponse extends BaseWorkerResponse { readonly type: 'AGGREGATE_FRAGMENTED_LONG_TAIL_RESULT'; readonly result: FragmentedLongTailResult; }
export interface DetectMatchTypeDilutionResponse extends BaseWorkerResponse { readonly type: 'DETECT_MATCH_TYPE_DILUTION_RESULT'; readonly result: MatchTypeDilutionResult; }
export interface AddExactBenchmarksSuccessResponse extends BaseWorkerResponse { readonly type: 'ADD_EXACT_BENCHMARKS_SUCCESS'; readonly count: number; }
export interface ResetEngineSuccessResponse extends BaseWorkerResponse { readonly type: 'RESET_ENGINE_SUCCESS'; }
export interface ExecuteSqlQueryResponse extends BaseWorkerResponse { readonly type: 'EXECUTE_SQL_QUERY_RESULT'; readonly columns: string[]; readonly rows: Array<Record<string, unknown>>; readonly rowCount: number; readonly executionTimeMs: number; readonly arrowIpcBuffer?: ArrayBuffer; }
export interface UnlinkTablesResponse extends BaseWorkerResponse { readonly type: 'UNLINK_TABLES_SUCCESS'; }
export interface ParseSuccessResponse extends BaseWorkerResponse { readonly type: 'PARSE_SUCCESS'; readonly recordBatchBuffer: ArrayBuffer; readonly rowCount: number; }
export interface WorkerErrorResponse extends BaseWorkerResponse { readonly type: 'WORKER_ERROR'; readonly error: string; readonly code?: string; readonly stack?: string; }

export type WorkerResponse =
  | InitWasmSuccessResponse | IngestChunkProgressResponse | IngestProgressResponse | IngestChunkCompleteResponse
  | DetectPlatformSchemaResponse | ExportNGramMetricsResponse | GetReportingGapResponse | DetectAuctionCollisionsResponse
  | DetectPMaxCannibalizationResponse | GuardAddSafeTermsSuccessResponse | GuardEvaluateCandidatesResponse
  | CalculateWilsonScoreResponse | CalculateBetaConfidenceResponse | CalculateCPADragResponse
  | AggregateFragmentedLongTailResponse | DetectMatchTypeDilutionResponse | AddExactBenchmarksSuccessResponse
  | ResetEngineSuccessResponse | ExecuteSqlQueryResponse | UnlinkTablesResponse | ParseSuccessResponse | WorkerErrorResponse;

export type WorkerEventType = WorkerResponse['type'];

export class WorkerExecutionError extends Error {
  public readonly code: string;
  public readonly workerId?: number;
  constructor(message: string, code: string = 'WORKER_INTERNAL_ERROR', workerId?: number) {
    super(message);
    this.name = 'WorkerExecutionError';
    this.code = code;
    this.workerId = workerId;
    Object.setPrototypeOf(this, WorkerExecutionError.prototype);
  }
}

export function getTransferables(command: WorkerCommand): Transferable[] {
  switch (command.type) {
    case 'INIT_WASM': return command.wasmBuffer ? [command.wasmBuffer] : [];
    case 'INGEST_CSV_CHUNK': return [command.chunkBuffer];
    case 'INGEST_FILE': return command.payload?.fileBuffer ? [command.payload.fileBuffer] : [];
    case 'DETECT_PLATFORM_SCHEMA': return [command.headerBuffer];
    case 'PARSE_REQUEST': return [command.buffer];
    default: return [];
  }
}

export function getResponseTransferables(response: WorkerResponse): Transferable[] {
  switch (response.type) {
    case 'PARSE_SUCCESS': return [response.recordBatchBuffer];
    case 'EXPORT_NGRAM_METRICS_RESULT': return response.rawBuffer ? [response.rawBuffer] : [];
    case 'INGEST_CHUNK_COMPLETE': return response.arrowIpcBuffer ? [response.arrowIpcBuffer] : [];
    case 'EXECUTE_SQL_QUERY_RESULT': return response.arrowIpcBuffer ? [response.arrowIpcBuffer] : [];
    default: return [];
  }
}
