import { describe, expect, it } from 'vitest'
import { computeWaterfall } from '@/domain/profit/waterfall'
import {
  buildDemoListings,
  buildDemoOrders,
  DEMO_COST_INPUTS,
  demoCostCoverage,
  DEMO_TOTALS,
} from '@/lib/etsy/demo-dataset'

const COSTS = DEMO_COST_INPUTS

describe('demo dataset', () => {
  it('is deterministic across builds', () => {
    const a = buildDemoOrders(buildDemoListings())
    const b = buildDemoOrders(buildDemoListings())
    expect(a).toEqual(b)
  })

  it('produces the designed order count and gross revenue exactly', () => {
    const orders = buildDemoOrders(buildDemoListings())
    expect(orders).toHaveLength(DEMO_TOTALS.orderCount)

    const gross = orders.reduce((s, o) => s + o.gross, 0)
    expect(round2(gross)).toBe(DEMO_TOTALS.grossRevenue)
  })

  it('apportions every verified fee line onto its designed total', () => {
    const orders = buildDemoOrders(buildDemoListings())
    expect(round2(orders.reduce((s, o) => s + o.etsyFees, 0))).toBe(DEMO_TOTALS.etsyFees)
    expect(round2(orders.reduce((s, o) => s + o.paymentProcessing, 0))).toBe(
      DEMO_TOTALS.paymentProcessing,
    )
    expect(round2(orders.reduce((s, o) => s + o.offsiteAds, 0))).toBe(DEMO_TOTALS.offsiteAds)
  })
})

describe('profit waterfall', () => {
  const orders = buildDemoOrders(buildDemoListings())
  const result = computeWaterfall(orders, COSTS)

  it('carries all ten cost lines plus gross and net', () => {
    /*
     * Discounts and refunds were absent for eleven phases, so gross revenue was
     * treated as money kept and net profit was overstated by exactly what had
     * been refunded. Both are on the receipt and both are VERIFIED.
     */
    expect(result.lines.map((l) => l.key)).toEqual([
      'gross',
      'discounts',
      'refunds',
      'etsyFees',
      'processing',
      'offsiteAds',
      'shipping',
      'cogs',
      'labour',
      'other',
      'net',
    ])
  })

  it('reconciles: gross minus every cost equals net', () => {
    const costs = result.lines
      .filter((l) => l.key !== 'gross' && l.key !== 'net')
      .reduce((s, l) => s + Math.abs(l.amount), 0)
    expect(round2(result.grossRevenue - costs)).toBeCloseTo(result.netProfit, 1)
  })

  it('labels verified fee lines VERIFIED and seller costs SELLER_INPUT', () => {
    const byKey = Object.fromEntries(result.lines.map((l) => [l.key, l.provenance.type]))
    expect(byKey.etsyFees).toBe('VERIFIED')
    expect(byKey.processing).toBe('VERIFIED')
    expect(byKey.offsiteAds).toBe('VERIFIED')
    expect(byKey.cogs).toBe('SELLER_INPUT')
    expect(byKey.labour).toBe('SELLER_INPUT')
    expect(byKey.net).toBe('CALCULATED')
  })

  it('never presents incomplete profit as complete', () => {
    // Measured, not stated - no literal here, on purpose.
    expect(result.coveragePercent).toBe(Math.round(demoCostCoverage().coverage * 100))
    expect(result.coveragePercent).toBeLessThan(100)

    const missing = result.missingData.join(' ')
    // The waterfall does fall back to the default rule, so it must say so
    // rather than claiming the uncosted orders were left out.
    expect(missing).toContain('default rule')
    expect(missing).not.toContain('floor')
  })

  it('reproduces every designed cost line from artboard 92', () => {
    const amount = (key: string) =>
      Math.abs(result.lines.find((l) => l.key === key)?.amount ?? 0)

    expect(amount('gross')).toBeCloseTo(DEMO_TOTALS.grossRevenue, 2)
    expect(amount('etsyFees')).toBeCloseTo(DEMO_TOTALS.etsyFees, 2)
    expect(amount('processing')).toBeCloseTo(DEMO_TOTALS.paymentProcessing, 2)
    expect(amount('offsiteAds')).toBeCloseTo(DEMO_TOTALS.offsiteAds, 2)
    expect(amount('shipping')).toBeCloseTo(DEMO_TOTALS.shipping, 2)
    expect(amount('cogs')).toBeCloseTo(DEMO_TOTALS.cogs, 2)
    expect(amount('labour')).toBeCloseTo(DEMO_TOTALS.labour, 2)
    expect(amount('other')).toBeCloseTo(DEMO_TOTALS.otherCosts, 2)
  })

  it('computes net from the lines rather than asserting it', () => {
    /*
     * The artboard states $4,938.20 and its own eight line items sum to
     * $4,937.15 — a $1.05 rounding artifact in the design, recorded here
     * because the waterfall has to add up and the computed figure wins.
     *
     * It is $3,923.15 now, exactly $1,014.00 lower, because Discounts ($412)
     * and Refunds ($602) are subtracted at last. Both were on the design from
     * artboard 53 and in neither the data nor the calculation: the shop was
     * being credited with money it had given back.
     */
    expect(result.netProfit).toBeCloseTo(3923.15, 2)
    expect(result.marginPercent).toBeCloseTo(21.3, 1)
  })
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
