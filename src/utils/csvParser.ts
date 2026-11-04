/**
 * Sieve CSV Normalization & Parser Engine
 *
 * Normalizes multi-platform PPC search term reports (Google Ads, Amazon PPC, Microsoft Ads).
 * Handles localized currency symbols, comma separators, and case-insensitive column aliases.
 */

import type { PersistedNegativeKeyword, PlatformSchema } from '../workers/protocol.ts';
import type { SupportedCurrency } from './currency.ts';

/**
 * Strips symbols ($, ₹, €, ¥, £) and commas before converting cost/clicks/conversions to numbers.
 */
export function cleanNumeric(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (!val) return 0;
  const str = String(val).trim();
  // Strip currency symbols ($, ₹, €, ¥, £), commas, and spaces
  const cleaned = str.replace(/[$₹€¥£,\s]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export interface DetectedColumns {
  queryCol: number;
  clicksCol: number;
  costCol: number;
  conversionsCol: number;
  campaignCol: number;
  adgroupCol: number;
}

/**
 * Detects search term report columns recognizing case-insensitive aliases for:
 * - Google Ads, Amazon PPC, and Microsoft Ads
 *   - Query: search term, customer search term, query
 *   - Cost: cost, spend, amount spent
 *   - Clicks: clicks
 *   - Conversions: conversions, orders, 7 day total orders (#)
 */
export function detectColumnMapping(headers: string[]): DetectedColumns {
  let queryCol = -1;
  let queryPriority = 0;

  let clicksCol = -1;
  let clicksPriority = 0;

  let costCol = -1;
  let costPriority = 0;

  let conversionsCol = -1;
  let convPriority = 0;

  let campaignCol = -1;
  let adgroupCol = -1;

  for (let idx = 0; idx < headers.length; idx++) {
    const raw = headers[idx]
      .trim()
      .toLowerCase()
      .replace(/^["']|["']$/g, '');

    // 1. Query: search term, customer search term, query
    if (
      raw === 'customer search term' ||
      raw === 'search term' ||
      raw === 'query' ||
      raw === 'search query'
    ) {
      if (queryPriority < 3) {
        queryCol = idx;
        queryPriority = 3;
      }
    } else if (raw.includes('customer search term') || raw.includes('search term')) {
      if (queryPriority < 2) {
        queryCol = idx;
        queryPriority = 2;
      }
    } else if (
      queryPriority < 1 &&
      (raw.includes('keyword') || raw.includes('query')) &&
      !raw.includes('match') &&
      !raw.includes('type') &&
      !raw.includes('id')
    ) {
      queryCol = idx;
      queryPriority = 1;
    }

    // 2. Cost: cost, spend, amount spent
    const isCostCandidate =
      (raw === 'cost' ||
        raw === 'spend' ||
        raw === 'amount spent' ||
        raw.includes('amount spent') ||
        raw.includes('cost') ||
        raw.includes('spend')) &&
      !raw.includes('conv') &&
      !raw.includes('click') &&
      !raw.includes('cpc') &&
      !raw.includes('ctr') &&
      !raw.includes('rate') &&
      !raw.includes('avg') &&
      !raw.includes('margin') &&
      !raw.includes('per');

    if (isCostCandidate) {
      const priority =
        raw === 'cost' || raw === 'spend' || raw === 'amount spent'
          ? 3
          : raw.includes('total cost') || raw.includes('total spend') || raw.includes('amount spent')
          ? 2
          : 1;
      if (priority > costPriority) {
        costCol = idx;
        costPriority = priority;
      }
    }

    // 3. Clicks: clicks
    const isClickCandidate =
      raw.includes('click') &&
      !raw.includes('rate') &&
      !raw.includes('ctr') &&
      !raw.includes('cost') &&
      !raw.includes('cpc') &&
      !raw.includes('thru') &&
      !raw.includes('through');

    if (isClickCandidate) {
      const priority = raw === 'clicks' ? 3 : raw === 'total clicks' ? 2 : 1;
      if (priority > clicksPriority) {
        clicksCol = idx;
        clicksPriority = priority;
      }
    }

    // 4. Conversions: conversions, orders, 7 day total orders (#)
    const isConvCandidate =
      (raw.includes('conversion') ||
        raw.includes('order') ||
        raw.includes('7 day total orders') ||
        raw === 'all conv.' ||
        raw === 'conv.' ||
        raw === 'conv') &&
      !raw.includes('cost') &&
      !raw.includes('rate') &&
      !raw.includes('val') &&
      !raw.includes('cpa') &&
      !raw.includes('per');

    if (isConvCandidate) {
      const priority =
        raw === 'conversions' ||
        raw === 'orders' ||
        raw.includes('7 day total orders') ||
        raw === 'all conv.'
          ? 3
          : raw.includes('total conversions') || raw.includes('total orders')
          ? 2
          : 1;
      if (priority > convPriority) {
        conversionsCol = idx;
        convPriority = priority;
      }
    }

    // 5. Campaign
    if (raw.includes('campaign') && !raw.includes('id')) {
      campaignCol = idx;
    }

    // 6. Ad Group
    if ((raw.includes('ad group') || raw.includes('adgroup')) && !raw.includes('id')) {
      adgroupCol = idx;
    }
  }

  return {
    queryCol: queryCol !== -1 ? queryCol : 0,
    clicksCol: clicksCol !== -1 ? clicksCol : 1,
    costCol: costCol !== -1 ? costCol : 2,
    conversionsCol: conversionsCol !== -1 ? conversionsCol : 3,
    campaignCol,
    adgroupCol,
  };
}

/**
 * Splits a CSV line into cells respecting double quotes.
 */
export function splitCsvLine(line: string, delimiter: string = ','): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Detects currency symbol from CSV data.
 */
export function detectCurrencySymbol(text: string): SupportedCurrency {
  const sample = text.slice(0, 32768);
  if (sample.includes('₹') || /\b(INR|Rs\.)\b/i.test(sample)) return '₹';
  if (sample.includes('€') || /\bEUR\b/i.test(sample)) return '€';
  if (sample.includes('£') || /\bGBP\b/i.test(sample)) return '£';
  if (sample.includes('¥') || /\b(JPY|Yen)\b/i.test(sample)) return '¥';
  if (sample.includes('$') || /\bUSD\b/i.test(sample)) return '$';
  return '$';
}

/**
 * Parses raw CSV text or buffer into PersistedNegativeKeyword records.
 */
export function parseCsvTextToRecords(
  csvText: string,
  targetCPA: number = 50
): { records: PersistedNegativeKeyword[]; currency: SupportedCurrency } {
  // Strip BOM if present
  let cleanText = csvText;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }

  const currency = detectCurrencySymbol(cleanText);

  // Auto-detect delimiter (comma or tab)
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

  // Find header row (skip preamble metadata rows like "Search terms report", date ranges)
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

    // Skip empty or summary rows
    if (!query || query.toLowerCase() === 'total' || query.toLowerCase().startsWith('total:')) {
      continue;
    }

    const clicks = cleanNumeric(cells[mapping.clicksCol]);
    const cost = cleanNumeric(cells[mapping.costCol]);
    const conversions = cleanNumeric(cells[mapping.conversionsCol]);
    const campaign = mapping.campaignCol !== -1 ? cells[mapping.campaignCol]?.trim() : undefined;
    const adgroup = mapping.adgroupCol !== -1 ? cells[mapping.adgroupCol]?.trim() : undefined;

    // Waste calculation
    let waste = 0;
    if (conversions <= 0) {
      waste = cost;
    } else {
      waste = Math.max(0, cost - conversions * targetCPA);
    }
    waste = currency === '¥' ? Math.round(waste) : Math.round(waste * 100) / 100;

    // Confidence calculation
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
