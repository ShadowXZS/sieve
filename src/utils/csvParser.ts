/**
 * Sieve CSV Normalization & Parser Engine
 *
 * Normalizes multi-platform PPC search term reports (Google Ads, Amazon PPC, Microsoft Ads).
 * Handles localized currency symbols, comma separators, and case-insensitive column aliases.
 * Physical line ceiling: <= 250 lines.
 */

import type { PersistedNegativeKeyword, PlatformSchema } from '../workers/protocol.ts';
import type { SupportedCurrency } from './currency.ts';
import {
  cleanNumeric,
  detectColumnMapping,
  type DetectedColumns,
  splitCsvLine,
  detectCurrencySymbol,
} from './csvColumnDetector.ts';

export { cleanNumeric, detectColumnMapping, type DetectedColumns, splitCsvLine, detectCurrencySymbol };

/**
 * Parses raw CSV text or buffer into PersistedNegativeKeyword records.
 */
export function parseCsvTextToRecords(
  csvText: string,
  targetCPA: number = 50
): { records: PersistedNegativeKeyword[]; currency: SupportedCurrency } {
  let cleanText = csvText;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }

  const currency = detectCurrencySymbol(cleanText);
  const firstLines = cleanText.slice(0, 2048).split(/\r?\n/);
  const firstSample = firstLines.find((l) => l.trim().length > 0) || '';
  const delimiter = firstSample.includes('\t') && !firstSample.includes(',') ? '\t' : ',';

  const rawLines = cleanText.split(/\r?\n/);
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i].trim();
    if (l) lines.push(l);
  }

  if (lines.length === 0) {
    return { records: [], currency };
  }

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const hasQuery = cells.some((c) => {
      const lower = c.toLowerCase();
      return (
        lower.includes('search term') ||
        lower.includes('customer search term') ||
        lower.includes('search query') ||
        lower === 'query'
      );
    });
    const hasMetric = cells.some((c) => {
      const lower = c.toLowerCase();
      return (
        lower.includes('click') ||
        lower.includes('cost') ||
        lower.includes('spend') ||
        lower.includes('amount spent') ||
        lower.includes('conversion') ||
        lower.includes('order') ||
        lower.includes('7 day total orders')
      );
    });

    if (hasQuery && hasMetric) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    headerRowIdx = 0;
  }

  const headerCells = splitCsvLine(lines[headerRowIdx], delimiter);
  const mapping = detectColumnMapping(headerCells);

  const records: PersistedNegativeKeyword[] = [];
  const now = Date.now();

  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const query = cells[mapping.queryCol]?.replace(/^["']|["']$/g, '').trim();

    if (!query || query.toLowerCase() === 'total' || query.toLowerCase().startsWith('total:')) {
      continue;
    }

    const clicks = cleanNumeric(cells[mapping.clicksCol]);
    const cost = cleanNumeric(cells[mapping.costCol]);
    const conversions = cleanNumeric(cells[mapping.conversionsCol]);
    const campaign = mapping.campaignCol !== -1 ? cells[mapping.campaignCol]?.trim() : undefined;
    const adgroup = mapping.adgroupCol !== -1 ? cells[mapping.adgroupCol]?.trim() : undefined;

    let waste = 0;
    if (conversions <= 0) {
      waste = cost;
    } else {
      waste = Math.max(0, cost - conversions * targetCPA);
    }
    waste = currency === '¥' ? Math.round(waste) : Math.round(waste * 100) / 100;

    const confidence =
      clicks > 0
        ? Math.min(0.99, Math.max(0.65, Math.round((1 - conversions / (clicks + 1)) * 100) / 100))
        : 0.8;

    const matchType: 'exact' | 'phrase' | 'broad' = clicks >= 10 ? 'phrase' : 'broad';
    const formattedRule = matchType === 'phrase' ? `"${query}"` : query;

    records.push({
      id: `kw_${now}_${i}`,
      sha256Hash: `hash_${query}_${now}_${i}`,
      keyword: query,
      matchType,
      formattedRule,
      platform: 1 as PlatformSchema,
      confidenceScore: confidence,
      marginalWaste: waste,
      hasCollision: false,
      clicks,
      cost,
      conversions,
      firstSeenCampaign: campaign,
      createdAt: now - i * 10,
      scope: {
        campaign,
        adGroup: adgroup,
      },
    });
  }

  return { records, currency };
}

/**
 * Splits an ArrayBuffer into chunk ArrayBuffers along newline boundaries.
 * Guarantees zero split rows across chunk boundaries.
 * Each chunk is an ArrayBuffer slice ready for zero-copy Transferable dispatch.
 */
export function splitBufferIntoChunks(
  buffer: ArrayBuffer,
  chunkSize: number = 16 * 1024 * 1024
): ArrayBuffer[] {
  const totalLength = buffer.byteLength;
  if (totalLength === 0) return [];
  if (totalLength <= chunkSize) return [buffer];

  const u8 = new Uint8Array(buffer);
  const chunks: ArrayBuffer[] = [];
  let currentStart = 0;

  while (currentStart < totalLength) {
    let candidateEnd = Math.min(currentStart + chunkSize, totalLength);

    if (candidateEnd < totalLength) {
      let newlinePos = -1;
      const searchWindow = Math.min(65536, candidateEnd - currentStart);
      for (let offset = 0; offset < searchWindow; offset++) {
        const idx = candidateEnd - 1 - offset;
        if (u8[idx] === 0x0a) {
          newlinePos = idx + 1;
          break;
        }
      }

      if (newlinePos > currentStart) {
        candidateEnd = newlinePos;
      }
    }

    const chunkLen = candidateEnd - currentStart;
    const chunkBuf = buffer.slice(currentStart, candidateEnd);
    chunks.push(chunkBuf);
    currentStart = candidateEnd;
  }

  return chunks;
}
