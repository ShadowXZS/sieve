/**
 * Phase 14 E2E Test Suite: Privacy Attestation & Release Hardening
 *
 * Verifies:
 * 1. Client-Side PII Scrubber: Detects and replaces emails, phone numbers, and payment cards
 *    with customizable placeholders (default: '[REDACTED]').
 * 2. Zero Network Calls: Interceptor guarantees 0 external HTTP, WebSocket, and WebRTC requests
 *    during analytical execution and workflow export.
 * 3. Cryptographic Air-Gap Attestation: Generates and cryptographically verifies a valid
 *    SHA-256 attestation digest proving 100% local client-side execution integrity.
 * 4. PrivacyModal Component: Renders cryptographic audit proof, air-gap guarantee,
 *    and local attestation verification in the UI.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

// Modules to be implemented in Step 2:
import {
  scrubPII,
  scrubSearchTerms,
  type PIIScrubberOptions,
} from '../../src/crypto/pii_scrubber.ts';
import {
  AirGapAuditor,
  generateAirGapAttestation,
  verifyAirGapAttestation,
  type AirGapAttestation,
} from '../../src/crypto/attestation.ts';
import { PrivacyModal } from '../../src/components/privacy/PrivacyModal.tsx';

describe('Phase 14: Release Hardening & Air-Gap Privacy Attestation (E2E)', () => {
  // -------------------------------------------------------------------------
  // 1. PII Scrubber Redaction & Custom Placeholders
  // -------------------------------------------------------------------------
  test('PII Scrubber: Redacts emails, phone patterns, and credit cards with customizable placeholders', () => {
    const rawSearchQuery =
      'order inquiry for john.doe@example.com call helpline +1 (800) 555-0199 or card 4111-1111-1111-1111';

    // Default placeholder [REDACTED]
    const defaultScrubbed = scrubPII(rawSearchQuery);
    assert.strictEqual(
      defaultScrubbed.text,
      'order inquiry for [REDACTED] call helpline [REDACTED] or card [REDACTED]'
    );
    assert.strictEqual(defaultScrubbed.hasPII, true);
    assert.strictEqual(defaultScrubbed.redactedCount, 3);
    assert.strictEqual(defaultScrubbed.types.includes('email'), true);
    assert.strictEqual(defaultScrubbed.types.includes('phone'), true);
    assert.strictEqual(defaultScrubbed.types.includes('credit_card'), true);

    // Custom placeholder string
    const customPlaceholderResult = scrubPII(rawSearchQuery, {
      placeholder: '[CONFIDENTIAL]',
    });
    assert.strictEqual(
      customPlaceholderResult.text,
      'order inquiry for [CONFIDENTIAL] call helpline [CONFIDENTIAL] or card [CONFIDENTIAL]'
    );

    // Custom per-type placeholder function or object
    const typedPlaceholderResult = scrubPII(rawSearchQuery, {
      placeholder: (type) => `[REDACTED_${type.toUpperCase()}]`,
    });
    assert.strictEqual(
      typedPlaceholderResult.text,
      'order inquiry for [REDACTED_EMAIL] call helpline [REDACTED_PHONE] or card [REDACTED_CREDIT_CARD]'
    );

    // Batch scrubbing over search term list
    const searchTerms = [
      'support contact sarah@techcorp.io issue',
      'discount code 555-987-6543 helpline',
      'regular non-pii query nike sneakers size 11',
    ];
    const batchResult = scrubSearchTerms(searchTerms, { placeholder: '[REDACTED]' });
    assert.strictEqual(batchResult.scrubbed[0], 'support contact [REDACTED] issue');
    assert.strictEqual(batchResult.scrubbed[1], 'discount code [REDACTED] helpline');
    assert.strictEqual(batchResult.scrubbed[2], 'regular non-pii query nike sneakers size 11');
    assert.strictEqual(batchResult.totalRedactions, 2);
  });

  // -------------------------------------------------------------------------
  // 2. Zero Network Calls: HTTP, WebSocket, WebRTC Interception
  // -------------------------------------------------------------------------
  test('Zero Network Calls: Network interceptor asserts 0 external HTTP/WebSocket/WebRTC requests during workflow', async () => {
    const auditor = new AirGapAuditor();
    auditor.start();

    try {
      assert.strictEqual(auditor.getOutboundBytes(), 0);
      assert.strictEqual(auditor.getDispatches().length, 0);

      // 1. Assert external HTTP fetch is blocked and emits 0 bytes
      await assert.rejects(
        async () => {
          await fetch('https://telemetry.external-domain.com/v1/event', {
            method: 'POST',
            body: JSON.stringify({ telemetry: 'leak' }),
          });
        },
        /Air-Gap Zero-Telemetry policy blocked/i,
        'External HTTP fetch must be strictly blocked'
      );

      // 2. Assert external WebSocket connection is blocked
      if (typeof globalThis.WebSocket !== 'undefined') {
        assert.throws(
          () => {
            new WebSocket('wss://realtime.external-domain.com/stream');
          },
          /Air-Gap Zero-Telemetry policy blocked/i,
          'External WebSocket connection must be blocked'
        );
      }

      // 3. Assert WebRTC peer connection creation is monitored/air-gapped
      if (typeof globalThis.RTCPeerConnection !== 'undefined') {
        assert.throws(
          () => {
            new RTCPeerConnection({
              iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
            });
          },
          /Air-Gap Zero-Telemetry policy blocked/i,
          'External WebRTC peer connection with remote STUN/TURN must be blocked'
        );
      }

      // Invariants: 0 bytes egressed, zero leaks permitted
      assert.strictEqual(auditor.getOutboundBytes(), 0, 'Zero bytes must leave the machine');
      assert.strictEqual(auditor.isAirGapCompliant(), true);
    } finally {
      auditor.stop();
    }
  });

  // -------------------------------------------------------------------------
  // 3. Cryptographic Air-Gap Attestation
  // -------------------------------------------------------------------------
  test('Cryptographic Attestation: Generates valid SHA-256 digest proving local execution integrity', async () => {
    const auditor = new AirGapAuditor();
    auditor.start();

    try {
      const attestation = await generateAirGapAttestation({
        sessionId: 'audit_session_airgap_01',
        recordsCount: 25000,
        piiRedactionsCount: 8,
        airGapAuditor: auditor,
      });

      assert.strictEqual(attestation.status, 'AIR_GAP_VERIFIED');
      assert.strictEqual(attestation.outboundBytes, 0, 'Must certify strictly 0 outbound bytes');
      assert.strictEqual(typeof attestation.sha256Digest, 'string');
      assert.strictEqual(attestation.sha256Digest.length, 64, 'Attestation digest must be 64-hex SHA-256');

      // Verify attestation validity
      const verification = await verifyAirGapAttestation(attestation);
      assert.strictEqual(verification.isValid, true, 'Attestation must pass cryptographic verification');

      // Tampering detection: Altering any parameter invalidates the attestation
      const tamperedAttestation: AirGapAttestation = {
        ...attestation,
        outboundBytes: 1, // tamper: claim 1 byte leaked
      };
      const tamperedCheck = await verifyAirGapAttestation(tamperedAttestation);
      assert.strictEqual(tamperedCheck.isValid, false, 'Tampered attestation must be rejected');
    } finally {
      auditor.stop();
    }
  });

  // -------------------------------------------------------------------------
  // 4. PrivacyModal Component UI
  // -------------------------------------------------------------------------
  test('PrivacyModal: Renders cryptographic proof, air-gap guarantee, and verifies in UI', async () => {
    cleanup();

    const attestation = await generateAirGapAttestation({
      sessionId: 'session_modal_test',
      recordsCount: 50000,
      piiRedactionsCount: 12,
    });

    render(
      React.createElement(PrivacyModal, {
        isOpen: true,
        onClose: () => {},
        attestation: attestation,
      })
    );

    // Verify modal elements
    assert.ok(screen.getByText(/Air-Gap Cryptographic Attestation/i));
    assert.ok(screen.getByText(/0 Bytes Outbound/i));
    assert.ok(screen.getByText(new RegExp(attestation.sha256Digest.slice(0, 16))));

    // Test verify button in UI
    const verifyBtn = screen.getByRole('button', { name: /verify attestation/i });
    await act(async () => {
      fireEvent.click(verifyBtn);
    });

    assert.ok(await screen.findByText(/Attestation Verified: Authentic 0-Byte Air-Gap/i));
  });
});
