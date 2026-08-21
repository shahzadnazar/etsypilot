import { describe, expect, it } from 'vitest'
import { calculateAdsRoi } from '@/domain/ads/roi'

describe('ads roi', () => {
  it('reports no ratio at all for zero spend, not zero return', () => {
    // "0×" would read as "these ads made nothing", which is the opposite of
    // true when nothing was spent. Same class as the 0.0% margin (D57b).
    const out = calculateAdsRoi({ spend: 0, attributedRevenue: 500 })
    expect(out.roas).toBeNull()
    expect(out.formula).toMatch(/enter what you spent/i)
  })

  it('shows that a healthy-looking ROAS can still lose money', () => {
    /*
     * The point of the tool. 4x ROAS is the number sellers quote to each
     * other; at a 20% margin it is a $100 loss on $400 of attributed revenue.
     */
    const out = calculateAdsRoi({ spend: 100, attributedRevenue: 400, marginPercent: 0.2 })
    expect(out.roas).toBe(4)
    expect(out.contributionAfterAds).toBe(-20) // 400 * 0.2 - 100
    expect(out.breakEvenRoas).toBe(5) // needs 5x at a 20% margin
  })

  it('withholds contribution when no margin was given', () => {
    // Assuming a margin would be inventing the seller's costs.
    const out = calculateAdsRoi({ spend: 100, attributedRevenue: 400 })
    expect(out.contributionAfterAds).toBeNull()
    expect(out.breakEvenRoas).toBeNull()
  })

  it('names attribution as Etsy’s claim, not a measurement', () => {
    const out = calculateAdsRoi({ spend: 10, attributedRevenue: 10 })
    expect(out.limitations.join(' ')).toMatch(/party selling the advertising/i)
    expect(out.limitations.join(' ')).toMatch(/would have happened anyway/i)
  })

  it('gives cost per order only when orders were entered', () => {
    expect(calculateAdsRoi({ spend: 90, attributedRevenue: 400 }).costPerOrder).toBeNull()
    expect(calculateAdsRoi({ spend: 90, attributedRevenue: 400, attributedOrders: 6 }).costPerOrder).toBe(15)
  })
})
