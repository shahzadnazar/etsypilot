import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE SELLER'S ORDERS. THE SECOND AGGREGATE, AND THE ONE THAT TESTED THE
 *   PATTERN RATHER THAN JUST REPEATING IT.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Same three pieces as listings: a repository scoped by shopId on every
 * statement, a sync that is a function, and one source decision. Two things
 * are genuinely different and both are about telling absence from zero.
 *
 * ── 1. THE READ RETURNS `StoredOrder[]`, NOT `EtsyOrder[]` ────────────────
 *
 * domain/orders/types.ts has the argument in full. In one line: `EtsyOrder`
 * declares `etsyFees: number`, the table must be able to say "the ledger has
 * not been read", and mapping null to 0 would reinstate the exact lie
 * migration 0011 removes. `StoredOrder` widens those three fields and nothing
 * else, so `EtsyOrder` is still assignable to it and the demo path needs no
 * mapper.
 *
 * ── 2. THE SYNC NEVER REMOVES AN ORDER, AND LISTINGS DOES ─────────────────
 *
 * The listings sync dates anything the adapter stopped returning, because it
 * reads the WHOLE catalogue and absence from it is a fact. Orders are read as
 * a TIME WINDOW. Absence from one window says nothing — it may be an order
 * outside the range, a page the provider shortened, or a window that moved —
 * so there is no safe reading of "gone" and this sync has no removal step.
 *
 * A receipt is also a historical fact in a way a listing is not. A seller can
 * take a listing down; they cannot unsell an order. A cancelled receipt
 * arrives as a REFUND on the same receipt, which is why `refunds` is a column
 * and why the upsert overwrites it.
 *
 * ── SHOP SCOPING IS STRUCTURAL, NOT REMEMBERED ────────────────────────────
 *
 * Every exported function takes `shopId` as its FIRST parameter and every
 * statement filters on it — including the statements against `order_items`,
 * which carries its own `shop_id` precisely so a line can be scoped without
 * joining through its order. tests/unit/orders-repository.test.ts asserts both
 * halves from the source, the same sweep the listings repository gets.
 */

import { randomUUID } from 'node:crypto'
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import { writeAggregateSyncedAt } from '@/lib/repositories/sync-state'
import type { StoredOrder, StoredOrderItem } from '@/domain/orders/types'

/** A half-open-at-neither-end window, matching EtsyService.getOrders. */
export interface OrderWindow {
  since: string
  until: string
}

function amount(raw: string | null): number | null {
  if (raw === null) return null
  const parsed = Number(raw)
  /*
   * A stored value that is not a number reads as UNKNOWN, not as zero.
   *
   * Postgres numeric accepts the literal 'NaN' — found while building the
   * listings slice, where the write path now refuses a non-finite price. This
   * is the read side of the same hazard: if such a value ever reaches this
   * column, null sends it down the "fees are not known" path and the screen
   * withholds the figure, rather than Number() handing a NaN into a sum and
   * poisoning the whole period silently.
   */
  return Number.isFinite(parsed) ? parsed : null
}

/** Money we require. Non-finite becomes 0 here because the column is NOT NULL. */
function requiredAmount(raw: string): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * This shop's orders in a window, newest first, with their lines.
 *
 * Two statements rather than a join: a join would repeat every order row once
 * per line and the grouping would have to be undone in JS anyway. Both are
 * scoped by shopId; the second does not rely on the first having been.
 */
export async function readOrders(shopId: string, window: OrderWindow): Promise<StoredOrder[]> {
  const db = getDb()
  const since = new Date(window.since)
  const until = new Date(window.until)

  const rows = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.shopId, shopId),
        gte(schema.orders.placedAt, since),
        lte(schema.orders.placedAt, until),
      ),
    )
  if (rows.length === 0) return []

  const lines = await db
    .select()
    .from(schema.orderItems)
    .where(
      and(
        eq(schema.orderItems.shopId, shopId),
        inArray(
          schema.orderItems.orderId,
          rows.map((row) => row.id),
        ),
      ),
    )

  const byOrder = new Map<string, StoredOrderItem[]>()
  for (const line of lines) {
    const list = byOrder.get(line.orderId) ?? []
    list.push({
      etsyListingId: line.etsyListingId,
      quantity: line.quantity,
      unitPrice: requiredAmount(line.unitPrice),
    })
    byOrder.set(line.orderId, list)
  }

  return rows
    .map((row) => ({
      etsyReceiptId: row.etsyReceiptId,
      placedAt: row.placedAt.toISOString(),
      gross: requiredAmount(row.gross),
      discounts: requiredAmount(row.discounts),
      refunds: requiredAmount(row.refunds),
      etsyFees: amount(row.etsyFees),
      paymentProcessing: amount(row.paymentProcessing),
      offsiteAds: amount(row.offsiteAds),
      /*
       * 'XX' is the unknown-country code the profit domain and the sales map
       * already understand — live.ts maps a receipt with no country to it. A
       * null column reads the same way rather than becoming an empty string,
       * which would be a third spelling of the same absence.
       */
      countryCode: row.countryCode ?? 'XX',
      items: byOrder.get(row.id) ?? [],
    }))
    .sort((left, right) => right.placedAt.localeCompare(left.placedAt))
}

/** How many orders we hold for this shop, in a window. */
export async function countOrders(shopId: string, window: OrderWindow): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.shopId, shopId),
        gte(schema.orders.placedAt, new Date(window.since)),
        lte(schema.orders.placedAt, new Date(window.until)),
      ),
    )
  return row?.total ?? 0
}

export interface OrderSyncOutcome {
  /** Receipts inserted or updated from this run's payload. */
  upserted: number
  /** Order lines inserted or updated. */
  lines: number
  /** Lines deleted because the receipt no longer carries that listing. */
  linesRemoved: number
}

/**
 * The fee fields, as the sync writes them: always unknown.
 *
 * ── ONE PLACE, SO THERE IS ONE PLACE TO CHANGE ────────────────────────────
 *
 * No adapter can currently report a fee. lib/etsy/live.ts's toOrder()
 * hardcodes all three to 0 and says why — Etsy exposes them through the
 * payment-account ledger, not the receipt — and `EtsyOrder` types them as
 * plain `number`, so a 0 arriving here is indistinguishable from a genuine
 * zero and provably means "not loaded".
 *
 * Writing the adapter's 0 would therefore write a verified-looking zero.
 * Writing NULL states what is true. The cost is that this DISCARDS a figure
 * if some future adapter starts supplying one, which is why it is a named
 * function with this comment on it rather than three literals inline: the day
 * the ledger lands, `EtsyOrder` gains `number | null` and this function is the
 * only thing that has to change.
 */
function feesAsWritten(): { etsyFees: null; paymentProcessing: null; offsiteAds: null } {
  return { etsyFees: null, paymentProcessing: null, offsiteAds: null }
}

/**
 * Merge the lines of one receipt by Etsy listing id.
 *
 * ── WHY MERGING IS NECESSARY AND WHY IT IS SAFE ───────────────────────────
 *
 * A receipt can carry the same listing twice — two variations of one listing
 * are two Etsy transactions with one listing_id — and `(order_id,
 * etsy_listing_id)` is the only key available, because `EtsyOrderItem` carries
 * no transaction id and lib/etsy/live.ts's receipt payload does not read one.
 * Without merging the second line aborts the transaction on the unique index.
 *
 * Quantities add. The unit price becomes the VALUE-WEIGHTED average, so
 * `quantity x unitPrice` still equals the summed line value rather than
 * picking one of two prices and losing the difference.
 *
 * It cannot affect net profit: the waterfall sums `orders.gross`, never the
 * lines (checked in domain/profit/waterfall.ts), so order-level money is
 * untouched by any rounding here. What is lost is per-variation granularity,
 * which the adapter's type does not carry in the first place — so nothing is
 * dropped that a reader could otherwise have seen.
 */
function mergeLines(items: readonly StoredOrderItem[]): StoredOrderItem[] {
  const byListing = new Map<string, { quantity: number; value: number }>()
  for (const item of items) {
    const seen = byListing.get(item.etsyListingId) ?? { quantity: 0, value: 0 }
    seen.quantity += item.quantity
    seen.value += item.quantity * item.unitPrice
    byListing.set(item.etsyListingId, seen)
  }
  return [...byListing.entries()].map(([etsyListingId, merged]) => ({
    etsyListingId,
    quantity: merged.quantity,
    unitPrice: merged.quantity === 0 ? 0 : Math.round((merged.value / merged.quantity) * 100) / 100,
  }))
}

/**
 * Write what the adapter returned for this shop's orders.
 *
 * ── RE-RUNNABLE, AND WHAT A RE-RUN DOES TO A CHANGED ORDER ────────────────
 *
 * Upserted on (shop_id, etsy_receipt_id). An order that has changed since the
 * last sync is UPDATED in place, and that is the point rather than a
 * concession: a refund arrives days after the sale, on the same receipt, so
 * `gross`, `discounts` and `refunds` are overwritten with the provider's
 * current view. Two rows for one receipt would double a seller's revenue.
 *
 * `placed_at` is overwritten too, and it is the one field that should never
 * actually move; it is included so that a provider correcting a timestamp is
 * followed rather than silently ignored.
 *
 * ── EXCEPT A FEE, WHICH A RE-SYNC CAN ONLY EVER ADD ───────────────────────
 *
 * The fee columns use COALESCE(excluded, existing). Today the sync always
 * writes NULL (see feesAsWritten), so without this a later re-run would ERASE
 * a fee that something else — a ledger import, an operator correction — had
 * put there, and the period would silently go back to "fees unknown". One
 * direction only: this sync may learn a fee, never forget one.
 *
 * ── AND `cost_snapshot` IS NOT IN THE CONFLICT SET AT ALL ─────────────────
 *
 * Cost rules are their own aggregate. Null already means "no confirmed cost,
 * so this order is excluded from profit rather than given an assumed one",
 * which is exactly right for an order whose cost nobody has recorded. Leaving
 * the column out of the upsert means a re-sync cannot erase a snapshot either.
 */
export async function writeSyncedOrders(
  shopId: string,
  received: readonly StoredOrder[],
  syncedAt: Date = new Date(),
): Promise<OrderSyncOutcome> {
  /*
   * ── DE-DUPLICATED HERE, AND THE BATCH MAKES IT MANDATORY ────────────────
   *
   * A provider can hand back the same receipt twice: a window re-read, a page
   * that shifted, or — measured — MockEtsyService returning 1,968 orders over
   * a wide window with only 1,530 distinct receipt ids.
   *
   * Row by row that was merely wasteful. In a MULTI-ROW upsert it is a
   * correctness problem with two different failure modes, and the second is
   * the dangerous one:
   *
   *   same batch       Postgres raises "ON CONFLICT DO UPDATE command cannot
   *                    affect row a second time" and the sync fails loudly.
   *   different batch  the second batch quietly updates what the first
   *                    inserted, `returning` yields one row rather than two,
   *                    and the receipt-to-id map comes back short. Lines would
   *                    then be written against the wrong order or not at all.
   *
   * The guard below catches the second case, and it is how this was found. But
   * a guard that fires is still a failed sync, so the duplicates are removed
   * before they reach the statement. LAST WINS: a later read is the more
   * recent view of the same receipt.
   */
  const byReceipt = new Map<string, StoredOrder>(
    received.map((order) => [order.etsyReceiptId, order]),
  )
  const orders = [...byReceipt.values()]

  return getDb().transaction(async (tx) => {
    /*
     * Our own listing ids for the listings these orders sold, resolved ONCE.
     *
     * `order_items.listing_id` is a foreign key to our listings row, so it can
     * only be set for a listing we hold. Orders commonly sync before listings
     * do, and a listing sold before this shop connected may never be held at
     * all — so the column stays null in those cases rather than the sync
     * failing on a foreign key. `etsy_listing_id` carries the identity
     * regardless, which is why migration 0011 added it.
     */
    const soldListingIds = [
      ...new Set(orders.flatMap((order) => order.items.map((item) => item.etsyListingId))),
    ]
    const ourListings =
      soldListingIds.length > 0
        ? await tx
            .select({ id: schema.listings.id, etsyListingId: schema.listings.etsyListingId })
            .from(schema.listings)
            .where(
              and(
                eq(schema.listings.shopId, shopId),
                inArray(schema.listings.etsyListingId, soldListingIds),
              ),
            )
        : []
    const listingIdFor = new Map(ourListings.map((row) => [row.etsyListingId, row.id]))

    /* ── THE RECEIPTS ──────────────────────────────────────────────────── */

    const orderIdFor = new Map<string, string>()
    for (const batch of chunk(orders, BATCH)) {
      const rows = await tx
        .insert(schema.orders)
        .values(
          batch.map((order) => ({
            id: `order_${randomUUID()}`,
            shopId,
            etsyReceiptId: order.etsyReceiptId,
            placedAt: new Date(order.placedAt),
            gross: String(order.gross),
            discounts: String(order.discounts),
            refunds: String(order.refunds),
            ...feesAsWritten(),
            countryCode: order.countryCode,
          })),
        )
        .onConflictDoUpdate({
          target: [schema.orders.shopId, schema.orders.etsyReceiptId],
          /*
           * `excluded.*` rather than per-row literals, which is what makes the
           * batch possible: one statement, one set clause, every row taking
           * its own incoming value. `id` is deliberately absent — order_items
           * points at it, and re-minting it would orphan every line.
           */
          set: {
            placedAt: sql`excluded.placed_at`,
            gross: sql`excluded.gross`,
            discounts: sql`excluded.discounts`,
            refunds: sql`excluded.refunds`,
            etsyFees: sql`coalesce(excluded.etsy_fees, ${schema.orders.etsyFees})`,
            paymentProcessing: sql`coalesce(excluded.payment_processing, ${schema.orders.paymentProcessing})`,
            offsiteAds: sql`coalesce(excluded.offsite_ads, ${schema.orders.offsiteAds})`,
            countryCode: sql`excluded.country_code`,
          },
        })
        .returning({ id: schema.orders.id, etsyReceiptId: schema.orders.etsyReceiptId })
      for (const row of rows) orderIdFor.set(row.etsyReceiptId, row.id)
    }
    if (orderIdFor.size !== orders.length) {
      throw new Error(
        `order upsert returned ${orderIdFor.size} rows for ${orders.length} receipts; refusing to write lines against an incomplete map`,
      )
    }

    /* ── THE LINES ─────────────────────────────────────────────────────── */

    const lineRows = orders.flatMap((order) => {
      const orderId = orderIdFor.get(order.etsyReceiptId)
      if (!orderId) throw new Error(`no order id for receipt ${order.etsyReceiptId}`)
      return mergeLines(order.items).map((line) => ({
        id: `item_${randomUUID()}`,
        shopId,
        orderId,
        etsyListingId: line.etsyListingId,
        listingId: listingIdFor.get(line.etsyListingId) ?? null,
        quantity: line.quantity,
        unitPrice: String(line.unitPrice),
      }))
    })

    for (const batch of chunk(lineRows, BATCH)) {
      await tx
        .insert(schema.orderItems)
        /*
         * `shopId` RE-ASSERTED AT THE STATEMENT, not only in the builder.
         *
         * `lineRows` already carries it, so at runtime this spread changes
         * nothing. It is here because the batch moved the scope out of the
         * statement and into a variable thirty lines up — and
         * tests/unit/orders-repository.test.ts, which reads the source, could
         * no longer see that the insert was scoped. It said so, which is the
         * guard working.
         *
         * Weakening the guard to accept `.values(batch)` would have made it
         * accept the version where the builder HAD forgotten. So the scope
         * comes back to where it can be checked, and is now guaranteed twice.
         */
        .values(batch.map((row) => ({ ...row, shopId })))
        .onConflictDoUpdate({
          target: [schema.orderItems.orderId, schema.orderItems.etsyListingId],
          // costSnapshot is deliberately absent. See the note on this function.
          set: {
            quantity: sql`excluded.quantity`,
            unitPrice: sql`excluded.unit_price`,
            listingId: sql`excluded.listing_id`,
          },
        })
    }

    /*
     * ── LINES THE RECEIPTS NO LONGER CARRY, IN ONE STATEMENT ────────────
     *
     * This ran once per order, which is where most of the sync's time went:
     * measured at 5,973ms for 1,968 receipts, about 5,900 round trips. One
     * row-comparison DELETE replaces 1,968 of them.
     *
     * Deleting a line is not the inconsistency with "the sync never removes an
     * order" that it looks like: the receipt in hand is the complete, current
     * list of what it contains, unlike a time window, which is a slice of
     * history and says nothing about what lies outside it. Nothing in the
     * schema references order_items — checked against pg_constraint — so no
     * history is destroyed.
     */
    const orderIds = [...orderIdFor.values()]
    let linesRemoved = 0
    if (orderIds.length > 0) {
      const keep = lineRows.map((row) => sql`(${row.orderId}, ${row.etsyListingId})`)
      const removed = await tx
        .delete(schema.orderItems)
        .where(
          and(
            eq(schema.orderItems.shopId, shopId),
            inArray(schema.orderItems.orderId, orderIds),
            /*
             * `(order_id, etsy_listing_id) not in (...)` — a row comparison, so
             * a listing kept on ONE receipt is not kept on every receipt. An
             * order whose lines all vanished has nothing in `keep` for it, and
             * the empty-list case has to be handled separately because SQL's
             * `not in ()` is not valid.
             */
            keep.length > 0
              ? sql`(${schema.orderItems.orderId}, ${schema.orderItems.etsyListingId}) not in (${sql.join(keep, sql`, `)})`
              : sql`true`,
          ),
        )
        .returning({ id: schema.orderItems.id })
      linesRemoved = removed.length
    }

    /*
     * Written even for an empty payload, and that is deliberate. "We read this
     * shop's orders and it has none in the window" is knowledge; without the
     * row the Action Center could not tell it from "nobody has looked", which
     * is the distinction this aggregate was built around.
     */
    await writeAggregateSyncedAt(tx, shopId, 'ORDERS', syncedAt)

    return { upserted: orders.length, lines: lineRows.length, linesRemoved }
  })
}

/**
 * How many rows go in one statement.
 *
 * Not a tuning knob anybody should need to touch. Postgres caps a statement at
 * 65,535 bound parameters and an order row binds nine, so 200 rows is ~1,800 —
 * well inside it, with the same headroom for the seven-column line rows. The
 * ceiling matters because a shop's order history is unbounded in a way its
 * catalogue is not: 1,968 receipts is an ordinary year of modest sales.
 */
const BATCH = 200

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
