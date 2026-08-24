/*
 * Shop analytics, the sales map and the experiment tracker.
 *
 * Three different ways to overstate what receipts can tell you, and one test
 * file for all three:
 *
 *   analytics    a ratio dressed as a verified figure
 *   sales map    a country with two orders in it, which is nearly a buyer list
 *   experiments  a causal claim, from a shop with no control group
 */

import { describe, expect, it } from 'vitest'
import { getAnalytics, percentChange, previousPeriod } from '@/domain/analytics/service'
import { aggregateByCountry, getSalesMap, SUPPRESSION_THRESHOLD } from '@/domain/analytics/sales-map'
import { evaluate, getExperiments, MIN_POST_DAYS, type Experiment } from '@/domain/analytics/experiments'
import type { DomainEvent } from '@/lib/events/types'
import type { EtsyOrder } from '@/lib/etsy/interface'
import { DEMO_ACTOR_ID, DEMO_SHOP_ID, PERIOD_START } from '@/lib/etsy/demo-dataset'
import { shopContext } from '@/lib/permissions'

const CTX = shopContext(
  { userId: DEMO_ACTOR_ID, email: 'a@b.c', name: 'A', shopId: DEMO_SHOP_ID, isDemo: true },
  DEMO_SHOP_ID,
)

describe('shop analytics', () => {
  it('has a previous period to compare against', async () => {
    const view = await getAnalytics(CTX)
    /*
     * The adapter served only the reporting period at first, so every
     * comparison came back null and the screen reported "no previous period"
     * for a shop with three months of history behind it.
     */
    expect(view.change.grossSales).not.toBeNull()
    expect(view.daily.some((d) => d.previousRevenue !== null)).toBe(true)
  })

  it('aligns the comparison by position, not by calendar date', async () => {
    const view = await getAnalytics(CTX)
    const previous = previousPeriod()
    expect(Date.parse(previous.end)).toBeLessThan(Date.parse(PERIOD_START))
    // Every day in the window has a counterpart, because both windows are the
    // same length. Matching on the date would have found none.
    expect(view.daily.filter((d) => d.previousRevenue !== null).length).toBe(view.daily.length)
  })

  it('counts refunds from the receipts rather than a stated rate', async () => {
    const view = await getAnalytics(CTX)
    expect(view.refundedOrders).toBeGreaterThan(0)
    expect(view.refundTotal).toBeGreaterThan(0)
    expect(view.refundRate).toBeCloseTo((view.refundedOrders / view.orderCount) * 100, 1)
  })

  it('has no average order when there are no orders', () => {
    // Not $0.00, which reads as a shop selling at no price.
    expect(percentChange(0, 100)).toBeNull()
  })

  it('leaves a top listing without a confirmed cost with no margin', async () => {
    const view = await getAnalytics(CTX)
    expect(view.topListings.length).toBeGreaterThan(0)
    for (const listing of view.topListings) {
      expect(listing.margin === null || typeof listing.margin === 'number').toBe(true)
    }
  })

  it('gives its listings a margin spread worth ranking', async () => {
    const view = await getAnalytics(CTX)
    const margins = view.topListings
      .map((l) => l.margin)
      .filter((m): m is number => m !== null)
    /*
     * Every listing used to cost the same fraction of its own price, so all 398
     * had a 51% margin and the "best margin" insight fired on a 0.7-point
     * spread. An insight that fires on noise teaches the reader to ignore the
     * panel.
     */
    expect(Math.max(...margins) - Math.min(...margins)).toBeGreaterThan(10)
  })

  it('states the section shares as a share of the period, summing to the whole', async () => {
    const view = await getAnalytics(CTX)
    const total = view.sections.reduce((sum, s) => sum + s.revenue, 0)
    expect(total).toBeCloseTo(view.grossSales, 0)
  })
})

describe('sales map', () => {
  const order = (code: string, gross = 40): EtsyOrder => ({
    etsyReceiptId: `#${code}-${gross}`,
    placedAt: '2026-07-20T00:00:00.000Z',
    gross,
    discounts: 0,
    refunds: 0,
    etsyFees: 0,
    paymentProcessing: 0,
    offsiteAds: 0,
    countryCode: code,
    items: [],
  })

  it('folds a country under the threshold into the aggregate row', () => {
    const orders = [
      ...Array.from({ length: 9 }, () => order('US')),
      ...Array.from({ length: 2 }, () => order('IE')),
      order('NZ'),
    ]
    const rows = aggregateByCountry(orders)
    expect(rows.map((r) => r.code)).toEqual(['US', 'OTHER'])
    const other = rows.find((r) => r.aggregate)!
    expect(other.orders).toBe(3)
    expect(other.name).toBe('2 other regions')
  })

  it('never reports an average for the aggregate row', () => {
    const rows = aggregateByCountry([order('IE'), order('NZ')])
    // A figure describing a group whose members the seller cannot see is not a
    // figure anyone can act on.
    expect(rows[0]!.averageOrder).toBeNull()
  })

  it('suppresses before the data leaves the domain', () => {
    const rows = aggregateByCountry([order('IE'), order('IE')])
    // No row anywhere in the result names IE, so a component cannot render one.
    expect(JSON.stringify(rows)).not.toContain('IE')
  })

  it('exercises suppression on the demo shop, rather than only in theory', async () => {
    const view = await getSalesMap(CTX)
    expect(view.suppressedCountries).toBeGreaterThan(0)
    expect(view.rows.some((r) => r.aggregate)).toBe(true)
    for (const row of view.rows.filter((r) => !r.aggregate)) {
      expect(row.orders).toBeGreaterThanOrEqual(SUPPRESSION_THRESHOLD)
    }
  })

  it('has nowhere to put a buyer', async () => {
    const view = await getSalesMap(CTX)
    const keys = new Set(view.rows.flatMap((r) => Object.keys(r)))
    // The row model is the guarantee. There is no field a name or an address
    // could be assigned to, so no future edit can start showing one.
    expect([...keys].sort()).toEqual(['aggregate', 'averageOrder', 'code', 'name', 'orders', 'sales'])
  })
})

describe('experiments', () => {
  const base: Experiment = {
    id: 'T',
    name: 'Test',
    hypothesis: 'x',
    startedAt: '2026-07-15T00:00:00.000Z',
    listingIds: ['L1'],
    primaryMetric: 'VERIFIED_ORDERS',
  }

  const orders = (from: string, count: number): EtsyOrder[] =>
    Array.from({ length: count }, (_, i) => ({
      etsyReceiptId: `#${from}-${i}`,
      placedAt: new Date(Date.parse(from) + i * 3_600_000).toISOString(),
      gross: 10,
      discounts: 0,
      refunds: 0,
      etsyFees: 0,
      paymentProcessing: 0,
      offsiteAds: 0,
      countryCode: 'US',
      items: [{ etsyListingId: 'L1', quantity: 1, unitPrice: 10 }],
    }))

  it('compares rates, not totals', () => {
    // 28 orders over 14 days before, 30 over 20 days after: the totals rose and
    // the RATE fell. Comparing totals would have called this positive.
    const result = evaluate(
      base,
      [...orders('2026-07-01T00:00:00.000Z', 28), ...orders('2026-07-15T00:00:00.000Z', 30)],
      '2026-08-04T00:00:00.000Z',
    )
    expect(result.before.rate).toBeGreaterThan(result.after.rate)
    expect(result.verdict).toBe('NEGATIVE')
  })

  it('refuses to call a result before the minimum window', () => {
    const result = evaluate(
      base,
      [...orders('2026-07-01T00:00:00.000Z', 14), ...orders('2026-07-15T00:00:00.000Z', 40)],
      '2026-07-20T00:00:00.000Z',
    )
    expect(result.after.days).toBeLessThan(MIN_POST_DAYS)
    expect(result.verdict).toBe('INCONCLUSIVE')
    expect(result.reasoning).toContain(String(MIN_POST_DAYS))
  })

  it('reaches a positive verdict when the numbers support one', () => {
    const result = evaluate(
      base,
      [...orders('2026-07-01T00:00:00.000Z', 14), ...orders('2026-07-15T00:00:00.000Z', 60)],
      '2026-08-01T00:00:00.000Z',
    )
    expect(result.verdict).toBe('POSITIVE')
  })

  it('calls a small movement inconclusive rather than a result', () => {
    const result = evaluate(
      base,
      [...orders('2026-07-01T00:00:00.000Z', 28), ...orders('2026-07-15T00:00:00.000Z', 35)],
      '2026-08-01T00:00:00.000Z',
    )
    expect(result.verdict).toBe('INCONCLUSIVE')
  })

  it('downgrades a large movement when another change overlaps it', () => {
    const event: DomainEvent = {
      eventId: 'E1',
      shopId: DEMO_SHOP_ID,
      listingId: 'L1',
      actorId: null,
      timestamp: '2026-07-22T00:00:00.000Z',
      type: 'LISTING_DEACTIVATED',
      source: 'MANUAL',
      field: 'state',
      beforeValue: 'ACTIVE',
      afterValue: 'INACTIVE',
      operationId: null,
      reason: null,
    }
    const data = [...orders('2026-07-01T00:00:00.000Z', 14), ...orders('2026-07-15T00:00:00.000Z', 60)]
    expect(evaluate(base, data, '2026-08-01T00:00:00.000Z').verdict).toBe('POSITIVE')
    /*
     * Same numbers, one known other cause inside the window. A large movement
     * with something else in it is the most misleading thing this screen could
     * report, because the size of the number is what makes it convincing.
     */
    const withEvent = evaluate(base, data, '2026-08-01T00:00:00.000Z', [event])
    expect(withEvent.verdict).toBe('INCONCLUSIVE')
    expect(withEvent.overlappingEvents).toHaveLength(1)
  })

  it('does not treat the experiment’s own change as a confound', () => {
    const own: DomainEvent = {
      eventId: 'E2',
      shopId: DEMO_SHOP_ID,
      listingId: 'L1',
      actorId: null,
      timestamp: base.startedAt,
      type: 'TAGS_CHANGED',
      source: 'BULK_EDIT',
      field: 'tags',
      beforeValue: null,
      afterValue: null,
      operationId: null,
      reason: null,
    }
    const data = [...orders('2026-07-01T00:00:00.000Z', 14), ...orders('2026-07-15T00:00:00.000Z', 60)]
    expect(evaluate(base, data, '2026-08-01T00:00:00.000Z', [own]).verdict).toBe('POSITIVE')
  })

  it('never claims a cause, on any verdict', async () => {
    const view = await getExperiments(CTX)
    expect(view.results.length).toBeGreaterThan(0)
    for (const result of view.results) {
      /*
       * The REASONING is what a hurried reader takes away, so it may not use a
       * causal verb at all. The limitations may — and must — because there the
       * word appears inside a denial: "it is not evidence that the change
       * caused it". An earlier version of this test matched the word anywhere
       * and failed on the disclaimer, which is the opposite of what it is for.
       */
      expect(result.reasoning.toLowerCase(), result.experiment.name).not.toMatch(
        /\bcaused\b|\bbecause of\b|\bdue to your\b|\bdrove\b|\bresulted in\b/,
      )
      // Every card says what it cannot tell you. Never optional.
      expect(result.limitations.length).toBeGreaterThan(2)
      expect(result.limitations.join(' ').toLowerCase()).toContain('not evidence that the change')
    }
  })

  it('agrees with Shop Pulse about the seasonal listings', async () => {
    const view = await getExperiments(CTX)
    const seasonal = view.results.find((r) => r.experiment.name.includes('seasonal'))!
    /*
     * Shop Pulse reports the Aug 6 deactivation as correlated with a fall on
     * these listings. Before group events named their listings, the experiment
     * tracker reported the seller's title change as the cause of the same fall
     * — two screens contradicting each other about one set of listings.
     */
    expect(seasonal.overlappingEvents.length).toBeGreaterThan(0)
    expect(seasonal.verdict).toBe('INCONCLUSIVE')
  })
})
