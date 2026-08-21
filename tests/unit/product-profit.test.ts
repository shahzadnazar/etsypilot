import { describe, expect, it } from 'vitest'
import { calculateProductProfit } from '@/domain/product-profit/calculate'

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
