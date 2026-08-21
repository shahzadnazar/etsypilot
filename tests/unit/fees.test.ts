import { describe, expect, it } from 'vitest'
import { calculateFees } from '@/domain/fees/calculate'
import { DEFAULT_FEE_RATES } from '@/domain/fees/rules'

describe('fee breakdown', () => {
  const base = { itemPrice: 24.5, shipping: 5, tax: 2.36, offsiteAd: false }

  it('charges the transaction fee on price PLUS shipping', () => {
    /*
     * The mistake this tool exists to correct. A seller working it out by hand
     * applies 6.5% to the item price and comes out low every time, because
     * Etsy charges on what the buyer pays for the item and the postage.
     */
    const fee = calculateFees(base).lines.find((l) => l.key === 'transaction')!
    expect(fee.amount).toBe(1.92) // 6.5% of 29.50, not of 24.50
    expect(fee.formula).toContain('$29.50')
  })

  it('charges processing on the tax as well, and excludes tax from net', () => {
    const out = calculateFees(base)
    const processing = out.lines.find((l) => l.key === 'processing')!
    // 3% of 31.86 + 0.25
    expect(processing.amount).toBe(1.21)
    expect(processing.formula).toContain('$31.86')
    // Tax is collected for the buyer's state, not earned, so it is not income.
    expect(out.netToSeller).toBe(24.5 + 5 - out.totalFees)
  })

  it('shows Offsite Ads at zero WITH its reason rather than omitting it', () => {
    // A seller who cannot see the line cannot tell whether it was excluded or
    // forgotten.
    const line = calculateFees(base).lines.find((l) => l.key === 'offsite')!
    expect(line.amount).toBe(0)
    expect(line.formula).toMatch(/not attributed/i)
  })

  it('charges Offsite Ads when the sale came from an ad', () => {
    const rates = DEFAULT_FEE_RATES.map((r) =>
      r.key === 'offsite' ? { ...r, percent: 0.15 } : r,
    )
    const out = calculateFees({ ...base, offsiteAd: true, rates })
    expect(out.lines.find((l) => l.key === 'offsite')!.amount).toBe(4.78) // 15% of 31.86
  })

  it('honours a corrected rate, because the schedule is an assumption', () => {
    /*
     * Etsy changes fees and they differ by country. A seller who cannot correct
     * the rate gets a confidently wrong answer, which is worse than no tool.
     */
    const rates = DEFAULT_FEE_RATES.map((r) =>
      r.key === 'transaction' ? { ...r, percent: 0.09 } : r,
    )
    expect(calculateFees({ ...base, rates }).lines.find((l) => l.key === 'transaction')!.amount)
      .toBe(2.66) // 9% of 29.50
  })

  it('carries its limitations and effective date with the numbers', () => {
    // Returned with the calculation, not left for a component to remember.
    const out = calculateFees(base)
    expect(out.limitations.length).toBeGreaterThan(0)
    expect(out.limitations.join(' ')).toMatch(/not a charge Etsy has confirmed/i)
    expect(out.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('does not go negative or NaN on empty input', () => {
    const out = calculateFees({ itemPrice: 0, shipping: 0, tax: 0, offsiteAd: false })
    expect(Number.isFinite(out.totalFees)).toBe(true)
    expect(out.effectivePercent).toBe(0) // not NaN from a divide by zero
  })
})
