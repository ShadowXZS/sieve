/**
 * Sieve History Repository
 *
 * Provides cryptographic hashing (Web Crypto API SHA-256), Dexie.js persistence
 * for run sessions and exclusion rules, and sub-5ms delta comparisons against
 * historical imports.
 * Physical line ceiling: <= 250 lines.
 */

import {
  SieveDatabase,
  type IngestionSessionRecord,
  type PersistedExclusionRecord,
  type HashChunkRecord,
} from '../db.ts';
import {
  computeKeywordHash,
  packHashesToBuffer,
  LOOKUP_PAIR,
} from './hash_packer.ts';

export { computeKeywordHash, packHashesToBuffer, LOOKUP_PAIR };

export interface CandidateNegativeRule {
  keyword: string;
  matchType: 'broad' | 'phrase' | 'exact';
  formattedRule: string;
  confidenceScore: number;
  marginalWaste: number;
  campaignId?: string;
  scope?: {
    campaign?: string;
    adGroup?: string;
  };
}
export const CandidateNegativeRule = {};

export interface DeltaResult {
  previouslyExcluded: Array<{
    rule: CandidateNegativeRule;
    stored: PersistedExclusionRecord;
  }>;
  newlyDiscovered: Array<{
    rule: CandidateNegativeRule;
    sha256Hash: string;
  }>;
  durationMs: number;
}
export const DeltaResult = {};

export async function computeDelta(
  candidates: CandidateNegativeRule[],
  campaignId?: string,
  db?: SieveDatabase
): Promise<DeltaResult> {
  const repo = new HistoryRepository(db!);
  return repo.computeDelta(candidates, campaignId);
}

export class HistoryRepository {
  private db: SieveDatabase;

  constructor(db: SieveDatabase) {
    this.db = db;
  }

  public async createSession(session: IngestionSessionRecord): Promise<string> {
    await this.db.sessions.put(session);
    return session.sessionId;
  }

  public async getSession(sessionId: string): Promise<IngestionSessionRecord | undefined> {
    return await this.db.sessions.get(sessionId);
  }

  public async saveExclusions(
    sessionId: string,
    rules: CandidateNegativeRule[]
  ): Promise<PersistedExclusionRecord[]> {
    const now = Date.now();
    const records: PersistedExclusionRecord[] = await Promise.all(
      rules.map(async (r) => {
        const campaignId = r.campaignId || r.scope?.campaign || '';
        const sha256Hash = await computeKeywordHash(r.keyword, r.matchType, campaignId);
        return {
          sha256Hash,
          sessionId,
          campaignId,
          matchType: r.matchType,
          keyword: r.keyword,
          formattedRule: r.formattedRule,
          confidenceScore: r.confidenceScore,
          marginalWaste: r.marginalWaste,
          createdAt: now,
        };
      })
    );

    await this.db.exclusions.bulkPut(records);
    return records;
  }

  public async bulkSaveRawExclusions(records: PersistedExclusionRecord[]): Promise<void> {
    await this.db.transaction('rw', this.db.exclusions, async () => {
      await this.db.exclusions.bulkPut(records);
    });
  }

  public async serializeAndCommitHashes(
    sessionId: string,
    hashes: string[]
  ): Promise<{ durationMs: number; bytesWritten: number }> {
    const start = performance.now();
    const count = hashes.length;
    const buffer = packHashesToBuffer(hashes);

    const chunkRecord: HashChunkRecord = {
      chunkId: `chunk_${sessionId}_${Date.now()}`,
      sessionId,
      count,
      payload: buffer.buffer as ArrayBuffer,
      createdAt: Date.now(),
    };

    await this.db.hashChunks.put(chunkRecord);
    const durationMs = performance.now() - start;

    return {
      durationMs,
      bytesWritten: buffer.byteLength,
    };
  }

  public async getExclusionByHash(
    sha256Hash: string
  ): Promise<PersistedExclusionRecord | undefined> {
    return await this.db.exclusions.get(sha256Hash);
  }

  public async getExclusionsByCampaign(
    campaignId: string
  ): Promise<PersistedExclusionRecord[]> {
    return await this.db.exclusions.where('campaignId').equals(campaignId).toArray();
  }

  public async computeDelta(
    incomingCandidates: CandidateNegativeRule[],
    campaignId?: string
  ): Promise<DeltaResult> {
    const start = performance.now();

    const candidateWithHashes = await Promise.all(
      incomingCandidates.map(async (rule) => {
        const camp = rule.campaignId || campaignId || '';
        const hash = await computeKeywordHash(rule.keyword, rule.matchType, camp);
        return { rule, hash };
      })
    );

    const existingRecords = campaignId
      ? await this.db.exclusions.where('campaignId').equals(campaignId).toArray()
      : await this.db.exclusions.toArray();

    const existingMap = new Map<string, PersistedExclusionRecord>();
    for (let i = 0; i < existingRecords.length; i++) {
      const rec = existingRecords[i];
      existingMap.set(rec.sha256Hash, rec);
    }

    const previouslyExcluded: DeltaResult['previouslyExcluded'] = [];
    const newlyDiscovered: DeltaResult['newlyDiscovered'] = [];

    for (let i = 0; i < candidateWithHashes.length; i++) {
      const item = candidateWithHashes[i];
      const stored = existingMap.get(item.hash);
      if (stored) {
        previouslyExcluded.push({ rule: item.rule, stored });
      } else {
        newlyDiscovered.push({ rule: item.rule, sha256Hash: item.hash });
      }
    }

    const durationMs = performance.now() - start;

    return {
      previouslyExcluded,
      newlyDiscovered,
      durationMs,
    };
  }
}
