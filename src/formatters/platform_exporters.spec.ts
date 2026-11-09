/**
 * Behavioral Specification: Platform Directive Export Engines
 * File line ceiling: <= 250 lines.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateGoogleAdsEditorTsv,
  generateAmazonBulkCsv,
  validatePlatformConstraints,
  createGoogleAdsBlob,
  createAmazonBulkBlob,
  downloadPlatformExport,
} from './platform_exporters.ts';
import type { NegativeExclusionRule } from '../domain/types/shield.ts';
import type { QueryString, CampaignId, AdGroupId, CurrencyMicros } from '../domain/types/primitives.ts';

function createRule(overrides: Partial<NegativeExclusionRule> = {}): NegativeExclusionRule {
  const term = (overrides.candidateTerm ?? 'test term') as QueryString;
  const campaignId = 'campaignId' in overrides ? overrides.campaignId : ('Campaign_01' as CampaignId);
  return {
    candidateTerm: term,
    recommendedMatchType: 'BROAD',
    targetLevel: 'CAMPAIGN',
    marginalWasteMicros: 10_000_000n as CurrencyMicros,
    confidenceScore: 0.95,
    verdict: 'SAFE_EXCLUSION',
    campaignId,
    ruleFingerprint: `fp_${Math.random().toString(36).substring(2, 9)}`,
    ...overrides,
  };
}

test('Red Test 1: generateGoogleAdsEditorTsv() outputs valid TSV with standard headers and match syntax', () => {
  const rules = [
    createRule({ candidateTerm: 'exact keyword' as QueryString, recommendedMatchType: 'EXACT', campaignId: 'Alpha_Campaign' as CampaignId, adGroupId: 'Main_AdGroup' as AdGroupId }),
    createRule({ candidateTerm: 'phrase keyword' as QueryString, recommendedMatchType: 'PHRASE', campaignId: 'Beta_Campaign' as CampaignId }),
    createRule({ candidateTerm: 'broad keyword' as QueryString, recommendedMatchType: 'BROAD', campaignId: undefined }),
    createRule({ candidateTerm: 'colliding keyword' as QueryString, recommendedMatchType: 'BROAD', verdict: 'EXACT_BRACKET_LOCK', campaignId: 'Gamma_Campaign' as CampaignId }),
  ];

  const tsv = generateGoogleAdsEditorTsv(rules);
  const lines = tsv.split('\n');

  assert.strictEqual(lines[0], 'Campaign\tAd Group\tKeyword\tCriterion Type');
  assert.strictEqual(lines[1], 'Alpha_Campaign\tMain_AdGroup\t[exact keyword]\tExact');
  assert.strictEqual(lines[2], 'Beta_Campaign\t\t"phrase keyword"\tPhrase');
  assert.strictEqual(lines[3], '\t\tbroad keyword\tBroad');
  assert.strictEqual(lines[4], 'Gamma_Campaign\t\t[colliding keyword]\tExact');
});

test('Red Test 2: generateAmazonBulkCsv() converts Broad match to Negative Phrase or Exact', () => {
  const rules = [
    createRule({ candidateTerm: 'broad, with comma' as QueryString, recommendedMatchType: 'BROAD', targetLevel: 'CAMPAIGN', campaignId: 'SP_Campaign_01' as CampaignId }),
    createRule({ candidateTerm: 'phrase candidate' as QueryString, recommendedMatchType: 'PHRASE', targetLevel: 'AD_GROUP', campaignId: 'SP_Campaign_01' as CampaignId, adGroupId: 'SP_AdGroup_01' as AdGroupId }),
    createRule({ candidateTerm: 'exact candidate' as QueryString, recommendedMatchType: 'EXACT', targetLevel: 'CAMPAIGN', campaignId: 'SP_Campaign_02' as CampaignId }),
  ];

  const defaultCsv = generateAmazonBulkCsv(rules);
  const defaultLines = defaultCsv.split('\n');

  assert.strictEqual(defaultLines[0], 'Record Type,Campaign ID,Ad Group ID,Keyword or Product Targeting,Match Type');
  assert.strictEqual(defaultLines[1], 'Campaign Negative Keyword,SP_Campaign_01,,"broad, with comma",Negative Phrase');
  assert.strictEqual(defaultLines[2], 'Negative Keyword,SP_Campaign_01,SP_AdGroup_01,phrase candidate,Negative Phrase');
  assert.strictEqual(defaultLines[3], 'Campaign Negative Keyword,SP_Campaign_02,,exact candidate,Negative Exact');

  const exactCsv = generateAmazonBulkCsv(rules, { fallbackBroadMatchType: 'Negative Exact' });
  assert.strictEqual(exactCsv.split('\n')[1], 'Campaign Negative Keyword,SP_Campaign_01,,"broad, with comma",Negative Exact');
});

test('Red Test 3: validatePlatformConstraints() flags terms exceeding 80 characters with LENGTH_EXCEEDED', () => {
  const validRule = createRule({ candidateTerm: 'short valid term' as QueryString });
  const excessiveTerm = 'a'.repeat(81) as QueryString;
  const invalidRule = createRule({ candidateTerm: excessiveTerm });

  const validResult = validatePlatformConstraints([validRule]);
  assert.strictEqual(validResult.isValid, true);
  assert.strictEqual(validResult.hasLengthExceeded, false);

  const invalidResult = validatePlatformConstraints([invalidRule]);
  assert.strictEqual(invalidResult.isValid, false);
  assert.strictEqual(invalidResult.hasLengthExceeded, true);

  const lengthIssue = invalidResult.issues.find((i) => i.code === 'LENGTH_EXCEEDED');
  assert.ok(lengthIssue, 'Must emit an issue with code LENGTH_EXCEEDED');
  assert.strictEqual(lengthIssue.severity, 'error');
});

test('Red Test 4: validatePlatformConstraints() asserts capacity warning for lists > 5,000 (Account) or > 10,000 (Campaign)', () => {
  const accountRules = Array.from({ length: 5001 }, (_, i) =>
    createRule({ candidateTerm: `neg_term_${i}` as QueryString, targetLevel: 'ACCOUNT' })
  );
  const accountResult = validatePlatformConstraints(accountRules, { targetLevel: 'ACCOUNT' });
  assert.strictEqual(accountResult.hasCapacityExceeded, true);
  assert.ok(accountResult.issues.some((i) => i.code === 'CAPACITY_EXCEEDED_ACCOUNT'));

  const campaignRules = Array.from({ length: 10001 }, (_, i) =>
    createRule({ candidateTerm: `neg_term_${i}` as QueryString, targetLevel: 'CAMPAIGN' })
  );
  const campaignResult = validatePlatformConstraints(campaignRules, { targetLevel: 'CAMPAIGN' });
  assert.strictEqual(campaignResult.hasCapacityExceeded, true);
  assert.ok(campaignResult.issues.some((i) => i.code === 'CAPACITY_EXCEEDED_CAMPAIGN'));
});

test('Zero Transmission & Blob Generation: in-memory downloadable Blobs with correct MIME types and URL cleanup', () => {
  if (typeof document === 'undefined') {
    (globalThis as unknown as { document: unknown }).document = {
      createElement: () => ({ click: () => {}, href: '', download: '' }),
      body: { appendChild: () => {}, removeChild: () => {} },
    };
  }

  const rules = [createRule({ candidateTerm: 'sample rule' as QueryString })];
  const tsv = generateGoogleAdsEditorTsv(rules);
  const csv = generateAmazonBulkCsv(rules);

  const tsvBlob = createGoogleAdsBlob(tsv);
  assert.ok(tsvBlob instanceof Blob);
  assert.strictEqual(tsvBlob.type, 'text/tab-separated-values;charset=utf-8');

  const csvBlob = createAmazonBulkBlob(csv);
  assert.ok(csvBlob instanceof Blob);
  assert.strictEqual(csvBlob.type, 'text/csv;charset=utf-8');

  let revokedUrl = '';
  const originalRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = (url: string) => { revokedUrl = url; };
  try {
    downloadPlatformExport(csvBlob, 'test.csv');
    assert.ok(revokedUrl.startsWith('blob:'), 'Must revoke object URL after download to prevent memory leaks');
  } finally {
    URL.revokeObjectURL = originalRevoke;
  }
});
