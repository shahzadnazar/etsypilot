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
  NicheSignals,
  ProductQuery,
  ProductSignals,
  RelatedTerm,
  SubNiche,
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

  /*
   * Null for a shop the model has not observed.
   *
   * This used to return the same figures for any string it was handed, so a
   * typo produced a confident competitor profile for a shop that does not
   * exist. Absence of observation is a real answer and now has a shape.
   */
  async getCompetitor(shopName: string): Promise<CompetitorShop | null> {
    const key = shopName.trim().toLowerCase()
    const found = COMPETITORS.find((c) => c.name.toLowerCase() === key)
    return found ? buildCompetitor(found) : null
  }

  async listCompetitors(): Promise<CompetitorShop[]> {
    return COMPETITORS.map(buildCompetitor)
  }

  async findProducts(query: ProductQuery): Promise<ProductSignals[]> {
    const term = query.term.trim().toLowerCase()
    const all = PRODUCT_SEEDS.map((seed, i) => buildProduct(seed, i))

    return all
      .filter((p) => term === '' || `${p.title} ${p.category} ${p.shop}`.toLowerCase().includes(term))
      .filter((p) => (query.minPrice === undefined ? true : p.price >= query.minPrice))
      .filter((p) => (query.maxPrice === undefined ? true : p.price <= query.maxPrice))
      .filter((p) => (query.maxAgeMonths === undefined ? true : p.ageMonths <= query.maxAgeMonths))
      .filter((p) => (query.digital === undefined ? true : p.digital === query.digital))
      .filter((p) => {
        if (query.minSales === undefined) return true
        /*
         * Applied to the range's LOWER bound, on purpose. "Est. sales 30+"
         * should mean "at least 30 even on the pessimistic reading", not "the
         * optimistic end of the band clears 30" — which would let a 5–40 band
         * through a filter the seller set to exclude exactly that.
         *
         * A product with no modelled sales is excluded rather than kept: the
         * filter asks for a number, and "unknown" is not one.
         */
        const range = p.monthlySales.value
        return range !== null && range.min >= query.minSales
      })
      .sort((a, b) => (b.opportunity?.value ?? -1) - (a.opportunity?.value ?? -1))
  }

  async getNiche(term: string, market: string): Promise<NicheSignals> {
    return buildNiche(term, market)
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

/* ------------------------------------------------- competitors (artboard 34) */

interface CompetitorSeed {
  name: string
  location: string
  openedYear: number
  activeListings: number
  reviews: number
  reviewsAdded30d: number
  medianPrice: number
  newListings30d: number
  removedListings30d: number
  salesPerMonth: EstimatedRange
  topTags: { tag: string; count: number }[]
}

/*
 * Three shops, not one.
 *
 * getCompetitor used to answer any string with the same figures, so the screen
 * could only ever show one profile and a mistyped name produced a confident
 * answer about a shop that does not exist. Each of these has its own observed
 * counts, and the estimates are derived from them rather than written beside
 * them — so a revenue range and a median price can never disagree.
 */
const COMPETITORS: CompetitorSeed[] = [
  {
    name: 'Aurelia Made',
    location: 'Portland, United States',
    openedYear: 2019,
    activeListings: 214,
    reviews: 9842,
    reviewsAdded30d: 214,
    medianPrice: 42,
    newListings30d: 18,
    removedListings30d: 4,
    salesPerMonth: { min: 640, max: 980 },
    topTags: [
      { tag: 'birth flower', count: 184 },
      { tag: 'personalized gift', count: 171 },
      { tag: 'gold necklace', count: 148 },
      { tag: 'gift for mom', count: 132 },
      { tag: 'dainty jewelry', count: 96 },
    ],
  },
  {
    name: 'Field & Flax',
    location: 'Bristol, United Kingdom',
    openedYear: 2021,
    activeListings: 96,
    reviews: 1840,
    reviewsAdded30d: 41,
    medianPrice: 54,
    newListings30d: 6,
    removedListings30d: 1,
    salesPerMonth: { min: 120, max: 210 },
    topTags: [
      { tag: 'linen apron', count: 71 },
      { tag: 'natural linen', count: 68 },
      { tag: 'kitchen gift', count: 54 },
      { tag: 'stonewashed', count: 44 },
      { tag: 'handmade apron', count: 39 },
    ],
  },
  {
    name: 'Paper Hound Co.',
    location: 'Toronto, Canada',
    openedYear: 2023,
    activeListings: 41,
    reviews: 642,
    reviewsAdded30d: 88,
    medianPrice: 24,
    newListings30d: 11,
    removedListings30d: 0,
    salesPerMonth: { min: 700, max: 1100 },
    topTags: [
      { tag: 'pet portrait', count: 38 },
      { tag: 'digital download', count: 36 },
      { tag: 'custom pet art', count: 29 },
      { tag: 'gift for dog mom', count: 21 },
      { tag: 'watercolour pet', count: 17 },
    ],
  },
]

function buildCompetitor(seed: CompetitorSeed): CompetitorShop {
  return {
    name: seed.name,
    location: seed.location,
    openedYear: seed.openedYear,
    activeListings: seed.activeListings,
    reviews: seed.reviews,
    reviewsAdded30d: seed.reviewsAdded30d,
    medianPrice: seed.medianPrice,
    newListings30d: seed.newListings30d,
    removedListings30d: seed.removedListings30d,
    monthlySales: estimated(seed.salesPerMonth, {
      source: SOURCE,
      methodology:
        'Modelled from review velocity and public sales counter movement over 90 days.',
      confidence: 'MODERATE',
      limitations: [
        'Only the shop owner can see their real Etsy figures.',
        'Can differ materially from actual results.',
      ],
      freshness: OBSERVED_AT,
    }),
    /*
     * Derived from the sales range and the observed median price, not written
     * down. A revenue band authored beside a median price is a band that stops
     * agreeing with it the first time either is edited.
     */
    monthlyRevenue: estimated(
      {
        min: round100(seed.salesPerMonth.min * seed.medianPrice),
        max: round100(seed.salesPerMonth.max * seed.medianPrice),
      },
      {
        source: SOURCE,
        methodology:
          'Modelled sales multiplied by the observed median price across active listings.',
        confidence: 'MODERATE',
        limitations: ['Excludes refunds, wholesale and off-platform sales.'],
        freshness: OBSERVED_AT,
      },
    ),
    topTags: seed.topTags,
    observedAt: OBSERVED_AT,
  }
}

/* ---------------------------------------------------- products (artboard 21) */

interface ProductSeed {
  title: string
  shop: string
  category: string
  price: number
  reviews: number
  favorites: number
  ageMonths: number
  digital: boolean
  /** Null where observation is too thin to model — a new listing, usually. */
  salesPerMonth: EstimatedRange | null
}

const PRODUCT_SEEDS: ProductSeed[] = [
  {
    title: 'Birth flower necklace, personalized gold pendant',
    shop: 'Aurelia Made',
    category: 'Jewelry · Necklaces · personalized',
    price: 38,
    reviews: 1204,
    favorites: 8910,
    ageMonths: 24,
    digital: false,
    salesPerMonth: { min: 40, max: 65 },
  },
  {
    title: 'Custom pet portrait from photo, digital download',
    shop: 'Paper Hound Co.',
    category: 'Art & Collectibles · digital',
    price: 24,
    reviews: 642,
    favorites: 3180,
    ageMonths: 11,
    digital: true,
    salesPerMonth: { min: 70, max: 110 },
  },
  {
    title: 'Linen apron with pockets, unisex, natural',
    shop: 'Field & Flax',
    category: 'Home & Living · kitchen',
    price: 52,
    reviews: 318,
    favorites: 2040,
    ageMonths: 36,
    digital: false,
    salesPerMonth: { min: 15, max: 30 },
  },
  {
    /*
     * Three weeks old with 27 reviews. This is the row the screen exists to
     * handle honestly: there is not enough observation to model it, so sales,
     * revenue and the opportunity score are all UNAVAILABLE rather than small.
     */
    title: 'Wedding welcome sign, editable template',
    shop: 'Marbled Studio',
    category: 'Weddings · digital · newly listed',
    price: 9,
    reviews: 27,
    favorites: 410,
    ageMonths: 1,
    digital: true,
    salesPerMonth: null,
  },
  {
    title: 'Stonewashed linen table runner, 60 inch',
    shop: 'Field & Flax',
    category: 'Home & Living · table linens',
    price: 34,
    reviews: 486,
    favorites: 2610,
    ageMonths: 19,
    digital: false,
    salesPerMonth: { min: 28, max: 46 },
  },
  {
    title: 'Ceramic mug, hand-thrown speckled stoneware',
    shop: 'Nord Atelier',
    category: 'Home & Living · kitchen · ceramics',
    price: 34,
    reviews: 934,
    favorites: 5120,
    ageMonths: 42,
    digital: false,
    salesPerMonth: { min: 55, max: 90 },
  },
  {
    title: 'Personalised name table runner, wedding',
    shop: 'Marbled Studio',
    category: 'Weddings · table linens · personalized',
    price: 62,
    reviews: 141,
    favorites: 980,
    ageMonths: 7,
    digital: false,
    salesPerMonth: { min: 9, max: 22 },
  },
  {
    title: 'Waffle-weave napkin set of four',
    shop: 'Field & Flax',
    category: 'Home & Living · table linens',
    price: 28,
    reviews: 12,
    favorites: 190,
    ageMonths: 2,
    digital: false,
    salesPerMonth: null,
  },
]

function buildProduct(seed: ProductSeed, index: number): ProductSignals {
  const sparse = seed.salesPerMonth === null

  const monthlySales: Provenanced<EstimatedRange> = sparse
    ? (unavailable(
        'Observed for too few weeks to model. A new listing has no review or favourite history to model from.',
        'Check again once the listing has been live for a full quarter.',
      ) as Provenanced<EstimatedRange>)
    : estimated(seed.salesPerMonth!, {
        source: SOURCE,
        methodology:
          'Modelled from review velocity, favourites and observed ranking movement over 90 days.',
        confidence: seed.reviews > 300 ? 'MODERATE' : 'LOW',
        limitations: [
          'Not official Etsy data. Only the shop owner can see their real figures.',
          'Excludes ads, off-platform traffic, wholesale and refunded orders.',
        ],
        freshness: OBSERVED_AT,
      })

  const monthlyRevenue: Provenanced<EstimatedRange> = sparse
    ? (unavailable(
        'Revenue cannot be modelled without a sales estimate.',
        'Check again once the listing has been live for a full quarter.',
      ) as Provenanced<EstimatedRange>)
    : estimated(
        {
          min: round100(seed.salesPerMonth!.min * seed.price),
          max: round100(seed.salesPerMonth!.max * seed.price),
        },
        {
          source: SOURCE,
          methodology: 'Modelled sales multiplied by the listing’s observed price.',
          confidence: 'LOW',
          limitations: ['Excludes refunds, discounts and off-platform sales.'],
          freshness: OBSERVED_AT,
        },
      )

  return {
    id: `P-${index + 1}`,
    title: seed.title,
    shop: seed.shop,
    category: seed.category,
    price: seed.price,
    reviews: seed.reviews,
    favorites: seed.favorites,
    ageMonths: seed.ageMonths,
    digital: seed.digital,
    monthlySales,
    monthlyRevenue,
    /*
     * Null wherever sales are unavailable. An opportunity score computed over a
     * missing input is a number invented to fill a column, and it would sort
     * the table.
     */
    opportunity: sparse
      ? null
      : calculated(
          opportunityScore(seed),
          'Modelled demand weighted against observed competition, review count and listing age. 0–100, EtsyPilot’s own scale.',
          {
            limitations: [
              'A score, not a prediction. It ranks what has been observed; it does not say what will sell.',
            ],
          },
        ),
    observedAt: OBSERVED_AT,
  }
}

/** 0–100, from the seed's own numbers. Deterministic and inspectable. */
function opportunityScore(seed: ProductSeed): number {
  if (!seed.salesPerMonth) return 0
  const midSales = (seed.salesPerMonth.min + seed.salesPerMonth.max) / 2
  const demand = Math.min(50, (midSales / 110) * 50)
  const freshness = Math.max(0, 25 - seed.ageMonths / 2)
  const traction = Math.min(25, (seed.favorites / 9000) * 25)
  return Math.round(demand + freshness + traction)
}

/* ------------------------------------------------------ niches (artboard 102) */

interface NicheSeed {
  demand: EstimatedRange
  listings: number
  priceBand: EstimatedRange
  concentration: number
  subNiches: { name: string; demand: EstimatedRange | null; listings: number; priceBand: EstimatedRange | null }[]
}

const NICHES: Record<string, NicheSeed> = {
  'linen table linens': {
    demand: { min: 8000, max: 13000 },
    listings: 41000,
    priceBand: { min: 28, max: 46 },
    concentration: 31,
    subNiches: [
      { name: 'Stonewashed linen runners', demand: { min: 1400, max: 2200 }, listings: 3900, priceBand: { min: 34, max: 58 } },
      { name: 'Personalised name runners', demand: { min: 900, max: 1600 }, listings: 2100, priceBand: { min: 42, max: 74 } },
      { name: 'Christmas table linens', demand: { min: 2800, max: 4400 }, listings: 14600, priceBand: { min: 24, max: 40 } },
      // Deliberately unmodellable. The row renders "Too few samples" and an em
      // dash, never a small number.
      { name: 'Waffle-weave napkins', demand: null, listings: 480, priceBand: null },
    ],
  },
  'birth flower jewelry': {
    demand: { min: 14000, max: 22000 },
    listings: 38000,
    priceBand: { min: 26, max: 58 },
    concentration: 22,
    subNiches: [
      { name: 'Personalised birth flower necklaces', demand: { min: 6000, max: 9000 }, listings: 14200, priceBand: { min: 30, max: 62 } },
      { name: 'Birth flower bracelets', demand: { min: 1200, max: 2400 }, listings: 5100, priceBand: { min: 24, max: 48 } },
      { name: 'Birth flower signet rings', demand: null, listings: 620, priceBand: null },
    ],
  },
}

const SAMPLING_ERROR_PERCENT = 8

function buildNiche(term: string, market: string): NicheSignals {
  const key = term.trim().toLowerCase()
  const seed = NICHES[key]

  if (!seed) {
    /*
     * A niche nobody has sampled enough is UNAVAILABLE across the board, and
     * every derived figure follows it down. There is no partial answer here:
     * crowding without demand, or a price band without listings, would be a
     * confident-looking row built on nothing.
     */
    const none = unavailable(
      'This niche has not been sampled often enough to model. EtsyPilot samples public listing and autocomplete signals weekly, and a term has to appear across several weeks before it can be reported.',
      'Try a broader term, or check back after the next sampling window.',
    )
    return {
      term,
      market,
      demand: none as Provenanced<EstimatedRange>,
      listings: none as Provenanced<number>,
      crowding: null,
      priceBand: null,
      concentration: null,
      history: historyOf(key).map((p) => ({ ...p, index: null })),
      subNiches: [],
      observedAt: OBSERVED_AT,
    }
  }

  const midDemand = (seed.demand.min + seed.demand.max) / 2
  const perSearch = seed.listings / midDemand

  return {
    term,
    market,
    demand: estimated(seed.demand, {
      source: SOURCE,
      methodology: METHODOLOGY,
      confidence: 'MODERATE',
      limitations: LIMITATIONS,
      freshness: OBSERVED_AT,
    }),
    listings: estimated(seed.listings, {
      source: SOURCE,
      methodology: `Counted from public category and search pages, sampled weekly. ±${SAMPLING_ERROR_PERCENT}% sampling error.`,
      confidence: 'MODERATE',
      limitations: ['A count of what was visible when sampled, not Etsy’s own index.'],
      freshness: OBSERVED_AT,
    }),
    crowding: calculated(
      perSearch >= 3 ? 'HIGH' : perSearch >= 1.5 ? 'MEDIUM' : 'LOW',
      `${perSearch.toFixed(1)} listings per modelled monthly search. Bands are EtsyPilot’s, not Etsy’s.`,
      { limitations: ['Both inputs are estimates, so the band is only as good as they are.'] },
    ),
    priceBand: estimated(seed.priceBand, {
      source: SOURCE,
      methodology: 'The middle 50% of observed listing prices — the interquartile range.',
      confidence: 'MODERATE',
      limitations: ['Asking prices, not what anyone paid. Discounts are not visible.'],
      freshness: OBSERVED_AT,
    }),
    concentration: calculated(
      seed.concentration,
      'Share of observed listings held by the ten largest shops in the niche.',
      { limitations: ['Counts listings, not sales. A big shop with slow listings still counts.'] },
    ),
    history: historyOf(key),
    subNiches: seed.subNiches.map((sub) => buildSubNiche(sub)),
    observedAt: OBSERVED_AT,
  }
}

function buildSubNiche(sub: {
  name: string
  demand: EstimatedRange | null
  listings: number
  priceBand: EstimatedRange | null
}): SubNiche {
  if (sub.demand === null) {
    return {
      name: sub.name,
      demand: unavailable(
        'Too few samples to model demand for this sub-niche.',
        'It may become reportable as sampling accumulates.',
      ) as Provenanced<EstimatedRange>,
      listings: sub.listings,
      priceBand: null,
      crowding: null,
    }
  }

  const perSearch = sub.listings / ((sub.demand.min + sub.demand.max) / 2)
  return {
    name: sub.name,
    demand: estimated(sub.demand, {
      source: SOURCE,
      methodology: METHODOLOGY,
      confidence: 'LOW',
      limitations: LIMITATIONS,
      freshness: OBSERVED_AT,
    }),
    listings: sub.listings,
    priceBand: sub.priceBand
      ? estimated(sub.priceBand, {
          source: SOURCE,
          methodology: 'The middle 50% of observed listing prices.',
          confidence: 'LOW',
          limitations: ['Asking prices, not what anyone paid.'],
          freshness: OBSERVED_AT,
        })
      : null,
    crowding: calculated(
      perSearch >= 3 ? 'HIGH' : perSearch >= 1.5 ? 'MEDIUM' : 'LOW',
      `${perSearch.toFixed(1)} listings per modelled monthly search.`,
    ),
  }
}

/** The niches the model has sampled enough to report on. */
export const KNOWN_NICHES = Object.keys(NICHES)
