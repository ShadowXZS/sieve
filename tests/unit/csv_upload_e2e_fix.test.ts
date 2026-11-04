import test from 'node:test';
import assert from 'node:assert/strict';
import { useSieveStore } from '../../src/state/useSieveStore.ts';
import {
  cleanNumeric,
  detectColumnMapping,
  parseCsvTextToRecords,
} from '../../src/utils/csvParser.ts';

test('Action 4: Normalized Column Aliases & Numeric Stripping', () => {
  // 1. Google Ads format
  const googleHeaders = ['Search term', 'Clicks', 'Cost', 'Conversions', 'Campaign'];
  const googleMapping = detectColumnMapping(googleHeaders);
  assert.strictEqual(googleMapping.queryCol, 0, 'Google query column recognized');
  assert.strictEqual(googleMapping.clicksCol, 1, 'Google clicks column recognized');
  assert.strictEqual(googleMapping.costCol, 2, 'Google cost column recognized');
  assert.strictEqual(googleMapping.conversionsCol, 3, 'Google conversions column recognized');

  // 2. Amazon PPC format
  const amazonHeaders = ['Customer Search Term', 'Clicks', 'Spend', '7 Day Total Orders (#)', 'Campaign Name'];
  const amazonMapping = detectColumnMapping(amazonHeaders);
  assert.strictEqual(amazonMapping.queryCol, 0, 'Amazon PPC query column recognized');
  assert.strictEqual(amazonMapping.clicksCol, 1, 'Amazon PPC clicks column recognized');
  assert.strictEqual(amazonMapping.costCol, 2, 'Amazon PPC spend column recognized');
  assert.strictEqual(amazonMapping.conversionsCol, 3, 'Amazon PPC 7 day total orders (#) column recognized');

  // 3. Microsoft Ads format
  const msHeaders = ['Query', 'Clicks', 'Amount spent', 'Orders'];
  const msMapping = detectColumnMapping(msHeaders);
  assert.strictEqual(msMapping.queryCol, 0, 'Microsoft Ads query column recognized');
  assert.strictEqual(msMapping.clicksCol, 1, 'Microsoft Ads clicks column recognized');
  assert.strictEqual(msMapping.costCol, 2, 'Microsoft Ads amount spent column recognized');
  assert.strictEqual(msMapping.conversionsCol, 3, 'Microsoft Ads orders column recognized');

  // 4. Numeric stripping ($ ₹ € ¥ £ and commas)
  assert.strictEqual(cleanNumeric('$1,234.50'), 1234.5);
  assert.strictEqual(cleanNumeric('₹1,23,456.78'), 123456.78);
  assert.strictEqual(cleanNumeric('€50.25'), 50.25);
  assert.strictEqual(cleanNumeric('¥12,450'), 12450);
  assert.strictEqual(cleanNumeric('£99.99'), 99.99);
  assert.strictEqual(cleanNumeric('1,500'), 1500);
});

test('Action 3: useSieveStore PARSE_SUCCESS & clearDataset Lifecycle', () => {
  useSieveStore.getState().reset();
  const initial = useSieveStore.getState();
  assert.strictEqual(initial.fileLoaded, false);
  assert.strictEqual(initial.records.length, 0);

  // Simulate PARSE_SUCCESS event
  const mockPayload = {
    records: [
      {
        sha256Hash: 'hash-1',
        keyword: 'enterprise crm',
        matchType: 'exact' as const,
        clicks: 50,
        cost: 250,
        conversions: 0,
        confidenceScore: 0.65, // Below default 0.8 threshold!
        hasCollision: false,
        createdAt: Date.now(),
      },
    ],
    summary: {
      totalKeywords: 1,
      totalWaste: 250,
      collisionCount: 0,
      avgConfidence: 0.65,
      exactLockedCount: 1,
      totalClicks: 50,
      totalCost: 250,
      totalConversions: 0,
    },
    currency: '$' as const,
  };

  useSieveStore.getState().handleParseSuccess(mockPayload);

  const loadedState = useSieveStore.getState();
  assert.strictEqual(loadedState.fileLoaded, true, 'fileLoaded must be true');
  assert.strictEqual(loadedState.isLoading, false, 'isLoading must be false');
  assert.strictEqual(loadedState.records.length, 1, 'records must be populated');
  // Crucial requirement: filteredRecords = records to prevent threshold zeroing
  assert.strictEqual(
    loadedState.filteredRecords.length,
    1,
    'filteredRecords must equal records to prevent threshold zeroing'
  );
  assert.strictEqual(loadedState.filteredKeywords.length, 1);

  // Clear dataset
  useSieveStore.getState().clearDataset();
  const clearedState = useSieveStore.getState();
  assert.strictEqual(clearedState.fileLoaded, false, 'fileLoaded must be reset to false');
  assert.strictEqual(clearedState.records.length, 0, 'records must be empty');
  assert.strictEqual(clearedState.filteredRecords.length, 0, 'filteredRecords must be empty');
  assert.strictEqual(clearedState.keywords.length, 0, 'keywords must be empty');
});

test('End-to-End CSV Parsing with multi-platform currencies and aliases', () => {
  const amazonCsv = `Customer Search Term,Clicks,Spend,7 Day Total Orders (#)
"amazon wireless earbuds",120,"$1,450.50",0
"noise cancelling headphones",35,"$420.00",2`;

  const parsed = parseCsvTextToRecords(amazonCsv, 50);
  assert.strictEqual(parsed.currency, '$');
  assert.strictEqual(parsed.records.length, 2);

  const r1 = parsed.records[0];
  assert.strictEqual(r1.keyword, 'amazon wireless earbuds');
  assert.strictEqual(r1.clicks, 120);
  assert.strictEqual(r1.cost, 1450.5);
  assert.strictEqual(r1.conversions, 0);
  assert.strictEqual(r1.marginalWaste, 1450.5);

  const r2 = parsed.records[1];
  assert.strictEqual(r2.keyword, 'noise cancelling headphones');
  assert.strictEqual(r2.clicks, 35);
  assert.strictEqual(r2.cost, 420);
  assert.strictEqual(r2.conversions, 2);
  assert.strictEqual(r2.marginalWaste, 320); // 420 - 2 * 50 = 320
});

