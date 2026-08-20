import { describe, expect, it } from 'vitest'
import { METHODOLOGIES, getMethodology } from '@/lib/provenance/methodology'

describe('methodology', () => {
  it('every entry states a source and a method', () => {
    for (const [key, m] of Object.entries(METHODOLOGIES)) {
      expect(m.source, key).toBeTruthy()
      expect(m.method, key).toBeTruthy()
    }
  })

  it('every estimated metric states its limitations and confidence', () => {
    for (const [key, m] of Object.entries(METHODOLOGIES)) {
      if (m.type !== 'ESTIMATED') continue
      expect(m.confidence, key).toBeTruthy()
      expect(m.limitations?.length, key).toBeGreaterThan(0)
    }
  })

  it('carries coverage — the field the original tooltips lacked', () => {
    expect(METHODOLOGIES.netProfit?.coverage).toBe(62)
    expect(METHODOLOGIES.netProfit?.coverageLabel).toContain('confirmed cost')
    expect(METHODOLOGIES.shopPulseBaseline?.coverage).toBe(88)
  })

  it('net profit states that it is computed from the lines', () => {
    expect(METHODOLOGIES.netProfit?.method).toContain('never stored')
  })

  it('an unavailable metric offers a remedy instead of a number', () => {
    const views = METHODOLOGIES.listingViews
    expect(views?.type).toBe('UNAVAILABLE')
    expect(views?.limitations?.join(' ')).toContain('will not be estimated')
  })

  it('returns null for an unknown metric rather than an empty shell', () => {
    expect(getMethodology('nope')).toBeNull()
  })
})
