import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE ORDERS SYNC. SAME SHAPE AS LISTINGS: A FUNCTION, WRITTEN AGAINST THE
 *   INTERFACE, THAT NEVER NAMES AN ADAPTER.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * lib/etsy/index.ts is the only file that chooses an adapter and both adapters
 * satisfy the same EtsyService, so this asks the selector for whichever one
 * the deployment has and writes what comes back. No timer, no queue, no cron:
 * when and how often is a later decision and a different kind of problem.
 *
 * assertCanWrite(ctx) is the gate, and it refuses a demo shop — so the mock's
 * invented receipts can never land in a seller's tables, where they would
 * survive a switch to live mode and be served as that seller's own sales.
 *
 * ── WHAT IS DIFFERENT FROM LISTINGS, AND IT IS NOT COSMETIC ───────────────
 *
 * getOrders takes a WINDOW, not a page. getListings reads a whole catalogue
 * and so can treat absence as removal; a window is a slice of history and
 * absence from it says nothing at all. So this sync has no removal step, and
 * the window it reads is an explicit argument rather than a constant hidden
 * inside it — a caller that syncs a different period gets different rows and
 * removes none of the others.
 */

import { getEtsyService } from '@/lib/etsy'
import { assertTermsAccepted } from '@/domain/legal/acceptance'
import { assertCanWrite, type ShopContext } from '@/lib/permissions'
import { writeSyncedOrders, type OrderSyncOutcome, type OrderWindow } from '@/lib/repositories/orders'

export interface OrderSyncResult extends OrderSyncOutcome {
  /** How many receipts the adapter handed over, before merging lines. */
  received: number
  syncedAt: string
  window: OrderWindow
}

/**
 * Pull this shop's orders for a window from whichever adapter the deployment
 * has, and write them.
 *
 * Re-runnable: the repository upserts on (shop_id, etsy_receipt_id), so running
 * it twice leaves the same rows and a refund that arrived in between updates
 * the order it belongs to rather than adding a second one.
 */
export async function syncShopOrders(
  ctx: ShopContext,
  window: OrderWindow,
): Promise<OrderSyncResult> {
  assertCanWrite(ctx)
  /*
   * ── AND THE TERMS, BECAUSE §4 SAYS "BEFORE THEIR NEXT CONNECT OR SYNC" ──
   *
   * assertCanWrite answers "may this shop be written to". This answers a
   * different question: is there an accepted agreement with this seller for
   * the documents AS THEY ARE NOW. A seller who connected under one version
   * and whose documents have since changed materially is asked again here,
   * before any further Etsy data is read — which is the half of Etsy's API
   * Terms §4 that a one-time checkbox at connect would miss.
   *
   * After assertCanWrite, not before: a read-only shop should be told it is
   * read-only rather than asked to accept an agreement it cannot act on.
   */
  await assertTermsAccepted(ctx.shopId)

  const etsy = getEtsyService()
  const received = await etsy.getOrders(ctx.shopId, window)

  /*
   * Handed straight to the repository, which de-duplicates by receipt id.
   *
   * That used to happen here. It belongs there: the unique index the
   * duplicates would violate is the repository's, the multi-row upsert that
   * makes de-duplication mandatory rather than prudent is the repository's,
   * and a second caller writing orders would otherwise have to remember.
   * `received` is still reported, so a caller can see how much the provider
   * repeated itself.
   *
   * The widening is free: `EtsyOrder` is assignable to `StoredOrder`, so the
   * adapter's objects reach the repository unchanged and un-copied. See
   * domain/orders/types.ts for why the repository's type is the wider one.
   */
  const syncedAt = new Date()
  const outcome = await writeSyncedOrders(ctx.shopId, received, syncedAt)

  return { ...outcome, received: received.length, syncedAt: syncedAt.toISOString(), window }
}
