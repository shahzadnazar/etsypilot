/*
 * Mock market signals.
 *
 * Deterministic, seeded from the term, so the same keyword returns the same
 * ranges on every render and in every test. No Date.now(), no Math.random().
 *
 * The demo terms carry the figures from artboards 23-24 and 34. Any other term
 * is modelled from the same seeded generator, so the screen works for a term
 * the designer never drew - including the case that matters most, a term with
 * too little observation to report.
 */

import { calculated, estimated, unavailable } from '@/lib/provenance/builders'
import type { Confidence, Provenanced } from '@/lib/provenance/types'
import type {
  CompetitionBand,
  CompetitorShop,
  EstimatedRange,
  KeywordSignals,
  MarketSignalsService,
  RelatedTerm,
  TrendPoint,
} from './interface'

const SOURCE = 'Public marketplace signals'
const OBSERVED_AT = '2026-08-20T06:02:00.000Z'

const METHODOLOGY =
  'Etsy does not publish search volume. Demand is modelled from public marketplace signals — listing counts, review velocity, favourites and observed ranking movement — over a 90-day window.'

const LIMITATIONS = [
  'Not official Etsy data. Etsy publishes no search volume for anyone.',
  'Excludes ads, off-platform traffic, wholesale and refunded orders.',
  'Treat two terms with overlapping ranges as equal — the model cannot separate them.',
]

/** Terms with enough observation to report. Everything else is sparse. */
const CATALOGUE: Record<string, { demand: EstimatedRange; listings: number; trend: number; confidence: Confidence }> = {
  'birth flower necklace': { demand: { min: 14000, max: 22000 }, listings: 38000, trend: 18, confidence: 'HIGH' },
  'personalized birth flower necklace': { demand: { min: 6000, max: 9000 }, listings: 14200, trend: 24, confidence: 'HIGH' },
  'birth month flower jewelry': { demand: { min: 3000, max: 5000 }, listings: 6100, trend: 31, confidence: 'HIGH' },
  'gift for mom birth flower': { demand: { min: 2000, max: 4000 }, listings: 11800, trend: 12, confidence: 'MODERATE' },
  'dainty flower pendant gold': { demand: { min: 1000, max: 3000 }, listings: 27400, trend: 0, confidence: 'MODERATE' },
  'birth month jewelry': { demand: { min: 3000, max: 5000 }, listings: 7300, trend: 16, confidence: 'HIGH' },
  'dainty flower charm': { demand: { min: 1000, max: 3000 }, listings: 9100, trend: 9, confidence: 'MODERATE' },
  'flower pendant gold': { demand: { min: 1000, max: 2000 }, listings: 22600, trend: 4, confidence: 'MODERATE' },
  'linen apron with pockets': { demand: { min: 900, max: 1800 }, listings: 4300, trend: 7, confidence: 'MODERATE' },
  'custom pet portrait': { demand: { min: 18000, max: 26000 }, listings: 51200, trend: 11, confidence: 'HIGH' },
}

/** Observed too rarely to model. These return UNAVAILABLE, never a small number. */
const SPARSE = new Set(['november birth flower chrysanthemum', 'november birth flower'])

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFor(term: string): number {
  let h = 2166136261
  for (let i = 0; i < term.length; i += 1) {
    h ^= term.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function bandFor(listings: number): CompetitionBand {
  if (listings < 8000) return 'LOW'
  if (listings < 25000) return 'MEDIUM'
  return 'HIGH'
}

function demandOf(term: string): Provenanced<EstimatedRange> {
  const key = term.trim().toLowerCase()
  if (SPARSE.has(key)) {
    return unavailable(
      'Too few public signals were observed for this term to model demand.',
      'Try a broader term, or check back once more listings use it.',
    ) as Provenanced<EstimatedRange>
  }

  const entry = CATALOGUE[key]
  if (entry) {
    return estimated(entry.demand, {
      source: SOURCE,
      methodology: METHODOLOGY,
      confidence: entry.confidence,
      limitations: LIMITATIONS,
      freshness: OBSERVED_AT,
    })
  }

  // An unseen term still gets a modelled range, or nothing if the seed puts it
  // below the observation floor. Sparse is the common case in a real catalogue.
  const rng = mulberry32(seedFor(key))
  const base = Math.round(rng() * 9000)
  if (base < 800) {
    return unavailable(
      'Too few public signals were observed for this term to model demand.',
      'Try a broader term, or check back once more listings use it.',
    ) as Provenanced<EstimatedRange>
  }
  const spread = 0.35 + rng() * 0.3
  return estimated(
    { min: round100(base), max: round100(base * (1 + spread)) },
    {
      source: SOURCE,
      methodology: METHODOLOGY,
      confidence: base > 4000 ? 'MODERATE' : 'LOW',
      limitations: LIMITATIONS,
      freshness: OBSERVED_AT,
    },
  )
}

function competingOf(term: string): { listings: Provenanced<EstimatedRange>; band: Provenanced<CompetitionBand> } {
  const key = term.trim().toLowerCase()
  const entry = CATALOGUE[key]
  const rng = mulberry32(seedFor(key) ^ 0x9e3779b9)
  const count = entry ? entry.listings : Math.round(2000 + rng() * 40000)

  return {
    listings: estimated(
      { min: round100(count * 0.92), max: round100(count * 1.08) },
      {
        source: SOURCE,
        methodology:
          'Counted from listings observed to match the term, then widened to a range because the marketplace changes daily.',
        confidence: 'MODERATE',
        limitations: ['Observed, not exhaustive — Etsy paginates and rotates results.'],
        freshness: OBSERVED_AT,
      },
    ),
    band: estimated(bandFor(count), {
      source: SOURCE,
      methodology: `Band from the observed listing count: under 8,000 low, under 25,000 medium, above that high. Observed ${count.toLocaleString('en-US')}.`,
      confidence: 'MODERATE',
      limitations: ['A band, not a ranking difficulty score. We do not model Etsy ranking.'],
      freshness: OBSERVED_AT,
    }),
  }
}

/**
 * Opportunity is CALCULATED, not ESTIMATED: it is a visible formula over the
 * estimated inputs. Its provenance names the formula, and it returns null
 * wherever demand is unavailable, because a score over a missing input would be
 * a number invented to fill a column.
 */
function opportunityOf(
  demand: Provenanced<EstimatedRange>,
  listings: Provenanced<EstimatedRange>,
): Provenanced<number> | null {
  if (demand.value === null || listings.value === null) return null
  const midDemand = (demand.value.min + demand.value.max) / 2
  const midListings = (listings.value.min + listings.value.max) / 2
  const ratio = midDemand / Math.max(1, midListings)
  const score = Math.max(1, Math.min(100, Math.round(ratio * 160)))
  return calculated(score, 'Modelled demand divided by observed competing listings, scaled to 0-100.', {
    limitations: [
      'Built from estimated inputs, so it inherits their uncertainty.',
      'Not a prediction of ranking or sales. Etsy does not publish either.',
    ],
  })
}

function trendOf(term: string): Provenanced<number> {
  const key = term.trim().toLowerCase()
  const entry = CATALOGUE[key]
  const rng = mulberry32(seedFor(key) ^ 0x85ebca6b)
  const pct = entry ? entry.trend : Math.round((rng() - 0.4) * 40)
  return estimated(pct, {
    source: SOURCE,
    methodology: 'Change in modelled demand against the previous 30 days.',
    confidence: 'MODERATE',
    limitations: ['Direction is more reliable than magnitude at this sample size.'],
    freshness: OBSERVED_AT,
  })
}

function historyOf(term: string): TrendPoint[] {
  const key = term.trim().toLowerCase()
  const rng = mulberry32(seedFor(key) ^ 0xc2b2ae35)
  const months = [
    '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02',
    '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
  ]
  return months.map((month, i) => {
    const seasonal = 40 + Math.sin((i / 12) * Math.PI * 2 - 1.2) * 22
    const noise = (rng() - 0.5) * 10
    // Two months of the year fall below the observation floor for most terms;
    // those render dashed rather than being interpolated into a smooth line.
    const sparse = rng() < 0.12
    return { month, index: sparse ? null : Math.max(4, Math.round(seasonal + noise + 20)) }
  })
}

const INTENTS = [
  { label: 'Gifting', share: 0.64 },
  { label: 'Personalized', share: 0.48 },
  { label: 'Material', share: 0.27 },
  { label: 'Occasion', share: 0.19 },
]

const TOP_LISTINGS = [
  { title: 'Birth flower necklace, gold filled', shop: 'Aurelia Made', price: 38, reviews: 1204 },
  { title: 'Custom birth month bouquet charm', shop: 'Petal & Pine', price: 46, reviews: 806 },
  { title: 'Sterling birth flower locket set', shop: 'Nord Atelier', price: 58, reviews: 412 },
]

const RELATED: Record<string, string[]> = {
  'birth flower necklace': [
    'personalized birth flower necklace',
    'birth month flower jewelry',
    'gift for mom birth flower',
    'dainty flower pendant gold',
    'november birth flower chrysanthemum',
  ],
}

export class MockMarketSignalsService implements MarketSignalsService {
  readonly mode = 'MOCK' as const

  async getKeyword(term: string, market: string): Promise<KeywordSignals> {
    const demand = demandOf(term)
    const { listings, band } = competingOf(term)

    return {
      term,
      market,
      demand,
      competingListings: listings,
      competition: band,
      opportunity: opportunityOf(demand, listings),
      trend30d: trendOf(term),
      history: historyOf(term),
      intent: estimated(INTENTS, {
        source: SOURCE,
        methodology:
          'Share of observed listings whose title and tags match each intent. Shares overlap and do not sum to 100.',
        confidence: 'LOW',
        limitations: ['Read from listing text, not from what buyers typed. Etsy does not release that.'],
        freshness: OBSERVED_AT,
      }),
      topListings: TOP_LISTINGS,
      observedAt: OBSERVED_AT,
    }
  }

  async getRelated(term: string, market: string): Promise<RelatedTerm[]> {
    void market
    const terms = RELATED[term.trim().toLowerCase()] ?? []
    return terms.map((t) => {
      const demand = demandOf(t)
      const { listings, band } = competingOf(t)
      const sparse = demand.value === null
      return {
        term: t,
        demand,
        competition: sparse ? null : band,
        opportunity: opportunityOf(demand, listings),
        trend30d: sparse ? null : trendOf(t),
        wordCount: t.split(/\s+/).length,
        relevance: sparse ? 'LOW' : t.includes('birth flower') ? 'HIGH' : 'MODERATE',
      }
    })
  }

  async getCompetitor(shopName: string): Promise<CompetitorShop> {
    return {
      name: shopName,
      location: 'Portland, United States',
      openedYear: 2019,
      activeListings: 214,
      reviews: 9842,
      reviewsAdded30d: 214,
      medianPrice: 42,
      newListings30d: 18,
      removedListings30d: 4,
      monthlySales: estimated(
        { min: 640, max: 980 },
        {
          source: SOURCE,
          methodology: 'Modelled from review velocity and public sales counter movement over 90 days.',
          confidence: 'MODERATE',
          limitations: [
            'Only the shop owner can see their real Etsy figures.',
            'Can differ materially from actual results.',
          ],
          freshness: OBSERVED_AT,
        },
      ),
      monthlyRevenue: estimated(
        { min: 24000, max: 38000 },
        {
          source: SOURCE,
          methodology: 'Modelled sales multiplied by observed median price across active listings.',
          confidence: 'MODERATE',
          limitations: ['Excludes refunds, wholesale and off-platform sales.'],
          freshness: OBSERVED_AT,
        },
      ),
      topTags: [
        { tag: 'birth flower', count: 184 },
        { tag: 'personalized gift', count: 171 },
        { tag: 'gold necklace', count: 148 },
        { tag: 'gift for mom', count: 132 },
        { tag: 'dainty jewelry', count: 96 },
      ],
      observedAt: OBSERVED_AT,
    }
  }

  async suggest(prefix: string, market: string): Promise<string[]> {
    void market
    const p = prefix.trim().toLowerCase()
    if (p.length === 0) return Object.keys(CATALOGUE).slice(0, 6)
    return Object.keys(CATALOGUE).filter((k) => k.includes(p)).slice(0, 6)
  }
}

function round100(n: number): number {
  return Math.round(n / 100) * 100
}
