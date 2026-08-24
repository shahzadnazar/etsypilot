/*
 * UNKNOWN is read first.
 *
 * The decision was recorded and half-implemented: truncation was fixed, the
 * sort was not. A CORRELATED row is a question already answered — here is what
 * moved, here is the change that preceded it. An UNKNOWN row is the part of the
 * shop nobody can account for. Ranking by magnitude alone buried it third on
 * the demo shop, under two changes the product had already explained.
 */
import { describe, expect, it } from 'vitest'
import { getShopPulse } from '@/domain/shop-pulse/service'
import { shopContext } from '@/lib/permissions'
import { DEMO_ACTOR_ID, DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'

const CTX = shopContext(
  { userId: DEMO_ACTOR_ID, email: 'a@b.c', name: 'A', shopId: DEMO_SHOP_ID, isDemo: true },
  DEMO_SHOP_ID,
)

describe('shop pulse ordering', () => {
  it('puts every UNKNOWN above every CORRELATED', async () => {
    const view = await getShopPulse(CTX)
    const order = view.changes.map((c) => c.diagnosis)
    const lastUnknown = order.lastIndexOf('UNKNOWN')
    const firstCorrelated = order.indexOf('CORRELATED')
    expect(order).toContain('UNKNOWN')
    expect(order).toContain('CORRELATED')
    expect(lastUnknown).toBeLessThan(firstCorrelated)
  })

  it('still orders by magnitude within a diagnosis', async () => {
    const view = await getShopPulse(CTX)
    for (const diagnosis of ['UNKNOWN', 'CORRELATED', 'RULED_OUT'] as const) {
      const sizes = view.changes
        .filter((c) => c.diagnosis === diagnosis)
        .map((c) => Math.abs(c.ordersAfterPercent ?? 0))
      const sorted = [...sizes].sort((a, b) => b - a)
      expect(sizes, `${diagnosis} not ordered by magnitude`).toEqual(sorted)
    }
  })

  it('ranks RULED_OUT last — a tested hypothesis that did not hold', async () => {
    const view = await getShopPulse(CTX)
    const order = view.changes.map((c) => c.diagnosis)
    if (order.includes('RULED_OUT') && order.includes('CORRELATED')) {
      expect(order.indexOf('RULED_OUT')).toBeGreaterThan(order.lastIndexOf('CORRELATED'))
    }
  })
})
