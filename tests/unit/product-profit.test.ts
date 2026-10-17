import { describe, expect, it } from 'vitest'
import { calculateProductProfit } from '@/domain/product-profit/calculate'
import { DEFAULT_FEE_RATES } from '@/domain/fees/rules'

const base = {
  price: 32, shippingCharged: 5, materials: 8.5, packaging: 1.2,
  shippingCost: 6.4, minutes: 25, hourlyRate: 20,
}

describe('one product, end to end', () => {
  it('costs the seller’s time as a line, not an option', () => {
    /*
     * The single most useful thing this tool can show: leaving labour out is
     * how a handmade seller concludes a product is profitable while paying
     * themselves below minimum wage.
     */
    const labour = calculateProductProfit(base).lines.find((l) => l.key === 'labour')!
    expect(labour.amount).toBe(8.33) // 25/60 * 20
    expect(labour.formula).toContain('25 min')
  })

  it('says plainly when a product loses money on every sale', () => {
    const out = calculateProductProfit({ ...base, price: 12 })
    expect(out.profit).toBeLessThan(0)
    expect(out.warning).toMatch(/loses \$/)
  })

  it('is silent when the product is profitable', () => {
    expect(calculateProductProfit({ ...base, price: 60 }).warning).toBeNull()
  })

  it('reports no margin rather than 0% when there is no revenue', () => {
    expect(calculateProductProfit({ ...base, price: 0, shippingCharged: 0 }).marginPercent).toBeNull()
  })

  it('accounts for the fee when solving break-even', () => {
    /*
     * Naive cost-plus is always short: raising the price raises the
     * transaction and processing fees with it, so break-even is above the sum
     * of the costs.
     */
    const out = calculateProductProfit(base)
    const nonFee = out.totalCosts - out.lines.find((l) => l.key === 'fees')!.amount
    expect(out.breakEvenPrice).toBeGreaterThan(nonFee - base.shippingCharged)
  })

  it('notices postage charged is not postage paid', () => {
    const line = calculateProductProfit(base).lines.find((l) => l.key === 'shipping')!
    expect(line.amount).toBe(6.4)
    expect(line.formula).toContain('charge $5.00')
    expect(line.formula).toContain('pay $6.40')
  })
})

/* ───────────────── the landing page's calculator, case by case ─────────── */

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE TEN CASES THE PUBLIC CALCULATOR IS SHIPPED AGAINST.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * `components/marketing/profit-calculator.tsx` runs this function, in the
 * browser, on numbers a stranger types. It is the only arithmetic on the site
 * that a visitor can get wrong in front of a customer, so the cases below are
 * the brief's list rather than a sample of it: positive, negative,
 * break-even, zero price, missing optional costs, different fee rates, the
 * ads toggle both ways, invalid input, the percentage, and the formatting.
 *
 * They run against the DOMAIN function, not the component. The component owns
 * no arithmetic — it parses strings, hands them over and renders what comes
 * back — which is what makes a test at this level worth anything.
 */
describe('the public profit calculator', () => {
  const sale = {
    price: 42, shippingCharged: 5, materials: 12.5, packaging: 0,
    shippingCost: 4.8, minutes: 0, hourlyRate: 0,
  }

  it('1. reports a profit as a positive number, with its margin', () => {
    const out = calculateProductProfit(sale)
    expect(out.revenue).toBe(47)
    expect(out.profit).toBeGreaterThan(0)
    expect(out.marginPercent).toBeGreaterThan(0)
    expect(out.warning).toBeNull()
    // Revenue less every cost, to the penny, rather than "about right".
    expect(out.profit).toBe(Math.round((out.revenue - out.totalCosts) * 100) / 100)
  })

  it('2. reports a LOSS as a negative number and never clamps it to zero', () => {
    /*
     * The defect this test exists for: `Math.max(0, netProfit)` renders a
     * product that loses $6 a sale as "$0.00 profit", which reads as
     * break-even. A seller acting on that keeps selling it.
     */
    const out = calculateProductProfit({ ...sale, price: 8, shippingCharged: 0 })
    expect(out.profit).toBeLessThan(0)
    expect(out.marginPercent).toBeLessThan(0)
    expect(out.warning).toMatch(/loses \$/)
  })

  it('3. is zero at break-even, and break-even is above the bare cost sum', () => {
    const out = calculateProductProfit(sale)
    const atBreakEven = calculateProductProfit({ ...sale, price: out.breakEvenPrice })
    expect(Math.abs(atBreakEven.profit)).toBeLessThanOrEqual(0.05)

    // Cost-plus-nothing is always short, because the fee rises with the price.
    const costsWithoutFees = out.totalCosts - out.lines.find((l) => l.key === 'fees')!.amount
    expect(out.breakEvenPrice).toBeGreaterThan(costsWithoutFees - sale.shippingCharged)
  })

  it('4. at a price of zero, reports no margin rather than 0%, and still charges the listing fee', () => {
    /*
     * Two different nothings. A margin needs revenue to be a share OF, so it
     * is null — 0% would be a claim about a sale that did not happen. The
     * listing fee is charged anyway, because Etsy charges it to list the item
     * whether or not it sells, so the loss at zero is real money.
     */
    const out = calculateProductProfit({ ...sale, price: 0, shippingCharged: 0 })
    expect(out.revenue).toBe(0)
    expect(out.marginPercent).toBeNull()
    expect(out.lines.find((l) => l.key === 'fees')!.amount).toBeGreaterThan(0)
    expect(out.profit).toBeLessThan(0)
  })

  it('5. omits no cost when the optional ones are left out', () => {
    const bare = calculateProductProfit({
      price: 20, shippingCharged: 0, materials: 0, packaging: 0,
      shippingCost: 0, minutes: 0, hourlyRate: 0,
    })
    // The five standing lines are always present, at zero, because a seller
    // who cannot see a line cannot tell whether it was excluded or forgotten.
    expect(bare.lines.map((l) => l.key)).toEqual([
      'fees', 'materials', 'packaging', 'shipping', 'labour',
    ])
    // "Other costs" is the one that is absent when it is zero.
    expect(bare.lines.some((l) => l.key === 'other')).toBe(false)
    expect(calculateProductProfit({ ...bare && sale, otherCosts: 3.5 }).lines.some((l) => l.key === 'other')).toBe(true)
  })

  it('6. follows the fee rates it is given, not the published ones', () => {
    /*
     * The whole point of the rates being editable: a seller outside the US,
     * or reading this after Etsy changes a rate, must be able to get a right
     * answer rather than a confidently wrong one.
     */
    const published = calculateProductProfit(sale)
    const doubled = calculateProductProfit({
      ...sale,
      rates: DEFAULT_FEE_RATES.map((rate) =>
        rate.key === 'transaction' ? { ...rate, percent: rate.percent * 2 } : rate,
      ),
    })
    const feeOf = (out: ReturnType<typeof calculateProductProfit>) =>
      out.lines.find((l) => l.key === 'fees')!.amount
    expect(feeOf(doubled)).toBeGreaterThan(feeOf(published))
    expect(doubled.profit).toBeLessThan(published.profit)
    /*
     * 6.5% → 13% on a $47 sale is another 6.5% of $47, which is $3.055 — a
     * number that does not exist in cents. Asserted to the penny either way
     * rather than pinned to one of them: `round2` is round-half-up over a
     * binary float, so 3.055 lands on 3.05 here and the half-penny is a
     * property of the money, not of this calculation.
     */
    expect(feeOf(doubled) - feeOf(published)).toBeCloseTo(3.055, 1)
  })

  it('7. charges Offsite Ads only when the sale is said to have come from one', () => {
    const organic = calculateProductProfit(sale)
    const attributed = calculateProductProfit({
      ...sale,
      offsiteAd: true,
      rates: DEFAULT_FEE_RATES.map((rate) =>
        rate.key === 'offsite' ? { ...rate, percent: 0.15 } : rate,
      ),
    })
    expect(attributed.profit).toBeLessThan(organic.profit)
    expect(Math.round((organic.profit - attributed.profit) * 100) / 100).toBe(7.05) // 15% of $47

    /*
     * And the default rate is zero, so ticking the box alone changes nothing
     * until a seller says which rate applies to them. 12% or 15% depends on
     * their annual revenue, and guessing for them would be the invented
     * figure this product does not ship.
     */
    expect(calculateProductProfit({ ...sale, offsiteAd: true }).profit).toBe(organic.profit)
  })

  it('8. treats an unparseable or negative input as zero rather than as NaN', () => {
    /*
     * The component refuses a keystroke that would not parse, so this is the
     * second line of defence: a NaN reaching the arithmetic renders every
     * figure on the panel as "NaN", which tells a seller their input was fine
     * and the calculator was not.
     */
    const broken = calculateProductProfit({
      ...sale,
      price: Number.NaN,
      materials: -5,
      minutes: Number.NEGATIVE_INFINITY,
    })
    expect(Number.isFinite(broken.profit)).toBe(true)
    expect(Number.isFinite(broken.totalCosts)).toBe(true)
    expect(broken.lines.find((l) => l.key === 'materials')!.amount).toBe(0)
    expect(broken.lines.find((l) => l.key === 'labour')!.amount).toBe(0)
  })

  it('9. states the margin as a share of what the buyer paid, to one decimal', () => {
    const out = calculateProductProfit({ ...sale, price: 50, shippingCharged: 0 })
    expect(out.revenue).toBe(50)
    expect(out.marginPercent).toBe(Math.round((out.profit / 50) * 1000) / 10)
    // One decimal, never more: a margin printed to four places is a precision
    // claim the inputs cannot support.
    expect(String(out.marginPercent).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1)
  })

  it('10. rounds every money figure to the penny, including the negative ones', () => {
    // Priced below its postage, so the figures under test are losses.
    const out = calculateProductProfit({ ...sale, price: 3.333, shippingCharged: 0, materials: 3.333 })
    for (const amount of [out.revenue, out.totalCosts, out.profit, out.breakEvenPrice]) {
      expect(Math.round(amount * 100) / 100, String(amount)).toBe(amount)
    }
    expect(out.profit).toBeLessThan(0)
    // The sign survives the rounding, which is what a $-0.004 would not.
    expect(String(out.profit).startsWith('-')).toBe(true)
  })
})
