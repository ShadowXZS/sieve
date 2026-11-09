/**
 * Sieve CSV Column & Delimiter Detector
 * Handles multi-platform column alias mapping, delimiter splitting, and currency detection.
 * Physical line ceiling: <= 250 lines.
 */

import type { SupportedCurrency } from './currency.ts';

export function cleanNumeric(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (!val) return 0;
  const str = String(val).trim();
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
      !raw.includes('rate') &&
      !raw.includes('per');

    if (isCostCandidate) {
      const priority =
        raw === 'cost' || raw === 'spend' || raw === 'amount spent'
          ? 3
          : raw.includes('amount spent') || raw.includes('total spend') || raw.includes('total cost')
          ? 2
          : 1;
      if (priority > costPriority) {
        costCol = idx;
        costPriority = priority;
      }
    }

    const isClicksCandidate =
      (raw === 'clicks' || raw.includes('click')) &&
      !raw.includes('rate') &&
      !raw.includes('ctr') &&
      !raw.includes('cost') &&
      !raw.includes('cpc') &&
      !raw.includes('per');

    if (isClicksCandidate) {
      const priority = raw === 'clicks' ? 2 : 1;
      if (priority > clicksPriority) {
        clicksCol = idx;
        clicksPriority = priority;
      }
    }

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

    if (raw.includes('campaign') && !raw.includes('id')) {
      campaignCol = idx;
    }

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

export function detectCurrencySymbol(text: string): SupportedCurrency {
  const sample = text.slice(0, 32768);
  if (sample.includes('₹') || /\b(INR|Rs\.)\b/i.test(sample)) return '₹';
  if (sample.includes('€') || /\bEUR\b/i.test(sample)) return '€';
  if (sample.includes('£') || /\bGBP\b/i.test(sample)) return '£';
  if (sample.includes('¥') || /\b(JPY|Yen)\b/i.test(sample)) return '¥';
  if (sample.includes('$') || /\bUSD\b/i.test(sample)) return '$';
  return '$';
}
