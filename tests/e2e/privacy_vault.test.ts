/**
 * Sieve Privacy & Encrypted Vault E2E Security Suite (Phase 8)
 *
 * Verifies:
 * 1. AES-GCM-256 encryption roundtrip with PBKDF2 (SHA-256, 100,000 iterations, 96-bit IV)
 * 2. Absolute zero-telemetry network integrity audit
 * 3. Session cryptographic SHA-256 audit proof generation
 * 4. Local File System Access API client-side backup mirroring
 * 5. Direct AWS SigV4 S3 backup synchronization with zero intermediaries
 * 6. PrivacyBadgeModal rendering cryptographic proofs and brand integration
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';

// Modules to be implemented in Step 2:
import {
  exportVaultToBuffer,
  importVaultFromBuffer,
  VAULT_MAGIC_HEADER,
  PBKDF2_ITERATIONS,
  type SieveVaultPayload,
} from '../../src/crypto/vault.ts';
import {
  PrivacyMonitor,
  generateSessionAuditHash,
  type SessionAuditState,
} from '../../src/crypto/privacy_monitor.ts';
import {
  syncVaultToLocalDirectory,
  type MockDirectoryHandle,
} from '../../src/sync/filesystem.ts';
import {
  uploadVaultToS3,
  computeAwsSigV4Headers,
  type S3SyncConfig,
} from '../../src/sync/s3.ts';
import { PrivacyBadgeModal } from '../../src/components/privacy/PrivacyBadgeModal.tsx';
import { createSieveDatabase } from '../../src/storage/db.ts';

// ---------------------------------------------------------------------------
// 1. AES-GCM-256 Cryptographic Vault Backup & Restoration
// ---------------------------------------------------------------------------
test('AES-GCM-256 Vault: Enforces PBKDF2 100,000 iterations, 96-bit IV, and rejection on incorrect passphrase', async () => {
  // Constant assertions
  assert.strictEqual(PBKDF2_ITERATIONS, 100000, 'PBKDF2 must use exactly 100,000 iterations');
  assert.strictEqual(VAULT_MAGIC_HEADER, 'SIEV_VAULT_V1', 'Vault must begin with SIEV_VAULT_V1 magic identifier');

  // Prepare sample IndexedDB state
  const testDb = createSieveDatabase(`test-vault-source-${Date.now()}`);
  const sampleSession = {
    sessionId: 'session_crypto_audit_01',
    timestamp: 1700000000000,
    platform: 1,
    totalSpend: 14250.5,
    recordsProcessed: 25000,
    campaignIds: ['camp-001', 'camp-002'],
  };
  const sampleExclusions = [
    {
      sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      sessionId: 'session_crypto_audit_01',
      campaignId: 'camp-001',
      matchType: 'exact' as const,
      keyword: 'free download',
      formattedRule: '[free download]',
      confidenceScore: 0.98,
      marginalWaste: 420.75,
      createdAt: 1700000001000,
    },
    {
      sha256Hash: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
      sessionId: 'session_crypto_audit_01',
      campaignId: 'camp-002',
      matchType: 'phrase' as const,
      keyword: 'torrent client',
      formattedRule: '"torrent client"',
      confidenceScore: 0.95,
      marginalWaste: 185.2,
      createdAt: 1700000002000,
    },
  ];

  await testDb.sessions.put(sampleSession);
  await testDb.exclusions.bulkPut(sampleExclusions);

  const passphrase = 'SuperSecretClientKey!2026';
  const wrongPassphrase = 'IncorrectPassword!2026';

  // 1. Export encrypted vault buffer
  const encryptedBuffer = await exportVaultToBuffer(testDb, passphrase);
  assert.ok(encryptedBuffer instanceof Uint8Array, 'Export must return a Uint8Array');
  assert.ok(encryptedBuffer.byteLength > 64, 'Encrypted buffer must contain header, salt, IV, and ciphertext');

  // Verify header magic bytes
  const headerText = new TextDecoder().decode(encryptedBuffer.slice(0, 13));
  assert.strictEqual(headerText, 'SIEV_VAULT_V1', 'Encrypted file header must match SIEV_VAULT_V1');

  // 2. Attempt decryption with incorrect passphrase -> MUST reject
  await assert.rejects(
    async () => {
      const restoreDb = createSieveDatabase(`test-vault-fail-${Date.now()}`);
      await importVaultFromBuffer(encryptedBuffer, wrongPassphrase, restoreDb);
    },
    (err: Error) => {
      return (
        err.message.includes('Authentication failed') ||
        err.message.includes('Decryption failed') ||
        err.name === 'OperationError' ||
        err.message.toLowerCase().includes('passphrase')
      );
    },
    'Decryption with incorrect passphrase must throw an authentication failure'
  );

  // 3. Attempt decryption with tampered ciphertext -> MUST reject (GCM authentication tag verification)
  const tamperedBuffer = new Uint8Array(encryptedBuffer);
  tamperedBuffer[tamperedBuffer.length - 5] ^= 0xff; // Flip bits in ciphertext
  await assert.rejects(
    async () => {
      const restoreDb = createSieveDatabase(`test-vault-tampered-${Date.now()}`);
      await importVaultFromBuffer(tamperedBuffer, passphrase, restoreDb);
    },
    'Tampered ciphertext must fail GCM tag verification'
  );

  // 4. Successful decryption with correct passphrase -> restores exact IndexedDB state
  const restoreDb = createSieveDatabase(`test-vault-restored-${Date.now()}`);
  const restoredPayload: SieveVaultPayload = await importVaultFromBuffer(
    encryptedBuffer,
    passphrase,
    restoreDb
  );

  assert.ok(restoredPayload, 'Restored payload must be defined');
  assert.strictEqual(restoredPayload.sessions.length, 1);
  assert.strictEqual(restoredPayload.exclusions.length, 2);

  const persistedSession = await restoreDb.sessions.get('session_crypto_audit_01');
  assert.deepStrictEqual(persistedSession, sampleSession, 'Restored session must strictly match original');

  const persistedExclusion = await restoreDb.exclusions.get(sampleExclusions[0].sha256Hash);
  assert.deepStrictEqual(persistedExclusion, sampleExclusions[0], 'Restored exclusions must strictly match original');
});

// ---------------------------------------------------------------------------
// 2. Zero-Telemetry Network Integrity Audit
// ---------------------------------------------------------------------------
test('Zero-Telemetry Network Audit: Network interceptor asserts 0 network dispatches during execution', async () => {
  const monitor = new PrivacyMonitor();
  monitor.start();

  try {
    // Perform compute-intensive client-side operations:
    // Hashing, state changes, synthetic N-Gram processing
    const sampleKeywords = ['running shoes discount', 'cheap travel flight', 'free vpn login'];
    const hashes: string[] = [];

    for (const kw of sampleKeywords) {
      const enc = new TextEncoder().encode(kw);
      const digest = await crypto.subtle.digest('SHA-256', enc);
      const hex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      hashes.push(hex);
    }

    assert.strictEqual(hashes.length, 3);

    // Verify 0 network requests dispatched
    const dispatches = monitor.getDispatches();
    assert.strictEqual(
      dispatches.length,
      0,
      'Absolute Zero-Telemetry violation: Network requests were intercepted during analytical operation'
    );
    assert.strictEqual(monitor.isZeroTelemetryCompliant(), true);

    // If an unauthorized network request is attempted, interceptor blocks and records it
    await assert.rejects(
      async () => {
        await fetch('https://analytics.thirdparty.com/track', {
          method: 'POST',
          body: JSON.stringify({ event: 'telemetry_leak' }),
        });
      },
      (err: Error) => err.message.includes('Zero-Telemetry policy blocked'),
      'Strict CSP/PrivacyMonitor must block unauthorized external HTTP requests'
    );

    assert.strictEqual(monitor.getDispatches().length, 1, 'Blocked unauthorized dispatch recorded');
  } finally {
    monitor.stop();
  }
});

// ---------------------------------------------------------------------------
// 3. Session Cryptographic Verification Proof Hash
// ---------------------------------------------------------------------------
test('Session Verification: Computes deterministic SHA-256 audit proof hash across session state', async () => {
  const sessionState: SessionAuditState = {
    sessionId: 'session_audit_alpha',
    timestamp: 1700005000000,
    datasetRecordCount: 150000,
    totalWasteRecovered: 8740.25,
    exclusionsCount: 1420,
    platform: 'google_ads',
    clientAppVersion: '0.1.0',
  };

  const hash1 = await generateSessionAuditHash(sessionState);
  const hash2 = await generateSessionAuditHash({ ...sessionState });

  assert.strictEqual(typeof hash1, 'string', 'Audit proof must be a string');
  assert.strictEqual(hash1.length, 64, 'SHA-256 audit proof must be 64 hex characters');
  assert.strictEqual(hash1, hash2, 'Deterministic state must generate identical SHA-256 proof hash');

  // Mutating any parameter must yield a completely different proof hash
  const mutatedState: SessionAuditState = {
    ...sessionState,
    totalWasteRecovered: 8740.26, // 1 cent difference
  };
  const hashMutated = await generateSessionAuditHash(mutatedState);
  assert.notStrictEqual(hash1, hashMutated, 'Altered session state must change cryptographic audit proof');
});

// ---------------------------------------------------------------------------
// 4. Client-Side File System Access API Backup Mirroring
// ---------------------------------------------------------------------------
test('File System Sync: Mirror encrypted .sievevault backups using client-side directory handles', async () => {
  let createdFileName = '';
  let writtenData: Uint8Array | null = null;
  let streamClosed = false;

  const mockWritable = {
    write: async (chunk: any) => {
      writtenData = new Uint8Array(chunk);
    },
    close: async () => {
      streamClosed = true;
    },
  };

  const mockFileHandle = {
    createWritable: async () => mockWritable,
  };

  const mockDirectoryHandle: MockDirectoryHandle = {
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      createdFileName = name;
      return mockFileHandle as any;
    },
  };

  const samplePayload = new Uint8Array([83, 73, 69, 86, 1, 2, 3, 4, 5, 6]);
  const filename = `backup_20261104_${Date.now()}.sievevault`;

  const result = await syncVaultToLocalDirectory(mockDirectoryHandle as any, filename, samplePayload);

  assert.strictEqual(result.success, true);
  assert.strictEqual(createdFileName, filename, 'Target filename must match requested .sievevault name');
  assert.ok(createdFileName.endsWith('.sievevault'), 'Backup filename must enforce .sievevault extension');
  assert.deepStrictEqual(writtenData, samplePayload, 'Written data must match encrypted vault payload');
  assert.strictEqual(streamClosed, true, 'Writable file stream must be cleanly closed');
});

// ---------------------------------------------------------------------------
// 5. Direct AWS SigV4 Client-Side S3 Backup Synchronization
// ---------------------------------------------------------------------------
test('S3 Client Sync: Produces compliant AWS Signature V4 headers and performs direct client upload', async () => {
  const s3Config: S3SyncConfig = {
    bucket: 'sieve-audit-vaults',
    region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    prefix: 'backups/client_01',
  };

  const payload = new Uint8Array([83, 73, 69, 86, 99, 98, 97]);
  const filename = 'vault_audit.sievevault';
  const datetime = '20261104T120000Z';

  // 1. Test canonical SigV4 header generation
  const headers = await computeAwsSigV4Headers(s3Config, filename, payload, datetime);

  assert.ok(headers['Authorization'], 'Authorization header must be present');
  assert.ok(
    headers['Authorization'].startsWith('AWS4-HMAC-SHA256 Credential='),
    'Authorization header must adhere to AWS4-HMAC-SHA256 standard'
  );
  assert.ok(
    headers['Authorization'].includes('SignedHeaders=host;x-amz-content-sha256;x-amz-date'),
    'Signed headers must include host, content hash, and date'
  );
  assert.strictEqual(headers['x-amz-date'], datetime);
  assert.strictEqual(headers['host'], `${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com`);
  assert.strictEqual(headers['Content-Type'], 'application/octet-stream');
  assert.strictEqual(typeof headers['x-amz-content-sha256'], 'string');
  assert.strictEqual(headers['x-amz-content-sha256'].length, 64);

  // 2. Test direct client dispatch with mocked global fetch
  let interceptedUrl = '';
  let interceptedMethod = '';
  let interceptedHeaders: any = {};
  let interceptedBody: any = null;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    interceptedUrl = input.toString();
    interceptedMethod = init?.method || 'GET';
    interceptedHeaders = init?.headers || {};
    interceptedBody = init?.body;
    return new Response(null, { status: 200, statusText: 'OK' });
  };

  try {
    const uploadResult = await uploadVaultToS3(s3Config, payload, filename);
    assert.strictEqual(uploadResult.success, true);
    assert.strictEqual(
      interceptedUrl,
      `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/${s3Config.prefix}/${filename}`
    );
    assert.strictEqual(interceptedMethod, 'PUT');
    assert.ok(interceptedHeaders['Authorization'].startsWith('AWS4-HMAC-SHA256'));
    assert.deepStrictEqual(new Uint8Array(interceptedBody), payload);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// 6. PrivacyBadgeModal UI Component Proof Rendering
// ---------------------------------------------------------------------------
test('PrivacyBadgeModal: Renders cryptographic audit proof, zero-telemetry badge, and brand asset', () => {
  cleanup();

  const mockProofHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  render(
    React.createElement(PrivacyBadgeModal, {
      isOpen: true,
      onClose: () => {},
      sessionAuditHash: mockProofHash,
      telemetryBlockedCount: 0,
      isEncrypted: true,
    })
  );

  // 1. Verify modal title and Zero-Telemetry affirmation
  const title = screen.getByRole('heading', { level: 2 });
  assert.ok(title.textContent?.includes('Privacy & Cryptographic Audit Proof'));

  // 2. Verify audit hash presence
  assert.ok(screen.getByText(new RegExp(mockProofHash.slice(0, 16))));

  // 3. Verify zero-telemetry status badge
  assert.ok(screen.getByText(/100% Client-Side/i));
  assert.ok(screen.getByText(/0 Telemetry Packets Dispatched/i));

  // 4. Verify presence of Sieve brand logo
  const logo = screen.getByAltText(/Sieve Vector Logo/i);
  assert.ok(logo);
  assert.strictEqual(logo.getAttribute('src'), '/sieve.svg');

  cleanup();
});
