/**
 * In-Memory Vector PDF Rendering Engine (Phase 12 Hardening)
 *
 * Compiles @react-pdf/renderer document element trees directly into memory blobs
 * without requiring any backend server infrastructure, maintaining 100% data privacy.
 *
 * Hardening Invariants:
 * - Air-Gap Compliance: Zero external network requests during synthesis.
 * - Exact Page Margins: Enforces 14mm (39.69pt) all around.
 * - Binary Signature Verification: Validates '%PDF-' header bytes.
 * - Immediate Object URL memory reclamation.
 */

import React from 'react';
import { pdf, type DocumentProps } from '@react-pdf/renderer';
import { registerPdfFonts } from './fonts/index.ts';
import { PDF_PAGE_MARGIN } from './tokens.ts';
import { logger } from '../../utils/logger.ts';

/** Standardized page margins in millimeters and PostScript points */
export const PDF_PAGE_MARGIN_MM = 14;
export const PDF_PAGE_MARGIN_PT = PDF_PAGE_MARGIN;

/**
 * Compiles a React PDF document element tree into an in-memory PDF Blob.
 * Enforces offline font embedding and zero network transmission.
 */
export async function generatePdfBlob(
  document: React.ReactElement<DocumentProps> | React.ReactElement<unknown>
): Promise<Blob> {
  if (!document || !React.isValidElement(document)) {
    throw new Error('generatePdfBlob: A valid React element must be provided');
  }

  // Ensure offline TrueType fonts are registered
  registerPdfFonts();

  try {
    const instance = pdf(document as React.ReactElement<DocumentProps>);
    const blob = await instance.toBlob();
    return blob;
  } catch (err) {
    logger.error('Failed to compile in-memory vector PDF:', err);
    throw err;
  }
}

/**
 * Verifies that a generated Blob matches the binary signature of a valid PDF (%PDF-).
 */
export async function verifyPdfSignature(blob: Blob): Promise<boolean> {
  if (!blob || blob.size < 5) return false;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer.slice(0, 5));
    const signature = String.fromCharCode(...bytes);
    return signature === '%PDF-';
  } catch (err) {
    logger.debug('verifyPdfSignature check notice:', err);
    return false;
  }
}

/**
 * Initiates an immediate browser download for the generated PDF Blob,
 * immediately reclaiming memory by revoking the Object URL.
 */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Memory reclamation: Revoke URL immediately after DOM trigger cycle
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
}
