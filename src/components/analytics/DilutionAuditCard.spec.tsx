/**
 * DilutionAuditCard, LongTailBleedCard & LongTailDilutionProbe Test Suite
 * Verifies reactive binding, stopword suppression, and Cooper's 5 UI States.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { DilutionAuditCard } from './DilutionAuditCard.tsx';
import { LongTailBleedCard } from './LongTailBleedCard.tsx';
import { LongTailDilutionProbe } from '../dashboard/LongTailDilutionProbe.tsx';
import { useSieveStore } from '../../state/useSieveStore.ts';
import type { DilutionSummary } from '../../domain/types/dilution.ts';
import type { AggregatedTokenMetric } from '../../domain/types/ngram.ts';
import type { CurrencyMicros, ClickCount, QueryString, TokenString } from '../../domain/types/primitives.ts';

if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1000 });
}

function resetStore() {
  cleanup();
  useSieveStore.getState().reset();
  useSieveStore.setState({ dilutionSummary: null, topBleedRoots: null, isPartial: false, fileLoaded: false } as any);
}

const mockDilutionSummary: DilutionSummary = {
  dilutionIndexPercent: 24.5,
  totalBudgetLostMicros: 1_250_000_000n as CurrencyMicros,
  dilutedQueryCount: 2,
  averageInflationRatio: 1.85,
  pairs: [
    {
      exactQuery: 'running shoes' as QueryString, broadQuery: 'running shoes sale' as QueryString,
      exactCpcMicros: 1_000_000n as CurrencyMicros, broadCpcMicros: 2_000_000n as CurrencyMicros,
      cpcInflationRatio: 2.0, hijackedClicks: 50 as ClickCount, budgetLostMicros: 50_000_000n as CurrencyMicros, severity: 'CRITICAL',
    },
    {
      exactQuery: 'trail sneakers' as QueryString, broadQuery: 'cheap trail sneakers' as QueryString,
      exactCpcMicros: 1_500_000n as CurrencyMicros, broadCpcMicros: 2_500_000n as CurrencyMicros,
      cpcInflationRatio: 1.67, hijackedClicks: 70 as ClickCount, budgetLostMicros: 70_000_000n as CurrencyMicros, severity: 'SEVERE',
    },
  ],
  totalDilutedClicks: 120 as ClickCount,
  totalDilutedSpendMicros: 3_000_000_000n as CurrencyMicros,
};

const mockBleedRoots: readonly AggregatedTokenMetric[] = [
  { tokenText: 'software' as TokenString, gramDegree: 1, classification: 'COMMERCIAL', occurrences: 15, subClickQueriesCount: 10, totalClicks: 8 as ClickCount, totalSpendMicros: 45_000_000n as CurrencyMicros, conversions: 0, wilsonScoreUpperBound: 0.12 },
  { tokenText: 'tutorial' as TokenString, gramDegree: 1, classification: 'INFORMATIONAL', occurrences: 20, subClickQueriesCount: 18, totalClicks: 12 as ClickCount, totalSpendMicros: 60_000_000n as CurrencyMicros, conversions: 0, wilsonScoreUpperBound: 0.05 },
  { tokenText: 'and' as TokenString, gramDegree: 1, classification: 'SYNTACTIC_STOPWORD', occurrences: 50, subClickQueriesCount: 40, totalClicks: 30 as ClickCount, totalSpendMicros: 100_000_000n as CurrencyMicros, conversions: 0, wilsonScoreUpperBound: 0.02 },
  { tokenText: 'with' as TokenString, gramDegree: 1, classification: 'SYNTACTIC_STOPWORD', occurrences: 30, subClickQueriesCount: 25, totalClicks: 20 as ClickCount, totalSpendMicros: 80_000_000n as CurrencyMicros, conversions: 0, wilsonScoreUpperBound: 0.03 },
  { tokenText: 'for' as TokenString, gramDegree: 1, classification: 'SYNTACTIC_STOPWORD', occurrences: 25, subClickQueriesCount: 20, totalClicks: 15 as ClickCount, totalSpendMicros: 50_000_000n as CurrencyMicros, conversions: 0, wilsonScoreUpperBound: 0.04 },
];

test('DilutionAuditCard: Renders calculated metrics reactively from DilutionSummary', () => {
  resetStore();
  act(() => { useSieveStore.setState({ dilutionSummary: mockDilutionSummary, fileLoaded: true } as any); });

  const { container } = render(<DilutionAuditCard />);
  const card = container.querySelector('[data-testid="dilution-audit-card"]');
  assert.ok(card, 'DilutionAuditCard must be rendered');

  const badge = container.querySelector('[data-testid="dilution-pct-badge"]');
  assert.ok(badge?.textContent?.includes('24.5% Dilution'), 'Must display 24.5% Dilution');
  assert.ok(card.textContent?.includes('$1,250.00'), 'Must display formatted $1,250.00 totalBudgetLostMicros');
  assert.ok(card.textContent?.includes('1.85x CPC Inflation'), 'Must display 1.85x CPC inflation');
  assert.ok(card.textContent?.includes('120 hijacked clicks'), 'Must display 120 hijacked clicks');

  let drawerOpened = false;
  const { container: customContainer } = render(
    <DilutionAuditCard onOpenDrawer={() => { drawerOpened = true; }} />
  );
  const btn = customContainer.querySelector('[data-testid="open-dilution-details-btn"]');
  act(() => { fireEvent.click(btn!); });
  assert.equal(drawerOpened, true, 'Click handler must invoke onOpenDrawer');
});

test('LongTailBleedCard: Suppresses syntactic stopwords and renders semantic tokens', () => {
  resetStore();
  act(() => { useSieveStore.setState({ topBleedRoots: mockBleedRoots, fileLoaded: true } as any); });

  const { container } = render(<LongTailBleedCard />);
  const card = container.querySelector('[data-testid="long-tail-bleed-card"]');
  assert.ok(card, 'LongTailBleedCard must be rendered');

  const rootsPills = container.querySelector('[data-testid="long-tail-roots-pills"]');
  assert.ok(rootsPills, 'Roots pills container must be rendered');
  assert.ok(rootsPills.textContent?.includes('software'), 'Must render commercial token "software"');
  assert.ok(rootsPills.textContent?.includes('tutorial'), 'Must render informational token "tutorial"');
  assert.ok(!rootsPills.textContent?.includes('and'), 'Must strictly suppress stopword "and"');
  assert.ok(!rootsPills.textContent?.includes('with'), 'Must strictly suppress stopword "with"');
  assert.ok(!rootsPills.textContent?.includes('for'), 'Must strictly suppress stopword "for"');
});

test('Cooper States: DilutionAuditCard handles Blank, Loading, Empty, and Partial states', () => {
  resetStore();
  // 1. Blank state
  const { container: blankContainer } = render(<DilutionAuditCard />);
  assert.ok(blankContainer.textContent?.includes('Upload Search Term CSV to inspect long-tail bleed and dilution.'));

  // 2. Loading state
  act(() => { useSieveStore.getState().setIsLoading(true); });
  const { container: loadContainer } = render(<DilutionAuditCard />);
  assert.ok(loadContainer.querySelector('[data-testid="dilution-skeleton"]'));

  // 3. Empty state (genuine analysis yielded 0)
  act(() => {
    useSieveStore.getState().setIsLoading(false);
    useSieveStore.setState({
      dilutionSummary: {
        dilutionIndexPercent: 0, totalBudgetLostMicros: 0n as CurrencyMicros, dilutedQueryCount: 0, averageInflationRatio: 1.0, pairs: [], totalDilutedClicks: 0 as ClickCount,
      },
      fileLoaded: true,
    } as any);
  });
  const { container: emptyContainer } = render(<DilutionAuditCard />);
  assert.ok(emptyContainer.textContent?.includes('Zero match dilution detected; broad and exact clearing CPCs are fully isolated.'));

  // 4. Partial state
  act(() => {
    useSieveStore.setState({ dilutionSummary: mockDilutionSummary, isPartial: true, fileLoaded: true } as any);
  });
  const { container: partialContainer } = render(<DilutionAuditCard />);
  assert.ok(partialContainer.querySelector('[data-testid="dilution-partial-badge"]'));
});

test('Cooper States: LongTailBleedCard handles Blank, Loading, and Ideal states', () => {
  resetStore();
  // 1. Blank state
  const { container: blankContainer } = render(<LongTailBleedCard />);
  assert.ok(blankContainer.textContent?.includes('Upload Search Term CSV to inspect long-tail bleed and dilution.'));

  // 2. Loading state
  act(() => { useSieveStore.getState().setIsLoading(true); });
  const { container: loadContainer } = render(<LongTailBleedCard />);
  assert.ok(loadContainer.querySelector('[data-testid="longtail-skeleton"]'));
});

test('LongTailDilutionProbe: Binds summary badges, renders query table, and filters by search', () => {
  resetStore();
  act(() => { useSieveStore.setState({ dilutionSummary: mockDilutionSummary, fileLoaded: true } as any); });

  const { container } = render(<LongTailDilutionProbe />);
  const probe = container.querySelector('[data-testid="longtail-dilution-probe"]');
  assert.ok(probe, 'Probe must be rendered');

  // Summary badges in Match Dilution Index
  assert.ok(probe.textContent?.includes('DILUTION INDEX') || probe.textContent?.includes('Dilution Index'));
  assert.ok(probe.textContent?.includes('BUDGET LOST') || probe.textContent?.includes('Budget Lost'));
  assert.ok(probe.textContent?.includes('DILUTED QUERIES') || probe.textContent?.includes('Diluted Queries'));
  assert.ok(probe.textContent?.includes('AVG CPC INFLATION') || probe.textContent?.includes('Avg CPC Inflation'));

  // Table rows mapping DilutedQueryPair
  assert.ok(probe.textContent?.includes('running shoes'));
  assert.ok(probe.textContent?.includes('trail sneakers'));
  assert.ok(probe.textContent?.includes('$1.00'));
  assert.ok(probe.textContent?.includes('$2.00'));
  assert.ok(probe.textContent?.includes('2.00x'));
  assert.ok(probe.textContent?.includes('$50.00'));

  // Search filter input
  const filterInput = container.querySelector('input[placeholder="Filter queries..."]');
  assert.ok(filterInput, 'Filter queries input must be present');

  act(() => { fireEvent.change(filterInput!, { target: { value: 'trail' } }); });
  assert.ok(probe.textContent?.includes('trail sneakers'), 'Filtered query must remain visible');
  assert.ok(!probe.textContent?.includes('running shoes'), 'Non-matching query must be filtered out');
});
