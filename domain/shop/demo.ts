import 'server-only'

/*
 * The one place the demo shop's 90-day baseline is allowed to leave the
 * dataset.
 *
 * DEMO_BASELINE is `{ orders: 512, revenue: 20287 }` — Willow & Fern's prior
 * window, chosen so the dashboard deltas match the artboards. It was compared
 * against every shop's figures. Measured in a browser on a live account with
 * two orders and $74.00 of revenue: "▼ 99.6% vs baseline $20,287.00".
 *
 * Same shape as domain/costs/demo.ts and the two before it: null outside demo
 * mode, so a caller that forgot to branch gets a type it has to handle rather
 * than the fixture.
 */

import { isDemoMode } from '@/lib/etsy'
import { DEMO_BASELINE } from '@/lib/etsy/demo-dataset'

export interface ShopBaseline {
  orders: number
  revenue: number
}

export function demoBaseline(): ShopBaseline | null {
  if (!isDemoMode()) return null
  return { orders: DEMO_BASELINE.orders, revenue: DEMO_BASELINE.revenue }
}
