import type { EtsyOrder, EtsyOrderItem } from '@/lib/etsy/interface'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE PATTERN BET, TESTED: THE ADAPTER'S TYPE HELD AS A FLOOR, NOT AS THE
 *   EXACT SHAPE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The listings repository returns `EtsyListing[]` — the adapter's own type —
 * and that slice's report named the cost: a column the interface does not
 * carry is unreachable through it, and the day an aggregate needs such a
 * field the choice has to be revisited rather than worked around.
 *
 * Orders is that day. The table must distinguish "fees not loaded" from "fees
 * were zero", and `EtsyOrder` declares:
 *
 *     etsyFees: number
 *     paymentProcessing: number
 *     offsiteAds: number
 *
 * Three non-nullable numbers. The type CANNOT say "unknown", so a repository
 * returning `EtsyOrder[]` would have to map a null column to `0` — putting
 * back exactly the lie migration 0011 exists to remove.
 *
 * ── WIDENED, NOT REPLACED, AND THE DIFFERENCE IS THE WHOLE POINT ──────────
 *
 * The obvious move was a row model plus a mapper, and it is the wrong one:
 * eleven services read orders through `EtsyOrder`, and a parallel type means a
 * mapper to keep in step with the interface forever.
 *
 * So this WIDENS the three fields and changes nothing else. Because `number`
 * is assignable to `number | null`, `EtsyOrder` is assignable to `StoredOrder`
 * for free — the demo path hands the adapter's own objects straight to every
 * reader with no mapper, no copy and no conversion, exactly as listings does.
 * What changed is the direction: the repository returns a SUPERTYPE of the
 * adapter's type rather than the type itself.
 *
 * That is the honest answer to "did the bet hold". It held as a floor. A table
 * may know LESS than the adapter's type promises, and a widening expresses
 * that with no mapper. It would NOT have held the other way: a table that knew
 * MORE — a column with no field at all — has nowhere to go, and
 * `order_items.cost_snapshot` is exactly that case, which is one more reason
 * the sync does not write it.
 *
 * ── AND THE INTERFACE CHANGE THIS DOES NOT MAKE ───────────────────────────
 *
 * The right long-term shape is `EtsyOrder.etsyFees: number | null`, so that an
 * adapter which HAS read the ledger can report a genuine zero and one which
 * has not can say so. That is a change to lib/etsy/interface.ts, which this
 * task may not make; it is proposed in the report instead. Until it lands, the
 * sync writes NULL for all three fees unconditionally, because every 0 the
 * live adapter produces provably means "not loaded" — toOrder() hardcodes
 * them — and no adapter can currently express the difference.
 */

/** An order item as we hold it. Unwidened: the table knows nothing extra. */
export type StoredOrderItem = EtsyOrderItem

export interface StoredOrder
  extends Omit<EtsyOrder, 'etsyFees' | 'paymentProcessing' | 'offsiteAds' | 'items'> {
  /** NULL means the payment-account ledger has not been read. Never zero. */
  etsyFees: number | null
  paymentProcessing: number | null
  offsiteAds: number | null
  items: StoredOrderItem[]
}

/**
 * True when every fee line on every order in this set is known.
 *
 * ── WHY A SET-LEVEL ANSWER AND NOT A PER-ORDER ONE ────────────────────────
 *
 * The waterfall is a PERIOD total. One order with unknown fees makes the
 * period's fee total unknown — summing the rest would report a number smaller
 * than the truth and label it the total, which is the flattering direction
 * again. So the question every reader actually needs is about the set, and
 * asking it once here stops each reader inventing its own answer.
 *
 * An EMPTY set is complete, deliberately. A period with no orders has no fees,
 * and that is knowledge rather than absence: the waterfall over no orders is
 * all zeroes and should say so. "Nothing synced" is a different question,
 * answered by sync_state, and conflating the two here would make an empty
 * period indistinguishable from an unread one all over again.
 */
export function feesAreKnown(orders: readonly StoredOrder[]): boolean {
  return orders.every(
    (order) =>
      order.etsyFees !== null && order.paymentProcessing !== null && order.offsiteAds !== null,
  )
}

/**
 * The fee totals, or null when any of them is unknown.
 *
 * Null rather than a partial sum, for the reason above. Callers that get null
 * must not render a fee figure at all.
 */
export function feeTotals(
  orders: readonly StoredOrder[],
): { etsyFees: number; paymentProcessing: number; offsiteAds: number } | null {
  if (!feesAreKnown(orders)) return null
  return {
    etsyFees: orders.reduce((total, order) => total + (order.etsyFees ?? 0), 0),
    paymentProcessing: orders.reduce((total, order) => total + (order.paymentProcessing ?? 0), 0),
    offsiteAds: orders.reduce((total, order) => total + (order.offsiteAds ?? 0), 0),
  }
}
