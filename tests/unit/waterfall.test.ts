import { describe, expect, it } from 'vitest'
import { computeWaterfall } from '@/domain/profit/waterfall'
import type { StoredOrder } from '@/domain/orders/types'
import {
  buildDemoListings,
  buildDemoOrders,
  DEMO_COST_INPUTS,
  demoCostCoverage,
  DEMO_TOTALS,
} from '@/lib/etsy/demo-dataset'

/*
 * The demo shop's costs, with `hasAnyRule` true because the demo shop HAS a
 * cost setup — DEMO_COST_INPUTS is exactly that. The flag is not decoration:
 * with it false, computeWaterfall says "you have not entered any costs yet",
 * which is the right sentence for a real seller and the wrong one here.
 */
const COSTS = { ...DEMO_COST_INPUTS, hasAnyRule: true }

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
    /*
     * The fixture's fees are known, which this now states rather than
     * assuming. A null amount here would mean the fee lines went UNAVAILABLE
     * and the reconciliation below would be summing an absence as zero —
     * which is the whole defect the nullable fee columns exist to prevent, so
     * it must not pass quietly in the test that checks the sum.
     */
    expect(result.feesKnown, 'this fixture is meant to have known fees').toBe(true)
    expect(result.netProfit).not.toBeNull()

    const costs = result.lines
      .filter((l) => l.key !== 'gross' && l.key !== 'net')
      .reduce((s, l) => {
        expect(l.amount, `${l.key} has no amount`).not.toBeNull()
        return s + Math.abs(l.amount ?? 0)
      }, 0)
    expect(round2(result.grossRevenue - costs)).toBeCloseTo(result.netProfit!, 1)
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

describe('a period whose fees have not been read', () => {
  /*
   * ██████████████████████████████████████████████████████████████████████
   *
   *   THE OTHER WATERFALL. THIS IS THE ONE THE DASHBOARD'S NET PROFIT TILE
   *   AND THE ACTION CENTER RUN ON.
   *
   * ██████████████████████████████████████████████████████████████████████
   *
   * Added because a NEGATIVE CONTROL found nothing to catch it. Replacing
   * `fees === null ? null : ...` in computeWaterfall with
   * `(fees?.etsyFees ?? 0)` — the exact defect the nullable columns exist to
   * prevent — left all 39 orders integration tests green, because those go
   * through getProfitView, which uses scenarios.ts and totalsFrom instead.
   *
   * domain/profit/types.ts already records what happens when the two
   * implementations drift: "D74 added them to computeWaterfall and missed
   * this type... so the flagship screen went on overstating net profit by
   * exactly their sum while a passing test covered the other
   * implementation." This is the same hazard from the opposite side, and the
   * fix is for BOTH to be covered rather than for one to be trusted.
   */
  const withKnownFees = buildDemoOrders(buildDemoListings())
  const withoutFees = withKnownFees.map((order) => ({
    ...order,
    etsyFees: null,
    paymentProcessing: null,
    offsiteAds: null,
  }))

  it('reports no net profit at all', () => {
    const result = computeWaterfall(withoutFees, COSTS)

    expect(result.feesKnown).toBe(false)
    expect(result.netProfit, 'a net profit was computed without the fees').toBeNull()
    expect(result.totalCosts).toBeNull()
    expect(result.marginPercent).toBeNull()
    // The revenue is still known, and still stated. Only what depends on the
    // fees is withheld.
    expect(result.grossRevenue).toBe(DEMO_TOTALS.grossRevenue)
  })

  it('marks the fee lines UNAVAILABLE rather than VERIFIED', () => {
    const result = computeWaterfall(withoutFees, COSTS)
    for (const key of ['etsyFees', 'processing', 'offsiteAds', 'net']) {
      const line = result.lines.find((l) => l.key === key)
      expect(line?.amount, `${key} drew an amount`).toBeNull()
      expect(line?.provenance.type, key).toBe('UNAVAILABLE')
    }
    // And the lines that ARE known keep their badge.
    expect(result.lines.find((l) => l.key === 'gross')?.provenance.type).toBe('VERIFIED')
    expect(result.lines.find((l) => l.key === 'cogs')?.provenance.type).toBe('SELLER_INPUT')
  })

  it('says so in missingData, and only when it applies', () => {
    const absent = computeWaterfall(withoutFees, COSTS).missingData.join(' ')
    expect(absent).toMatch(/fees for this period have not been read/i)

    // THE CONVERSE. Without this, a product that always warned about fees
    // would satisfy the assertion above perfectly.
    const present = computeWaterfall(withKnownFees, COSTS).missingData.join(' ')
    expect(present).not.toMatch(/have not been read/i)
  })

  it('is decided per SET, so one unread order withholds the period', () => {
    /*
     * The waterfall is a period total. Summing the orders whose fees ARE known
     * and calling it the total would report a number smaller than the truth —
     * the flattering direction — with nothing on screen to say so.
     */
    const mostlyKnown: StoredOrder[] = [...withKnownFees]
    mostlyKnown[0] = { ...mostlyKnown[0]!, etsyFees: null }

    const result = computeWaterfall(mostlyKnown, COSTS)
    expect(result.feesKnown, 'one unknown fee was averaged away').toBe(false)
    expect(result.netProfit).toBeNull()
  })

  it('still computes a net profit when every fee is known', () => {
    // The positive control for the whole block.
    const result = computeWaterfall(withKnownFees, COSTS)
    expect(result.feesKnown).toBe(true)
    expect(result.netProfit).not.toBeNull()
    expect(result.lines.find((l) => l.key === 'etsyFees')?.provenance.type).toBe('VERIFIED')
  })
})
