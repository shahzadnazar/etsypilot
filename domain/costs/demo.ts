import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE ONE PLACE DEMO_COST_INPUTS IS ALLOWED TO LEAVE THE DEMO DATASET.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * DEMO_COST_INPUTS is the Willow & Fern designed figures, reverse-derived so
 * the waterfall reconciles against artboard 92:
 *
 *     shippingPerOrder: DEMO_TOTALS.shipping / DEMO_TOTALS.orderCount
 *     cogsPercent:      DEMO_TOTALS.cogs / DEMO_TOTALS.grossRevenue
 *
 * It was imported by eight files, including domain/costs/store.ts, which
 * handed it to a real seller as `defaultCostSettings()` — their starting
 * point, on their own settings page, labelled as their own figure. Measured in
 * a browser in live mode: the form offered `defaultRulePercent 38.0` and
 * `shippingPerOrder 2.6187214611872145`, which is that division, unrounded.
 *
 * ── WHY A MODULE RATHER THAN AN IMPORT AT EACH SITE ───────────────────────
 *
 * So that "is this fixture on a live path" is answerable by reading one import
 * list. tests/unit/costs-repository.test.ts asserts DEMO_COST_INPUTS appears
 * in exactly two files — the dataset that defines it, and this one — and that
 * this one checks the mode. Eight scattered imports could not be checked that
 * way, which is how it reached a seller in the first place.
 *
 * It is NOT a default. A fictional shop's COGS ratio is not a sensible
 * starting value for a real one; a real seller who has set nothing gets null,
 * and the profit screen says so.
 */

import { isDemoMode } from '@/lib/etsy'
import { DEMO_COST_INPUTS, demoUnmatchedOrderIds } from '@/lib/etsy/demo-dataset'
import type { SellerCosts } from '@/lib/repositories/costs'

/**
 * The demo shop's costs, or null if this deployment is not serving them.
 *
 * Returns null rather than throwing in live mode, so a caller that forgot to
 * branch gets "no costs" — which the product renders honestly — rather than
 * the fixture. The refusal is still structural: callers go through
 * domain/costs/load.ts, which branches on the same mode.
 */
export function demoSellerCosts(): SellerCosts | null {
  if (!isDemoMode()) return null
  return {
    defaultRulePercent: DEMO_COST_INPUTS.cogsPercent,
    shippingPerOrder: DEMO_COST_INPUTS.shippingPerOrder,
    labourTotal: DEMO_COST_INPUTS.labourTotal,
    otherCosts: DEMO_COST_INPUTS.otherCosts,
    /*
     * Null, not a figure, and it always was. The demo shop's owner has never
     * told us what they spent on ads and Etsy will not tell us either — the
     * one cost line the fixture itself declines to invent.
     */
    adSpend: null,
  }
}

/**
 * The demo shop's unreconciled receipts, or none.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   FOUND BY THE SURVEY, NOT BY THE PROMPT: THIS INVENTED AN EXCEPTION
 *   AGAINST A REAL SELLER'S FIRST EIGHT ORDERS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `demoUnmatchedOrderIds` is `orders.slice(0, 8)` — the dataset's way of giving
 * Willow & Fern eight orders whose supplier invoice never arrived, so the
 * ledger has exceptions to show. Both /profit and /settings/costs called it
 * unconditionally, on whatever orders they had just loaded.
 *
 * On a live shop that marked the first eight real receipts UNMATCHED, with the
 * reason "Supplier invoice missing — this order cannot be costed yet" and a
 * button offering to import an invoice that was never missing. It also held
 * cost coverage down: a confirmed per-listing cost on those orders was
 * discarded, because an UNMATCHED row is not counted as covered. That is how
 * this was found — an integration test wrote a per-listing cost, expected
 * coverage to reach 100%, and measured 0%.
 *
 * Same shape as the costs above, and the same single exit, so the containment
 * guard covers both.
 */
export function demoUnmatchedReceiptIds(
  orders: readonly { etsyReceiptId: string }[],
): Set<string> {
  if (!isDemoMode()) return new Set()
  return demoUnmatchedOrderIds(orders)
}
