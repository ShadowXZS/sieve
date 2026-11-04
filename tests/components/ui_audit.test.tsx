/**
 * UI Audit Test Suite (Phase: Red)
 *
 * Asserts:
 * 1. Visual badge "60/120 FPS Validated" is NOT present in ThresholdControls.
 * 2. Layout footer contains strictly "Sieve © 2026" without verbose telemetry lines.
 * 3. FileDropzone subtitle renders "Up to 600MB processed in background workers".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

import { ThresholdControls } from '../../src/components/sliders/ThresholdControls.tsx';
import { FileDropzone } from '../../src/components/dropzone/FileDropzone.tsx';
import { AppShell } from '../../src/components/layout/AppShell.tsx';

// Viewport mocks for Happy-DOM
if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    value: 1000,
  });
}

test('UI Audit: ThresholdControls does NOT render "60/120 FPS Validated" badge button', () => {
  cleanup();
  const { container } = render(<ThresholdControls />);

  const text = container.textContent || '';
  assert.strictEqual(
    text.includes('60/120 FPS Validated'),
    false,
    'ThresholdControls must NOT render the "60/120 FPS Validated" badge element'
  );
});

test('UI Audit: Layout footer contains strictly "Sieve © 2026"', () => {
  cleanup();
  // Render AppShell with its default layout footer
  const { container } = render(
    <AppShell>
      <div>Analytical Workbench Content</div>
    </AppShell>
  );

  const footer = container.querySelector('footer');
  assert.ok(footer, 'AppShell must render a footer element');
  assert.strictEqual(
    footer.textContent?.trim(),
    'Sieve © 2026',
    'Footer text must be strictly "Sieve © 2026"'
  );
  assert.strictEqual(
    footer.className.includes('text-center') &&
      footer.className.includes('py-4') &&
      footer.className.includes('text-xs') &&
      footer.className.includes('text-zinc-500') &&
      footer.className.includes('font-mono'),
    true,
    'Footer element must apply standard classes: text-center py-4 text-xs text-zinc-500 font-mono'
  );
});

test('UI Audit: FileDropzone text displays "Up to 600MB processed in background workers"', () => {
  cleanup();
  const { container } = render(<FileDropzone />);

  const text = container.textContent || '';
  assert.ok(
    text.includes('Up to 600MB processed in background workers'),
    'FileDropzone description must display "Up to 600MB processed in background workers"'
  );
  assert.strictEqual(
    text.includes('Up to 500MB'),
    false,
    'FileDropzone description must no longer mention obsolete "Up to 500MB"'
  );
});

