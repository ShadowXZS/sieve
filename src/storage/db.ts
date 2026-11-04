/**
 * Sieve Dexie.js Database Storage Configuration
 *
 * Configures IndexedDB persistence schemas for ingestion run sessions,
 * campaign metadata, and deterministic SHA-256 exclusion records.
 */

import { Dexie, type Table } from 'dexie';

export interface IngestionSessionRecord {
  sessionId: string;
  timestamp: number;
  platform: number;
  totalSpend: number;
  recordsProcessed: number;
  campaignIds: string[];
}

export interface PersistedExclusionRecord {
  sha256Hash: string;
  sessionId: string;
  campaignId: string;
  matchType: 'broad' | 'phrase' | 'exact';
  keyword: string;
  formattedRule: string;
  confidenceScore: number;
  marginalWaste: number;
  createdAt: number;
}

export interface HashChunkRecord {
  chunkId: string;
  sessionId: string;
  count: number;
  payload: ArrayBuffer;
  createdAt: number;
}

export class SieveDatabase extends Dexie {
  public sessions!: Table<IngestionSessionRecord, string>;
  public exclusions!: Table<PersistedExclusionRecord, string>;
  public hashChunks!: Table<HashChunkRecord, string>;

  constructor(dbName: string = 'sieve_local_db') {
    super(dbName);
    this.version(1).stores({
      sessions: 'sessionId, timestamp, platform',
      exclusions: 'sha256Hash, sessionId, campaignId, matchType, keyword, createdAt',
      hashChunks: 'chunkId, sessionId, createdAt',
    });
  }
}

export function createSieveDatabase(dbName?: string): SieveDatabase {
  return new SieveDatabase(dbName);
}

export const defaultDb = createSieveDatabase();
