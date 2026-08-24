/*
 * Opportunities, Competitors, Niche and the Seasonal calendar.
 *
 * All four report figures Etsy does not publish, so all four are estimates —
 * and the ways an estimate can quietly become a fact are what this file guards.
 */

import { describe, expect, it } from 'vitest'
import { getOpportunities, sortProducts } from '@/domain/research/opportunities'
import { getCompetitors, medianOf } from '@/domain/research/competitors'
import { conditionsFrom, getNiche } from '@/domain/research/niche'
import { confidenceFor, getSeasonalCalendar, liftOf } from '@/domain/seasonal/service'
import { getSignalsService } from '@/lib/signals'
import { DEMO_ACTOR_ID, DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'
import { shopContext } from '@/lib/permissions'
import type { EtsyOrder } from '@/lib/etsy/interface'

const CTX = shopContext(
  { userId: DEMO_ACTOR_ID, email: 'a@b.c', name: 'A', shopId: DEMO_SHOP_ID, isDemo: true },
  DEMO_SHOP_ID,
)

describe('opportunities', () => {
  it('never scores a product it cannot size', async () => {
    const view = await getOpportunities()
    const unmodelled = view.products.filter((p) => p.monthlySales.value === null)
    expect(unmodelled.length).toBeGreaterThan(0)
    for (const product of unmodelled) {
      // A score over a missing input is a number invented to fill a column —
      // and this column sorts the table.
      expect(product.opportunity, product.title).toBeNull()
      expect(product.monthlyRevenue.value).toBeNull()
    }
  })

  it('applies a sales floor to the low end of the range', async () => {
    const view = await getOpportunities({ minSales: '40' })
    for (const product of view.products) {
      expect(product.monthlySales.value!.min).toBeGreaterThanOrEqual(40)
    }
    /*
     * "Est. sales 30+" has to mean "at least 30 even on the pessimistic
     * reading". Applied to the upper bound, a 5–40 band would pass a filter the
     * seller set to exclude exactly that.
     */
    const loose = await getOpportunities()
    expect(view.products.length).toBeLessThan(loose.products.length)
  })

  it('excludes unmodelled products from a numeric filter rather than keeping them', async () => {
    const view = await getOpportunities({ minSales: '1' })
    expect(view.products.every((p) => p.monthlySales.value !== null)).toBe(true)
  })

  it('sorts unmodelled rows last when the key is an estimate, and normally when it is not', async () => {
    const products = await getSignalsService().findProducts({ term: '', market: 'United States' })

    /*
     * The split is between what the SORT KEY is, not what the row is.
     *
     * Opportunity and revenue are modelled, so a row with neither cannot be
     * ranked by them and goes last — sorting it as zero would say it is the
     * worst, which is a claim nobody made.
     *
     * Age and review count are observed on the listing itself, so an unmodelled
     * row ranks by them like any other. NEWEST is the case that proves it: the
     * newest listings are exactly the ones too new to model, and pinning them
     * to the bottom would empty the one order they should lead.
     */
    for (const sort of ['OPPORTUNITY', 'REVENUE'] as const) {
      const sorted = sortProducts(products, sort)
      const firstUnmodelled = sorted.findIndex((p) => p.opportunity === null)
      const lastModelled = sorted.map((p) => p.opportunity !== null).lastIndexOf(true)
      expect(firstUnmodelled, sort).toBeGreaterThan(lastModelled)
    }

    const newest = sortProducts(products, 'NEWEST')
    expect(newest[0]!.opportunity, 'the newest listing is the one too new to model').toBeNull()
    expect(newest[0]!.ageMonths).toBe(Math.min(...products.map((p) => p.ageMonths)))
  })

  it('offers to drop the filter that emptied the table', async () => {
    const view = await getOpportunities({ minSales: '99999' })
    expect(view.products).toHaveLength(0)
    expect(view.filters.minSales).toBe(99999)
  })
})

describe('competitors', () => {
  it('reports a shop it has not observed as absent', async () => {
    const view = await getCompetitors(CTX, { shop: 'A Shop That Does Not Exist' })
    // The adapter used to answer any string with the same figures, so a typo
    // produced a confident profile for a shop that does not exist.
    expect(view.selected).toBeNull()
    expect(view.notFound).toBe('A Shop That Does Not Exist')
  })

  it('tracks more than one shop, with different figures', async () => {
    const view = await getCompetitors(CTX)
    expect(view.shops.length).toBeGreaterThan(1)
    const listings = view.shops.map((s) => s.activeListings)
    expect(new Set(listings).size).toBe(listings.length)
  })

  it('derives revenue from the sales range and the observed median price', async () => {
    const view = await getCompetitors(CTX)
    for (const shop of view.shops) {
      const sales = shop.monthlySales.value!
      const revenue = shop.monthlyRevenue.value!
      // Within rounding of sales x median price, so the two cannot drift apart.
      expect(revenue.min).toBeCloseTo(Math.round((sales.min * shop.medianPrice) / 100) * 100, -2)
    }
  })

  it('has no median price for an empty catalogue', () => {
    // Not zero. $0.00 beside a competitor's $42 reads as ruinous undercutting.
    expect(medianOf([])).toBeNull()
    expect(medianOf([10, 20, 30])).toBe(20)
    expect(medianOf([10, 20, 30, 40])).toBe(25)
  })

  it('marks a tag the competitor uses and this shop does not', async () => {
    const view = await getCompetitors(CTX)
    expect(view.comparison!.gaps.length).toBeGreaterThan(0)
    expect(view.comparison!.gaps.some((g) => g.yourCount === 0)).toBe(true)
  })
})

describe('niche research', () => {
  it('takes everything down together when a term is unsampled', async () => {
    const view = await getNiche({ q: 'a term nobody has ever sampled' })
    expect(view.sparse).toBe(true)
    expect(view.signals.demand.value).toBeNull()
    /*
     * Crowding without demand, or a price band without listings, would be a
     * confident-looking row built on nothing.
     */
    expect(view.signals.crowding).toBeNull()
    expect(view.signals.priceBand).toBeNull()
    expect(view.signals.concentration).toBeNull()
    expect(view.conditions).toHaveLength(0)
  })

  it('offers the terms it has actually sampled', async () => {
    const view = await getNiche({ q: 'nonsense' })
    expect(view.known.length).toBeGreaterThan(0)
    const real = await getNiche({ q: view.known[0]! })
    expect(real.sparse).toBe(false)
  })

  it('states conditions, never a recommendation', async () => {
    const view = await getNiche({ q: 'linen table linens' })
    expect(view.conditions.length).toBeGreaterThan(2)
    for (const condition of view.conditions) {
      // A condition carries a number the seller can check. Advice does not.
      expect(condition.text, condition.text).toMatch(/\d/)
      expect(condition.from.length).toBeGreaterThan(3)
      expect(condition.text.toLowerCase()).not.toMatch(
        /\byou should\b|\bwe recommend\b|\bthis is a good\b|\benter this niche\b/,
      )
    }
  })

  it('leaves a sub-niche with too few samples with no figures at all', async () => {
    const view = await getNiche({ q: 'linen table linens' })
    const thin = view.signals.subNiches.find((s) => s.demand.value === null)!
    expect(thin).toBeDefined()
    expect(thin.priceBand).toBeNull()
    expect(thin.crowding).toBeNull()
    // The listing count IS observed, so it stays. Absence is per-figure.
    expect(thin.listings).toBeGreaterThan(0)
  })

  it('says nothing about a season it cannot see', () => {
    const flat = {
      term: 't',
      market: 'm',
      demand: { value: null, provenance: { type: 'UNAVAILABLE' as const, source: '', methodology: '' } },
      listings: { value: null, provenance: { type: 'UNAVAILABLE' as const, source: '', methodology: '' } },
      crowding: null,
      priceBand: null,
      concentration: null,
      history: [],
      subNiches: [],
      observedAt: '',
    }
    expect(conditionsFrom(flat)).toHaveLength(0)
  })
})

describe('seasonal calendar', () => {
  const order = (month: string): EtsyOrder => ({
    etsyReceiptId: `#${month}-${Math.random()}`,
    placedAt: `2026-${month}-15T00:00:00.000Z`,
    gross: 10,
    discounts: 0,
    refunds: 0,
    etsyFees: 0,
    paymentProcessing: 0,
    offsiteAds: 0,
    countryCode: 'US',
    items: [],
  })

  it('never claims high confidence on a short history', () => {
    // A seasonal claim is a claim about a repeating pattern, and one season
    // cannot show a repeat.
    expect(confidenceFor(4, 500)).toBe('LOW')
    expect(confidenceFor(14, 40)).toBe('MODERATE')
    expect(confidenceFor(30, 200)).toBe('HIGH')
  })

  it('drops to low confidence when the window months were never observed', () => {
    expect(confidenceFor(30, 200, false)).toBe('LOW')
  })

  it('compares rates per month, not totals', () => {
    // Five months against seven: the totals would report a "lift" that is only
    // the window being longer.
    const inside = Array.from({ length: 50 }, () => order('11'))
    const outside = Array.from({ length: 70 }, () => order('03'))
    expect(liftOf(inside, outside, 5)).toBeCloseTo(1, 0)
  })

  it('gives every window a confidence and the reason for it', async () => {
    const view = await getSeasonalCalendar(CTX)
    expect(view.windows.length).toBeGreaterThan(0)
    for (const window of view.windows) {
      expect(['HIGH', 'MODERATE', 'LOW']).toContain(window.confidence)
      // A window with a confidence and no basis is a label, and a label is not
      // evidence. This is why the screen can ship on thin history.
      expect(window.basis.length, window.name).toBeGreaterThan(40)
    }
  })

  it('measures no lift over months the shop has never lived through', async () => {
    const view = await getSeasonalCalendar(CTX)
    /*
     * The demo shop has four months of orders. A "0.1x lift" for a November
     * window it has never seen is arithmetic on absence, and it reads as a
     * measured finding.
     */
    expect(view.historyMonths).toBeLessThan(12)
    for (const window of view.windows) {
      expect(window.observedLift, window.name).toBeNull()
      expect(window.confidence).toBe('LOW')
    }
  })
})
