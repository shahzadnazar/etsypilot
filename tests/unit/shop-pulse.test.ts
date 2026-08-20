import { describe, expect, it } from 'vitest'
import { getShopPulse } from '@/domain/shop-pulse/service'
import { compareRates, confidenceFor, diagnose } from '@/domain/shop-pulse/correlation'
import { DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'

const ctx = { shopId: DEMO_SHOP_ID, actorId: 'demo-user-salman', readOnly: true }
const view = await getShopPulse(ctx)

describe('baseline', () => {
  it('is built from the shop’s own history, one point per day', () => {
    expect(view.orders.series).toHaveLength(30)
    expect(view.orders.windowDays).toBe(90)
  })

  it('detects that the period ran below its own baseline', () => {
    expect(view.orders.deviationPercent).toBeLessThan(0)
    expect(view.revenue.deviationPercent).toBeLessThan(0)
  })

  it('reports baseline coverage rather than implying it is complete', () => {
    expect(view.orders.coveragePercent).toBe(88)
    expect(view.orders.listingsTooNew).toBe(11)
  })

  it('marks days outside the expected band', () => {
    expect(view.orders.series.some((p) => p.outside)).toBe(true)
    for (const p of view.orders.series) {
      expect(p.lower).toBeLessThanOrEqual(p.upper)
      expect(p.lower).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('diagnosis is reached, not asserted', () => {
  it('finds the price rise CORRELATED with a real fall in orders', () => {
    const price = view.changes.find((c) => c.id === 'CH-PRICE')
    expect(price?.diagnosis).toBe('CORRELATED')
    expect(price?.ordersAfterPercent).toBeLessThan(-15)
  })

  it('RULES OUT the tag job, whose listings were not the ones that fell', () => {
    const tags = view.changes.find((c) => c.id === 'CH-TAGS')
    expect(tags?.diagnosis).toBe('RULED_OUT')
    expect(Math.abs(tags?.ordersAfterPercent ?? 99)).toBeLessThan(15)
  })

  it('finds the stockout CORRELATED — the listing sold nothing while out', () => {
    const stock = view.changes.find((c) => c.id === 'CH-STOCK')
    expect(stock?.diagnosis).toBe('CORRELATED')
  })

  it('reports the unexplained dip as UNKNOWN and offers no cause', () => {
    const unknown = view.changes.find((c) => c.diagnosis === 'UNKNOWN')
    expect(unknown).toBeDefined()
    expect(unknown?.eventType).toBeNull()
    expect(unknown?.evidence.observed.join(' ')).toContain('No event in your history')
    expect(unknown?.evidence.limitations.join(' ')).toContain('not guessing at a cause')
  })

  it('never claims knowledge of Etsy’s ranking algorithm', () => {
    const all = JSON.stringify(view).toLowerCase()
    expect(all).not.toContain('etsy lowered')
    expect(all).not.toContain('because etsy')
    expect(all).not.toMatch(/algorithm (changed|penal)/)
  })

  it('reaches all three verdicts on the demo shop', () => {
    expect(view.counts.CORRELATED).toBeGreaterThan(0)
    expect(view.counts.RULED_OUT).toBeGreaterThan(0)
    expect(view.counts.UNKNOWN).toBeGreaterThan(0)
  })
})

describe('every diagnosis carries the evidence that produced it', () => {
  it('states what was observed, what else was tested, and what it cannot tell you', () => {
    for (const c of view.changes) {
      expect(c.evidence.observed.length, c.id).toBeGreaterThan(0)
      expect(c.evidence.alsoTested.length, c.id).toBeGreaterThan(0)
      expect(c.evidence.limitations.length, c.id).toBeGreaterThan(0)
      expect(c.evidence.confidence, c.id).toBeTruthy()
      expect(c.evidence.coverageNote, c.id).toBeTruthy()
    }
  })

  it('keeps ruled-out alternatives visible rather than hiding them', () => {
    const price = view.changes.find((c) => c.id === 'CH-PRICE')
    expect(price?.evidence.alsoTested.some((a) => a.verdict === 'RULED_OUT')).toBe(true)
  })

  it('always says orders alone are the basis, since views are unavailable', () => {
    for (const c of view.changes) {
      expect(c.evidence.limitations.join(' '), c.id).toContain('orders alone')
    }
  })

  it('gives every change somewhere to go', () => {
    for (const c of view.changes) {
      expect(c.destinations.length, c.id).toBeGreaterThan(0)
      for (const d of c.destinations) expect(d.href).toBeTruthy()
    }
  })
})

describe('correlation primitives', () => {
  it('returns UNKNOWN whenever there is no event, whatever the movement', () => {
    const huge = {
      beforePerDay: 10, afterPerDay: 1, changePercent: -90,
      daysBefore: 10, daysAfter: 10, ordersBefore: 100, ordersAfter: 10,
    }
    expect(diagnose(huge, false)).toBe('UNKNOWN')
  })

  it('rules out an event whose movement is immaterial', () => {
    const flat = {
      beforePerDay: 10, afterPerDay: 9.8, changePercent: -2,
      daysBefore: 10, daysAfter: 10, ordersBefore: 100, ordersAfter: 98,
    }
    expect(diagnose(flat, true)).toBe('RULED_OUT')
  })

  it('raises confidence only with time and breadth', () => {
    const thin = {
      beforePerDay: 2, afterPerDay: 1, changePercent: -50,
      daysBefore: 3, daysAfter: 2, ordersBefore: 6, ordersAfter: 2,
    }
    expect(confidenceFor(thin, 1)).toBe('LOW')

    const solid = {
      beforePerDay: 4, afterPerDay: 3, changePercent: -25,
      daysBefore: 20, daysAfter: 20, ordersBefore: 80, ordersAfter: 60,
    }
    expect(confidenceFor(solid, 3)).toBe('HIGH')
  })

  it('measures a rate over an empty listing set as shop-wide', () => {
    const c = compareRates([], [], '2026-07-24T00:00:00.000Z', '2026-07-14T00:00:00.000Z', '2026-08-12T00:00:00.000Z')
    expect(c.ordersBefore).toBe(0)
    expect(c.changePercent).toBe(0)
  })
})

describe('baseline figures reconcile with the designed shop', () => {
  it('the orders baseline lands on the shop’s prior run rate', () => {
    // Designed: 512 orders per 30-day window. Weekday shaping moves it a little.
    expect(Math.abs(view.orders.expectedTotal - 512)).toBeLessThan(15)
  })

  it('the revenue baseline lands on the shop’s prior run rate', () => {
    // Designed: $20,287 per 30-day window.
    expect(Math.abs(view.revenue.expectedTotal - 20287)).toBeLessThan(700)
  })

  it('reports the designed deviation, near enough to be the same finding', () => {
    expect(view.orders.deviationPercent).toBeLessThan(-10)
    expect(view.orders.deviationPercent).toBeGreaterThan(-20)
    expect(view.revenue.deviationPercent).toBeLessThan(-5)
    expect(view.revenue.deviationPercent).toBeGreaterThan(-15)
  })
})
