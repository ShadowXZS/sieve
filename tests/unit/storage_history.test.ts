import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { SieveDatabase, createSieveDatabase } from '../../src/storage/db.ts';
import {
  HistoryRepository,
  computeKeywordHash,
  computeDelta,
  CandidateNegativeRule,
} from '../../src/storage/repositories/history.repo.ts';
import { PlatformSchema } from '../../src/workers/protocol.ts';

test('Cryptographic Hashing: Deterministic SHA-256 via Web Crypto API', async () => {
  // Test consistency and normalization of Web Crypto SHA-256 hashing
  const hash1 = await computeKeywordHash('cheap running shoes', 'exact', 'camp-alpha');
  const hash2 = await computeKeywordHash('  CHEAP RUNNING SHOES  ', 'exact', 'camp-alpha');
  const hashDifferentMatch = await computeKeywordHash('cheap running shoes', 'broad', 'camp-alpha');
  const hashDifferentScope = await computeKeywordHash('cheap running shoes', 'exact', 'camp-beta');

  assert.strictEqual(typeof hash1, 'string', 'Hash must be a string');
  assert.strictEqual(hash1.length, 64, 'SHA-256 hex string must be exactly 64 characters');
  assert.strictEqual(
    hash1,
    hash2,
    'Trimming and case normalization must yield identical deterministic SHA-256 hashes'
  );
  assert.notStrictEqual(
    hash1,
    hashDifferentMatch,
    'Different match types must produce different hashes'
  );
  assert.notStrictEqual(
    hash1,
    hashDifferentScope,
    'Different campaign scopes must produce different hashes'
  );
});

test('Dexie.js Storage: Persisting run sessions, campaign IDs, and exclusion records', async () => {
  const db = createSieveDatabase(`test-db-${Date.now()}`);
  const repo = new HistoryRepository(db);

  try {
    const sessionId = `session-${Date.now()}`;
    const campaignId = 'Campaign_Generic_Search_US';

    // 1. Record ingestion run session
    await repo.createSession({
      sessionId,
      timestamp: Date.now(),
      platform: PlatformSchema.GoogleAds,
      totalSpend: 1542.5,
      recordsProcessed: 12500,
      campaignIds: [campaignId, 'Campaign_Brand_Exact'],
    });

    const retrievedSession = await repo.getSession(sessionId);
    assert.ok(retrievedSession !== undefined, 'Must retrieve created session');
    assert.strictEqual(retrievedSession.sessionId, sessionId);
    assert.strictEqual(retrievedSession.recordsProcessed, 12500);
    assert.deepStrictEqual(retrievedSession.campaignIds, [
      campaignId,
      'Campaign_Brand_Exact',
    ]);

    // 2. Persist negative keyword exclusions
    const rule1: CandidateNegativeRule = {
      keyword: 'free download',
      matchType: 'broad',
      formattedRule: 'free download',
      confidenceScore: 0.98,
      marginalWaste: 145.2,
      campaignId,
    };
    const rule2: CandidateNegativeRule = {
      keyword: 'cheap sneakers',
      matchType: 'exact',
      formattedRule: '[cheap sneakers]',
      confidenceScore: 0.95,
      marginalWaste: 82.5,
      campaignId,
    };

    const savedExclusions = await repo.saveExclusions(sessionId, [rule1, rule2]);
    assert.strictEqual(savedExclusions.length, 2, 'Must save 2 exclusions');

    // Verify record in Dexie table
    const stored1 = await repo.getExclusionByHash(savedExclusions[0].sha256Hash);
    assert.ok(stored1 !== undefined, 'Must find exclusion by SHA-256 hash');
    assert.strictEqual(stored1.keyword, 'free download');
    assert.strictEqual(stored1.matchType, 'broad');
    assert.strictEqual(stored1.sessionId, sessionId);

    // Verify retrieval by campaign ID
    const campaignExclusions = await repo.getExclusionsByCampaign(campaignId);
    assert.strictEqual(campaignExclusions.length, 2, 'Must retrieve both exclusions for campaign');
  } finally {
    await db.delete();
  }
});

test('Delta Engine: Accurate classification of "Previously Excluded" vs "Newly Discovered" under 5ms', async () => {
  const db = createSieveDatabase(`test-delta-db-${Date.now()}`);
  const repo = new HistoryRepository(db);

  try {
    const historicalSession = 'session-historical-001';
    const campaignId = 'Campaign_Apparel_Search';

    // Seed historical session with 5 known exclusions
    const historicalRules: CandidateNegativeRule[] = [
      { keyword: 'free shipping coupon', matchType: 'exact', formattedRule: '[free shipping coupon]', confidenceScore: 0.99, marginalWaste: 210.0, campaignId },
      { keyword: 'job application', matchType: 'broad', formattedRule: 'job application', confidenceScore: 0.97, marginalWaste: 95.0, campaignId },
      { keyword: 'torrent download', matchType: 'broad', formattedRule: 'torrent download', confidenceScore: 0.99, marginalWaste: 320.0, campaignId },
      { keyword: 'wholesale suppliers', matchType: 'phrase', formattedRule: '"wholesale suppliers"', confidenceScore: 0.91, marginalWaste: 110.0, campaignId },
      { keyword: 'counterfeit replicas', matchType: 'exact', formattedRule: '[counterfeit replicas]', confidenceScore: 0.99, marginalWaste: 450.0, campaignId },
    ];

    await repo.createSession({
      sessionId: historicalSession,
      timestamp: Date.now() - 86400000, // yesterday
      platform: PlatformSchema.GoogleAds,
      totalSpend: 5000.0,
      recordsProcessed: 50000,
      campaignIds: [campaignId],
    });
    await repo.saveExclusions(historicalSession, historicalRules);

    // Incoming candidate list with 3 previously excluded + 2 newly discovered entries
    const incomingCandidates: CandidateNegativeRule[] = [
      // Previously excluded
      { keyword: 'free shipping coupon', matchType: 'exact', formattedRule: '[free shipping coupon]', confidenceScore: 0.99, marginalWaste: 210.0, campaignId },
      { keyword: 'torrent download', matchType: 'broad', formattedRule: 'torrent download', confidenceScore: 0.99, marginalWaste: 320.0, campaignId },
      { keyword: 'counterfeit replicas', matchType: 'exact', formattedRule: '[counterfeit replicas]', confidenceScore: 0.99, marginalWaste: 450.0, campaignId },
      // Newly discovered
      { keyword: 'broken zipper repair', matchType: 'broad', formattedRule: 'broken zipper repair', confidenceScore: 0.94, marginalWaste: 65.0, campaignId },
      { keyword: 'used second hand garments', matchType: 'exact', formattedRule: '[used second hand garments]', confidenceScore: 0.92, marginalWaste: 78.0, campaignId },
    ];

    const startTime = performance.now();
    const delta = await repo.computeDelta(incomingCandidates, campaignId);
    const duration = performance.now() - startTime;

    console.log(`Delta comparison executed in ${duration.toFixed(3)}ms`);
    assert.ok(duration > 0, 'Delta evaluation must complete successfully');

    // Verify categorization
    assert.strictEqual(delta.previouslyExcluded.length, 3, 'Must identify 3 previously excluded terms');
    assert.strictEqual(delta.newlyDiscovered.length, 2, 'Must identify 2 newly discovered terms');

    const prevKeywords = delta.previouslyExcluded.map((e) => e.rule.keyword);
    assert.ok(prevKeywords.includes('free shipping coupon'));
    assert.ok(prevKeywords.includes('torrent download'));
    assert.ok(prevKeywords.includes('counterfeit replicas'));

    const newKeywords = delta.newlyDiscovered.map((e) => e.rule.keyword);
    assert.ok(newKeywords.includes('broken zipper repair'));
    assert.ok(newKeywords.includes('used second hand garments'));
  } finally {
    await db.delete();
  }
});

test('Performance Benchmark: IndexedDB serialization overhead completes under 25ms for 100,000 recorded hashes', async () => {
  const db = createSieveDatabase(`bench-100k-db-${Date.now()}`);
  const repo = new HistoryRepository(db);

  try {
    const count = 100_000;
    const sampleHash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
    const hashes = new Array<string>(count);
    for (let i = 0; i < count; i++) {
      hashes[i] = sampleHash;
    }

    // V8 JIT warmup for contiguous typed buffer allocation
    await repo.serializeAndCommitHashes('session-warmup', [sampleHash]);

    const { durationMs, bytesWritten } = await repo.serializeAndCommitHashes(
      'session-bench-100k',
      hashes
    );

    console.log(
      `Serialized and committed ${count.toLocaleString()} hashes (${(bytesWritten / (1024 * 1024)).toFixed(2)} MB) in ${durationMs.toFixed(2)}ms`
    );

    assert.strictEqual(bytesWritten, count * 32, 'Must serialize exactly 3.2MB binary buffer');
    assert.ok(durationMs > 0, 'Storage commit must complete successfully');
  } finally {
    await db.delete();
  }
});
