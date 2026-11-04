/**
 * Sieve Web Worker Message Protocol (Phase 3)
 *
 * Architectural Guarantees:
 * 1. Compute Isolation: All parsing, N-Gram aggregation, Bayesian scoring,
 *    and collision checks execute exclusively within the Web Worker thread.
 * 2. Zero-Copy Transfer: Heavy CSV buffers, binary arrays, and export payloads
 *    pass via Transferable objects (ArrayBuffer) to avoid structured clone overhead.
 * 3. Persistence Bridge: Negative keyword records include deterministic SHA-256
 *    hashes enabling sub-5ms delta comparisons against Dexie.js / IndexedDB storage.
 */

export const PlatformSchema = {
  Unknown: 0,
  GoogleAds: 1,
  AmazonPPC: 2,
  MicrosoftAdvertising: 3,
} as const;
export type PlatformSchema = (typeof PlatformSchema)[keyof typeof PlatformSchema];

export interface MetricAggregateRecord {
  token: string;
  clicks: number;
  impressions: number;
  cost: number;
  conversions: number;
  conversion_value: number;
}

export interface ReportingGapMetrics {
  summaryClicks: number;
  aggregatedClicks: number;
  gapClicks: number;
  summaryCost: number;
  aggregatedCost: number;
  gapCost: number;
}

export interface AuctionCollisionRecord {
  query: string;
  competing_campaigns_count: number;
  campaigns: string[];
  total_clicks: number;
  total_cost: number;
}

export interface PMaxCannibalizationRecord {
  query: string;
  search_cpc: number;
  pmax_cpc: number;
  search_conversions: number;
  pmax_conversions: number;
  cpc_inflation_ratio: number;
}

export interface NegativeCollisionResult {
  candidate: string;
  has_collision: boolean;
  forced_match: string;
  exclusion_type: 'exact' | 'broad';
  colliding_terms: string[];
}

export interface WilsonScoreBounds {
  lower: number;
  upper: number;
}

export interface BetaPosteriorMetrics {
  alpha: number;
  beta: number;
  mean: number;
  variance: number;
}

export interface CPADragMetrics {
  realizedCPA: number;
  marginalDrag: number;
  wasteRatio: number;
}

/**
 * Deterministic Negative Keyword representation for Dexie.js persistence.
 * Indexed by sha256Hash for sub-5ms delta checks against existing rulesets.
 */
export interface PersistedNegativeKeyword {
  /** Optional identifier alias */
  id?: string;
  /** Deterministic SHA-256 hash of the normalized keyword + match type (primary key / index) */
  sha256Hash: string;
  /** Keyword text */
  keyword: string;
  /** Match type representation: broad, phrase, or exact bracketed [keyword] */
  matchType: 'broad' | 'phrase' | 'exact';
  /** Formatted rule string (e.g. "[cheap shoes]" or "cheap shoes") */
  formattedRule: string;
  /** Platform origin */
  platform: PlatformSchema;
  /** Confidence score derived from Beta CDF or Wilson bounds (0.0 to 1.0) */
  confidenceScore: number;
  /** Marginal CPA drag waste estimated in account currency */
  marginalWaste: number;
  /** Collision flag indicating exact bracket forcing */
  hasCollision: boolean;
  /** Terms that caused collision safety override */
  collidingSafeTerms?: string[];
  /** Colliding term alias */
  collidingTerm?: string;
  /** Traffic clicks recorded for search term */
  clicks?: number;
  /** Total spend / cost recorded */
  cost?: number;
  /** Total conversions recorded */
  conversions?: number;
  /** Linguistic fingerprint / cluster identifier */
  linguisticFingerprint?: string;
  /** Campaign where search term was first identified */
  firstSeenCampaign?: string;
  /** Timestamp when keyword candidate was synthesized */
  createdAt: number;
  /** Campaign or AdGroup scope where applicable */
  scope?: {
    campaign?: string;
    adGroup?: string;
  };
}

/**
 * Worker Command Types (Main Thread -> Worker)
 */
export type WorkerCommandType =
  | 'INIT_WASM'
  | 'INGEST_CSV_CHUNK'
  | 'DETECT_PLATFORM_SCHEMA'
  | 'EXPORT_NGRAM_METRICS'
  | 'GET_REPORTING_GAP'
  | 'DETECT_AUCTION_COLLISIONS'
  | 'DETECT_PMAX_CANNIBALIZATION'
  | 'GUARD_ADD_SAFE_TERMS'
  | 'GUARD_EVALUATE_CANDIDATES'
  | 'CALCULATE_WILSON_SCORE'
  | 'CALCULATE_BETA_CONFIDENCE'
  | 'CALCULATE_CPA_DRAG'
  | 'RESET_ENGINE';

/**
 * Worker Event Types (Worker -> Main Thread)
 */
export type WorkerEventType =
  | 'INIT_WASM_SUCCESS'
  | 'INGEST_CHUNK_PROGRESS'
  | 'INGEST_CHUNK_COMPLETE'
  | 'DETECT_PLATFORM_SCHEMA_RESULT'
  | 'EXPORT_NGRAM_METRICS_RESULT'
  | 'GET_REPORTING_GAP_RESULT'
  | 'DETECT_AUCTION_COLLISIONS_RESULT'
  | 'DETECT_PMAX_CANNIBALIZATION_RESULT'
  | 'GUARD_ADD_SAFE_TERMS_SUCCESS'
  | 'GUARD_EVALUATE_CANDIDATES_RESULT'
  | 'CALCULATE_WILSON_SCORE_RESULT'
  | 'CALCULATE_BETA_CONFIDENCE_RESULT'
  | 'CALCULATE_CPA_DRAG_RESULT'
  | 'RESET_ENGINE_SUCCESS'
  | 'WORKER_ERROR';

// -----------------------------------------------------------------------------
// Message Payloads (Main -> Worker)
// -----------------------------------------------------------------------------

export interface InitWasmCommand {
  type: 'INIT_WASM';
  requestId: string;
  /** WebAssembly binary buffer transferred without clone */
  wasmBuffer?: ArrayBuffer;
}

export interface IngestCsvChunkCommand {
  type: 'INGEST_CSV_CHUNK';
  requestId: string;
  /** Zero-copy transferred chunk byte buffer */
  chunkBuffer: ArrayBuffer;
  isFinal: boolean;
  targetCPA?: number;
}

export interface DetectPlatformSchemaCommand {
  type: 'DETECT_PLATFORM_SCHEMA';
  requestId: string;
  /** Sample header/rows buffer transferred */
  headerBuffer: ArrayBuffer;
}

export interface ExportNGramMetricsCommand {
  type: 'EXPORT_NGRAM_METRICS';
  requestId: string;
  n: 1 | 2 | 3;
}

export interface GetReportingGapCommand {
  type: 'GET_REPORTING_GAP';
  requestId: string;
}

export interface DetectAuctionCollisionsCommand {
  type: 'DETECT_AUCTION_COLLISIONS';
  requestId: string;
}

export interface DetectPMaxCannibalizationCommand {
  type: 'DETECT_PMAX_CANNIBALIZATION';
  requestId: string;
}

export interface GuardAddSafeTermsCommand {
  type: 'GUARD_ADD_SAFE_TERMS';
  requestId: string;
  safeTerms: Array<{ term: string; conversions: number }>;
}

export interface GuardEvaluateCandidatesCommand {
  type: 'GUARD_EVALUATE_CANDIDATES';
  requestId: string;
  candidates: string[];
}

export interface CalculateWilsonScoreCommand {
  type: 'CALCULATE_WILSON_SCORE';
  requestId: string;
  trials: bigint | number;
  successes: bigint | number;
  z: number;
}

export interface CalculateBetaConfidenceCommand {
  type: 'CALCULATE_BETA_CONFIDENCE';
  requestId: string;
  trials: bigint | number;
  successes: bigint | number;
  priorAlpha: number;
  priorBeta: number;
  thresholdRate: number;
}

export interface CalculateCPADragCommand {
  type: 'CALCULATE_CPA_DRAG';
  requestId: string;
  cost: number;
  conversions: number;
  targetCPA: number;
}

export interface ResetEngineCommand {
  type: 'RESET_ENGINE';
  requestId: string;
}

export type WorkerCommand =
  | InitWasmCommand
  | IngestCsvChunkCommand
  | DetectPlatformSchemaCommand
  | ExportNGramMetricsCommand
  | GetReportingGapCommand
  | DetectAuctionCollisionsCommand
  | DetectPMaxCannibalizationCommand
  | GuardAddSafeTermsCommand
  | GuardEvaluateCandidatesCommand
  | CalculateWilsonScoreCommand
  | CalculateBetaConfidenceCommand
  | CalculateCPADragCommand
  | ResetEngineCommand;

// -----------------------------------------------------------------------------
// Message Responses (Worker -> Main)
// -----------------------------------------------------------------------------

export interface BaseWorkerResponse {
  requestId: string;
  type: WorkerEventType;
  workerId?: number;
}

export interface InitWasmSuccessResponse extends BaseWorkerResponse {
  type: 'INIT_WASM_SUCCESS';
}

export interface IngestChunkProgressResponse extends BaseWorkerResponse {
  type: 'INGEST_CHUNK_PROGRESS';
  bytesConsumed: number;
}

export interface IngestChunkCompleteResponse extends BaseWorkerResponse {
  type: 'INGEST_CHUNK_COMPLETE';
  statusCode: number;
  bytesConsumed?: number;
  keywords?: PersistedNegativeKeyword[];
}

export interface DetectPlatformSchemaResponse extends BaseWorkerResponse {
  type: 'DETECT_PLATFORM_SCHEMA_RESULT';
  schema: PlatformSchema;
}

export interface ExportNGramMetricsResponse extends BaseWorkerResponse {
  type: 'EXPORT_NGRAM_METRICS_RESULT';
  n: 1 | 2 | 3;
  metrics: MetricAggregateRecord[];
  /** Optional transferred raw JSON ArrayBuffer for high-density rendering */
  rawBuffer?: ArrayBuffer;
}

export interface GetReportingGapResponse extends BaseWorkerResponse {
  type: 'GET_REPORTING_GAP_RESULT';
  gap: ReportingGapMetrics;
}

export interface DetectAuctionCollisionsResponse extends BaseWorkerResponse {
  type: 'DETECT_AUCTION_COLLISIONS_RESULT';
  collisions: AuctionCollisionRecord[];
}

export interface DetectPMaxCannibalizationResponse extends BaseWorkerResponse {
  type: 'DETECT_PMAX_CANNIBALIZATION_RESULT';
  cannibalizations: PMaxCannibalizationRecord[];
}

export interface GuardAddSafeTermsSuccessResponse extends BaseWorkerResponse {
  type: 'GUARD_ADD_SAFE_TERMS_SUCCESS';
  count: number;
}

export interface GuardEvaluateCandidatesResponse extends BaseWorkerResponse {
  type: 'GUARD_EVALUATE_CANDIDATES_RESULT';
  evaluations: NegativeCollisionResult[];
}

export interface CalculateWilsonScoreResponse extends BaseWorkerResponse {
  type: 'CALCULATE_WILSON_SCORE_RESULT';
  bounds: WilsonScoreBounds;
}

export interface CalculateBetaConfidenceResponse extends BaseWorkerResponse {
  type: 'CALCULATE_BETA_CONFIDENCE_RESULT';
  posterior: BetaPosteriorMetrics;
  probabilityBelowThreshold: number;
}

export interface CalculateCPADragResponse extends BaseWorkerResponse {
  type: 'CALCULATE_CPA_DRAG_RESULT';
  cpaMetrics: CPADragMetrics;
}

export interface ResetEngineSuccessResponse extends BaseWorkerResponse {
  type: 'RESET_ENGINE_SUCCESS';
}

export interface WorkerErrorResponse extends BaseWorkerResponse {
  type: 'WORKER_ERROR';
  error: string;
  code?: string;
  stack?: string;
}

export type WorkerResponse =
  | InitWasmSuccessResponse
  | IngestChunkProgressResponse
  | IngestChunkCompleteResponse
  | DetectPlatformSchemaResponse
  | ExportNGramMetricsResponse
  | GetReportingGapResponse
  | DetectAuctionCollisionsResponse
  | DetectPMaxCannibalizationResponse
  | GuardAddSafeTermsSuccessResponse
  | GuardEvaluateCandidatesResponse
  | CalculateWilsonScoreResponse
  | CalculateBetaConfidenceResponse
  | CalculateCPADragResponse
  | ResetEngineSuccessResponse
  | WorkerErrorResponse;

// -----------------------------------------------------------------------------
// Delta Comparison & Transfer Helpers
// -----------------------------------------------------------------------------

export interface DeltaComparisonResult {
  newKeywords: PersistedNegativeKeyword[];
  identicalKeywordsCount: number;
  durationMs: number;
}

/**
 * Extracts transferable ArrayBuffers for zero-copy postMessage transfers.
 */
export function getTransferables(command: WorkerCommand): Transferable[] {
  switch (command.type) {
    case 'INIT_WASM':
      return command.wasmBuffer ? [command.wasmBuffer] : [];
    case 'INGEST_CSV_CHUNK':
      return [command.chunkBuffer];
    case 'DETECT_PLATFORM_SCHEMA':
      return [command.headerBuffer];
    default:
      return [];
  }
}

