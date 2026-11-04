/**
 * Native Clipboard and Payload Formatters (Phase 5)
 *
 * Provides formatters strictly compliant with Google Ads Editor direct paste (TSV)
 * and Amazon Advertising Bulk Upload formats, plus resilient clipboard writing with
 * document.execCommand fallback.
 */

import type { PersistedNegativeKeyword } from '../workers/protocol.ts';
import { normalizeGoogleAdsKeyword, normalizeAmazonKeyword } from './syntax.ts';
import { logger } from '../utils/logger.ts';

export interface FormatterOptions {
  defaultCampaign?: string;
  defaultAdGroup?: string;
}

/**
 * Generates a tab-delimited string strictly matching Google Ads Editor paste schema:
 * Campaign \t Ad Group \t Keyword Text \t Criterion Type
 */
export function formatGoogleAdsEditorTSV(
  keywords: PersistedNegativeKeyword[],
  options: FormatterOptions = {}
): string {
  const header = 'Campaign\tAd Group\tKeyword Text\tCriterion Type';
  const rows: string[] = [header];

  for (const kw of keywords) {
    const campaign = sanitizeField(kw.scope?.campaign || options.defaultCampaign || '');
    const adGroup = sanitizeField(kw.scope?.adGroup || options.defaultAdGroup || '');
    const norm = normalizeGoogleAdsKeyword(kw.keyword, kw.matchType, kw.hasCollision);
    const keywordText = sanitizeField(norm.keywordText);

    rows.push(`${campaign}\t${adGroup}\t${keywordText}\t${norm.criterionType}`);
  }

  return rows.join('\n');
}

/**
 * Generates a CSV string formatted for Amazon Advertising negative keyword bulk operations.
 * Columns: Campaign Name, Ad Group Name, Keyword Text, Match Type, State
 */
export function formatAmazonBulkUploadCSV(
  keywords: PersistedNegativeKeyword[],
  options: FormatterOptions = {}
): string {
  const header = 'Campaign Name,Ad Group Name,Keyword Text,Match Type,State';
  const rows: string[] = [header];

  for (const kw of keywords) {
    const norm = normalizeAmazonKeyword(kw.keyword, kw.matchType);
    if (!norm.isValid) continue;

    const campaign = escapeCSV(kw.scope?.campaign || options.defaultCampaign || '');
    const adGroup = escapeCSV(kw.scope?.adGroup || options.defaultAdGroup || '');
    const text = escapeCSV(norm.normalizedText);
    const matchType = escapeCSV(norm.matchType);

    rows.push(`${campaign},${adGroup},${text},${matchType},Enabled`);
  }

  return rows.join('\n');
}

/**
 * Resilient clipboard writer.
 * Uses navigator.clipboard.writeText with fallback to document.execCommand('copy').
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern navigator.clipboard API first
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (clipboardErr) {
      logger.debug('navigator.clipboard fallback notice:', clipboardErr);
      // Fall through to legacy DOM copy fallback
    }
  }

  // Fallback for headless environments or unsupported browsers
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      return successful;
    } catch (execCommandErr) {
      logger.debug('document.execCommand fallback notice:', execCommandErr);
      return false;
    }
  }

  return false;
}

function sanitizeField(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').trim();
}

function escapeCSV(field: string): string {
  const sanitized = field.replace(/[\r\n]+/g, ' ').trim();
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

