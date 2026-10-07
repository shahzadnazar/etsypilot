import 'server-only'

/*
 * The markers on the baseline chart.
 *
 * `app/(dashboard)/shop-pulse/page.tsx` passed DEMO_EVENTS straight into
 * <BaselineChart>, so a real seller's orders-against-baseline chart carried
 * the demo shop's price changes, bulk job, stockout and deactivation as
 * annotated verticals — the fixture drawn on top of their own measurements.
 *
 * Same single exit as the rest of this module: the fixture in demo mode, the
 * shop's own `events` rows otherwise. Empty today for a live shop, because
 * nothing writes that table yet — which is the honest chart.
 */

import { BASELINE_START, PERIOD_END } from '@/lib/etsy/demo-dataset'
import { readEvents } from '@/lib/repositories/events'
import type { DomainEvent } from '@/lib/events/types'
import type { ShopContext } from '@/lib/permissions'
import { demoEvents } from './demo'

export async function pulseChartEvents(ctx: ShopContext): Promise<DomainEvent[]> {
  return demoEvents() ?? readEvents(ctx.shopId, { since: BASELINE_START, until: PERIOD_END })
}
