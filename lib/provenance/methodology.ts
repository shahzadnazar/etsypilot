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
  /**
   * What this provenance class means FOR THIS METRIC, where the canonical
   * sentence is wrong here.
   *
   * FOUND BY READING THE DRAWER. PROVENANCE_DEFINITION.VERIFIED is "Etsy
   * returned it for your own shop. Exact." — correct on every seller screen
   * and false on every operator one, where a verified figure is a count of
   * rows in OUR OWN tables and Etsy was never asked. The operator console
   * makes no Etsy call at all, so the drawer was crediting a source the
   * figure had not touched.
   *
   * An override rather than a broader canonical sentence: that sentence is
   * the published definition on the Methodology page, and loosening it to
   * cover both would make the seller-facing promise vaguer to fix an
   * operator-facing screen.
   */
  definition?: string
  /** Anchor on the full Methodology page. */
  readMoreHref?: string
}

/*
 * The catalogue. Keyed by metric so any surface can render the same explanation
 * without restating it - the Methodology page and the drawer read from here.
 */
/**
 * What VERIFIED means in the operator console.
 *
 * Written once rather than five times, because five copies of a definition
 * become five definitions.
 */
const OUR_OWN_RECORDS =
  'Counted from EtsyPilot\u2019s own tables, where we are the system of record. Nothing was modelled, and Etsy was not asked \u2014 the operator console makes no Etsy call at all.'

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
    /*
     * UTC, like every other card on this page.
     *
     * This said "in your shop time zone", which was the pre-D24 answer and
     * survived the decision that replaced it. It is the worst place for a stale
     * claim: the Methodology page is where a seller goes to find out whether a
     * period boundary means what they think it means, and one card quietly
     * disagreeing with the other eleven is how they conclude nothing here is
     * reliable.
     */
    method: 'A count of receipts in the period, bounded in UTC.',
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
    /*
     * No coverage figure here on purpose (D34). Coverage is measured per shop
     * and per period; a number written into this catalogue would be an authored
     * one, and the drawer is exactly where a seller goes to check.
     */
    coverageLabel: 'of order value has a confirmed cost',
    limitations: [
      'Revenue and fees are verified; the cost lines are yours to supply, so accuracy follows what you entered.',
      'Where a listing has no confirmed cost, your default cost rule supplies one. That share of net profit rests on your rule, not on a cost you confirmed.',
    ],
    exclusions: [
      'No per-order profit is computed without a confirmed cost, so those orders are blank in the ledger and excluded from its column totals.',
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

  keywordCompetition: {
    metric: 'Competition',
    type: 'ESTIMATED',
    source: 'Public marketplace signals · listings observed to match the term',
    method:
      'Counted from listings observed for the term, then placed in a band: under 8,000 low, under 25,000 medium, above that high.',
    confidence: 'MODERATE',
    limitations: [
      'A band, not a ranking difficulty score. EtsyPilot does not model Etsy ranking and no one outside Etsy can.',
      'Observed, not exhaustive — Etsy paginates and rotates search results.',
    ],
    readMoreHref: '/data/methodology#keyword-competition',
  },

  keywordOpportunity: {
    metric: 'Opportunity',
    type: 'CALCULATED',
    source: 'Modelled demand and observed competing listings',
    method:
      'Modelled demand divided by observed competing listings, scaled to 0-100. A visible formula over two estimated inputs.',
    limitations: [
      'Inherits the uncertainty of both inputs — it is not more precise than the ranges it came from.',
      'Not a prediction of ranking or sales. Etsy publishes neither.',
      'Blank wherever demand could not be modelled. A score over a missing input would be invented.',
    ],
    readMoreHref: '/data/methodology#keyword-opportunity',
  },

  listingHealth: {
    metric: 'Health score',
    type: 'CALCULATED',
    source: 'Your listings, your thresholds and your verified revenue',
    method:
      'Each listing’s share of your verified revenue, weighted by the severity of its worst issue, subtracted from 100. Errors count fully; warnings count a third.',
    limitations: [
      'Listings with no orders in the period carry no weight, so a broken listing that never sold does not move the score.',
      'Severity weights are EtsyPilot thresholds, not Etsy requirements — except the rules that say they block publishing, which are Etsy’s.',
      'Says how much of your money sits behind a broken listing, not how many listings are broken.',
    ],
    readMoreHref: '/data/methodology#listing-health',
  },

  competitorSales: {
    metric: 'Competitor estimated sales',
    type: 'ESTIMATED',
    source: 'Public marketplace signals · review velocity and public sales counter',
    method: 'Modelled over a 90-day observation window and published as a range.',
    confidence: 'MODERATE',
    limitations: [
      'Only the shop owner can see their real Etsy figures. These can differ materially.',
      'Excludes refunds, wholesale and off-platform sales.',
      'Not comparable with your own verified figures — one is measured, the other is modelled.',
    ],
    readMoreHref: '/data/methodology#competitor-sales',
  },

  shopPulseBaseline: {
    metric: 'Shop Pulse baseline',
    type: 'CALCULATED',
    source: 'Your own order history',
    method:
      'A rolling 90-day expected range from your own orders, by weekday. Recorded changes are tested first; the unexplained figure is then measured on the residual — the orders left after every correlated change is accounted for — so the same shortfall is never reported twice and an unexplained percentage is always net of what the recorded changes already explain.',
    confidence: 'MODERATE',
    coverage: 88,
    coverageLabel: 'of listings have enough history to baseline',
    limitations: [
      'Correlation is not cause.',
      'Ninety days cannot separate seasonality from a change you made.',
      'Etsy does not release views or impressions, so diagnoses rest on orders alone.',
      'Where too few orders fall on the affected listings to measure a rate, the result is reported as unknown rather than as a percentage the sample cannot support.',
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

  /* ─────────────────────── the operator console ─────────────────────────
   *
   * A badge promises an explanation; ProvenanceButton is what makes the
   * promise clickable, and it renders a STATIC badge for any metric with no
   * entry here — a dead control is worse than no control. So the operator
   * figures had a badge and no explanation behind it until these existed.
   *
   * They are the same shape as the seller entries deliberately. The operator
   * screens are where "why is this seller's figure wrong" gets answered, and
   * an operator reading a looser explanation than the seller can read is the
   * wrong way round.
   */

  operatorUsage: {
    metric: 'Usage against a plan limit',
    type: 'CALCULATED',
    source: 'EtsyPilot database · listings, ai_generations, subscriptions',
    method:
      'Counted from the underlying rows at render time and compared with the limit on the plan in force. usage_records.used is never written by anything in the product, so there is no stored counter to read and this is not a reading of one.',
    limitations: [
      'Counted at render time, not stored. A figure the seller saw a moment ago can differ if a listing or a generation landed in between.',
      'An account with no subscription row is measured against nothing rather than against Free. Never having been through billing and choosing the free tier are different facts.',
    ],
    readMoreHref: '/data/methodology#calculated',
  },

  operatorPlanMix: {
    metric: 'Accounts by plan',
    type: 'VERIFIED',
    definition: OUR_OWN_RECORDS,
    source: 'EtsyPilot database · subscriptions',
    method:
      'A count of subscription rows by plan, with every plan present including the ones at zero. Nothing is modelled: the row is there or it is not.',
    coverage: 100,
    coverageLabel: 'of accounts, including those with no billing row at all',
    limitations: [
      'This is EtsyPilot\u2019s own copy of the billing state, not the payment processor\u2019s. It is what the product enforces limits against, which is the right thing for this screen and the wrong thing for reconciling a charge.',
    ],
  },

  operatorSubscriptionStatus: {
    metric: 'Accounts by billing status',
    type: 'VERIFIED',
    definition: OUR_OWN_RECORDS,
    source: 'EtsyPilot database · subscriptions',
    method:
      'A count of subscription rows by their CURRENT status. Every status is present, including the ones at zero, and rows with an unrecognised status are counted in their own bucket rather than dropped.',
    limitations: [
      'A subscription row carries its current status, not its history. An account that trialled and converted is indistinguishable from one that signed up paying.',
    ],
  },

  operatorOperationState: {
    metric: 'Bulk operations by state',
    type: 'VERIFIED',
    definition: OUR_OWN_RECORDS,
    source: 'EtsyPilot database · bulk_operations',
    method:
      'A count of bulk_operations rows by their stored state, every state present. An unrecognised state is counted in its own bucket rather than folded into a neighbour.',
    limitations: [
      '"Stuck" is a separate, calculated view over the same rows: it compares how long a job has been applying against a threshold this product chose, and is not a state any row carries.',
    ],
  },

  operatorConnectionHealth: {
    metric: 'Etsy connections by state',
    type: 'VERIFIED',
    definition: OUR_OWN_RECORDS,
    source: 'EtsyPilot database · etsy_connections, shops',
    method:
      'A count of shops by the connection state derived from their grant. Revoked, expired and never-connected are facts the row carries. Expiring soon and stale sync are comparisons against thresholds this product chose, and those two counts are reported as calculated rather than verified.',
    limitations: [
      'Nothing here is read from Etsy. The operator console makes no Etsy call at all, so every state is what OUR records say about a grant, not what Etsy currently thinks of it.',
    ],
  },

  operatorOnboarding: {
    metric: 'Onboarding funnel',
    type: 'UNAVAILABLE',
    definition:
      'The column exists and nothing writes it. We show what it says rather than a number we worked out, because there is nothing here to work out.',
    source: 'EtsyPilot database · users.onboarding_state',
    method:
      'Read from users.onboarding_state, which defaults to NOT_STARTED and which nothing in the product writes after provisioning sets it. The count is an accurate report of a stored value and not a measurement of how far anyone gets.',
    limitations: [
      'This is what the column says. Until something writes it, the funnel cannot tell a seller who stopped at step one from a seller who finished.',
    ],
  },

  operatorAiAcceptance: {
    metric: 'AI acceptance rate',
    type: 'CALCULATED',
    definition:
      'A share of the generations a seller has actually DECIDED on, computed from EtsyPilot\u2019s own rows. Reproducible, and it is not a verdict on the AI where few have been decided.',
    source: 'EtsyPilot database · ai_generations',
    method:
      'Accepted divided by decided, where decided is accepted plus rejected. Drafts are NOT in the denominator: a draft is undecided, and counting it as "not accepted" would report a shop that generated fifty drafts this morning as having a 0% acceptance rate — a claim about the AI made out of the seller not having got to them yet.',
    coverageLabel: 'of generations have been decided',
    limitations: [
      'Unavailable, not zero, when nothing has been decided. A shop with only drafts has no acceptance rate, and 0% would be the most misleading number this screen could carry.',
      'The generated text itself is never read to produce this. Only the status is.',
    ],
  },

  operatorShopMix: {
    metric: 'Shops by what is behind them',
    type: 'VERIFIED',
    definition: OUR_OWN_RECORDS,
    source: 'EtsyPilot database · shops, etsy_connections',
    method:
      'A count of shop rows by whether they have a real Etsy grant, no grant, or are a demo shop. A demo shop is counted as neither connected nor unconnected: it is a shop with no Etsy behind it by design.',
  },
}

export function getMethodology(key: string): Methodology | null {
  return METHODOLOGIES[key] ?? null
}
