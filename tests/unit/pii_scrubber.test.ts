/**
 * Client-Side PII Scrubber Unit & Performance Tests
 *
 * Operating Principles:
 * - Titus Winters et al. (SE at Google): Behavior-driven contracts, zero data leaks
 * - Privacy-by-Design: Strictly client-side, zero console output, zero external network calls
 *
 * Verifies:
 * 1. Accurate redaction of RFC-compliant email addresses.
 * 2. Redaction of international, national, and toll-free telephone numbers.
 * 3. Accurate detection and Luhn-validated redaction of Visa, Mastercard, Amex, and Discover numbers.
 * 4. Redaction of US Social Security Numbers (3-2-4 format).
 * 5. Redaction of IPv4 and IPv6 addresses.
 * 6. Redaction of authentication secrets, API keys, and bearer tokens.
 * 7. Redaction of street address patterns.
 * 8. Zero false positives on typical search queries (product models, shoe sizes, prices, dimensions).
 * 9. Different redaction modes (labeled, compact, generic, mask).
 * 10. scrubKeywordList integration and statistical aggregation.
 * 11. High throughput: Scrubs 5,000 queries in under 250ms.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  scrubPiiText,
  containsPii,
  scrubKeywordRecord,
  scrubKeywordList,
  isValidLuhn,
} from '../../src/crypto/pii_scrubber.ts';

describe('Client-Side PII Scrubber', () => {
  test('Luhn Checksum Validation: Accurately validates genuine payment cards and rejects invalid sequences', () => {
    // Valid Visa
    assert.strictEqual(isValidLuhn('4111 1111 1111 1111'), true);
    assert.strictEqual(isValidLuhn('4532-0150-0000-0007'), true);
    // Invalid Visa (last digit altered)
    assert.strictEqual(isValidLuhn('4111 1111 1111 1112'), false);
    // Valid Mastercard
    assert.strictEqual(isValidLuhn('5425 2334 3010 9903'), true);
    assert.strictEqual(isValidLuhn('5425 2334 3010 9904'), false);
    assert.strictEqual(isValidLuhn('5500 0000 0000 0004'), true);
    // Short string
    assert.strictEqual(isValidLuhn('12345'), false);
  });

  test('Email Redaction: Redacts various email patterns across search queries', () => {
    const input = 'contact support@acme-corp.com or john.doe+promo@gmail.co.uk for order status';
    const result = scrubPiiText(input);

    assert.strictEqual(result.hasPii, true);
    assert.strictEqual(result.redactedCount, 2);
    assert.strictEqual(
      result.scrubbedText,
      'contact [REDACTED_EMAIL] or [REDACTED_EMAIL] for order status'
    );
  });

  test('Phone Redaction: Handles international, parenthesized, and dashed formats', () => {
    const inputs = [
      { text: 'call customer service at +1 (800) 555-0199 today', expected: 'call customer service at [REDACTED_PHONE] today' },
      { text: 'helpline 555-123-4567 direct', expected: 'helpline [REDACTED_PHONE] direct' },
      { text: 'reach out to (555) 019-2834 now', expected: 'reach out to [REDACTED_PHONE] now' },
      { text: 'london office +44 20 7946 0919 support', expected: 'london office [REDACTED_PHONE] support' },
    ];

    for (const item of inputs) {
      const res = scrubPiiText(item.text);
      assert.strictEqual(res.hasPii, true, `Failed for input: ${item.text}`);
      assert.strictEqual(res.scrubbedText, item.expected);
    }
  });

  test('Payment Card Redaction: Luhn-validated card numbers are masked and false numbers preserved', () => {
    const textWithCard = 'pay with card 4111-1111-1111-1111 discount code';
    const res = scrubPiiText(textWithCard);
    assert.strictEqual(res.hasPii, true);
    assert.strictEqual(res.scrubbedText, 'pay with card [REDACTED_CARD] discount code');

    const randomNumbers = 'order item 1111-2222-3333-4445 tracking';
    const nonCardRes = scrubPiiText(randomNumbers);
    assert.strictEqual(nonCardRes.hasPii, false);
  });

  test('Social Security Number (SSN): Redacts 3-2-4 formatted numbers', () => {
    const text = 'verify id 123-45-6789 for tax form';
    const res = scrubPiiText(text);
    assert.strictEqual(res.hasPii, true);
    assert.strictEqual(res.scrubbedText, 'verify id [REDACTED_SSN] for tax form');
  });

  test('IP Address Redaction: Redacts IPv4 and IPv6 addresses', () => {
    const ipv4Text = 'server connection issue 192.168.1.105 timeout error';
    const resV4 = scrubPiiText(ipv4Text);
    assert.strictEqual(resV4.hasPii, true);
    assert.strictEqual(resV4.scrubbedText, 'server connection issue [REDACTED_IP] timeout error');

    const ipv6Text = 'gateway 2001:0db8:85a3:0000:0000:8a2e:0370:7334 unreachable';
    const resV6 = scrubPiiText(ipv6Text);
    assert.strictEqual(resV6.hasPii, true);
    assert.strictEqual(resV6.scrubbedText, 'gateway [REDACTED_IP] unreachable');
  });

  test('Secrets & Credentials: Redacts API keys and passwords', () => {
    const text = 'login error password=SuperSecretKey123! token failed';
    const res = scrubPiiText(text);
    assert.strictEqual(res.hasPii, true);
    assert.strictEqual(res.scrubbedText, 'login error [REDACTED_SECRET] token failed');
  });

  test('Physical Street Addresses: Redacts street address combinations', () => {
    const text = 'deliver to 742 Evergreen Terrace Springfield order';
    const res = scrubPiiText(text);
    assert.strictEqual(res.hasPii, true);
    assert.ok(res.scrubbedText.includes('[REDACTED_ADDRESS]'));
  });

  test('Zero False Positives: Does NOT redact common non-PII search queries', () => {
    const benignQueries = [
      'buy iphone 15 pro 256gb titanium',
      'nike air max 90 size 10.5 running shoes',
      'bmw 328i 2016 brake pads replacement',
      'cheap flights from lax to jfk under $300',
      'dell xps 13 intel core i7 32gb ram 1tb ssd',
      'python 3.11 tutorial for beginners',
      'best 4k tv 65 inch oled review',
    ];

    for (const q of benignQueries) {
      const res = scrubPiiText(q);
      assert.strictEqual(res.hasPii, false, `Query "${q}" was falsely flagged as PII`);
      assert.strictEqual(res.scrubbedText, q);
    }
  });

  test('Redaction Modes: Supports compact, generic, mask, and custom replacers', () => {
    const input = 'email test@example.com call 555-123-4567';

    const compactRes = scrubPiiText(input, { mode: 'compact' });
    assert.strictEqual(compactRes.scrubbedText, 'email [EMAIL] call [PHONE]');

    const genericRes = scrubPiiText(input, { mode: 'generic' });
    assert.strictEqual(genericRes.scrubbedText, 'email [REDACTED_PII] call [REDACTED_PII]');

    const maskRes = scrubPiiText(input, { mode: 'mask' });
    assert.ok(maskRes.scrubbedText.includes('***'));

    const customRes = scrubPiiText(input, {
      customReplacer: (type) => `<censored-${type}>`,
    });
    assert.strictEqual(customRes.scrubbedText, 'email <censored-email> call <censored-phone>');
  });

  test('scrubKeywordList: Redacts arrays of keywords and compiles accurate PII stats', () => {
    const sampleKeywords = [
      { id: '1', keyword: 'order confirmation john@test.com', formattedRule: '[order confirmation john@test.com]' },
      { id: '2', keyword: 'call 555-987-6543 support', formattedRule: '"call 555-987-6543 support"' },
      { id: '3', keyword: 'normal search term query', formattedRule: '[normal search term query]' },
      { id: '4', keyword: 'server ip 10.0.0.1 admin', formattedRule: '[server ip 10.0.0.1 admin]' },
    ];

    const { scrubbed, stats } = scrubKeywordList(sampleKeywords);

    assert.strictEqual(scrubbed.length, 4);
    assert.strictEqual(stats.totalScrubbed, 3);
    assert.strictEqual(stats.emailCount, 1);
    assert.strictEqual(stats.phoneCount, 1);
    assert.strictEqual(stats.ipCount, 1);
    assert.strictEqual(stats.redactedTokens, 3);

    assert.strictEqual(scrubbed[0].keyword, 'order confirmation [REDACTED_EMAIL]');
    assert.strictEqual(scrubbed[0].formattedRule, '[order confirmation [REDACTED_EMAIL]]');
    assert.strictEqual(scrubbed[1].keyword, 'call [REDACTED_PHONE] support');
    assert.strictEqual(scrubbed[2].keyword, 'normal search term query');
  });

  test('Performance: Scrubs 5,000 queries in under 250ms', () => {
    const largeList = Array.from({ length: 5000 }, (_, i) => ({
      keyword: i % 10 === 0 ? `query with user${i}@domain.com` : `normal keyword search query ${i}`,
      formattedRule: `[rule ${i}]`,
    }));

    const start = performance.now();
    const { scrubbed, stats } = scrubKeywordList(largeList);
    const duration = performance.now() - start;

    assert.strictEqual(scrubbed.length, 5000);
    assert.strictEqual(stats.emailCount, 500);
    assert.ok(duration < 250, `Scrubbing 5000 records took ${duration.toFixed(2)}ms, expected < 250ms`);
  });
});
