import { describe, expect, it } from 'vitest'
import {
  buildDemoListings,
  buildDemoOrders,
  buildDemoPriorOrders,
  DEMO_BASELINE,
  DEMO_TOTALS,
  NARRATIVE,
} from '@/lib/etsy/demo-dataset'

const listings = buildDemoListings()
const orders = buildDemoOrders(listings)

function countFor(ids: readonly string[], from?: string, until?: string): number {
  return orders.filter(
    (o) =>
      o.items.some((i) => ids.includes(i.etsyListingId)) &&
      (!from || o.placedAt >= from) &&
      (!until || o.placedAt < until),
  ).length
}

describe('the demo shop actually contains the drop it claims', () => {
  it('still totals 438 orders after the rewrite', () => {
    expect(orders).toHaveLength(DEMO_TOTALS.orderCount)
  })

  it('orders on the price group really do fall after the change', () => {
    const before = countFor(NARRATIVE.priceGroup, undefined, NARRATIVE.priceChangeAt)
    const after = countFor(NARRATIVE.priceGroup, NARRATIVE.priceChangeAt)
    const daysBefore = 10
    const daysAfter = 20
    const rateBefore = before / daysBefore
    const rateAfter = after / daysAfter

    expect(rateBefore).toBeGreaterThan(rateAfter)
    // The engine has to find roughly a 30% fall, so the data must contain one.
    const fall = (rateBefore - rateAfter) / rateBefore
    expect(fall).toBeGreaterThan(0.2)
    expect(fall).toBeLessThan(0.45)
  })

  it('the out-of-stock listing sells nothing at all while it is out', () => {
    const during = countFor(
      [NARRATIVE.stockoutListing],
      `${NARRATIVE.stockoutFrom}T04:00:00.000Z`,
      `${NARRATIVE.stockoutUntil}T04:00:00.000Z`,
    )
    expect(during).toBe(0)

    const after = countFor([NARRATIVE.stockoutListing], `${NARRATIVE.stockoutUntil}T04:00:00.000Z`)
    expect(after).toBeGreaterThan(0)
  })

  it('deactivated seasonal listings stop selling entirely', () => {
    const seasonal = listings
      .filter((l) => l.state === 'ACTIVE' && l.section === 'Seasonal')
      .slice(0, 4)
      .map((l) => l.etsyListingId)
    const after = countFor(seasonal, `${NARRATIVE.deactivatedFrom}T04:00:00.000Z`)
    expect(after).toBe(0)
  })

  it('generates 90 days of prior history so the baseline is measured, not asserted', () => {
    const prior = buildDemoPriorOrders(listings)
    const perThirtyDays = (prior.length / 90) * 30
    expect(Math.abs(perThirtyDays - DEMO_BASELINE.orders)).toBeLessThan(20)
  })

  it('the period really is below the prior baseline', () => {
    const prior = buildDemoPriorOrders(listings)
    const baselinePerDay = prior.length / 90
    const actualPerDay = orders.length / 30
    expect(actualPerDay).toBeLessThan(baselinePerDay)
  })
})
