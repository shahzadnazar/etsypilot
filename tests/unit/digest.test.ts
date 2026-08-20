import { describe, expect, it } from 'vitest'
import { buildDigest } from '@/domain/shop-pulse/digest'
import { getShopPulse } from '@/domain/shop-pulse/service'
import type { ShopPulseView } from '@/domain/shop-pulse/types'
import { DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'

const ctx = { shopId: DEMO_SHOP_ID, actorId: 'demo-user-salman', readOnly: true }
const pulse = await getShopPulse(ctx)

const opts = {
  shopName: 'Willow & Fern Studio',
  currency: 'USD',
  includeProfit: true,
  netProfit: 4937.15,
  coveragePercent: 62,
  day: 'Thu' as const,
}

describe('weekly digest', () => {
  it('leads with what changed against the baseline', () => {
    const d = buildDigest(pulse, opts)
    expect(d?.headline).toMatch(/Orders were .+ below your baseline this week/)
  })

  it('says plainly that nothing was changed in the shop', () => {
    const d = buildDigest(pulse, opts)
    expect(d?.reassurance).toContain('Nothing has been changed in your shop')
  })

  it('names the unexplained finding without inventing a cause', () => {
    const d = buildDigest(pulse, opts)
    expect(d?.reassurance).toContain('unexplained')
  })

  it('tells the reader why it arrived and how to stop it', () => {
    const d = buildDigest(pulse, opts)
    expect(d?.footer).toContain('Thursdays')
    expect(d?.footer).toContain('one click, no confirmation needed')
  })

  it('sends nothing when nothing crossed the baseline', () => {
    // The suppression rule: "a digest with nothing in it trains you to ignore
    // the next one." There is no empty-digest shape to send.
    const quiet: ShopPulseView = {
      ...pulse,
      changes: [],
      counts: { CORRELATED: 0, RULED_OUT: 0, UNKNOWN: 0 },
      orders: {
        ...pulse.orders,
        series: pulse.orders.series.map((p) => ({ ...p, outside: false })),
      },
    }
    expect(buildDigest(quiet, opts)).toBeNull()
  })

  it('omits profit when the seller has that box unticked', () => {
    const d = buildDigest(pulse, { ...opts, includeProfit: false })
    expect(d?.metrics.some((m) => m.label === 'Net profit')).toBe(false)
  })
})
