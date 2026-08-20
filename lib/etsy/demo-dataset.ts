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

export const DEMO_SHOP_ID = 'demo-willow-fern'
export const DEMO_ACTOR_ID = 'demo-user-salman'

/** The period every screen reports on. */
/* Midnight to midnight in the shop's own timezone (America/New_York, EDT). */
export const PERIOD_START = '2026-07-14T04:00:00.000Z'
export const PERIOD_END = '2026-08-13T03:59:59.000Z'
/** Fixed "now" for the demo shop, so freshness copy stays stable. */
export const DEMO_NOW = '2026-08-12T14:06:00.000Z'
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
  costCoveragePercent: 62,
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
  coverage: DEMO_TOTALS.costCoveragePercent / 100,
} as const

export const DEMO_BASELINE = {
  orders: 512,
  revenue: 20287,
  coveragePercent: 88,
  listingsTooNew: 11,
  windowDays: 90,
} as const

export const DEMO_COUNTS = {
  activeListings: 412,
  drafts: 38,
  expiringWithin7Days: 6,
  listingsWithoutCost: 38,
} as const

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

const TITLE_NOUNS = ['necklace', 'mug', 'table runner', 'apron', 'print', 'candle', 'tote bag', 'earrings', 'coaster set', 'napkin set', 'wall hanging', 'keychain'] as const
const TITLE_ADJECTIVES = ['Handmade', 'Personalized', 'Stonewashed', 'Hand-thrown', 'Minimalist', 'Vintage-style', 'Custom', 'Rustic'] as const
const TITLE_QUALIFIERS = ['for her', 'gift set', 'natural linen', 'gold filled', 'made to order', 'housewarming gift', 'wedding favour'] as const

export function buildDemoListings(): EtsyListing[] {
  const rng = mulberry32(20260812)
  const listings: EtsyListing[] = []

  FEATURED.forEach((f, i) => {
    listings.push({
      etsyListingId: `L${String(1001 + i).padStart(5, '0')}`,
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
      renewsAt: '2026-09-02T00:00:00.000Z',
      lastChangedAt: '2026-08-10T09:00:00.000Z',
    })
  })

  const total = DEMO_COUNTS.activeListings + DEMO_COUNTS.drafts
  for (let i = listings.length; i < total; i++) {
    const isDraft = i >= DEMO_COUNTS.activeListings
    const noun = pick(rng, TITLE_NOUNS)
    const adjective = pick(rng, TITLE_ADJECTIVES)
    const qualifier = pick(rng, TITLE_QUALIFIERS)
    const price = round2(9 + rng() * 65)
    const state: ListingState = isDraft ? 'DRAFT' : rng() < 0.015 ? 'EXPIRED' : 'ACTIVE'
    const tagCount = 5 + Math.floor(rng() * 9)

    listings.push({
      etsyListingId: `L${String(1001 + i).padStart(5, '0')}`,
      title: `${adjective} ${noun}, ${qualifier}`,
      description: 'Made to order in small batches. Materials and dimensions are listed below.',
      tags: Array.from({ length: tagCount }, (_, t) => `${noun.split(' ')[0]} tag ${t + 1}`),
      price,
      quantity: state === 'ACTIVE' ? Math.floor(rng() * 60) : 0,
      state,
      section: pick(rng, SECTIONS),
      sku: `WF-${String(i).padStart(4, '0')}`,
      attributes: {},
      requiredAttributes: rng() < 0.034 ? ['Primary material'] : [],
      photoCount: 1 + Math.floor(rng() * 9),
      renewsAt: state === 'ACTIVE' ? '2026-10-04T00:00:00.000Z' : null,
      lastChangedAt: '2026-07-30T12:00:00.000Z',
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

export function buildDemoOrders(listings: EtsyListing[]): EtsyOrder[] {
  const rng = mulberry32(438438)
  const sellable = listings.filter((l) => l.state === 'ACTIVE')
  const orders: EtsyOrder[] = []

  const start = new Date(PERIOD_START).getTime()
  const dayMs = 86_400_000

  for (let i = 0; i < DEMO_TOTALS.orderCount; i++) {
    // Weight order dates so the last five days sit below the baseline band -
    // this is the dip Shop Pulse diagnoses as UNKNOWN.
    let dayOffset = Math.floor(rng() * 30)
    if (dayOffset >= 25 && rng() < 0.45) dayOffset = Math.floor(rng() * 25)

    const listing = pick(rng, sellable)
    const quantity = rng() < 0.87 ? 1 : 2
    const unitPrice = listing.price
    const gross = round2(unitPrice * quantity)

    orders.push({
      etsyReceiptId: `#${30040 + i}`,
      placedAt: new Date(start + dayOffset * dayMs + Math.floor(rng() * dayMs)).toISOString(),
      gross,
      discounts: 0,
      refunds: 0,
      etsyFees: round2(gross * 0.162),
      paymentProcessing: round2(gross * 0.03 + 0.25),
      offsiteAds: rng() < 0.14 ? round2(gross * 0.15) : 0,
      countryCode: pickCountry(rng),
      items: [{ etsyListingId: listing.etsyListingId, quantity, unitPrice }],
    })
  }

  orders.sort((a, b) => a.placedAt.localeCompare(b.placedAt))
  return reconcileToTotals(orders)
}

/**
 * Scale generated orders onto the designed totals, then absorb the rounding
 * remainder into the final order so the sum is exact rather than approximate.
 */
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
