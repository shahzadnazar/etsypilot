/*
 * Modelled market signals.
 *
 * Deliberately NOT part of EtsyService.
 *
 * Etsy does not publish keyword search volume, competitor sales, or anything
 * else on this interface. NOTHING BEHIND IT IS OBSERVED: there is one
 * implementation, MockMarketSignalsService, and it generates every figure from
 * the term it was handed. Putting this behind the Etsy adapter would make it
 * look like Etsy data one refactor later, and the badge would be the only thing
 * standing between a seller and that mistake.
 *
 * The field comments below used to describe the plan - "publicly visible on the
 * shop page", "listings observed, with the sampling error stated" - and a
 * reader had no way to tell the plan from the code. They now describe what the
 * value IS.
 *
 * Two consequences follow from the separation and are enforced by the types:
 *
 *   1. Every metric returns Provenanced<EstimatedRange>, not a number. An
 *      estimate that can be rendered as a single figure will eventually be
 *      rendered as a single figure.
 *
 *   2. A term the model has nothing for returns UNAVAILABLE with a null
 *      value. There is no shape for a fallback, so "Sparse data" cannot quietly
 *      become a small number.
 *
 * Language rule from the design: Analyze / Compare / Track. Never "spy".
 */

import type { Confidence, Provenanced } from '@/lib/provenance/types'

export interface EstimatedRange {
  min: number
  max: number
}

export type CompetitionBand = 'LOW' | 'MEDIUM' | 'HIGH'

export interface TrendPoint {
  /** Calendar month, YYYY-MM. Never passed through a zoned formatter (D24). */
  month: string
  /** Indexed demand, 0-100. Null where observation was too sparse to model. */
  index: number | null
}

export interface KeywordSignals {
  term: string
  market: string
  /** Modelled monthly searches. Null when there is nothing modelled. */
  demand: Provenanced<EstimatedRange>
  /** Modelled competing-listing count, and the band that follows from it. */
  competingListings: Provenanced<EstimatedRange>
  competition: Provenanced<CompetitionBand>
  /**
   * 0-100, CALCULATED from the two above. Null wherever demand is unavailable:
   * a score over a missing input is a number invented to fill a column.
   */
  opportunity: Provenanced<number> | null
  /** Change over the last 30 days, percent. */
  trend30d: Provenanced<number>
  /** Twelve months, oldest first. Sparse months carry null and render dashed. */
  history: TrendPoint[]
  /** Share of the modelled listings whose text matches each intent, 0-1. */
  intent: Provenanced<{ label: string; share: number }[]>
  /*
   * Sample rows, and the shop names in them are invented.
   *
   * This said "public listings ranking for the term. Observable, so no estimate
   * needed", and the Keywords page printed them under "Publicly visible on Etsy
   * right now. Observed, not modelled." They are three literals in mock.ts.
   * Nothing is ranked, nothing is visible, and no shop called Aurelia Made
   * exists.
   */
  topListings: { title: string; shop: string; price: number; reviews: number }[]
}

/*
 * ── THERE IS NO TIMESTAMP ON ANY OF THESE ─────────────────────────────
 *
 * Each of these four interfaces carried `observedAt: string`, documented as
 * "when the underlying observation was taken". Every one was the same authored
 * constant in mock.ts, rendered as "Last updated", "last observed" and "model
 * last refreshed" on four screens.
 *
 * A modelled figure has no observation time — there is nothing for the time to
 * be OF — so the field is gone rather than renamed. Removing it is what took
 * the line off the screens: the compiler found all four callers, which is not
 * true of a field left in place with a better comment on it.
 *
 * When the model's own run time becomes a real thing (a nightly job writing
 * rows, say), the honest field is `modelledAt` and the honest label is "model
 * last ran" — a different claim, added when there is something to claim.
 */

export interface RelatedTerm {
  term: string
  demand: Provenanced<EstimatedRange>
  competition: Provenanced<CompetitionBand> | null
  /** 0-100. Null wherever demand is unavailable - see opportunity(). */
  opportunity: Provenanced<number> | null
  trend30d: Provenanced<number> | null
  wordCount: number
  relevance: Confidence
}

export interface CompetitorShop {
  name: string
  location: string
  openedYear: number
  /** Modelled, though it is the kind of figure a shop page shows to anybody. */
  activeListings: number
  reviews: number
  reviewsAdded30d: number
  medianPrice: number
  newListings30d: number
  removedListings30d: number
  monthlySales: Provenanced<EstimatedRange>
  monthlyRevenue: Provenanced<EstimatedRange>
  topTags: { tag: string; count: number }[]
}

/*
 * A product observed on the marketplace (artboard 21).
 *
 * Title, shop, price, reviews, favourites and age are plain values — not
 * because they are observed (nothing here is) but because the model produces a
 * single figure for them rather than a band. Sales and revenue are
 * Provenanced<EstimatedRange> for the same reason every other modelled figure
 * is: a range cannot be rendered as a single confident number by accident.
 *
 * `opportunity` is null wherever sales are unavailable. A score computed over a
 * missing input is a number invented to fill a column.
 */
export interface ProductSignals {
  id: string
  title: string
  shop: string
  /** "Jewelry · Necklaces · personalized" — as the marketplace files it. */
  category: string
  price: number
  reviews: number
  favorites: number
  /** Modelled age of the listing, in months. */
  ageMonths: number
  digital: boolean
  monthlySales: Provenanced<EstimatedRange>
  monthlyRevenue: Provenanced<EstimatedRange>
  opportunity: Provenanced<number> | null
}

/** What the Opportunities screen can filter on, all optional. */
export interface ProductQuery {
  term: string
  market: string
  minPrice?: number
  maxPrice?: number
  /** Minimum modelled monthly sales, applied to the range's LOWER bound. */
  minSales?: number
  maxAgeMonths?: number
  digital?: boolean
}

/** A sub-segment of a niche (artboard 102). */
export interface SubNiche {
  name: string
  demand: Provenanced<EstimatedRange>
  listings: number
  priceBand: Provenanced<EstimatedRange> | null
  crowding: Provenanced<CompetitionBand> | null
}

export interface NicheSignals {
  term: string
  market: string
  demand: Provenanced<EstimatedRange>
  /** Modelled listing count, with the width the model reports it to. */
  listings: Provenanced<number>
  /** Listings per search. CALCULATED from the two above. */
  crowding: Provenanced<CompetitionBand> | null
  /** Middle 50% of the modelled listing prices. */
  priceBand: Provenanced<EstimatedRange> | null
  /** Top ten shops' share of the modelled listings, 0-100. */
  concentration: Provenanced<number> | null
  history: TrendPoint[]
  subNiches: SubNiche[]
}

export interface MarketSignalsService {
  readonly mode: 'MOCK' | 'LIVE'
  getKeyword(term: string, market: string): Promise<KeywordSignals>
  getRelated(term: string, market: string): Promise<RelatedTerm[]>
  getCompetitor(shopName: string): Promise<CompetitorShop | null>
  /** Shops this account is tracking. Modelled — and no private data anywhere. */
  listCompetitors(): Promise<CompetitorShop[]>
  /** Products matching a query. Empty is a real answer, not an error. */
  findProducts(query: ProductQuery): Promise<ProductSignals[]>
  /** Whether a niche is worth entering. Every figure is modelled. */
  getNiche(term: string, market: string): Promise<NicheSignals>
  /** Terms the modelled set covers at all. */
  suggest(prefix: string, market: string): Promise<string[]>
}
