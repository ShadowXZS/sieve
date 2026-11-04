/**
 * Curated Intent Exclusion Dictionaries (Phase 5)
 *
 * Provides standardized domain-specific negative keyword preset libraries
 * covering B2B, E-Commerce, Local Services, and Information/Job-seeking waste.
 * Uses token-boundary matching to prevent false-positive substring collisions.
 */

import type { PersistedNegativeKeyword } from '../workers/protocol.ts';

export interface IntentPreset {
  id: string;
  name: string;
  description: string;
  category: 'b2b' | 'ecommerce' | 'local_services' | 'general';
  terms: string[];
}

export const INTENT_PRESETS: Record<string, IntentPreset> = {
  B2B: {
    id: 'B2B',
    name: 'B2B & SaaS Waste Filters',
    description: 'Filters out job seekers, free/crack hunters, students, and low-intent DIY informational searchers.',
    category: 'b2b',
    terms: [
      'free',
      'diy',
      'job',
      'jobs',
      'career',
      'careers',
      'salary',
      'salaries',
      'resume',
      'intern',
      'internship',
      'internships',
      'course',
      'courses',
      'tutorial',
      'tutorials',
      'what is',
      'template',
      'templates',
      'sample',
      'samples',
      'training',
      'association',
      'definition',
      'crack',
      'keygen',
      'warez',
      'hack',
      'torrent',
      'freeware',
      'open source',
      'interview questions',
      'pay scale',
      'glassdoor',
      'certification',
      'openings',
    ],
  },
  ECOMMERCE: {
    id: 'ECOMMERCE',
    name: 'E-Commerce Non-Buyer Filters',
    description: 'Excludes customers seeking product manuals, repair guides, second-hand bargains, or illegal streams.',
    category: 'ecommerce',
    terms: [
      'repair',
      'manual',
      'manuals',
      'wholesale',
      'used',
      'craigslist',
      'ebay',
      'how to make',
      'torrent',
      'reddit',
      'reviews',
      'coupon',
      'coupons',
      'discount code',
      'promo code',
      'voucher',
      'free shipping',
      'clearance',
      'refurbished',
      'second hand',
      'diagram',
      'schematic',
      'instructions',
      'troubleshooting',
      'broken',
      'fix',
      'replacement parts',
      'diy',
      'youtube',
    ],
  },
  LOCAL_SERVICES: {
    id: 'LOCAL_SERVICES',
    name: 'Local Services Job/Permit Filters',
    description: 'Stops ad spend on licensing inquiries, building codes, job seekers, and trade apprenticeships.',
    category: 'local_services',
    terms: [
      'jobs',
      'careers',
      'salary',
      'school',
      'schools',
      'degree',
      'certification',
      'certifications',
      'associations',
      'laws',
      'regulations',
      'diy',
      'licensing',
      'license',
      'classes',
      'course',
      'courses',
      'training',
      'hourly rate',
      'union',
      'code requirements',
      'permit',
      'permits',
      'inspection',
      'apprenticeship',
      'volunteer',
      'pro bono',
    ],
  },
};

export interface IntentMatchResult {
  matchedPresets: string[];
  matchedTokens: string[];
}

/**
 * Normalizes input text into a clean set of word tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Matches a search query against active or all intent preset dictionaries.
 * Uses whole-word boundary matching to avoid false positives (e.g. "free" won't match "freeway").
 */
export function matchIntentPresets(
  query: string,
  activePresetIds?: string[]
): IntentMatchResult {
  const normalizedQuery = ` ${query.toLowerCase().replace(/[^\w\s-]/g, ' ')} `;
  const queryTokens = new Set(tokenize(query));
  const matchedPresets = new Set<string>();
  const matchedTokens = new Set<string>();

  const targetPresetIds = activePresetIds && activePresetIds.length > 0
    ? activePresetIds
    : Object.keys(INTENT_PRESETS);

  for (const presetId of targetPresetIds) {
    const preset = INTENT_PRESETS[presetId];
    if (!preset) continue;

    for (const term of preset.terms) {
      const lowerTerm = term.toLowerCase().trim();
      if (!lowerTerm) continue;

      if (lowerTerm.includes(' ')) {
        // Multi-word phrase check (with word boundaries)
        const regex = new RegExp(`\\b${escapeRegExp(lowerTerm)}\\b`, 'i');
        if (regex.test(normalizedQuery)) {
          matchedPresets.add(preset.id);
          matchedTokens.add(lowerTerm);
        }
      } else {
        // Single token check against word set
        if (queryTokens.has(lowerTerm)) {
          matchedPresets.add(preset.id);
          matchedTokens.add(lowerTerm);
        }
      }
    }
  }

  return {
    matchedPresets: Array.from(matchedPresets),
    matchedTokens: Array.from(matchedTokens),
  };
}

/**
 * Filters a list of persisted negative keywords matching any of the specified preset IDs.
 */
export function filterKeywordsByPresets(
  keywords: PersistedNegativeKeyword[],
  presetIds: string[]
): PersistedNegativeKeyword[] {
  if (!presetIds || presetIds.length === 0) return keywords;

  return keywords.filter((kw) => {
    const match = matchIntentPresets(kw.keyword, presetIds);
    return match.matchedPresets.length > 0;
  });
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

