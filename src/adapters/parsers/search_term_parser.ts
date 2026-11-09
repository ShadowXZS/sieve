/**
 * Multi-Platform Search Term Report Parser
 *
 * Ingestion and normalization engine for Google Ads, Amazon PPC, and Microsoft Ads exports.
 * Precision Invariant: Converts monetary amounts directly into 64-bit integer CurrencyMicros.
 * Zero UI/DOM dependencies. File line ceiling: <= 200 lines.
 */

import {
  type SearchTermRecord,
  type PlatformMatchType,
  type CurrencyMicros,
  type ClickCount,
  type ImpressionCount,
  type QueryString,
  toCurrencyMicros,
} from '../../domain/types/index.ts';
import { detectDelimiter, findHeaderRow, splitDelimitedLine } from './platform_detector.ts';

export function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/[\[\]"']/g, '').replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
}

export function parseCurrencyToMicros(value: string | number | bigint | null | undefined): CurrencyMicros {
  return toCurrencyMicros(value);
}

export function normalizeMatchType(rawMatchType: string | undefined): PlatformMatchType {
  if (!rawMatchType) return 'BROAD';
  const lower = rawMatchType.trim().toLowerCase();
  if (lower.includes('exact')) return 'EXACT';
  if (lower.includes('phrase')) return 'PHRASE';
  return 'BROAD';
}

interface ColumnMap {
  query: number; matchType: number; campaign: number; adGroup: number;
  impressions: number; clicks: number; cost: number; conversions: number; revenue: number;
}

function resolveColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {
    query: -1, matchType: -1, campaign: -1, adGroup: -1,
    impressions: -1, clicks: -1, cost: -1, conversions: -1, revenue: -1,
  };

  headers.forEach((h, idx) => {
    const raw = h.trim().toLowerCase().replace(/^["']|["']$/g, '');
    if (raw === 'customer search term') map.query = idx;
    else if (map.query === -1 && (raw === 'search term' || raw === 'query' || raw === 'search query')) map.query = idx;
    else if (map.query === -1 && raw.includes('search term')) map.query = idx;

    if (raw.includes('match') && (raw.includes('type') || raw === 'match')) map.matchType = idx;
    if (raw.includes('campaign') && !raw.includes('id')) map.campaign = idx;
    if ((raw.includes('ad group') || raw.includes('adgroup')) && !raw.includes('id')) map.adGroup = idx;
    if (raw.includes('impression') || raw === 'impr.' || raw === 'impr') map.impressions = idx;
    if (raw.includes('click') && !raw.includes('rate') && !raw.includes('ctr') && !raw.includes('cost') && !raw.includes('cpc')) {
      map.clicks = idx;
    }
    if (raw.includes('7 day total sales') || raw.includes('conv. value') || raw.includes('conversion value') || raw === 'revenue' || raw === 'total sales') {
      map.revenue = idx;
    }
    const isCost = (raw === 'cost' || raw === 'spend' || raw === 'amount spent' || raw.includes('cost') || raw.includes('spend')) &&
      !raw.includes('conv') && !raw.includes('click') && !raw.includes('cpc') && !raw.includes('rate') && !raw.includes('per');
    if (isCost && map.cost === -1) map.cost = idx;

    const isConv = (raw.includes('conversion') || raw.includes('order') || raw.includes('7 day total orders') || raw === 'all conv.' || raw === 'conv.' || raw === 'conv') &&
      !raw.includes('cost') && !raw.includes('rate') && !raw.includes('val') && !raw.includes('cpa') && !raw.includes('per');
    if (isConv && map.conversions === -1) map.conversions = idx;
  });

  if (map.query === -1) map.query = 0;
  return map;
}

function parseCell(cells: string[], idx: number): string {
  if (idx < 0 || idx >= cells.length) return '';
  return cells[idx].replace(/^["']|["']$/g, '').trim();
}

function parseNum(raw: string): number {
  const num = parseFloat(raw.replace(/[,\s]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

export class SearchTermParser {
  parse(rawContent: string): SearchTermRecord[] {
    let text = rawContent;
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const delimiter = detectDelimiter(text);
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];

    const headerMatch = findHeaderRow(lines, delimiter);
    const headerIdx = headerMatch ? headerMatch.index : 0;
    const headerCells = headerMatch ? headerMatch.headers : splitDelimitedLine(lines[0], delimiter);
    const cols = resolveColumns(headerCells);

    const records: SearchTermRecord[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cells = splitDelimitedLine(line, delimiter);
      const rawQuery = parseCell(cells, cols.query);
      if (!rawQuery || rawQuery === '--' || rawQuery.toLowerCase() === 'total' || rawQuery.toLowerCase().startsWith('total:') || rawQuery.toLowerCase().startsWith('total -')) {
        continue;
      }

      const clicks = Math.max(0, Math.round(parseNum(parseCell(cells, cols.clicks)))) as ClickCount;
      const impressions = Math.max(0, Math.round(parseNum(parseCell(cells, cols.impressions)))) as ImpressionCount;
      const spendMicros = parseCurrencyToMicros(parseCell(cells, cols.cost));
      const conversions = Math.max(0, parseNum(parseCell(cells, cols.conversions)));
      const revenueMicros = parseCurrencyToMicros(parseCell(cells, cols.revenue));
      const matchType = normalizeMatchType(parseCell(cells, cols.matchType));
      const avgCpc = clicks > 0 ? ((spendMicros / BigInt(Math.round(clicks))) as CurrencyMicros) : (0n as CurrencyMicros);

      records.push({
        rawQuery: rawQuery as QueryString,
        normalizedQuery: normalizeQuery(rawQuery) as QueryString,
        campaignName: parseCell(cells, cols.campaign),
        adGroupName: parseCell(cells, cols.adGroup),
        matchType,
        impressions,
        clicks,
        spendMicros,
        conversions,
        revenueMicros,
        averageCpcMicros: avgCpc,
      });
    }

    return records;
  }
}

export function parseSearchTermReport(rawContent: string): SearchTermRecord[] {
  return new SearchTermParser().parse(rawContent);
}
