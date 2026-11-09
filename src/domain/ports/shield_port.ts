/**
 * SIEVE Domain Port: Conversion Shield & Collision Guard Engine
 *
 * Clean Architecture port contract to register safe-list converting terms,
 * evaluate collisions, enforce Exact Bracket-Lock fallbacks on overlaps,
 * and emit qualified negative keyword exclusion candidates.
 * Strict Dependency Rule: Depends ONLY on src/domain/types.
 */

import type {
  CollisionEvaluationResult,
  NegativeExclusionRule,
  SafeListTerm,
  ExclusionTargetLevel,
  PlatformMatchType,
  SearchTermRecord,
  QueryString,
  CurrencyMicros,
  CampaignId,
  AdGroupId,
} from '../types/index.ts';

/**
 * Decoupled Port Contract for Conversion Protection & Collision Mitigation.
 */
export interface IConversionShieldPort {
  /**
   * Registers proven converting terms into the conversion safe-list.
   */
  registerSafeListTerms(
    terms: readonly SafeListTerm[]
  ): void;

  /**
   * Retrieves all currently registered safe-list converting terms.
   */
  getSafeListTerms(): readonly SafeListTerm[];

  /**
   * Evaluates a candidate negative term against the safe-list to detect collision risk.
   */
  evaluateCollision(
    candidate: QueryString,
    proposedMatchType?: PlatformMatchType
  ): CollisionEvaluationResult;

  /**
   * Evaluates a batch of candidate negative terms against the safe-list in bulk.
   */
  evaluateBatchCollisions(
    candidates: readonly QueryString[]
  ): readonly CollisionEvaluationResult[];

  /**
   * Enforces Exact Bracket-Lock fallback rule when broad/phrase exclusions overlap converting traffic.
   */
  enforceBracketLockFallback(
    candidate: QueryString,
    collidingSafeTerms: readonly QueryString[],
    wasteMicros?: CurrencyMicros
  ): NegativeExclusionRule;

  /**
   * Evaluates search term performance against target CPA and emits qualified negative candidates.
   */
  emitQualifiedNegativeCandidates(
    searchTerms: readonly SearchTermRecord[],
    targetCpaMicros: CurrencyMicros
  ): readonly NegativeExclusionRule[];

  /**
   * Computes a deterministic SHA-256 fingerprint for rule idempotency.
   */
  computeRuleFingerprint(
    term: QueryString,
    matchType: PlatformMatchType,
    targetLevel: ExclusionTargetLevel,
    campaignId?: CampaignId,
    adGroupId?: AdGroupId
  ): string;
}
