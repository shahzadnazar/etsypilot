/*
 * The Willow & Fern demo dataset.
 *
 * A complete fictional shop so every screen can be explored before connecting
 * anything (Data Sources 94). Not a real shop, not benchmark data.
 *
 * Figures are continuous with every canvas: 412 active listings, 438 orders,
 * $18,420.65 gross, $4,938.20 net at 62% cost coverage, and an order baseline
 * of 512 that the period misses by 14.5%.
 *
 * Generation is deterministic - a fixed-seed PRNG, no Date.now(), no
 * Math.random() - so the demo shop is byte-identical on every boot and tests
 * can assert against it.
 */

import type { EtsyListing, EtsyOrder, ListingState } from './interface'

/*
 * Etsy listing ids are numeric, so the demo's are too.
 *
 * They used to be "L01001". Nothing in the app minded — until the browser
 * extension, which reads an id out of a real etsy.com URL where the id is
 * always digits. A demo listing could therefore never match, and the whole
 * own-listing path was unreachable in demo mode: a flow nobody could walk is a
 * flow nobody can check.
 */
export const DEMO_LISTING_ID_BASE = 1_400_001_001

export const DEMO_SHOP_ID = 'demo-willow-fern'
export const DEMO_ACTOR_ID = 'demo-user-salman'

/** The period every screen reports on. */
/* Midnight to midnight, UTC. One time basis across the product (D24). */
export const PERIOD_START = '2026-07-14T00:00:00.000Z'
export const PERIOD_END = '2026-08-12T23:59:59.999Z'
/** Fixed "now" for the demo shop, so freshness copy stays stable. */
export const DEMO_NOW = '2026-08-12T14:06:00.000Z'

/**
 * The 90 days before the period. Shop Pulse baselines against this, so it has
 * to exist as real orders rather than as a stored average - otherwise the
 * baseline is an assertion, not a measurement.
 */
export const BASELINE_START = '2026-04-15T00:00:00.000Z'
export const BASELINE_END = '2026-07-13T23:59:59.999Z'

/**
 * The listings each recorded event touched.
 *
 * Shop Pulse tests events against outcomes, so the demo shop must actually
 * contain the outcomes: orders on PRICE_GROUP really do fall after Jul 24, the
 * mug really does sell nothing while out of stock, and the shop-wide dip after
 * Aug 8 really has no event behind it.
 */
export const NARRATIVE = {
  /** Jul 24 price rise. "Linen table runner +2". */
  priceGroup: ['1400001006', '1400001001', '1400001002'],
  priceChangeAt: '2026-07-24T09:12:00.000Z',
  ordersPerDayBefore: 4.1,
  ordersPerDayAfter: 2.8,

  /** Aug 4-9 stockout, restocked Aug 10. Ceramic mug set. */
  stockoutListing: '1400001004',
  stockoutFrom: '2026-08-04',
  stockoutUntil: '2026-08-10',
  stockoutRatePerDay: 1.6,

  /**
   * Jul 28 tag job. A steady seller that the job demonstrably did NOT move -
   * which is what makes RULED OUT reachable rather than merely asserted. It
   * needs enough orders to be measurable; 12 listings averaging under one order
   * each would only produce noise.
   */
  tagGroupRatePerDay: 2.4,

  /** Aug 6 deactivation. Seasonal section. */
  deactivatedFrom: '2026-08-06',
  deactivatedRatePerDay: 1.2,

  /**
   * Aug 8-12 dip with NO recorded event. This is what produces the UNKNOWN
   * diagnosis - we do not invent a cause for it.
   *
   * The factor is set so the period's shortfall against baseline is fully
   * accounted for: the four recorded events explain their share, and this dip
   * carries the remainder. Without that, ordinary days across the whole period
   * sit below the band and the sweep reports unexplained runs everywhere.
   */
  dipFrom: '2026-08-08',
  dipFactor: 0.251,

  /** Steady rate for everything no event touches. */
  restRatePerDay: 7.77,
} as const
export const DEMO_LAST_SYNCED = '2026-08-12T14:00:00.000Z'

/** Designed totals. The profit domain computes from orders; these are the target. */
export const DEMO_TOTALS = {
  grossRevenue: 18420.65,
  discounts: 412.0,
  refunds: 602.0,
  etsyFees: 2984.1,
  paymentProcessing: 622.0,
  offsiteAds: 412.35,
  shipping: 1147.0,
  cogs: 6996.0,
  labour: 1020.0,
  otherCosts: 302.05,
  netProfit: 4938.2,
  orderCount: 438,
} as const

/** Shop Pulse baselines, from the shop's own 90-day history. */
/**
 * The demo shop's configured cost rates, derived from the designed cost lines
 * so the computed waterfall reconciles against artboard 92.
 */
export const DEMO_COST_INPUTS = {
  shippingPerOrder: DEMO_TOTALS.shipping / DEMO_TOTALS.orderCount,
  cogsPercent: DEMO_TOTALS.cogs / DEMO_TOTALS.grossRevenue,
  labourTotal: DEMO_TOTALS.labour,
  otherCosts: DEMO_TOTALS.otherCosts,
  /**
   * Computed below from the orders and the confirmed-cost set, never stated.
   * A coverage figure is a measurement of this shop's own data; writing one
   * down as a constant is the same mistake as authoring a Shop Pulse number.
   */
  get coverage(): number {
    return demoCostCoverage().coverage
  },
}

export const DEMO_BASELINE = {
  orders: 512,
  revenue: 20287,
  coveragePercent: 88,
  listingsTooNew: 11,
  windowDays: 90,
} as const

/*
 * The empty-dataset seam.
 *
 * DEMO_DATASET=empty serves the same shop with nothing in it, so the empty
 * states can be driven rather than assumed. It lives here rather than in the
 * mock adapter because demo STORES need it too — the audit log's records, for
 * one — and lib/etsy/mock.ts is the file nothing outside the selector may
 * import.
 */
export function isEmptyDataset(): boolean {
  return process.env.DEMO_DATASET === 'empty'
}

/** Length of the reporting period, in whole days. */
export const PERIOD_DAYS = 30

/*
 * How many listings the generator MAKES. Inputs to the catalogue, not claims
 * about it — the loop below draws states from the RNG, so some of the non-draft
 * slots come out EXPIRED and the two numbers are not the same question.
 */
const CATALOGUE_SHAPE = { nonDraft: 412, drafts: 38 } as const

interface MeasuredCounts {
  active: number
  drafts: number
  withoutCost: number
  expiringSoon: number
}

let countsCache: MeasuredCounts | null = null

function measuredCounts(): MeasuredCounts {
  if (countsCache) return countsCache
  const listings = buildDemoListings()
  const costs = demoConfirmedCosts(listings)
  const active = listings.filter((l) => l.state === 'ACTIVE')
  const now = Date.parse(DEMO_NOW)
  countsCache = {
    active: active.length,
    drafts: listings.filter((l) => l.state === 'DRAFT').length,
    withoutCost: active.filter((l) => !costs.has(l.etsyListingId)).length,
    expiringSoon: active.filter((l) => {
      if (!l.renewsAt) return false
      const days = (Date.parse(l.renewsAt) - now) / 86_400_000
      return days >= 0 && days <= 7
    }).length,
  }
  return countsCache
}

/*
 * Counted from the catalogue, not written down beside it.
 *
 * These were three literals — 412 active, 38 drafts, 38 without a cost — and
 * all three were wrong about the shop the generator actually builds: 404, 39
 * and 52. The dashboard said 412 active listings, the Action Center said "38 of
 * 412 have no cost rule", the plan meter said 412 / 200, and Profit Reality's
 * own ledger left 52 listings blank on the same screen that announced 38.
 *
 * Nothing here is a constant any more, so the demo shop cannot describe itself
 * incorrectly (D34, D61a).
 */
export const DEMO_COUNTS = {
  get activeListings(): number {
    return measuredCounts().active
  },
  get drafts(): number {
    return measuredCounts().drafts
  },
  get expiringWithin7Days(): number {
    return measuredCounts().expiringSoon
  },
  get listingsWithoutCost(): number {
    return measuredCounts().withoutCost
  },
}

/* ------------------------------------------------------------------ *
 * Deterministic PRNG (mulberry32). Same seed, same shop, every time.
 * ------------------------------------------------------------------ */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)]
  // items is never empty at any call site; this keeps noUncheckedIndexedAccess happy.
  return item as T
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/* ------------------------------------------------------------------ *
 * Listings
 * ------------------------------------------------------------------ */

const SECTIONS = ['Necklaces', 'Kitchen', 'Weddings', 'Digital', 'Seasonal', 'Home'] as const

/** The named listings that appear by name across the canvases. */
const FEATURED: ReadonlyArray<Partial<EtsyListing> & { title: string; sku: string }> = [
  {
    title: 'Personalized Birth Flower Necklace, Gold Filled Pendant, Custom Birth Month Gift for Mom, Handmade Jewelry',
    sku: 'BFN-014',
    price: 38.0,
    quantity: 42,
    section: 'Necklaces',
    state: 'ACTIVE',
    tags: ['birth flower necklace', 'personalized gift', 'gold filled', 'gift for mom', 'birth month jewelry', 'dainty jewelry', 'handmade jewelry', 'custom necklace', 'flower pendant', 'gold necklace', 'gift for her'],
    photoCount: 6,
    attributes: { 'Metal purity': null },
    requiredAttributes: ['Metal purity'],
  },
  {
    title: 'Linen apron with pockets, unisex, natural',
    sku: 'LA-002',
    price: 52.0,
    quantity: 0,
    section: 'Kitchen',
    state: 'EXPIRED',
    tags: ['linen apron', 'unisex apron', 'natural linen', 'kitchen apron', 'cooking gift', 'chef apron', 'pocket apron', 'handmade apron', 'baking gift'],
    photoCount: 5,
  },
  {
    title: 'Custom pet portrait from photo, digital download',
    sku: 'PET-DL-1',
    price: 24.0,
    quantity: 0,
    section: 'Digital',
    state: 'DRAFT',
    tags: ['pet portrait', 'digital download', 'custom pet art'],
    photoCount: 3,
    attributes: { 'Primary material': null },
    requiredAttributes: ['Primary material'],
  },
  {
    title: 'Ceramic mug, hand-thrown speckled stoneware',
    sku: 'MUG-011',
    price: 34.0,
    quantity: 18,
    section: 'Kitchen',
    state: 'ACTIVE',
    tags: ['ceramic mug', 'stoneware mug', 'handmade mug', 'speckled ceramic', 'coffee mug', 'pottery gift', 'wheel thrown', 'rustic mug', 'tea cup', 'kitchen gift', 'housewarming', 'artisan ceramics'],
    photoCount: 8,
    attributes: { 'Primary material': null },
    requiredAttributes: ['Primary material'],
  },
  {
    title: 'Wedding welcome sign, editable template',
    sku: 'WED-SGN',
    price: 9.0,
    quantity: 0,
    section: 'Weddings',
    state: 'ACTIVE',
    tags: ['wedding sign', 'editable template', 'welcome sign', 'digital wedding'],
    photoCount: 4,
  },
  {
    title: 'Stonewashed linen table runner, natural',
    sku: 'LTR-007',
    price: 34.0,
    quantity: 24,
    section: 'Home',
    state: 'ACTIVE',
    tags: ['linen table runner', 'stonewashed linen', 'table linens', 'dining decor', 'natural linen', 'rustic table', 'farmhouse decor'],
    photoCount: 7,
  },
]

/*
 * Variations, deterministically.
 *
 * A digital listing has none — there is nothing to vary. Everything else gets a
 * size or colour set from the seeded RNG, so the same shop always has the same
 * variations and the listings table is stable across runs.
 *
 * `variationSummary` is null when `hasVariations` is false, and the two say
 * different things: false/null is "no variations", true/null would be "it has
 * some and we did not load them". The live adapter produces the second.
 */
const VARIATION_SETS = ['3 sizes', '2 colors', '4 finishes', '2 lengths', '3 scents'] as const

/*
 * Deliberately NOT drawn from the seeded RNG.
 *
 * Consuming a random number here would shift the sequence for every listing
 * generated afterwards — different prices, different states, a different order
 * total — and the demo shop's figures are reconciled to exact designed values.
 * A pure function of the index gives the same determinism at no cost to the
 * catalogue that already exists.
 */
function variationsFor(
  sku: string,
  index: number,
): { hasVariations: boolean; variationSummary: string | null } {
  // Nothing to vary on a download.
  const digital = sku.includes('DL') || sku.includes('SGN')
  if (digital || index % 5 < 2) return { hasVariations: false, variationSummary: null }
  return {
    hasVariations: true,
    variationSummary: VARIATION_SETS[index % VARIATION_SETS.length]!,
  }
}

const TITLE_NOUNS = ['necklace', 'mug', 'table runner', 'apron', 'print', 'candle', 'tote bag', 'earrings', 'coaster set', 'napkin set', 'wall hanging', 'keychain'] as const
const TITLE_ADJECTIVES = ['Handmade', 'Personalized', 'Stonewashed', 'Hand-thrown', 'Minimalist', 'Vintage-style', 'Custom', 'Rustic'] as const
const TITLE_QUALIFIERS = ['for her', 'gift set', 'natural linen', 'gold filled', 'made to order', 'housewarming gift', 'wedding favour'] as const

/*
 * Renewal dates, spread across a quarter.
 *
 * Every active listing used to renew on exactly 2026-10-04, which had two
 * consequences nobody noticed until a screen tried to use the date. "Expiring
 * within 7 days" was always ZERO — the count beside it said 6, authored — and
 * the audit's RENEWS_SOON rule could never fire on any listing, so one of the
 * fourteen rules was permanently unreachable.
 *
 * Deterministic and RNG-free, for the same reason as the variations above: a
 * random draw here would shift every listing generated afterwards.
 */
/*
 * Descriptions and tags, varied on purpose.
 *
 * Every generated listing used to carry the SAME 96-character description and
 * tags of the form "mug tag 3", shared by every listing with that noun. The
 * consequences only surfaced when a screen tried to grade a listing:
 *
 *   SHORT_DESCRIPTION  fired on 450 of 450 listings
 *   DUPLICATE_TAGS     fired on 444 of 450
 *   health = "Good"    was unreachable — not one listing in the shop was clean
 *
 * None of that was a finding about the demo seller; all of it was one string
 * written once. A demo shop in which every listing has a problem overstates
 * what the product finds, and an unreachable state is a state nobody has read.
 *
 * Both are pure functions of the index, so no RNG is consumed and the rest of
 * the catalogue is untouched.
 */
const LONG_DESCRIPTION =
  'Made to order in small batches in our studio, finished by hand and checked before it ships. Materials, dimensions and care instructions are listed below, and every order goes out in recyclable packaging within three working days.'

function descriptionFor(noun: string, index: number): string {
  // Roughly one in six is genuinely thin, which is what the rule is for.
  if (index % 6 === 0) return `A ${noun} made to order.`
  return LONG_DESCRIPTION
}

/*
 * Tag phrases, written against the rules they will be graded by.
 *
 * The first attempt used the bare noun as tag one, which put a tag inside the
 * title of all 450 listings and tripped TAG_TOO_BROAD on a third of them —
 * trading three rules that fired on everything for two more that did. A demo
 * catalogue has to be graded to a spread, not to a corner.
 *
 * So: multi-word phrases that do not appear verbatim in the title, four shared
 * category tags every sixth listing (DUPLICATE_TAGS needs four), and a bare
 * broad word on every ninth.
 */
const SHARED_TAGS = ['small batch studio', 'made in vermont', 'eco packaging', 'gift wrapped']

function tagsFor(noun: string, qualifier: string, count: number, index: number): string[] {
  const head = noun.split(' ')[0] ?? noun
  const tags: string[] = []
  if (index % 6 === 0) tags.push(...SHARED_TAGS)
  if (index % 9 === 0) tags.push(head)
  for (let t = tags.length; t < count; t++) {
    tags.push(`${head} ${qualifier} ${index}${t}`)
  }
  return tags.slice(0, count)
}

const RENEWAL_ANCHOR = Date.parse('2026-08-13T00:00:00.000Z')

function renewalFor(index: number): string {
  const days = 3 + ((index * 11) % 110)
  return new Date(RENEWAL_ANCHOR + days * 86_400_000).toISOString()
}

export function buildDemoListings(): EtsyListing[] {
  const rng = mulberry32(20260812)
  const listings: EtsyListing[] = []

  FEATURED.forEach((f, i) => {
    listings.push({
      etsyListingId: `${DEMO_LISTING_ID_BASE + i}`,
      title: f.title,
      description: f.description ?? 'Hand-finished in our Vermont studio and shipped in recyclable packaging.',
      tags: f.tags ?? [],
      price: f.price ?? 30,
      quantity: f.quantity ?? 10,
      state: f.state ?? 'ACTIVE',
      section: f.section ?? 'Home',
      sku: f.sku,
      attributes: f.attributes ?? {},
      requiredAttributes: f.requiredAttributes ?? [],
      photoCount: f.photoCount ?? 5,
      /*
       * Null unless the listing is active.
       *
       * This was a fixed date on every featured listing whatever its state, so
       * the listings table printed "Expired · Renews Sep 2" and "Draft ·
       * Renews Sep 2" side by side — a row contradicting itself across two
       * columns. Etsy has no renewal date for a listing that is not live.
       */
      renewsAt: (f.state ?? 'ACTIVE') === 'ACTIVE' ? '2026-09-02T00:00:00.000Z' : null,
      lastChangedAt: '2026-08-10T09:00:00.000Z',
      ...variationsFor(f.sku ?? '', i),
    })
  })

  const total = CATALOGUE_SHAPE.nonDraft + CATALOGUE_SHAPE.drafts
  for (let i = listings.length; i < total; i++) {
    const isDraft = i >= CATALOGUE_SHAPE.nonDraft
    const noun = pick(rng, TITLE_NOUNS)
    const adjective = pick(rng, TITLE_ADJECTIVES)
    const qualifier = pick(rng, TITLE_QUALIFIERS)
    const price = round2(9 + rng() * 65)
    const state: ListingState = isDraft ? 'DRAFT' : rng() < 0.015 ? 'EXPIRED' : 'ACTIVE'
    // 8–16, so a real share of the catalogue reaches the 13-tag threshold and
    // a real share does not. It was 5–13, which put 403 of 450 listings under
    // it — a rule firing on 90% of a shop is a property of the generator, not
    // a finding about the seller.
    const tagCount = 8 + Math.floor(rng() * 9)

    listings.push({
      etsyListingId: `${DEMO_LISTING_ID_BASE + i}`,
      title: `${adjective} ${noun}, ${qualifier}`,
      description: descriptionFor(noun, i),
      tags: tagsFor(noun, qualifier, tagCount, i),
      price,
      quantity: state === 'ACTIVE' ? Math.floor(rng() * 60) : 0,
      state,
      section: pick(rng, SECTIONS),
      sku: `WF-${String(i).padStart(4, '0')}`,
      attributes: {},
      requiredAttributes: rng() < 0.034 ? ['Primary material'] : [],
      photoCount: 1 + Math.floor(rng() * 9),
      renewsAt: state === 'ACTIVE' ? renewalFor(i) : null,
      lastChangedAt: '2026-07-30T12:00:00.000Z',
      ...variationsFor(`WF-${i}`, i),
    })
  }

  return listings
}

/* ------------------------------------------------------------------ *
 * Orders
 *
 * Generated across the period with a dip after Aug 8, then reconciled so the
 * gross total is exactly the designed $18,420.65.
 * ------------------------------------------------------------------ */

const COUNTRIES: ReadonlyArray<{ code: string; weight: number }> = [
  { code: 'US', weight: 0.726 },
  { code: 'CA', weight: 0.123 },
  { code: 'GB', weight: 0.071 },
  { code: 'AU', weight: 0.041 },
  { code: 'DE', weight: 0.02 },
  { code: 'FR', weight: 0.019 },
]

function pickCountry(rng: () => number): string {
  const r = rng()
  let acc = 0
  for (const c of COUNTRIES) {
    acc += c.weight
    if (r <= acc) return c.code
  }
  return 'US'
}

/**
 * Emit `count` orders for a listing on a given day.
 *
 * Fractional daily rates are carried across days rather than rounded away, so
 * a rate of 4.1/day produces 41 orders over 10 days exactly.
 */
interface Emit {
  listing: EtsyListing
  day: number
  rng: () => number
}

function dayIndex(iso: string): number {
  return Math.floor(
    (new Date(iso).getTime() - new Date(PERIOD_START).getTime()) / 86_400_000,
  )
}

/**
 * The listing sets each narrative event touches.
 *
 * Exported and shared: the order generator and Shop Pulse must resolve the
 * identical sets, or the engine measures one group while the data moved
 * another. The sets are disjoint by construction.
 */
export function narrativeGroups(listings: EtsyListing[]) {
  const byId = new Map(listings.map((l) => [l.etsyListingId, l]))
  const active = listings.filter((l) => l.state === 'ACTIVE')

  const priceGroup = NARRATIVE.priceGroup
    .map((id) => byId.get(id))
    .filter((l): l is EtsyListing => Boolean(l))
  const stockout = byId.get(NARRATIVE.stockoutListing) ?? null
  const seasonal = active.filter((l) => l.section === 'Seasonal').slice(0, 4)

  const claimed = new Set<string>([
    ...priceGroup.map((l) => l.etsyListingId),
    ...(stockout ? [stockout.etsyListingId] : []),
    ...seasonal.map((l) => l.etsyListingId),
  ])

  const tagGroup = active
    .filter((l) => l.section === 'Home' && !claimed.has(l.etsyListingId))
    .slice(0, 12)
  tagGroup.forEach((l) => claimed.add(l.etsyListingId))

  const rest = active.filter((l) => !claimed.has(l.etsyListingId))

  const groups = { priceGroup, stockout, seasonal, tagGroup, rest }
  assertDisjoint(groups)
  return groups
}

/**
 * Overlapping listing groups are how a correlation engine becomes a rumour mill:
 * measuring one change while the data moved another, and reporting the borrowed
 * movement as a finding.
 *
 * This is a runtime invariant rather than a test, deliberately. A test proves
 * the sets are disjoint today; this makes them unable to stop being disjoint,
 * including on the day a future feature makes overlap convenient.
 */
function assertDisjoint(groups: {
  priceGroup: EtsyListing[]
  stockout: EtsyListing | null
  seasonal: EtsyListing[]
  tagGroup: EtsyListing[]
  rest: EtsyListing[]
}): void {
  const named: [string, EtsyListing[]][] = [
    ['priceGroup', groups.priceGroup],
    ['stockout', groups.stockout ? [groups.stockout] : []],
    ['seasonal', groups.seasonal],
    ['tagGroup', groups.tagGroup],
    ['rest', groups.rest],
  ]

  const owner = new Map<string, string>()
  for (const [name, listings] of named) {
    for (const l of listings) {
      const existing = owner.get(l.etsyListingId)
      if (existing) {
        throw new Error(
          `Narrative groups overlap: listing ${l.etsyListingId} is in both "${existing}" and "${name}". ` +
            'Groups must be disjoint, or Shop Pulse will attribute one change\'s movement to another.',
        )
      }
      owner.set(l.etsyListingId, name)
    }
  }
}

export function buildDemoOrders(listings: EtsyListing[]): EtsyOrder[] {
  const rng = mulberry32(438438)
  const { priceGroup, stockout, seasonal, tagGroup, rest } = narrativeGroups(listings)

  const priceChangeDay = dayIndex(NARRATIVE.priceChangeAt)
  const stockoutFrom = dayIndex(`${NARRATIVE.stockoutFrom}T00:00:00.000Z`)
  const stockoutUntil = dayIndex(`${NARRATIVE.stockoutUntil}T00:00:00.000Z`)
  const deactivatedFrom = dayIndex(`${NARRATIVE.deactivatedFrom}T00:00:00.000Z`)
  const dipFrom = dayIndex(`${NARRATIVE.dipFrom}T00:00:00.000Z`)

  const emits: Emit[] = []
  const carry = new Map<string, number>()

  /** Accumulate a fractional rate and emit whole orders as they accrue. */
  function schedule(group: EtsyListing[], key: string, day: number, ratePerDay: number) {
    if (group.length === 0 || ratePerDay <= 0) return
    const acc = (carry.get(key) ?? 0) + ratePerDay
    const whole = Math.floor(acc)
    carry.set(key, acc - whole)
    for (let i = 0; i < whole; i++) {
      emits.push({ listing: pick(rng, group), day, rng })
    }
  }

  for (let day = 0; day < PERIOD_DAYS; day++) {
    const dipped = day >= dipFrom ? NARRATIVE.dipFactor : 1

    // The price group: a real, measurable fall after the change.
    schedule(
      priceGroup,
      'price',
      day,
      day < priceChangeDay ? NARRATIVE.ordersPerDayBefore : NARRATIVE.ordersPerDayAfter,
    )

    // The mug sells nothing at all while it is out of stock.
    if (stockout) {
      const out = day >= stockoutFrom && day < stockoutUntil
      schedule([stockout], 'stockout', day, out ? 0 : NARRATIVE.stockoutRatePerDay)
    }

    // Deactivated listings stop selling entirely.
    schedule(
      seasonal,
      'seasonal',
      day,
      day >= deactivatedFrom ? 0 : NARRATIVE.deactivatedRatePerDay,
    )

    // The tag-job listings sell steadily throughout. Nothing touches them, so
    // the job is genuinely ruled out rather than ruled out by assertion.
    schedule(tagGroup, 'tags', day, NARRATIVE.tagGroupRatePerDay)

    // The dip lands on the listings no event accounts for. That is what makes
    // it surface as UNKNOWN: real, measurable, and with nothing behind it.
    schedule(rest, 'rest', day, NARRATIVE.restRatePerDay * dipped)
  }

  // The narrative rates are deliberately round numbers, so the fractional
  // carry lands a little short of the designed 438. Settle the difference on
  // the unconstrained group - never on a group whose rate the diagnosis
  // depends on.
  let day = 0
  while (emits.length < DEMO_TOTALS.orderCount && rest.length > 0) {
    emits.push({ listing: pick(rng, rest), day: day % dipFrom, rng })
    day++
  }
  while (emits.length > DEMO_TOTALS.orderCount) {
    const idx = emits.findIndex((e) => rest.includes(e.listing))
    if (idx === -1) break
    emits.splice(idx, 1)
  }

  const orders = emits.map((e, i) => makeOrder(e, i, rng))
  orders.sort((a, b) => a.placedAt.localeCompare(b.placedAt))
  return reconcileToTotals(orders)
}

/**
 * Baseline history: the 90 days before the period.
 *
 * Generated with the SAME group structure as the period, at each group's
 * pre-change rate. This matters more than it looks: baselining a
 * group-structured period against a uniformly-distributed history makes the
 * residual comparison meaningless, and every quiet day reads as a deviation.
 *
 * The rates below sum to the shop's prior run rate, so "before" genuinely means
 * this shop before these changes.
 */
export function buildDemoPriorOrders(listings: EtsyListing[]): EtsyOrder[] {
  const rng = mulberry32(90900)
  const { priceGroup, stockout, seasonal, tagGroup, rest } = narrativeGroups(listings)
  const start = new Date(BASELINE_START).getTime()
  const days = Math.round((new Date(BASELINE_END).getTime() - start) / 86_400_000)

  const orders: EtsyOrder[] = []
  const carry = new Map<string, number>()
  let n = 0

  function schedule(group: EtsyListing[], key: string, day: number, ratePerDay: number) {
    if (group.length === 0 || ratePerDay <= 0) return
    // Weekday shape, so a by-weekday baseline is meaningfully different from a
    // flat average and weekends do not read as deviations.
    const weekday = new Date(start + day * 86_400_000).getUTCDay()
    const shaped = ratePerDay * (weekday === 0 || weekday === 6 ? 0.72 : 1.11)
    const acc = (carry.get(key) ?? 0) + shaped
    const whole = Math.floor(acc)
    carry.set(key, acc - whole)
    for (let i = 0; i < whole; i++) {
      orders.push(makeOrder({ listing: pick(rng, group), day, rng }, n++, rng, start))
    }
  }

  for (let day = 0; day < days; day++) {
    schedule(priceGroup, 'price', day, NARRATIVE.ordersPerDayBefore)
    if (stockout) schedule([stockout], 'stockout', day, NARRATIVE.stockoutRatePerDay)
    schedule(seasonal, 'seasonal', day, NARRATIVE.deactivatedRatePerDay)
    schedule(tagGroup, 'tags', day, NARRATIVE.tagGroupRatePerDay)
    schedule(rest, 'rest', day, NARRATIVE.restRatePerDay)
  }

  orders.sort((a, b) => a.placedAt.localeCompare(b.placedAt))

  /*
   * Scale prior revenue onto the shop's prior run rate.
   *
   * Period orders are reconciled onto their designed totals; leaving the prior
   * window unscaled made the revenue baseline reflect raw listing prices
   * instead, and the revenue deviation came out roughly twice its true size.
   */
  const target = (DEMO_BASELINE.revenue / 30) * days
  const raw = orders.reduce((sum, o) => sum + o.gross, 0)
  const scale = raw === 0 ? 1 : target / raw
  return orders.map((o) => ({
    ...o,
    gross: round2(o.gross * scale),
    etsyFees: round2(o.etsyFees * scale),
    paymentProcessing: round2(o.paymentProcessing * scale),
    offsiteAds: round2(o.offsiteAds * scale),
  }))
}

function makeOrder(
  { listing, day, rng }: Emit,
  index: number,
  seq: () => number,
  originMs: number = new Date(PERIOD_START).getTime(),
): EtsyOrder {
  const quantity = seq() < 0.87 ? 1 : 2
  const unitPrice = listing.price
  const gross = round2(unitPrice * quantity)
  return {
    etsyReceiptId: `#${30040 + index}`,
    placedAt: new Date(originMs + day * 86_400_000 + Math.floor(rng() * 86_400_000)).toISOString(),
    gross,
    discounts: 0,
    refunds: 0,
    etsyFees: round2(gross * 0.162),
    paymentProcessing: round2(gross * 0.03 + 0.25),
    offsiteAds: seq() < 0.14 ? round2(gross * 0.15) : 0,
    countryCode: pickCountry(seq),
    items: [{ etsyListingId: listing.etsyListingId, quantity, unitPrice }],
  }
}

function reconcileToTotals(orders: EtsyOrder[]): EtsyOrder[] {
  const rawGross = orders.reduce((sum, o) => sum + o.gross, 0)
  const scale = DEMO_TOTALS.grossRevenue / rawGross

  const scaled = orders.map((o) => {
    const gross = round2(o.gross * scale)
    return {
      ...o,
      gross,
      items: o.items.map((it) => ({ ...it, unitPrice: round2((gross / it.quantity) * 1) })),
    }
  })

  const drift = round2(DEMO_TOTALS.grossRevenue - scaled.reduce((s, o) => s + o.gross, 0))
  const last = scaled[scaled.length - 1]
  if (last && drift !== 0) last.gross = round2(last.gross + drift)

  // Every verified fee line is apportioned onto its designed total, so the
  // waterfall on Profit Reality adds up from the orders rather than beside them.
  let out = apportion(scaled, 'etsyFees', DEMO_TOTALS.etsyFees)
  out = apportion(out, 'paymentProcessing', DEMO_TOTALS.paymentProcessing)
  out = apportion(out, 'offsiteAds', DEMO_TOTALS.offsiteAds)
  return out
}

function apportion(orders: EtsyOrder[], field: 'etsyFees' | 'paymentProcessing' | 'offsiteAds', target: number): EtsyOrder[] {
  const current = orders.reduce((s, o) => s + o[field], 0)
  if (current === 0) return orders
  const scale = target / current
  const out = orders.map((o) => ({ ...o, [field]: round2(o[field] * scale) }) as EtsyOrder)
  const drift = round2(target - out.reduce((s, o) => s + o[field], 0))
  const last = out[out.length - 1]
  if (last && drift !== 0) last[field] = round2(last[field] + drift)
  return out
}

/*
 * Which listings have a confirmed per-listing cost.
 *
 * One resolver, used by the profit service, the bulk editor page and the
 * coverage computation below. Two call sites deriving "which listings are
 * costed" independently is how a screen comes to disagree with its own
 * coverage figure.
 */
export function demoConfirmedCosts(listings: EtsyListing[]): Map<string, number> {
  const cogsPercent = DEMO_TOTALS.cogs / DEMO_TOTALS.grossRevenue
  return new Map(
    listings
      .filter((_, i) => i % 8 !== 0)
      .map((l) => [l.etsyListingId, Number((l.price * cogsPercent).toFixed(2))]),
  )
}

/** Orders whose supplier invoice never arrived, so they cannot be costed at all. */
export function demoUnmatchedOrderIds(orders: EtsyOrder[]): Set<string> {
  return new Set(orders.slice(0, 8).map((o) => o.etsyReceiptId))
}

let coverageCache: { coverage: number; confirmedGross: number; ruleGross: number } | null = null

/**
 * Cost coverage, measured.
 *
 * `coverage` is the share of order value carrying a confirmed per-listing cost.
 * The rest is costed by the seller's default rule, which is a seller input, not
 * a confirmed cost - so it is counted in the waterfall and named as a rule
 * wherever the split is shown.
 */
export function demoCostCoverage(): { coverage: number; confirmedGross: number; ruleGross: number } {
  if (coverageCache) return coverageCache
  const listings = buildDemoListings()
  const orders = buildDemoOrders(listings)
  const costs = demoConfirmedCosts(listings)
  const unmatched = demoUnmatchedOrderIds(orders)

  let confirmedGross = 0
  let ruleGross = 0
  for (const order of orders) {
    const listingId = order.items[0]?.etsyListingId ?? ''
    const confirmed = costs.has(listingId) && !unmatched.has(order.etsyReceiptId)
    if (confirmed) confirmedGross += order.gross
    else ruleGross += order.gross
  }

  const total = confirmedGross + ruleGross
  coverageCache = {
    coverage: total === 0 ? 0 : confirmedGross / total,
    confirmedGross: round2(confirmedGross),
    ruleGross: round2(ruleGross),
  }
  return coverageCache
}
