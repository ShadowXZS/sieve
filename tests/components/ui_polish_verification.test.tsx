/**
 * UI Polish & Layout Verification TDD Suite
 *
 * Verifies 3 critical contracts:
 * 1. Pre-boot Loader & Brand Logo Animation in index.html (eliminating cold-start white flash)
 * 2. Export Modal React Portal mounting to document.body (breaking out of virtual grid overflow: hidden)
 * 3. PDF Number Formatting & KPI Typography/Flex Layout (no decimal fractions, dynamic flex: 1, REALLOCATION YIELD title)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ExportDefModal } from '../../src/components/export/ExportDefModal.tsx';
import {
  formatConversionCount,
  formatPdfConversions,
  styles as pdfStyles,
  CARD_4_TITLE,
} from '../../src/components/pdf/ExecutiveReportPdf.tsx';

test('1. Pre-boot Loader & Brand Logo Animation: index.html dark background inline style and #preboot-loader inside #root', () => {
  const indexPath = path.resolve(process.cwd(), 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf-8');

  // Verify inline <style> block inside <head>
  const headMatch = indexHtml.match(/<head[\s\S]*?<\/head>/i);
  assert.ok(headMatch, 'index.html must contain a <head> block');
  const headContent = headMatch[0];

  const styleMatch = headContent.match(/<style[\s\S]*?>([\s\S]*?)<\/style>/i);
  assert.ok(styleMatch, '<head> must contain an inline <style> block to prevent cold-start white flash');
  const inlineCss = styleMatch[1];

  // Assert html, body has background-color: #09090b
  assert.match(
    inlineCss,
    /html\s*,\s*body\s*\{[^}]*background-color\s*:\s*#09090b/i,
    'Inline style in <head> must set background-color: #09090b for html, body'
  );

  // Assert #preboot-loader is present inside <div id="root">
  const rootMatch = indexHtml.match(/<div\s+id=["']root["'][^>]*>([\s\S]*?)<\/div>/i);
  assert.ok(rootMatch, 'index.html must contain a <div id="root"> container');
  const rootInnerHtml = rootMatch[1];

  assert.ok(
    rootInnerHtml.includes('id="preboot-loader"') || rootInnerHtml.includes("id='preboot-loader'"),
    '#preboot-loader must be present inside <div id="root">'
  );

  // Assert containing an img tag referencing /logo.svg (or fallback /sieve.svg) with class sieve-logo-anim
  const imgMatch = rootInnerHtml.match(/<img[^>]*>/i);
  assert.ok(imgMatch, '#preboot-loader must contain an <img> element');
  const imgTag = imgMatch[0];

  assert.ok(
    imgTag.includes('src="/logo.svg"') || imgTag.includes("src='/logo.svg'") || imgTag.includes('/sieve.svg'),
    'Brand logo <img> must reference /logo.svg or /sieve.svg'
  );

  assert.ok(
    imgTag.includes('sieve-logo-anim'),
    'Brand logo <img> must have class "sieve-logo-anim"'
  );
});

test('2. Modal React Portal Verification: ExportDefModal mounts to document.body, breaks out of grid container, and handles Escape', () => {
  cleanup();

  // Create an arbitrary mock container styled like the virtualized grid (with overflow: hidden)
  const mockGridContainer = document.createElement('div');
  mockGridContainer.setAttribute('data-testid', 'mock-virtual-grid');
  mockGridContainer.style.overflow = 'hidden';
  mockGridContainer.style.position = 'relative';
  mockGridContainer.style.width = '800px';
  mockGridContainer.style.height = '600px';
  document.body.appendChild(mockGridContainer);

  let isClosed = false;
  const onClose = () => {
    isClosed = true;
  };

  const { unmount } = render(
    <div className="grid-viewport" style={{ overflow: 'hidden' }}>
      <ExportDefModal isOpen={true} onClose={onClose} />
    </div>,
    { container: mockGridContainer }
  );

  // Find the modal overlay wrapper
  const modalWrapper = document.body.querySelector('.fixed.inset-0.z-50') as HTMLElement;
  assert.ok(modalWrapper, 'Modal wrapper must be rendered with "fixed inset-0 z-50" classes');

  // Assert the modal wrapper is rendered via createPortal directly under document.body,
  // and is NOT nested inside the container DOM node.
  assert.strictEqual(
    modalWrapper.parentElement,
    document.body,
    'Modal wrapper must be mounted directly under document.body via createPortal'
  );
  assert.strictEqual(
    mockGridContainer.contains(modalWrapper),
    false,
    'Modal wrapper must NOT be nested inside the virtual grid mock container DOM node'
  );

  // Assert overlay styling
  assert.ok(
    modalWrapper.className.includes('fixed') &&
      modalWrapper.className.includes('inset-0') &&
      modalWrapper.className.includes('z-50'),
    'Modal overlay must include "fixed inset-0 z-50"'
  );

  // Assert dispatching an Escape key event invokes onClose
  fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
  assert.strictEqual(isClosed, true, 'Dispatching Escape keydown event must invoke onClose');

  unmount();
  mockGridContainer.remove();
});

test('3. PDF Number Formatting & Title Length: rounds conversions to integer strings with comma formatting, flex: 1, and REALLOCATION YIELD title', () => {
  // Assert conversion counts round to integer strings with comma formatting
  const testVal1 = 1052243.1;
  const testVal2 = 2380262.4;

  const formatted1 = (formatPdfConversions ?? formatConversionCount)(testVal1);
  const formatted2 = (formatPdfConversions ?? formatConversionCount)(testVal2);

  assert.strictEqual(
    formatted1,
    '1,052,243',
    `1052243.1 must format to "1,052,243", got: "${formatted1}"`
  );
  assert.strictEqual(
    formatted2,
    '2,380,262',
    `2380262.4 must format to "2,380,262", got: "${formatted2}"`
  );

  // Edge cases
  assert.strictEqual(
    (formatPdfConversions ?? formatConversionCount)(0),
    '0',
    '0 conversions must format to "0"'
  );
  assert.strictEqual(
    (formatPdfConversions ?? formatConversionCount)(99.9),
    '100',
    '99.9 conversions must round to "100"'
  );

  // Assert Card 4 title is "REALLOCATION YIELD"
  assert.strictEqual(
    CARD_4_TITLE,
    'REALLOCATION YIELD',
    'Card 4 title must be "REALLOCATION YIELD"'
  );

  // Verify stylesheet styles assign dynamic flex width (flex: 1) rather than cramped static percentages
  const kpiCardStyle = (pdfStyles as any).kpiCard;
  assert.ok(kpiCardStyle, 'PDF stylesheet must define kpiCard style');
  assert.strictEqual(
    kpiCardStyle.flex,
    1,
    'kpiCard stylesheet must assign dynamic flex: 1 rather than cramped static percentages'
  );
  assert.strictEqual(kpiCardStyle.marginHorizontal, 3, 'kpiCard must have marginHorizontal: 3');
  assert.strictEqual(kpiCardStyle.padding, 7, 'kpiCard must have padding: 7');
  assert.strictEqual(kpiCardStyle.borderRadius, 4, 'kpiCard must have borderRadius: 4');
  assert.strictEqual(kpiCardStyle.backgroundColor, '#f8fafc', 'kpiCard must have backgroundColor: #f8fafc');
  assert.strictEqual(kpiCardStyle.borderWidth, 1, 'kpiCard must have borderWidth: 1');
  assert.strictEqual(kpiCardStyle.borderColor, '#e2e8f0', 'kpiCard must have borderColor: #e2e8f0');

  // Verify kpiTitle typography
  const kpiTitleStyle = (pdfStyles as any).kpiTitle;
  assert.ok(kpiTitleStyle, 'PDF stylesheet must define kpiTitle style');
  assert.strictEqual(kpiTitleStyle.fontSize, 7.5, 'kpiTitle must have fontSize: 7.5');
  assert.strictEqual(kpiTitleStyle.fontWeight, 'bold', 'kpiTitle must have fontWeight: "bold"');
  assert.strictEqual(kpiTitleStyle.letterSpacing, 0.2, 'kpiTitle must have letterSpacing: 0.2');
  assert.strictEqual(kpiTitleStyle.marginBottom, 3, 'kpiTitle must have marginBottom: 3');
  assert.strictEqual(kpiTitleStyle.textTransform, 'uppercase', 'kpiTitle must have textTransform: "uppercase"');

  // Verify kpiValue typography
  const kpiValueStyle = (pdfStyles as any).kpiValue;
  assert.ok(kpiValueStyle, 'PDF stylesheet must define kpiValue style');
  assert.strictEqual(kpiValueStyle.fontSize, 12.5, 'kpiValue must have fontSize: 12.5');
  assert.strictEqual(kpiValueStyle.fontWeight, 'heavy', 'kpiValue must have fontWeight: "heavy"');
  assert.strictEqual(kpiValueStyle.marginBottom, 2, 'kpiValue must have marginBottom: 2');
});

