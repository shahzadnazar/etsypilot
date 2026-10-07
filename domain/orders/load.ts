import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   ONE LOADER, ELEVEN READERS. SWITCHING A SERVICE TO OUR OWN TABLES IS A
 *   ONE-LINE CHANGE, WHICH IS THE PATTERN'S WHOLE CLAIM.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The listings slice put its branch inline, in the one service that reads
 * listings. Orders are read by eleven call sites across the Action Center,
 * Shop Pulse, profit, analytics, the sales map, experiments, costs, the audit,
 * the extension, the dashboard overview and the seasonal calendar — so the
 * branch is here once instead of eleven times.
 *
 * That is not only tidiness. Eleven copies of a three-way branch is eleven
 * chances for one of them to read the table in demo mode, or to treat
 * NOT_SYNCED as an empty list. This file is the thing the next three
 * aggregates should copy.
 *
 * ── WHAT EACH SOURCE MEANS FOR A CALLER ───────────────────────────────────
 *
 *   DEMO        the mock's receipts, with real fee figures on them, exactly
 *               as before. Touches no table.
 *   NOT_SYNCED  nothing has read this shop's orders. The array is empty AND
 *               the caller must not present it as "no orders" — see below.
 *   SYNCED      our own rows, as of the aggregate's own sync time.
 *   NO_SHOP     the session names a shop row that is gone.
 *
 * ── AN EMPTY ARRAY IS NOT THE ANSWER, AND ORDERS IS THE SHARP CASE ────────
 *
 * The Action Center exists to say what needs the seller's attention. Handed an
 * empty order list it would compute a clean waterfall, find nothing wrong, and
 * say "nothing needs your attention" — which is the opposite of the truth when
 * nothing has been read. So `source` comes back with the orders and every
 * caller has to look at it; that is why this returns a record rather than an
 * array.
 */

import { getEtsyService } from '@/lib/etsy'
import type { ShopContext } from '@/lib/permissions'
import { readOrders, type OrderWindow } from '@/lib/repositories/orders'
import { shopDataSource, type ShopDataSource } from '@/domain/sync/source'
import type { StoredOrder } from '@/domain/orders/types'

export interface LoadedOrders {
  orders: readonly StoredOrder[]
  source: ShopDataSource
  /** From `shops.currency` on a synced shop, null in demo mode. */
  currency: string | null
}

/**
 * This shop's orders for a window, from wherever this deployment keeps them.
 *
 * DEMO calls the adapter and touches no table. NOT_SYNCED and NO_SHOP read
 * nothing at all — a query returning an empty array would make them
 * indistinguishable from a synced shop with no orders, at the only point where
 * the difference is still knowable.
 */
export async function loadOrders(ctx: ShopContext, window: OrderWindow): Promise<LoadedOrders> {
  const { source, currency } = await shopDataSource(ctx, 'ORDERS')

  if (source.kind === 'DEMO') {
    /*
     * The adapter's `EtsyOrder[]` is handed straight back as `StoredOrder[]`.
     * No mapper and no copy: `number` is assignable to `number | null`, so the
     * widening is free. domain/orders/types.ts has the argument.
     */
    const orders = await getEtsyService().getOrders(ctx.shopId, window)
    return { orders, source, currency: null }
  }

  if (source.kind !== 'SYNCED') return { orders: [], source, currency }

  return { orders: await readOrders(ctx.shopId, window), source, currency }
}

/**
 * True when this source means the caller is looking at a real answer.
 *
 * For a screen that must not state a negative — "no orders", "nothing needs
 * your attention", "no refunds this period" — this is the question to ask
 * before writing the sentence.
 */
export function ordersWereRead(source: ShopDataSource): boolean {
  return source.kind === 'DEMO' || source.kind === 'SYNCED'
}
