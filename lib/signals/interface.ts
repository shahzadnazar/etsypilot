/*
 * Modelled market signals.
 *
 * Deliberately NOT part of EtsyService.
 *
 * Etsy does not publish keyword search volume, competitor sales, or anything
 * else on this interface. Every figure here is modelled from public marketplace
 * observation - listing counts, review velocity, favourites, observed ranking
 * movement. Putting it behind the Etsy adapter would make it look like Etsy data
 * one refactor later, and the badge would be the only thing standing between a
 * seller and that mistake.
 *
 * Two consequences follow from the separation and are enforced by the types:
 *
 *   1. Every metric returns Provenanced<EstimatedRange>, not a number. An
 *      estimate that can be rendered as a single figure will eventually be
 *      rendered as a single figure.
 *
 *   2. A term with too little observation returns UNAVAILABLE with a null
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
  /** Modelled monthly searches. Null when observation is too sparse. */
  demand: Provenanced<EstimatedRange>
  /** Competing listings observed, and the band that follows from it. */
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
  /** Share of observed listings whose text matches each intent, 0-1. */
  intent: Provenanced<{ label: string; share: number }[]>
  /** Public listings ranking for the term. Observable, so no estimate needed. */
  topListings: { title: string; shop: string; price: number; reviews: number }[]
  /** When the underlying observation was taken. */
  observedAt: string
}

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
  /** Publicly visible on the shop page. Observation, not estimation. */
  activeListings: number
  reviews: number
  reviewsAdded30d: number
  medianPrice: number
  newListings30d: number
  removedListings30d: number
  monthlySales: Provenanced<EstimatedRange>
  monthlyRevenue: Provenanced<EstimatedRange>
  topTags: { tag: string; count: number }[]
  observedAt: string
}

export interface MarketSignalsService {
  readonly mode: 'MOCK' | 'LIVE'
  getKeyword(term: string, market: string): Promise<KeywordSignals>
  getRelated(term: string, market: string): Promise<RelatedTerm[]>
  getCompetitor(shopName: string): Promise<CompetitorShop>
  /** Terms the model has enough observation to report on at all. */
  suggest(prefix: string, market: string): Promise<string[]>
}
