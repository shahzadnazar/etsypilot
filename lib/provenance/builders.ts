import type { Confidence, Provenance, Provenanced } from './types'

/*
 * Builders, so a domain service states provenance in one line and cannot
 * accidentally omit the fields its class requires.
 */

export function verified(value: number | string | null, source: string, freshness?: string): Provenanced<number | string> {
  return {
    value,
    provenance: {
      type: 'VERIFIED',
      source,
      methodology: 'Received from your connected Etsy shop.',
      ...(freshness ? { freshness } : {}),
    },
  }
}

export function calculated<T>(
  value: T,
  methodology: string,
  opts: { coverage?: number; limitations?: string[] } = {},
): Provenanced<T> {
  return {
    value,
    provenance: {
      type: 'CALCULATED',
      source: 'EtsyPilot calculation',
      methodology,
      ...(opts.coverage !== undefined ? { coverage: opts.coverage } : {}),
      ...(opts.limitations ? { limitations: opts.limitations } : {}),
    },
  }
}

/**
 * An estimate requires confidence and limitations. The signature enforces it -
 * there is no way to publish an estimate without saying what it cannot tell you.
 */
export function estimated<T>(
  value: T,
  args: { source: string; methodology: string; confidence: Confidence; limitations: string[]; freshness?: string },
): Provenanced<T> {
  return {
    value,
    provenance: {
      type: 'ESTIMATED',
      source: args.source,
      methodology: args.methodology,
      confidence: args.confidence,
      limitations: args.limitations,
      ...(args.freshness ? { freshness: args.freshness } : {}),
    },
  }
}

export function sellerInput<T>(value: T, source = 'Your cost setup'): Provenanced<T> {
  return {
    value,
    provenance: {
      type: 'SELLER_INPUT',
      source,
      methodology: 'Entered or imported by a shop team member.',
      limitations: ['Only as accurate as what you enter.'],
    },
  }
}

/**
 * Unavailable carries a null value and an explanation. It never carries a
 * fallback number - "we show nothing, not a guess".
 */
export function unavailable(reason: string, remedy?: string): Provenanced<never> {
  return {
    value: null,
    provenance: {
      type: 'UNAVAILABLE',
      source: 'Etsy Open API v3',
      methodology: reason,
      ...(remedy ? { limitations: [remedy] } : {}),
    },
  }
}

/** The three unavailable metrics the API genuinely does not expose. */
export const UNAVAILABLE_LISTING_VIEWS: Provenance = unavailable(
  'Etsy does not provide listing views through the public API.',
  'Import your Etsy Stats file to add this metric.',
).provenance

export const UNAVAILABLE_SEARCH_TERMS: Provenance = unavailable(
  'Etsy does not release the search terms buyers used.',
  'This is not available anywhere, from any tool.',
).provenance

export const UNAVAILABLE_ADS_PERFORMANCE: Provenance = unavailable(
  'Etsy does not expose Etsy Ads performance through the public API.',
  'Enter your ad spend manually to include it in profit.',
).provenance
