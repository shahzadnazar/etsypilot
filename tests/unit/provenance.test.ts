import { describe, expect, it } from 'vitest'
import { estimated, sellerInput, unavailable, verified } from '@/lib/provenance/builders'
import { isUnavailable } from '@/lib/provenance/types'

describe('provenance', () => {
  it('an estimate cannot be published without confidence and limitations', () => {
    const e = estimated(
      { min: 14000, max: 22000 },
      {
        source: 'Public marketplace signals',
        methodology: 'Normalised into a monthly band.',
        confidence: 'HIGH',
        limitations: ['Etsy publishes no search volume.'],
      },
    )
    expect(e.provenance.confidence).toBe('HIGH')
    expect(e.provenance.limitations?.length).toBeGreaterThan(0)
  })

  it('unavailable carries no fallback value', () => {
    const u = unavailable('Etsy does not provide listing views through the public API.')
    expect(u.value).toBeNull()
    expect(isUnavailable(u)).toBe(true)
  })

  it('distinguishes verified from seller input', () => {
    expect(verified(100, 'Your Etsy order receipts').provenance.type).toBe('VERIFIED')
    expect(sellerInput(100).provenance.type).toBe('SELLER_INPUT')
  })
})
