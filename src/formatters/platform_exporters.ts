/**
 * Platform Directive Export Engines: Google Ads Editor (TSV) & Amazon PPC (CSV)
 * File line ceiling: <= 250 lines.
 */
import type { NegativeExclusionRule, ExclusionTargetLevel } from '../domain/types/shield.ts';

export type AmazonFallbackMatch = 'Negative Phrase' | 'Negative Exact';

export interface CandidateKeywordLike {
  readonly keyword?: string;
  readonly query?: string;
  readonly searchTerm?: string;
  readonly term?: string;
  readonly text?: string;
  readonly candidateTerm?: string;
  readonly matchType?: string;
  readonly recommendedMatchType?: string;
  readonly verdict?: string;
  readonly hasCollision?: boolean;
  readonly targetLevel?: ExclusionTargetLevel;
  readonly campaignId?: string;
  readonly adGroupId?: string;
  readonly firstSeenCampaign?: string;
  readonly scope?: { readonly campaign?: string; readonly adGroup?: string };
}

export type CandidateRuleInput = NegativeExclusionRule | CandidateKeywordLike;

export interface GoogleAdsExportOptions { defaultCampaign?: string; defaultAdGroup?: string; }
export interface AmazonBulkExportOptions {
  fallbackBroadMatchType?: AmazonFallbackMatch;
  defaultCampaignId?: string;
  defaultAdGroupId?: string;
}
export interface PlatformConstraintOptions {
  targetLevel?: ExclusionTargetLevel;
  maxTermLength?: number;
  accountCapacityLimit?: number;
  campaignCapacityLimit?: number;
}
export interface PlatformValidationIssue {
  code: 'LENGTH_EXCEEDED' | 'CAPACITY_EXCEEDED_ACCOUNT' | 'CAPACITY_EXCEEDED_CAMPAIGN' | 'CAPACITY_EXCEEDED';
  message: string;
  severity: 'error' | 'warning';
  term?: string;
  ruleIndex?: number;
}
export interface PlatformValidationResult {
  isValid: boolean;
  issues: PlatformValidationIssue[];
  warnings: string[];
  hasLengthExceeded: boolean;
  hasCapacityExceeded: boolean;
}

const stripTerm = (t: string): string =>
  t.replace(/^\[(.*)\]$/, '$1').replace(/^"(.*)"$/, '$1').replace(/[\r\n\t]+/g, ' ').trim();
const sanitizeTsv = (v: string): string => v.replace(/[\r\n\t]+/g, ' ').trim();
const escapeCsv = (v: string): string => {
  const s = v.replace(/[\r\n]+/g, ' ').trim();
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
};

function extractRuleDetails(rule: CandidateRuleInput) {
  const r = rule as Record<string, unknown>;
  const rawTerm = String(
    r.query ?? r.keyword ?? r.searchTerm ?? r.term ?? r.text ?? r.candidateTerm ?? ''
  );
  const cleanTerm = stripTerm(rawTerm);
  const isExactLocked =
    ('verdict' in rule && rule.verdict === 'EXACT_BRACKET_LOCK') ||
    ('hasCollision' in rule && Boolean(rule.hasCollision));
  const rawMatch = 'recommendedMatchType' in rule ? rule.recommendedMatchType : (rule as CandidateKeywordLike).matchType;
  const matchUpper = String(rawMatch || 'BROAD').toUpperCase();
  const isExact = isExactLocked || matchUpper === 'EXACT';
  const isPhrase = !isExact && matchUpper === 'PHRASE';
  const campaignId =
    ('campaignId' in rule && rule.campaignId) ||
    ('scope' in rule && rule.scope?.campaign) ||
    ('firstSeenCampaign' in rule && rule.firstSeenCampaign) ||
    '';
  const adGroupId =
    ('adGroupId' in rule && rule.adGroupId) ||
    ('scope' in rule && rule.scope?.adGroup) ||
    '';
  const targetLevel: ExclusionTargetLevel =
    ('targetLevel' in rule && rule.targetLevel) ||
    ('scope' in rule && (rule.scope?.adGroup ? 'AD_GROUP' : rule.scope?.campaign ? 'CAMPAIGN' : 'ACCOUNT')) ||
    (adGroupId ? 'AD_GROUP' : campaignId ? 'CAMPAIGN' : 'ACCOUNT');

  return { cleanTerm, isExact, isPhrase, campaignId, adGroupId, targetLevel };
}

/** Generates Plain Text negative rules with match type syntax ([exact], "phrase", broad) */
export function generatePlainTextRules(
  rules: readonly (CandidateRuleInput | Record<string, unknown>)[]
): string {
  const lines: string[] = [];
  for (const rule of rules) {
    const r = rule as Record<string, unknown>;
    const rawVal = r.query ?? r.keyword ?? r.searchTerm ?? r.text ?? r.candidateTerm ?? r.term ?? '';
    const rawStr = String(rawVal).trim();
    const rawTerm = stripTerm(rawStr);
    if (rawTerm.length === 0) continue;

    const rawMatch = String(r.matchType ?? r.recommendedMatchType ?? '').toUpperCase();
    const isExactLocked = r.verdict === 'EXACT_BRACKET_LOCK' || Boolean(r.hasCollision);
    let matchType = rawMatch;
    if (!matchType) {
      if (rawStr.startsWith('[') && rawStr.endsWith(']')) matchType = 'EXACT';
      else if (rawStr.startsWith('"') && rawStr.endsWith('"')) matchType = 'PHRASE';
      else matchType = isExactLocked ? 'EXACT' : 'BROAD';
    } else if (isExactLocked) {
      matchType = 'EXACT';
    }

    const formatted =
      matchType === 'EXACT' ? `[${rawTerm}]` :
      matchType === 'PHRASE' ? `"${rawTerm}"` :
      rawTerm;

    lines.push(formatted);
  }
  return lines.filter((line) => line.trim().length > 0).join('\n');
}

/** Generates Google Ads Editor TSV: Campaign \t Ad Group \t Keyword \t Criterion Type */
export function generateGoogleAdsEditorTsv(
  rules: readonly CandidateRuleInput[],
  options: GoogleAdsExportOptions = {}
): string {
  const rows = ['Campaign\tAd Group\tKeyword\tCriterion Type'];
  for (const rule of rules) {
    const { cleanTerm, isExact, isPhrase, campaignId, adGroupId } = extractRuleDetails(rule);
    const campaign = sanitizeTsv(campaignId || options.defaultCampaign || '');
    const adGroup = sanitizeTsv(adGroupId || options.defaultAdGroup || '');
    let keywordCol = cleanTerm;
    let criterionTypeCol: 'Exact' | 'Phrase' | 'Broad' = 'Broad';
    if (isExact) {
      keywordCol = `[${cleanTerm}]`;
      criterionTypeCol = 'Exact';
    } else if (isPhrase) {
      keywordCol = `"${cleanTerm}"`;
      criterionTypeCol = 'Phrase';
    }
    rows.push(`${campaign}\t${adGroup}\t${keywordCol}\t${criterionTypeCol}`);
  }
  return rows.join('\n');
}

/** Generates Amazon Bulk CSV: Record Type,Campaign ID,Ad Group ID,Keyword or Product Targeting,Match Type */
export function generateAmazonBulkCsv(
  rules: readonly CandidateRuleInput[],
  options: AmazonBulkExportOptions = {}
): string {
  const rows = ['Record Type,Campaign ID,Ad Group ID,Keyword or Product Targeting,Match Type'];
  const broadFallback = options.fallbackBroadMatchType || 'Negative Phrase';
  for (const rule of rules) {
    const { cleanTerm, isExact, isPhrase, campaignId, adGroupId, targetLevel } = extractRuleDetails(rule);
    const camp = escapeCsv(campaignId || options.defaultCampaignId || '');
    const adg = escapeCsv(adGroupId || options.defaultAdGroupId || '');
    const term = escapeCsv(cleanTerm);
    const isAdGroupLevel = Boolean(adGroupId || options.defaultAdGroupId || targetLevel === 'AD_GROUP');
    const recordType = isAdGroupLevel ? 'Negative Keyword' : 'Campaign Negative Keyword';
    const matchType = isExact ? 'Negative Exact' : isPhrase ? 'Negative Phrase' : broadFallback;
    rows.push(`${recordType},${camp},${adg},${term},${matchType}`);
  }
  return rows.join('\n');
}

/** Validates rules against character limits (80 chars) and list capacity thresholds */
export function validatePlatformConstraints(
  rules: readonly CandidateRuleInput[],
  options: PlatformConstraintOptions = {}
): PlatformValidationResult {
  const issues: PlatformValidationIssue[] = [];
  const warnings: string[] = [];
  const maxLen = options.maxTermLength ?? 80;
  const accountLimit = options.accountCapacityLimit ?? 5000;
  const campaignLimit = options.campaignCapacityLimit ?? 10000;
  let hasLengthExceeded = false;
  let hasCapacityExceeded = false;

  for (let idx = 0; idx < rules.length; idx++) {
    const { cleanTerm } = extractRuleDetails(rules[idx]);
    if (cleanTerm.length > maxLen) {
      hasLengthExceeded = true;
      issues.push({
        code: 'LENGTH_EXCEEDED',
        message: `Term "${cleanTerm.slice(0, 20)}..." (${cleanTerm.length} chars) exceeds maximum ${maxLen} characters limit`,
        severity: 'error',
        term: cleanTerm,
        ruleIndex: idx,
      });
    }
  }

  const targetLevel =
    options.targetLevel ||
    (rules.some((r) => extractRuleDetails(r).targetLevel === 'ACCOUNT')
      ? 'ACCOUNT'
      : rules.some((r) => extractRuleDetails(r).targetLevel === 'CAMPAIGN')
      ? 'CAMPAIGN'
      : 'AD_GROUP');

  if (targetLevel === 'ACCOUNT' && rules.length > accountLimit) {
    hasCapacityExceeded = true;
    const msg = `Account-level negative list (${rules.length.toLocaleString()} rules) exceeds platform limit of ${accountLimit.toLocaleString()} rules`;
    issues.push({ code: 'CAPACITY_EXCEEDED_ACCOUNT', message: msg, severity: 'warning' });
    warnings.push(msg);
  } else if (targetLevel === 'CAMPAIGN' && rules.length > campaignLimit) {
    hasCapacityExceeded = true;
    const msg = `Campaign negative list (${rules.length.toLocaleString()} rules) exceeds platform limit of ${campaignLimit.toLocaleString()} rules`;
    issues.push({ code: 'CAPACITY_EXCEEDED_CAMPAIGN', message: msg, severity: 'warning' });
    warnings.push(msg);
  }

  return { isValid: !hasLengthExceeded, issues, warnings, hasLengthExceeded, hasCapacityExceeded };
}

/** In-browser Blob creation with zero outbound network calls */
export function createGoogleAdsBlob(tsvContent: string): Blob {
  return new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8' });
}

export function createAmazonBulkBlob(csvContent: string): Blob {
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
}

/** Client-side file downloader with instant URL revocation */
export function downloadPlatformExport(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
