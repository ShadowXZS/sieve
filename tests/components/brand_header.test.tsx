/**
 * BrandHeader Component Layout & Typography Regression Tests (TDD)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { BrandHeader } from '../../src/components/brand/BrandHeader.tsx';

test('BrandHeader: Does NOT render "Phase 7" badge', () => {
  cleanup();
  const { container } = render(<BrandHeader />);
  assert.strictEqual(
    container.textContent?.includes('Phase 7'),
    false,
    'Header must NOT render the text "Phase 7"'
  );
});

test('BrandHeader: Does NOT render center cluster ("WASM Analytical Pipeline" or "Bayesian Posteriori")', () => {
  cleanup();
  const { container } = render(<BrandHeader />);
  assert.strictEqual(
    container.textContent?.includes('WASM Analytical Pipeline'),
    false,
    'Header must NOT render "WASM Analytical Pipeline"'
  );
  assert.strictEqual(
    container.textContent?.includes('Bayesian Posteriori'),
    false,
    'Header must NOT render "Bayesian Posteriori"'
  );
});

test('BrandHeader: Does NOT render "Load 10k Demo" button', () => {
  cleanup();
  const { container } = render(<BrandHeader />);
  assert.strictEqual(
    container.textContent?.includes('Load 10k Demo'),
    false,
    'Header must NOT render "Load 10k Demo" button'
  );
  assert.strictEqual(
    screen.queryByRole('button', { name: /10k demo/i }),
    null,
    'Header must not contain any button matching 10k demo'
  );
});

test('BrandHeader: Wordmark "SIEVE" has enlarged typography styling (text-2xl or larger, bold/black weight)', () => {
  cleanup();
  render(<BrandHeader />);
  const wordmark = screen.getByText('SIEVE');
  assert.ok(wordmark, 'Header must render "SIEVE" wordmark');
  assert.ok(
    wordmark.className.includes('text-2xl') ||
      wordmark.className.includes('text-3xl') ||
      wordmark.className.includes('text-4xl'),
    `Expected enlarged typography (text-2xl or larger), got classes: "${wordmark.className}"`
  );
  assert.ok(
    wordmark.className.includes('font-black') ||
      wordmark.className.includes('font-extrabold') ||
      wordmark.className.includes('font-bold'),
    `Expected bold/black weight, got classes: "${wordmark.className}"`
  );
});

