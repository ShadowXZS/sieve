import test from 'node:test';
import assert from 'node:assert/strict';

// Imports from target Phase 5 modules (Step 1 Red Phase will fail as these are not yet implemented)
import {
  formatGoogleAdsEditorTSV,
  formatAmazonBulkUploadCSV,
  copyToClipboard,
} from '../../src/formatters/clipboard.ts';
import {
  normalizeAmazonKeyword,
  normalizeGoogleAdsKeyword,
} from '../../src/formatters/syntax.ts';
import {
  generateGoogleAdsScript,
} from '../../src/formatters/scripts.ts';
import {
  INTENT_PRESETS,
  matchIntentPresets,
  filterKeywordsByPresets,
} from '../../src/presets/dictionaries.ts';
import type { PersistedNegativeKeyword } from '../../src/workers/protocol.ts';
import { PlatformSchema } from '../../src/workers/protocol.ts';

// -----------------------------------------------------------------------------
// Test Fixtures
// -----------------------------------------------------------------------------

function createMockKeyword(overrides: Partial<PersistedNegativeKeyword> = {}): PersistedNegativeKeyword {
  return {
    sha256Hash: `hash_${Math.random().toString(36).substring(2, 9)}`,
    keyword: 'free trial software',
    matchType: 'phrase',
    formattedRule: '"free trial software"',
    platform: PlatformSchema.GoogleAds,
    confidenceScore: 0.95,
    marginalWaste: 145.5,
    hasCollision: false,
    createdAt: Date.now(),
    scope: {
      campaign: 'US_Search_NonBrand',
      adGroup: 'Software_Core',
    },
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// 1. Google Ads Editor Tab-Delimited Clipboard Formatter
// -----------------------------------------------------------------------------

test('Google Ads Editor TSV Formatter: Matches platform column specifications exactly', () => {
  const keywords: PersistedNegativeKeyword[] = [
    createMockKeyword({
      keyword: 'free download',
      matchType: 'phrase',
      formattedRule: '"free download"',
      scope: { campaign: 'Camp_Alpha', adGroup: 'AdGroup_1' },
      hasCollision: false,
    }),
    createMockKeyword({
      keyword: 'cheap crack keygen',
      matchType: 'broad',
      formattedRule: 'cheap crack keygen',
      scope: { campaign: 'Camp_Alpha', adGroup: 'AdGroup_2' },
      hasCollision: false,
    }),
    createMockKeyword({
      keyword: 'competitor login portal',
      matchType: 'exact',
      formattedRule: '[competitor login portal]',
      scope: { campaign: 'Camp_Beta' }, // No adGroup (Campaign-level)
      hasCollision: true, // Collision safety lock forces exact
    }),
  ];

  const tsvOutput = formatGoogleAdsEditorTSV(keywords);
  const lines = tsvOutput.trim().split('\n');

  // Verify header row
  assert.strictEqual(
    lines[0],
    'Campaign\tAd Group\tKeyword Text\tCriterion Type',
    'TSV header must match Google Ads Editor bulk paste schema exactly'
  );

  // Line 1: Phrase match with campaign and adGroup
  const row1Cols = lines[1].split('\t');
  assert.strictEqual(row1Cols.length, 4, 'Row 1 must contain exactly 4 columns');
  assert.strictEqual(row1Cols[0], 'Camp_Alpha');
  assert.strictEqual(row1Cols[1], 'AdGroup_1');
  assert.strictEqual(row1Cols[2], 'free download', 'Keyword Text should be raw clean string');
  assert.strictEqual(row1Cols[3], 'Negative Phrase', 'Criterion Type must map to Negative Phrase');

  // Line 2: Broad match with campaign and adGroup
  const row2Cols = lines[2].split('\t');
  assert.strictEqual(row2Cols.length, 4);
  assert.strictEqual(row2Cols[0], 'Camp_Alpha');
  assert.strictEqual(row2Cols[1], 'AdGroup_2');
  assert.strictEqual(row2Cols[2], 'cheap crack keygen');
  assert.strictEqual(row2Cols[3], 'Negative Broad', 'Criterion Type must map to Negative Broad');

  // Line 3: Campaign-level negative (empty ad group) with collision override
  const row3Cols = lines[3].split('\t');
  assert.strictEqual(row3Cols.length, 4);
  assert.strictEqual(row3Cols[0], 'Camp_Beta');
  assert.strictEqual(row3Cols[1], '', 'Ad Group should be blank for campaign-level exclusions');
  assert.strictEqual(row3Cols[2], 'competitor login portal');
  assert.strictEqual(row3Cols[3], 'Negative Exact', 'Collision keywords must force Negative Exact');
});

test('Google Ads Editor TSV Formatter: Sanitizes internal tabs and linebreaks in terms', () => {
  const keywords: PersistedNegativeKeyword[] = [
    createMockKeyword({
      keyword: 'invalid\ttab\r\nterm',
      matchType: 'phrase',
      scope: { campaign: 'Clean\tCampaign', adGroup: 'Clean\nAdGroup' },
    }),
  ];

  const tsvOutput = formatGoogleAdsEditorTSV(keywords);
  const lines = tsvOutput.trim().split('\n');
  assert.strictEqual(lines.length, 2, 'Should not produce extra lines due to embedded linebreaks');
  const rowCols = lines[1].split('\t');
  assert.strictEqual(rowCols.length, 4, 'Tab in content must be sanitized to prevent column shifting');
  assert.ok(!rowCols[2].includes('\t'), 'Keyword Text must not contain literal tab characters');
});

// -----------------------------------------------------------------------------
// 2. Amazon Ads PPC Syntax Normalizer
// -----------------------------------------------------------------------------

test('Amazon Ads Normalizer: Strips invalid punctuation, brackets, and quotes', () => {
  // Amazon PPC strictly rejects [brackets], "quotes", pluses +, and special punctuation
  const rawTerm = '["+cheap-deals! & *discounts*? @home"]';
  const result = normalizeAmazonKeyword(rawTerm, 'phrase');

  assert.ok(result.isValid, 'Sanitized term should be marked valid');
  assert.ok(!result.normalizedText.includes('['), 'Must strip opening square bracket');
  assert.ok(!result.normalizedText.includes(']'), 'Must strip closing square bracket');
  assert.ok(!result.normalizedText.includes('"'), 'Must strip double quotes');
  assert.ok(!result.normalizedText.includes('+'), 'Must strip plus modifiers');
  assert.ok(!result.normalizedText.includes('*'), 'Must strip asterisks');
  assert.ok(!result.normalizedText.includes('?'), 'Must strip question marks');
  assert.ok(!result.normalizedText.includes('!'), 'Must strip exclamation marks');
  assert.ok(!result.normalizedText.includes('&'), 'Must strip ampersands');
  assert.strictEqual(result.matchType, 'Negative Phrase');
});

test('Amazon Ads Normalizer: Rejects terms exceeding 10 words', () => {
  const elevenWords = 'one two three four five six seven eight nine ten eleven';
  const result = normalizeAmazonKeyword(elevenWords, 'exact');

  assert.strictEqual(result.isValid, false, 'Terms with > 10 words must be rejected');
  assert.ok(
    result.errors.some((err) => err.toLowerCase().includes('10 words')),
    `Errors must include 10 words limit reason. Got: ${JSON.stringify(result.errors)}`
  );
  assert.strictEqual(result.wordCount, 11);
});

test('Amazon Ads Normalizer: Flags or rejects terms exceeding 80 characters', () => {
  const longTerm = 'a'.repeat(81);
  const result = normalizeAmazonKeyword(longTerm, 'exact');

  assert.strictEqual(result.isValid, false, 'Terms exceeding 80 characters must be flagged invalid');
  assert.ok(
    result.errors.some((err) => err.toLowerCase().includes('80 character')),
    `Errors must mention 80 character limit. Got: ${JSON.stringify(result.errors)}`
  );
  assert.strictEqual(result.charCount, 81);
});

test('Amazon Ads Normalizer: Enforces valid Amazon negative match types (No Broad Negatives)', () => {
  // Amazon PPC ad groups and campaigns do not support Negative Broad; only exact and phrase are supported.
  const broadTerm = normalizeAmazonKeyword('budget sample', 'broad');

  assert.ok(
    resultMatchTypeIsAmazonPPC(broadTerm.matchType),
    'Amazon normalizer must coerce or validate match type to Negative Exact or Negative Phrase'
  );
});

function resultMatchTypeIsAmazonPPC(matchType: string): boolean {
  return matchType === 'Negative Exact' || matchType === 'Negative Phrase';
}

// -----------------------------------------------------------------------------
// 3. Google Ads Script Generator
// -----------------------------------------------------------------------------

test('Google Ads Script Generator: Produces valid syntactic ES6 script with no external imports', () => {
  const keywords: PersistedNegativeKeyword[] = [
    createMockKeyword({
      keyword: 'free download crack',
      matchType: 'exact',
      scope: { campaign: 'Alpha_Campaign' },
    }),
    createMockKeyword({
      keyword: 'diy cheap tutorial',
      matchType: 'phrase',
      scope: { campaign: 'Beta_Campaign' },
    }),
  ];

  const scriptCode = generateGoogleAdsScript(keywords, {
    batchSize: 50,
  });

  // 1. Syntactic ES6 validity check: parsing code with Function constructor
  assert.doesNotThrow(() => {
    // Validates JavaScript syntax without execution
    new Function(scriptCode);
  }, 'Generated script must be syntactically valid ES6 JavaScript');

  // 2. Encapsulates entry point 'main' function
  assert.ok(
    scriptCode.includes('function main()'),
    'Script must define a top-level function main() for Google Ads Scripts runtime'
  );

  // 3. Encapsulates keywords and campaign scopes
  assert.ok(scriptCode.includes('free download crack'), 'Script must embed keyword texts');
  assert.ok(scriptCode.includes('Alpha_Campaign'), 'Script must encapsulate target campaigns');

  // 4. Strict isolation: No external network calls, remote libraries, or module imports
  assert.ok(!scriptCode.includes('require('), 'Script must not contain CommonJS require');
  assert.ok(!scriptCode.includes('import '), 'Script must not contain ES module imports');
  assert.ok(!scriptCode.includes('fetch('), 'Script must not contain fetch API calls');
  assert.ok(!scriptCode.includes('XMLHttpRequest'), 'Script must not contain XMLHttpRequest');
  assert.ok(!scriptCode.includes('http://') && !scriptCode.includes('https://'), 'Script must have no external URLs');
});

// -----------------------------------------------------------------------------
// 4. Intent Preset Matching Dictionaries
// -----------------------------------------------------------------------------

test('Intent Preset Matching: Flags target queries matching B2B, E-Commerce, and Local Services', () => {
  // B2B informational / career queries
  const b2bQuery1 = 'software engineer salary in tech';
  const b2bMatch1 = matchIntentPresets(b2bQuery1);
  assert.ok(b2bMatch1.matchedPresets.includes('B2B'), 'Should flag career/salary search as B2B negative');
  assert.ok(b2bMatch1.matchedTokens.includes('salary'), 'Should identify "salary" token');

  const b2bQuery2 = 'crm software free download crack';
  const b2bMatch2 = matchIntentPresets(b2bQuery2);
  assert.ok(b2bMatch2.matchedPresets.includes('B2B'), 'Should flag "free" or "crack" under B2B waste');

  // E-Commerce DIY / repair / manual queries
  const ecommerceQuery = 'running shoes user manual and repair guide';
  const ecomMatch = matchIntentPresets(ecommerceQuery);
  assert.ok(
    ecomMatch.matchedPresets.includes('ECOMMERCE'),
    'Should flag repair / manual queries as E-Commerce non-transactional waste'
  );
  assert.ok(
    ecomMatch.matchedTokens.includes('repair') || ecomMatch.matchedTokens.includes('manual'),
    'Should capture matching tokens'
  );

  // Local Services licensing / job seeker queries
  const localQuery = 'plumber apprenticeship and certification school';
  const localMatch = matchIntentPresets(localQuery);
  assert.ok(
    localMatch.matchedPresets.includes('LOCAL_SERVICES'),
    'Should flag apprenticeship / school queries as Local Services waste'
  );
});

test('Intent Preset Matching: Respects word boundaries and avoids substring false positives', () => {
  // "free" should match "free trial", but NOT "freeway construction"
  const freewayQuery = 'freeway transport logistics';
  const matchResult = matchIntentPresets(freewayQuery);

  assert.ok(
    !matchResult.matchedTokens.includes('free'),
    'Substring "free" inside "freeway" must not trigger false positive match'
  );
});

test('Intent Preset Filtering: Correctly filters keyword list by active preset IDs', () => {
  const keywords: PersistedNegativeKeyword[] = [
    createMockKeyword({ keyword: 'enterprise software pricing' }), // Normal
    createMockKeyword({ keyword: 'software developer jobs and careers' }), // B2B / Career
    createMockKeyword({ keyword: 'appliance repair pdf manual' }), // E-Commerce
  ];

  const b2bFiltered = filterKeywordsByPresets(keywords, ['B2B']);
  assert.strictEqual(b2bFiltered.length, 1);
  assert.ok(b2bFiltered[0].keyword.includes('jobs'));

  const multiFiltered = filterKeywordsByPresets(keywords, ['B2B', 'ECOMMERCE']);
  assert.strictEqual(multiFiltered.length, 2);
});

