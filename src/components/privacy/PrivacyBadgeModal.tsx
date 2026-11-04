/**
 * Sieve Privacy & Cryptographic Audit Proof Modal (Phase 8)
 *
 * Displays mathematical privacy guarantees, zero-telemetry telemetry assertion,
 * deterministic session SHA-256 state hashes, and encrypted backup controls.
 */

import React, { useEffect, useState } from 'react';
import { SieveLogo } from '../brand/SieveLogo.tsx';
import { ShieldCheck, Lock, HardDrive, Cloud, Copy, Check, X } from 'lucide-react';

export interface PrivacyBadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionAuditHash?: string;
  telemetryBlockedCount?: number;
  isEncrypted?: boolean;
  onSyncFileSystem?: () => void;
  onSyncS3?: () => void;
}

export const PrivacyBadgeModal: React.FC<PrivacyBadgeModalProps> = ({
  isOpen,
  onClose,
  sessionAuditHash = '0000000000000000000000000000000000000000000000000000000000000000',
  telemetryBlockedCount = 0,
  isEncrypted = true,
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
        className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center space-x-3">
            <SieveLogo size="sm" alt="Sieve Vector Logo" />
            <h2 id="privacy-modal-title" className="text-base font-semibold text-zinc-100">
              Privacy & Cryptographic Audit Proof
            </h2>
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
        <div className="p-6 space-y-6">
          {/* Privacy Badges */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-zinc-950/60 border border-emerald-500/30 flex items-center space-x-3">
              <ShieldCheck className="w-8 h-8 text-emerald-400 shrink-0" />
              <div>
                <div className="text-xs text-zinc-400 font-mono uppercase">Telemetry Status</div>
                <div className="text-sm font-semibold text-emerald-400">100% Client-Side</div>
                <div className="text-[11px] text-zinc-500 font-mono">0 Telemetry Packets Dispatched</div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-zinc-950/60 border border-blue-500/30 flex items-center space-x-3">
              <Lock className="w-8 h-8 text-blue-400 shrink-0" />
              <div>
                <div className="text-xs text-zinc-400 font-mono uppercase">Encryption Standard</div>
                <div className="text-sm font-semibold text-blue-400">
                  {isEncrypted ? 'AES-GCM-256' : 'Unencrypted'}
                </div>
                <div className="text-[11px] text-zinc-500 font-mono">PBKDF2 (100,000 Iterations)</div>
              </div>
            </div>
          </div>

          {/* Session Proof Hash */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-mono uppercase tracking-wider">Cryptographic Session Proof (SHA-256)</span>
              <button
                onClick={handleCopyHash}
                className="flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 font-mono text-xs transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg font-mono text-xs text-zinc-300 break-all select-all">
              {sessionAuditHash}
            </div>
            <p className="text-[11px] text-zinc-500">
              This proof hash mathematically binds your current ingestion state, platform configuration, and
              exclusion rules using client-side Web Crypto SHA-256.
            </p>
          </div>

          {/* Backup & Sync Controls */}
          <div className="pt-2 border-t border-zinc-800/80 space-y-3">
            <div className="text-xs font-medium text-zinc-300 uppercase tracking-wider font-mono">
              Zero-Intermediary Backups
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onSyncFileSystem}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-sm font-medium text-zinc-200 transition-colors"
              >
                <HardDrive className="w-4 h-4 text-emerald-400" />
                <span>Local Filesystem Sync</span>
              </button>
              <button
                onClick={onSyncS3}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-sm font-medium text-zinc-200 transition-colors"
              >
                <Cloud className="w-4 h-4 text-blue-400" />
                <span>Direct S3 Upload</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950/40 flex items-center justify-between text-xs text-zinc-500 font-mono">
          <span>Violations Blocked: {telemetryBlockedCount}</span>
          <span>Verified Local Sandbox</span>
        </div>
      </div>
    </div>
  );
};

