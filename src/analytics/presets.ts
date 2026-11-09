/**
 * SIEVE Analytical SQL Presets & Parameterized Diagnostic Templates
 *
 * Enforces integer micro-arithmetic across all financial calculations.
 * Strict Dependency Rule: Free of UI dependencies. Pure SQL generators.
 */

import type { DiagnosticPresetQuery } from '../domain/ports/database_port.ts';

function sanitizeInteger(val: number, fallback: number = 0): number {
  if (!Number.isFinite(val) || Number.isNaN(val)) return fallback;
  return Math.max(0, Math.floor(val));
}

function sanitizeBigInt(val: bigint | number, fallback: bigint = 0n): bigint {
  try {
    const b = BigInt(val);
    return b < 0n ? 0n : b;
  } catch {
    return fallback;
  }
}

/**
 * Top spenders preset query ranked by total spend_micros.
 */
export function topSpendersPreset(limit: number = 50): string {
  const safeLimit = Math.max(1, sanitizeInteger(limit, 50));
  return `SELECT
  query,
  campaign,
  adgroup,
  match_type,
  impressions,
  clicks,
  spend_micros,
  conversions,
  revenue_micros,
  CAST(round(spend_micros / nullif(clicks, 0)) AS UBIGINT) AS cpc_micros
FROM search_terms
ORDER BY spend_micros DESC
LIMIT ${safeLimit};`;
}

/**
 * Zero conversion waste preset querying high-click terms with 0 conversions.
 */
export function zeroConvWastePreset(minClicks: number = 5, minSpendMicros: bigint = 0n): string {
  const safeClicks = sanitizeInteger(minClicks, 5);
  const safeSpend = sanitizeBigInt(minSpendMicros, 0n);
  return `SELECT
  query,
  campaign,
  adgroup,
  match_type,
  impressions,
  clicks,
  spend_micros,
  conversions,
  revenue_micros,
  CAST(round(spend_micros / nullif(clicks, 0)) AS UBIGINT) AS cpc_micros
FROM search_terms
WHERE conversions = 0
  AND clicks >= ${safeClicks}
  AND spend_micros >= ${safeSpend}
ORDER BY spend_micros DESC;`;
}

/**
 * Campaign rollup preset grouping metrics by campaign.
 */
export function campaignRollupPreset(): string {
  return `SELECT
  campaign,
  count(distinct query) AS query_count,
  sum(impressions) AS total_impressions,
  sum(clicks) AS total_clicks,
  sum(spend_micros) AS total_spend_micros,
  sum(conversions) AS total_conversions,
  sum(revenue_micros) AS total_revenue_micros,
  CAST(round(sum(spend_micros) / nullif(sum(clicks), 0)) AS UBIGINT) AS cpc_micros,
  CAST(round(sum(spend_micros) / nullif(sum(conversions), 0)) AS UBIGINT) AS cpa_micros
FROM search_terms
GROUP BY campaign
ORDER BY total_spend_micros DESC;`;
}

/**
 * Auction collisions preset highlighting cross-adgroup/campaign query cannibalization.
 */
export function auctionCollisionsPreset(): string {
  return `SELECT
  query,
  campaign,
  adgroup,
  clicks,
  spend_micros,
  conversions,
  CAST(round(spend_micros / nullif(clicks, 0)) AS UBIGINT) AS cpc_micros
FROM search_terms
WHERE is_safe = false
ORDER BY spend_micros DESC;`;
}

/**
 * High CPC / CPA outliers preset parameterized by threshold.
 */
export function highCpcOutliersPreset(targetCpaMicros: bigint): string {
  const safeThreshold = sanitizeBigInt(targetCpaMicros, 0n);
  return `SELECT
  query,
  campaign,
  adgroup,
  clicks,
  spend_micros,
  conversions,
  CAST(round(spend_micros / nullif(clicks, 0)) AS UBIGINT) AS cpc_micros,
  CAST(round(spend_micros / nullif(conversions, 0)) AS UBIGINT) AS cpa_micros
FROM search_terms
WHERE clicks >= 1
  AND CAST(round(spend_micros / nullif(clicks, 0)) AS UBIGINT) >= ${safeThreshold}
ORDER BY cpc_micros DESC;`;
}

/**
 * Resolves a diagnostic preset request into its parameterized SQL statement.
 */
export function resolveDiagnosticPreset(preset: DiagnosticPresetQuery): string {
  const params = preset.parameters ?? {};
  switch (preset.presetId) {
    case 'TOP_SPENDERS':
      return topSpendersPreset(Number(params.limit ?? 50));
    case 'ZERO_CONVERSION_WASTE':
      return zeroConvWastePreset(
        Number(params.minClicks ?? 5),
        BigInt(params.minSpendMicros ?? 0n)
      );
    case 'CAMPAIGN_ROLLUP':
      return campaignRollupPreset();
    case 'AUCTION_COLLISIONS':
      return auctionCollisionsPreset();
    case 'MATCH_TYPE_DILUTION':
    case 'LONG_TAIL_BLEED':
    default:
      if (params.targetCpaMicros !== undefined && params.targetCpaMicros !== null) {
        return highCpcOutliersPreset(BigInt(params.targetCpaMicros));
      }
      return topSpendersPreset(50);
  }
}
