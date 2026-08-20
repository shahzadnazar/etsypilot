/*
 * The methodology content model (artboard 93).
 *
 * A provenance badge promises an explanation. This is the shape that keeps it.
 * Seven fields, in the order the Methodology page uses them:
 *
 *   source · method · freshness · confidence · coverage · limitations · exclusions
 *
 * `coverage` is the field the original tooltips lacked. It is what stops a
 * partial number reading as a complete one, so it is carried here rather than
 * only on the surfaces that happened to remember it.
 */

import type { Confidence, ProvenanceType } from './types'

export interface Methodology {
  /** What the metric is called on screen. */
  metric: string
  type: ProvenanceType
  /** Where the inputs came from. A category, not a URL. */
  source: string
  /** How the number was produced. Plain language. */
  method: string
  /** When the underlying observation was made, not when this rendered. */
  freshness?: string
  confidence?: Confidence
  /** Percent of the relevant population this figure covers, 0-100. */
  coverage?: number
  /** Wording for the coverage line, e.g. "of order value has a confirmed cost". */
  coverageLabel?: string
  /** What this number cannot tell you. Required for ESTIMATED. */
  limitations?: string[]
  /** What is deliberately left out of the calculation. */
  exclusions?: string[]
  /** Anchor on the full Methodology page. */
  readMoreHref?: string
}

/*
 * The catalogue. Keyed by metric so any surface can render the same explanation
 * without restating it - the Methodology page and the drawer read from here.
 */
export const METHODOLOGIES: Record<string, Methodology> = {
  grossSales: {
    metric: 'Gross sales',
    type: 'VERIFIED',
    source: 'Etsy Open API v3 · your order receipts',
    method: 'Summed from the receipts Etsy released for your own shop. Exact, not modelled.',
    coverage: 100,
    coverageLabel: 'of orders in the period',
    exclusions: ['Orders outside the selected period.', 'Sales made off Etsy.'],
    readMoreHref: '/data/methodology#gross-sales',
  },

  orders: {
    metric: 'Orders',
    type: 'VERIFIED',
    source: 'Etsy Open API v3 · your order receipts',
    method: 'A count of receipts in the period, in your shop time zone.',
    coverage: 100,
    coverageLabel: 'of orders in the period',
    readMoreHref: '/data/methodology#orders',
  },

  netProfit: {
    metric: 'Net profit',
    type: 'CALCULATED',
    source: 'Your receipts and your cost setup',
    method:
      'Gross revenue − Etsy fees − payment processing − Offsite Ads − shipping − COGS − labour − other costs. Computed from the eight lines, never stored as a figure of its own.',
    confidence: 'MODERATE',
    coverage: 62,
    coverageLabel: 'of order value has a confirmed cost',
    limitations: [
      'Revenue and fees are verified; the cost lines are yours to supply, so accuracy follows what you entered.',
    ],
    exclusions: [
      'Orders with no confirmed product cost are excluded rather than assigned an assumed one, so net profit is a floor.',
      'Sales tax, VAT and refunds outside the period.',
    ],
    readMoreHref: '/data/methodology#net-profit',
  },

  activeListings: {
    metric: 'Active listings',
    type: 'VERIFIED',
    source: 'Etsy Open API v3 · your shop',
    method: 'A count of listings Etsy reports as active at the last sync.',
    coverage: 100,
    coverageLabel: 'of your catalogue',
    exclusions: ['Drafts, expired and inactive listings are counted separately.'],
    readMoreHref: '/data/methodology#active-listings',
  },

  keywordDemand: {
    metric: 'Keyword demand',
    type: 'ESTIMATED',
    source: 'Public autocomplete and listing-count signals, sampled weekly',
    method:
      'Signals are normalised into a monthly band. We publish the band, never a midpoint.',
    freshness: '2026-08-10T06:02:00.000Z',
    confidence: 'MODERATE',
    coverage: 100,
    coverageLabel: 'of the four supported locales',
    limitations: [
      'Etsy publishes no search volume. This is not Etsy search data and does not represent Etsy’s internal figures.',
      'Treat two terms with overlapping bands as equal.',
      'Confidence drops below 100 competing listings.',
    ],
    readMoreHref: '/data/methodology#keyword-demand',
  },

  shopPulseBaseline: {
    metric: 'Shop Pulse baseline',
    type: 'CALCULATED',
    source: 'Your own order history',
    method: 'A rolling 90-day expected range from your own orders, by weekday.',
    confidence: 'MODERATE',
    coverage: 88,
    coverageLabel: 'of listings have enough history to baseline',
    limitations: [
      'Correlation is not cause.',
      'Ninety days cannot separate seasonality from a change you made.',
      'Etsy does not release views or impressions, so diagnoses rest on orders alone.',
    ],
    readMoreHref: '/data/methodology#shop-pulse-baseline',
  },

  listingViews: {
    metric: 'Listing views',
    type: 'UNAVAILABLE',
    source: 'Etsy Open API v3',
    method:
      'Etsy does not expose listing views through the public API, so EtsyPilot shows nothing rather than a modelled figure.',
    limitations: ['Import your Etsy Stats CSV to add this metric. It will not be estimated.'],
    readMoreHref: '/data/methodology#unavailable',
  },
}

export function getMethodology(key: string): Methodology | null {
  return METHODOLOGIES[key] ?? null
}
