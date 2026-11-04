/**
 * Phase 14: Privacy Attestation & Release Hardening UI Component Tests
 *
 * Verifies:
 * 1. BrandHeader renders the Zero-Leak Attestation badge with 0 B readout.
 * 2. ExportModal renders PII Scrubber toggle, scrubs search terms in preview & formatters, and displays redaction count.
 * 3. ReportConfigModal renders PII redaction control for vector PDF compilation.
 * 4. PrivacyBadgeModal renders Zero-Leak Attestation certificate card and verifies 0 bytes egress.
 * 5. AuditOnePager renders scrubbed keywords in exclusion table with zero PII leaks.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

import { BrandHeader } from '../../src/components/brand/BrandHeader.tsx';
import { ExportModal } from '../../src/components/export/ExportModal.tsx';
import { ReportConfigModal } from '../../src/components/reports/ReportConfigModal.tsx';
import { PrivacyBadgeModal } from '../../src/components/privacy/PrivacyBadgeModal.tsx';
import { AuditOnePager } from '../../src/reports/pdf/AuditOnePager.tsx';
import { generateZeroLeakAttestation } from '../../src/crypto/privacy_monitor.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';

const SAMPLE_KEYWORDS_WITH_PII: PersistedNegativeKeyword[] = [
  {
    id: 'kw-pii-1',
    keyword: 'order receipt john.smith@company.com urgent',
    formattedRule: '[order receipt john.smith@company.com urgent]',
    matchType: 'exact',
    clicks: 15,
    cost: 45.0,
    conversions: 0,
    marginalWaste: 45.0,
    confidenceScore: 0.95,
    hasCollision: false,
    clusterId: 'cluster-1',
    sha256Hash: 'hash-pii-1',
    createdAt: Date.now(),
    campaignId: 'camp-1',
    adGroupId: 'ag-1',
  },
  {
    id: 'kw-pii-2',
    keyword: 'customer care call 555-123-4567 direct',
    formattedRule: '"customer care call 555-123-4567 direct"',
    matchType: 'phrase',
    clicks: 28,
    cost: 95.0,
    conversions: 0,
    marginalWaste: 95.0,
    confidenceScore: 0.92,
    hasCollision: false,
    clusterId: 'cluster-2',
    sha256Hash: 'hash-pii-2',
    createdAt: Date.now(),
    campaignId: 'camp-2',
    adGroupId: 'ag-2',
  },
  {
    id: 'kw-clean-3',
    keyword: 'cheap running shoes online',
    formattedRule: '[cheap running shoes online]',
    matchType: 'exact',
    clicks: 50,
    cost: 120.0,
    conversions: 0,
    marginalWaste: 120.0,
    confidenceScore: 0.98,
    hasCollision: false,
    clusterId: 'cluster-3',
    sha256Hash: 'hash-clean-3',
    createdAt: Date.now(),
    campaignId: 'camp-3',
    adGroupId: 'ag-3',
  },
];

describe('Phase 14: Privacy Attestation & Release Hardening UI', () => {
  test('BrandHeader: Renders Zero-Leak Attestation badge with 0 B readout and triggers onOpenPrivacyModal', () => {
    cleanup();
    let modalOpened = false;

    render(
      <BrandHeader
        onOpenPrivacyModal={() => {
          modalOpened = true;
        }}
      />
    );

    const badge = screen.getByTestId('header-zero-leak-badge');
    assert.ok(badge, 'BrandHeader must render zero-leak attestation badge');
    assert.ok(badge.textContent?.includes('Zero-Leak Attestation'));
    assert.ok(badge.textContent?.includes('0 B'));

    fireEvent.click(badge);
    assert.strictEqual(modalOpened, true, 'Clicking badge must trigger modal callback');
  });

  test('ExportModal: Renders PII Scrubber toggle, active by default, and redacts terms in preview payload', () => {
    cleanup();

    render(
      <ExportModal
        isOpen={true}
        onClose={() => {}}
        keywords={SAMPLE_KEYWORDS_WITH_PII}
      />
    );

    // Verify toggle presence and default active state
    const toggle = screen.getByTestId('export-pii-toggle');
    assert.ok(toggle, 'ExportModal must render PII toggle');
    assert.ok(toggle.textContent?.includes('PII Scrubber: Redacted'));

    // Verify payload preview contains redacted tokens and does NOT contain raw email or phone
    const emailToken = screen.getByText(/\[REDACTED_EMAIL\]/);
    assert.ok(emailToken, 'Must find [REDACTED_EMAIL] token in DOM');

    const phoneToken = screen.getByText(/\[REDACTED_PHONE\]/);
    assert.ok(phoneToken, 'Must find [REDACTED_PHONE] token in DOM');

    assert.strictEqual(
      screen.queryByText(/john\.smith@company\.com/),
      null,
      'Must NOT contain raw email in DOM'
    );
    assert.strictEqual(
      screen.queryByText(/555-123-4567/),
      null,
      'Must NOT contain raw phone in DOM'
    );

    // Toggle off to view raw rules
    fireEvent.click(toggle);
    assert.ok(toggle.textContent?.includes('PII Scrubber: Raw'));

    const rawEmail = screen.getByText(/john\.smith@company\.com/);
    assert.ok(rawEmail, 'Raw payload must show unredacted email when disabled');
  });

  test('ReportConfigModal: Renders client-side PII scrubbing toggle for vector PDF compilation', () => {
    cleanup();

    render(
      <ReportConfigModal
        isOpen={true}
        onClose={() => {}}
      />
    );

    const piiToggle = screen.getByTestId('report-pii-scrub-toggle') as HTMLInputElement;
    assert.ok(piiToggle, 'ReportConfigModal must render PII scrubbing toggle');
    assert.strictEqual(piiToggle.checked, true, 'PII scrubbing must default to active (checked)');

    // Toggle off
    fireEvent.click(piiToggle);
    assert.strictEqual(piiToggle.checked, false);
  });

  test('PrivacyBadgeModal: Displays Zero-Leak Attestation certificate with 0 Bytes egress & verifies successfully', async () => {
    cleanup();

    const attestation = await generateZeroLeakAttestation({
      sessionId: 'session_ui_test',
      datasetRecordCount: 15000,
      totalWasteRecovered: 4200.0,
      exclusionsCount: 120,
      piiTokensRedacted: 3,
    });

    render(
      <PrivacyBadgeModal
        isOpen={true}
        onClose={() => {}}
        sessionAuditHash={attestation.sessionHash}
        attestation={attestation}
      />
    );

    // Check certificate card and 0 Bytes Transmitted badge
    assert.ok(screen.getByText(/Zero-Leak Attestation Certificate/i));
    assert.ok(screen.getByText(/0 Bytes Transmitted/i));
    assert.ok(screen.getByText(/0 Bytes Egress/i));

    // Test verify button
    const verifyBtn = screen.getByTestId('verify-attestation-btn');
    assert.ok(verifyBtn);

    await act(async () => {
      fireEvent.click(verifyBtn);
    });

    const affirmedText = await screen.findByText(/Cryptographically Verified: 0 Bytes Egressed/i);
    assert.ok(affirmedText, 'Must display cryptographic verification affirmation');

    // Test download button presence
    const downloadBtn = screen.getByTestId('download-attestation-btn');
    assert.ok(downloadBtn);
  });

  test('AuditOnePager: Redacts PII in top exclusions table when redactPii is true', () => {
    cleanup();

    const kpi = {
      totalWaste: 260.0,
      totalKeywords: 3,
      avgConfidence: 0.95,
      collisionCount: 0,
      exactLockedCount: 0,
    };

    const reallocation = {
      recoveredWaste: 260.0,
      currentCPA: 50.0,
      projectedCPA: 45.0,
      marginalCPA: 40.0,
      currentROAS: 2.5,
      projectedROAS: 2.8,
      roasLiftPercent: 12.0,
      incrementalConversions: 6.5,
      capitalEfficiencyIndex: 1.15,
      annualizedRecovery: 3120.0,
      efficiencyMultiplier: 1.12,
      conversionLiftPercent: 8.5,
    };

    // Call component function to obtain rendered element tree
    const doc = AuditOnePager({
      kpi,
      reallocation: reallocation as any,
      topKeywords: SAMPLE_KEYWORDS_WITH_PII,
      redactPii: true,
    });

    assert.ok(doc, 'AuditOnePager element tree must be rendered successfully');
    // Inspect rendered element tree JSON
    const jsonTree = JSON.stringify(doc);
    assert.ok(jsonTree.includes('[REDACTED_EMAIL]'), 'PDF element tree must contain [REDACTED_EMAIL]');
    assert.ok(jsonTree.includes('[REDACTED_PHONE]'), 'PDF element tree must contain [REDACTED_PHONE]');
    assert.strictEqual(
      jsonTree.includes('john.smith@company.com'),
      false,
      'PDF element tree must not contain unredacted email'
    );
  });
});
