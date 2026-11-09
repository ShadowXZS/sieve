/**
 * Behavioral Unit Tests: Multi-Platform Search Term Report Parser
 *
 * Beck's TDD & Martin's Clean Architecture test suite verifying Google Ads,
 * Amazon PPC, and Microsoft Ads parsing, precision invariants, and throughput.
 * File line ceiling: <= 200 lines.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SearchTermParser,
  parseSearchTermReport,
  parseCurrencyToMicros,
  normalizeMatchType,
} from './search_term_parser.ts';
import { detectPlatformFromHeaders } from './platform_detector.ts';

test('Red Test 1: Google Ads TSV with header metadata skips preamble and maps SearchTermRecord accurately', () => {
  const googleTsv = [
    'Search terms report',
    'Oct 1, 2026 - Oct 31, 2026',
    '',
    'Search term\tMatch type\tCampaign\tAd group\tImpressions\tClicks\tCost\tConversions\tConv. value',
    'running shoes\tExact match\tSearch - Shoes\tRunning Footwear\t1,500\t120\t$144.50\t12\t$360.00',
    'trail hiking boots\tPhrase match\tSearch - Boots\tHiking Gear\t800\t40\t$80.00\t2.5\t$125.00',
    'best outdoor sandals\tBroad match\tSearch - Sandals\tSandals\t500\t25\t$50.00\t0\t$0.00',
    'Total: Account\t--\t--\t--\t2,800\t185\t$274.50\t14.5\t$485.00',
  ].join('\n');

  const records = parseSearchTermReport(googleTsv);
  assert.equal(records.length, 3, 'Metadata and Total rows should be excluded');

  assert.equal(records[0].rawQuery, 'running shoes');
  assert.equal(records[0].normalizedQuery, 'running shoes');
  assert.equal(records[0].campaignName, 'Search - Shoes');
  assert.equal(records[0].adGroupName, 'Running Footwear');
  assert.equal(records[0].matchType, 'EXACT');
  assert.equal(records[0].impressions, 1500);
  assert.equal(records[0].clicks, 120);
  assert.equal(records[0].spendMicros, 144_500_000n);
  assert.equal(records[0].conversions, 12);
  assert.equal(records[0].revenueMicros, 360_000_000n);
  assert.equal(records[0].averageCpcMicros, 144_500_000n / 120n);

  assert.equal(records[1].rawQuery, 'trail hiking boots');
  assert.equal(records[1].matchType, 'PHRASE');
  assert.equal(records[1].conversions, 2.5);
  assert.equal(records[1].spendMicros, 80_000_000n);
  assert.equal(records[1].revenueMicros, 125_000_000n);

  assert.equal(records[2].rawQuery, 'best outdoor sandals');
  assert.equal(records[2].matchType, 'BROAD');
  assert.equal(records[2].conversions, 0);
  assert.equal(records[2].revenueMicros, 0n);
});

test('Red Test 2: Strips currency formatting and converts to exact integer CurrencyMicros without float drift', () => {
  assert.equal(parseCurrencyToMicros('$1,234.56'), 1_234_560_000n);
  assert.equal(parseCurrencyToMicros('€12.50'), 12_500_000n);
  assert.equal(parseCurrencyToMicros('£99.99'), 99_990_000n);
  assert.equal(parseCurrencyToMicros('$0.00'), 0n);
  assert.equal(parseCurrencyToMicros('$1.14'), 1_140_000n);
  assert.equal(parseCurrencyToMicros('1,234,567.89'), 1_234_567_890_000n);
  assert.equal(parseCurrencyToMicros('$0.05'), 50_000n);
  assert.equal(parseCurrencyToMicros(''), 0n);
  assert.equal(parseCurrencyToMicros(undefined), 0n);
  assert.equal(parseCurrencyToMicros('175.5285'), 175_528_500n);
  assert.equal(parseCurrencyToMicros('0.015'), 15_000n);
  assert.equal(parseCurrencyToMicros(175528.49999999997), 175_528_500_000n);
  assert.equal(parseCurrencyToMicros(0.17552849999999998), 175_528n);
  assert.equal(parseCurrencyToMicros('-$175.5285'), -175_528_500n);
  assert.equal(parseCurrencyToMicros('($175.5285)'), -175_528_500n);
  assert.equal(parseCurrencyToMicros(NaN), 0n);
});

test('Fractional currency ingestion: Ingests CSV containing 175.5285 and 0.015 without RangeError', () => {
  const csv = [
    'Search term,Match type,Campaign,Ad group,Impressions,Clicks,Cost,Conversions,Conv. value',
    'fractional cost item,Exact,Camp A,Grp A,100,10,175.5285,1.5,350.25',
    'micro bid query,Phrase,Camp B,Grp B,50,5,0.015,0,0',
  ].join('\n');
  const records = parseSearchTermReport(csv);
  assert.equal(records.length, 2);
  assert.equal(records[0].spendMicros, 175_528_500n);
  assert.equal(records[0].revenueMicros, 350_250_000n);
  assert.equal(records[1].spendMicros, 15_000n);
});

test('Red Test 3: Amazon PPC Sponsored Products report maps customer search term and 7-day metrics cleanly', () => {
  const amazonCsv = [
    'Customer Search Term,Campaign Name,Ad Group Name,Match Type,Impressions,Clicks,Spend,7 Day Total Orders (#),7 Day Total Sales ($)',
    'wireless earbuds bluetooth,Audio Campaign,Earbuds,EXACT,2500,150,$225.00,15,$750.00',
    'noise cancelling headphones,Audio Campaign,Over-Ear,BROAD,1000,50,$100.00,4,$200.00',
  ].join('\n');

  const parser = new SearchTermParser();
  const records = parser.parse(amazonCsv);

  assert.equal(records.length, 2);
  assert.equal(records[0].rawQuery, 'wireless earbuds bluetooth');
  assert.equal(records[0].campaignName, 'Audio Campaign');
  assert.equal(records[0].adGroupName, 'Earbuds');
  assert.equal(records[0].matchType, 'EXACT');
  assert.equal(records[0].impressions, 2500);
  assert.equal(records[0].clicks, 150);
  assert.equal(records[0].spendMicros, 225_000_000n);
  assert.equal(records[0].conversions, 15);
  assert.equal(records[0].revenueMicros, 750_000_000n);
  assert.equal(records[0].averageCpcMicros, 1_500_000n);

  assert.equal(records[1].rawQuery, 'noise cancelling headphones');
  assert.equal(records[1].matchType, 'BROAD');
  assert.equal(records[1].spendMicros, 100_000_000n);
});

test('Red Test 4: Resiliently handles quoted commas, empty lines, trailing delimiters, and missing columns', () => {
  const messyCsv = [
    '',
    'Search term,Campaign,Ad group,Match type,Clicks,Cost,',
    '"shoes, running waterproof",Footwear Campaign,Road Running,Phrase,10,$15.50,',
    '"laptop ""ultra"" slim",Electronics,,Exact,5,$25.00,',
    ',,,,,',
    '   ',
  ].join('\n');

  const records = parseSearchTermReport(messyCsv);
  assert.equal(records.length, 2);

  assert.equal(records[0].rawQuery, 'shoes, running waterproof');
  assert.equal(records[0].normalizedQuery, 'shoes running waterproof');
  assert.equal(records[0].campaignName, 'Footwear Campaign');
  assert.equal(records[0].adGroupName, 'Road Running');
  assert.equal(records[0].matchType, 'PHRASE');
  assert.equal(records[0].clicks, 10);
  assert.equal(records[0].spendMicros, 15_500_000n);
  assert.equal(records[0].impressions, 0);
  assert.equal(records[0].conversions, 0);
  assert.equal(records[0].revenueMicros, 0n);
  assert.equal(records[0].averageCpcMicros, 1_550_000n);

  assert.equal(records[1].rawQuery, 'laptop "ultra" slim');
  assert.equal(records[1].adGroupName, '');
  assert.equal(records[1].matchType, 'EXACT');
});

test('Red Test 5: Microsoft Advertising report and casing canonicalization', () => {
  const msCsv = [
    'Query,Campaign,Ad group,Delivered match type,Impressions,Clicks,Amount spent,All conversions,Revenue',
    'accounting software,SaaS Campaign,Finance Group,Exact,3000,100,$250.00,10,"$1,000.00"',
    'cloud payroll,SaaS Campaign,HR Group,Phrase,1200,40,$80.00,2,$200.00',
  ].join('\n');

  const records = parseSearchTermReport(msCsv);
  assert.equal(records.length, 2);
  assert.equal(records[0].rawQuery, 'accounting software');
  assert.equal(records[0].campaignName, 'SaaS Campaign');
  assert.equal(records[0].adGroupName, 'Finance Group');
  assert.equal(records[0].matchType, 'EXACT');
  assert.equal(records[0].spendMicros, 250_000_000n);
  assert.equal(records[0].conversions, 10);
  assert.equal(records[0].revenueMicros, 1_000_000_000n);
  assert.equal(records[0].averageCpcMicros, 2_500_000n);
  assert.equal(records[1].matchType, 'PHRASE');

  assert.equal(normalizeMatchType('Exact match'), 'EXACT');
  assert.equal(normalizeMatchType('Phrase match'), 'PHRASE');
  assert.equal(normalizeMatchType('Broad match'), 'BROAD');
  assert.equal(normalizeMatchType('exact'), 'EXACT');
  assert.equal(normalizeMatchType('PHRASE'), 'PHRASE');
  assert.equal(normalizeMatchType('bRoAd'), 'BROAD');
  assert.equal(normalizeMatchType(undefined), 'BROAD');
});

test('High-Throughput: Parses thousands of rows in multi-megabyte buffer under 500ms', () => {
  const rows: string[] = ['Search term,Campaign,Ad group,Match type,Impressions,Clicks,Cost,Conversions,Conv. value'];
  for (let i = 0; i < 5000; i++) {
    rows.push(`"term query ${i}",Campaign ${i % 10},AdGroup ${i % 20},Exact,100,10,$12.50,1,$50.00`);
  }
  const bigCsv = rows.join('\n');
  const start = performance.now();
  const records = parseSearchTermReport(bigCsv);
  const elapsed = performance.now() - start;

  assert.equal(records.length, 5000);
  assert.equal(records[0].spendMicros, 12_500_000n);
  assert.equal(records[4999].revenueMicros, 50_000_000n);
  assert.ok(elapsed < 500, `Parsing took ${elapsed}ms, expected < 500ms`);
});

test('Platform Detector: Accurately identifies Google Ads, Amazon PPC, and Microsoft Ads', () => {
  assert.equal(detectPlatformFromHeaders(['Search term', 'Match type', 'Cost']), 'GOOGLE_ADS');
  assert.equal(detectPlatformFromHeaders(['Customer Search Term', 'Spend', '7 Day Total Orders (#)']), 'AMAZON_PPC');
  assert.equal(detectPlatformFromHeaders(['Query', 'Amount spent', 'Delivered match type']), 'MICROSOFT_ADS');
  assert.equal(detectPlatformFromHeaders(['Random', 'Unknown']), 'UNKNOWN');
});
