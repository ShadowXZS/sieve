/**
 * Multi-Platform PPC Search Term Report Platform Detector
 *
 * Inspects column headers and content structure to identify Google Ads,
 * Amazon PPC / Bulk, and Microsoft Advertising exports.
 * Zero UI/DOM dependencies. File line ceiling: <= 200 lines.
 */

export type PlatformType = 'GOOGLE_ADS' | 'AMAZON_PPC' | 'MICROSOFT_ADS' | 'UNKNOWN';

/**
 * Splits a delimited line into cells, respecting quoted tokens containing delimiters.
 */
export function splitDelimitedLine(line: string, delimiter: string = ','): string[] {
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
 * Auto-detects whether comma or tab is the dominant delimiter.
 */
export function detectDelimiter(text: string): ',' | '\t' {
  const sample = text.slice(0, 8192);
  const lines = sample.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let tabCount = 0;
  let commaCount = 0;
  for (const line of lines.slice(0, 5)) {
    tabCount += (line.match(/\t/g) ?? []).length;
    commaCount += (line.match(/,/g) ?? []).length;
  }
  return tabCount > commaCount ? '\t' : ',';
}

/**
 * Determines whether an array of cell values represents a valid table header row.
 */
export function isHeaderRowCandidate(cells: readonly string[]): boolean {
  const normalized = cells.map((c) => c.trim().toLowerCase().replace(/^["']|["']$/g, ''));
  const hasQuery = normalized.some(
    (h) => h === 'search term' || h === 'customer search term' || h === 'query' || h === 'search query'
  );
  const hasMetricOrMeta = normalized.some(
    (h) =>
      h.includes('click') ||
      h.includes('cost') ||
      h.includes('spend') ||
      h.includes('impression') ||
      h.includes('match') ||
      h.includes('campaign')
  );
  return hasQuery && hasMetricOrMeta;
}

/**
 * Detects the advertising platform origin from an array of column headers.
 */
export function detectPlatformFromHeaders(headers: readonly string[]): PlatformType {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));

  // 1. Amazon PPC / Amazon Bulk identifiers
  const hasAmazonQuery = normalized.some((h) => h === 'customer search term' || h.includes('customer search term'));
  const hasAmazonMetrics = normalized.some(
    (h) =>
      h.includes('7 day total orders') ||
      h.includes('7 day total sales') ||
      h.includes('total advertising cost of sales') ||
      h.includes('total return on advertising spend')
  );
  if (hasAmazonQuery || hasAmazonMetrics) {
    return 'AMAZON_PPC';
  }

  // 2. Microsoft Advertising identifiers
  const hasMsAmountSpent = normalized.some((h) => h === 'amount spent' || h.includes('amount spent'));
  const hasMsMatchType = normalized.some((h) => h.includes('delivered match type') || h.includes('bid match type'));
  if (hasMsAmountSpent || hasMsMatchType) {
    return 'MICROSOFT_ADS';
  }

  // 3. Google Ads identifiers
  const hasGoogleQuery = normalized.some((h) => h === 'search term' || h === 'search query');
  const hasGoogleMetrics = normalized.some(
    (h) =>
      h.includes('conv. value') ||
      h.includes('all conv. value') ||
      h.includes('cost / conv.') ||
      h === 'conv.' ||
      h === 'all conv.'
  );
  if (hasGoogleQuery && (hasGoogleMetrics || normalized.some((h) => h === 'match type'))) {
    return 'GOOGLE_ADS';
  }

  if (hasGoogleQuery) {
    return 'GOOGLE_ADS';
  }

  const hasGenericQuery = normalized.some((h) => h === 'query');
  if (hasGenericQuery) {
    return 'MICROSOFT_ADS';
  }

  return 'UNKNOWN';
}

/**
 * Scans up to 25 lines to locate the actual column header row index and header names.
 */
export function findHeaderRow(
  lines: readonly string[],
  delimiter: string
): { index: number; headers: string[] } | null {
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = splitDelimitedLine(line, delimiter);
    if (isHeaderRowCandidate(cells)) {
      return { index: i, headers: cells };
    }
  }
  return null;
}
