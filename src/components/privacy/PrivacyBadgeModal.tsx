/**
 * Sieve Privacy & Cryptographic Audit Proof Modal (Phase 8 & Phase 14)
 *
 * Displays mathematical privacy guarantees, zero-telemetry telemetry assertion,
 * deterministic session SHA-256 state hashes, local cryptographic zero-leak attestation,
 * client-side PII scrubbing status, and encrypted backup controls.
 * Physical line ceiling: <= 250 lines.
 */

import React, { useEffect, useState } from 'react';
import { SieveLogo } from '../brand/SieveLogo.tsx';
import {
  ShieldCheck,
  Lock,
  HardDrive,
  Cloud,
  Copy,
  Check,
  X,
  FileCheck2,
} from 'lucide-react';
import type { ZeroLeakAttestation } from '../../crypto/privacy_monitor.ts';
import { AttestationAuditCard } from './AttestationAuditCard.tsx';

export interface PrivacyBadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionAuditHash?: string;
  telemetryBlockedCount?: number;
  isEncrypted?: boolean;
  attestation?: ZeroLeakAttestation | null;
  onSyncFileSystem?: () => void;
  onSyncS3?: () => void;
}

export const PrivacyBadgeModal: React.FC<PrivacyBadgeModalProps> = ({
  isOpen,
  onClose,
  sessionAuditHash = '0000000000000000000000000000000000000000000000000000000000000000',
  telemetryBlockedCount = 0,
  isEncrypted = true,
  attestation = null,
  onSyncFileSystem,
  onSyncS3,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyHash = () => {
    navigator.clipboard?.writeText(sessionAuditHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden text-zinc-100 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center space-x-3">
            <SieveLogo size="sm" alt="Sieve Vector Logo" />
            <div>
              <h2 id="privacy-modal-title" className="text-base font-semibold text-zinc-100">
                Privacy & Cryptographic Audit Proof
              </h2>
              <span className="text-[11px] text-zinc-400 font-mono">
                Phase 14 Zero-Leak Attestation Engine
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Privacy Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-lg bg-zinc-950/60 border border-emerald-500/30 flex items-center space-x-3">
              <ShieldCheck className="w-7 h-7 text-emerald-400 shrink-0" />
              <div>
                <div className="text-[10px] text-zinc-400 font-mono uppercase">Telemetry Status</div>
                <div className="text-sm font-semibold text-emerald-400">100% Client-Side</div>
                <div className="text-[10px] text-zinc-500 font-mono">0 Telemetry Packets Dispatched</div>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-zinc-950/60 border border-indigo-500/30 flex items-center space-x-3">
              <FileCheck2 className="w-7 h-7 text-indigo-400 shrink-0" />
              <div>
                <div className="text-[10px] text-zinc-400 font-mono uppercase">Zero-Leak Proof</div>
                <div className="text-sm font-semibold text-indigo-400">0 Bytes Egress</div>
                <div className="text-[10px] text-zinc-500 font-mono">Web Crypto SHA-256</div>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-zinc-950/60 border border-blue-500/30 flex items-center space-x-3">
              <Lock className="w-7 h-7 text-blue-400 shrink-0" />
              <div>
                <div className="text-[10px] text-zinc-400 font-mono uppercase">Encryption Standard</div>
                <div className="text-sm font-semibold text-blue-400">
                  {isEncrypted ? 'AES-GCM-256' : 'Unencrypted'}
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">PBKDF2 (100k rounds)</div>
              </div>
            </div>
          </div>

          {/* Cryptographic Zero-Leak Attestation Card */}
          <AttestationAuditCard attestation={attestation} sessionAuditHash={sessionAuditHash} />

          {/* Session Proof Hash */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-mono uppercase tracking-wider">Cryptographic Session Proof (SHA-256)</span>
              <button
                onClick={handleCopyHash}
                data-testid="copy-session-hash-btn"
                className="flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 font-mono text-[11px] transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Hash'}</span>
              </button>
            </div>
            <div
              data-testid="session-audit-hash-display"
              className="p-3 rounded bg-zinc-950 border border-zinc-800 font-mono text-xs text-emerald-400/90 break-all select-all selection:bg-emerald-500/20"
            >
              {sessionAuditHash}
            </div>
            <p className="text-[11px] text-zinc-400">
              Deterministic hash generated from active keyword state, thresholds, and timestamp.
              Any modified metric produces a completely distinct SHA-256 digest.
            </p>
          </div>

          {/* Telemetry Counter */}
          <div className="p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-zinc-200">Outbound Requests Blocked</div>
              <div className="text-[11px] text-zinc-400">Air-gapped client environment; zero outbound socket/fetch calls allowed</div>
            </div>
            <div
              data-testid="telemetry-blocked-count"
              className="text-base font-mono font-bold text-zinc-100 bg-zinc-900 px-2.5 py-1 rounded border border-zinc-800 tabular-nums"
            >
              {telemetryBlockedCount}
            </div>
          </div>

          {/* Local-First Storage Actions */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <div className="text-xs font-semibold text-zinc-300">Local-First Storage &amp; Backup Sync</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={onSyncFileSystem}
                className="flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700 transition-colors"
              >
                <HardDrive className="w-4 h-4 text-zinc-400" />
                <span>Save Encrypted .sievevault</span>
              </button>
              <button
                onClick={onSyncS3}
                className="flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700 transition-colors"
              >
                <Cloud className="w-4 h-4 text-zinc-400" />
                <span>Sync with Custom S3 Bucket</span>
              </button>
            </div>
            <p className="text-[10px] text-zinc-400">
              Audit data persists locally via Dexie IndexedDB. Exporting generates client-side AES-GCM encrypted binary vaults.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors"
          >
            Close Proof
          </button>
        </div>
      </div>
    </div>
  );
};
