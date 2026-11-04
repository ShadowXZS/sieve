/**
 * CurrencySelector Component (Phase 9)
 *
 * Implements an unobtrusive multi-currency selector for the application header.
 * Supports manual override strictly across: '$', '₹' (INR), '€' (EUR), '¥' (JPY), and '£' (GBP).
 * Employs tabular-nums font-mono to eliminate layout jitter on currency transitions.
 */

import React from 'react';
import { useSieveStore, SUPPORTED_CURRENCIES, type SupportedCurrency } from '../../state/useSieveStore.ts';

export interface CurrencySelectorProps {
  className?: string;
}

export const CurrencySelector: React.FC<CurrencySelectorProps> = ({ className = '' }) => {
  const { currency, setCurrency } = useSieveStore();

  const handleCycleCurrency = () => {
    const nextIdx = (SUPPORTED_CURRENCIES.indexOf(currency) + 1) % SUPPORTED_CURRENCIES.length;
    setCurrency(SUPPORTED_CURRENCIES[nextIdx], true);
  };

  return (
    <div className={`flex items-center gap-1.5 text-xs font-mono tabular-nums ${className}`}>
      {/* Segmented Currency Buttons */}
      <div
        role="group"
        aria-label="Currency Selector"
        data-testid="currency-toggle-group"
        className="flex items-center rounded-lg bg-zinc-950/80 border border-zinc-800 p-0.5 text-xs font-mono tabular-nums shadow-xs"
      >
        {SUPPORTED_CURRENCIES.map((c: SupportedCurrency) => {
          const isSelected = currency === c;
          return (
            <button
              key={c}
              type="button"
              data-testid={`currency-toggle-${c}`}
              data-currency={c}
              aria-label={`Select ${c} currency`}
              aria-pressed={isSelected}
              onClick={() => setCurrency(c, true)}
              className={`px-2 py-1 rounded text-xs font-mono font-medium transition-all duration-150 tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60 active:scale-95 ${
                isSelected
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 shadow-xs font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* Accessible Quick Cycle Toggle Button */}
      <button
        type="button"
        data-testid="currency-toggle"
        aria-label={`Toggle currency (Current: ${currency})`}
        onClick={handleCycleCurrency}
        className="sr-only"
      >
        Toggle {currency}
      </button>
    </div>
  );
};

