import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHERE A SELLER'S COSTS COME FROM. ONE BRANCH, SAME SHAPE AS ORDERS AND
 *   LISTINGS.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   DEMO         DEMO_COST_INPUTS, via domain/costs/demo.ts. No table read.
 *   NOT_SYNCED   the shop exists and the seller has set nothing. All null.
 *   SYNCED       cost_rules, newest row per key.
 *   NO_SHOP      the session names a shop row that is gone.
 *
 * ── COSTS DO NOT NEED A SYNC, AND STILL USE THE SYNC SOURCE ───────────────
 *
 * Nothing syncs costs — the seller types them — so NOT_SYNCED and SYNCED are
 * the same answer here: read cost_rules. The branch is kept anyway, because
 * the thing it decides is whether the FIXTURE is in play, and that is the mode.
 * Collapsing it would mean a second way of asking the question this codebase
 * has now answered the same way three times.
 *
 * ── "HAS THE SELLER SET ANYTHING" IS A SEPARATE QUESTION ──────────────────
 *
 * `hasAnyRule` comes back alongside, because a shop with no rules and a shop
 * whose rules are all retracted produce the same nulls and want the same
 * sentence, while a shop with rules and a 0% COGS has set something real. The
 * profit screen needs the distinction to decide between "add your costs" and
 * "your costs say this".
 */

import type { ShopContext } from '@/lib/permissions'
import { currentCostRules, countCostRules, NO_SELLER_COSTS, type SellerCosts } from '@/lib/repositories/costs'
import { shopDataSource, type ShopDataSource } from '@/domain/sync/source'
import type { CostInputs } from '@/domain/profit/waterfall'
import { demoSellerCosts } from './demo'

export interface LoadedCosts {
  costs: SellerCosts
  /** False when this seller has never set a cost rule of any kind. */
  hasAnyRule: boolean
  source: ShopDataSource
}

export async function loadCosts(ctx: ShopContext): Promise<LoadedCosts> {
  /*
   * ORDERS, not a 'COSTS' aggregate, and this is deliberate rather than lazy.
   *
   * shopDataSource's job here is only to say DEMO or not-DEMO; costs have no
   * sync of their own, so adding a 'COSTS' row to SYNC_AGGREGATES would create
   * a timestamp nothing ever writes and a NOT_SYNCED state that is permanent
   * and meaningless. Asking about ORDERS gets the mode and the shop's
   * existence, which is all this branch needs.
   */
  const { source } = await shopDataSource(ctx, 'ORDERS')

  if (source.kind === 'DEMO') {
    const demo = demoSellerCosts()
    /*
     * demoSellerCosts returns null outside demo mode. Reaching here with null
     * would mean shopDataSource and isDemoMode disagreed about the mode, which
     * cannot happen — they read the same function. Handled rather than
     * asserted, and it falls to "nothing set", never to the fixture.
     */
    return { costs: demo ?? NO_SELLER_COSTS, hasAnyRule: demo !== null, source }
  }

  if (source.kind === 'NO_SHOP') {
    return { costs: NO_SELLER_COSTS, hasAnyRule: false, source }
  }

  const [costs, ruleCount] = await Promise.all([
    currentCostRules(ctx.shopId),
    countCostRules(ctx.shopId),
  ])
  return { costs, hasAnyRule: ruleCount > 0, source }
}

/**
 * The waterfall's cost inputs, from what the seller actually set.
 *
 * ── ONE BRIDGE, SO FOUR CALLERS CANNOT DISAGREE ───────────────────────────
 *
 * computeWaterfall is called from the profit screen, the Action Center, the
 * dashboard overview and analytics, and all four used to pass
 * DEMO_COST_INPUTS. Four separate reconstructions of CostInputs would be four
 * chances for one of them to coalesce a null to zero, which is the single
 * substitution this whole slice exists to prevent.
 *
 * `coverage` is a measurement and comes from the reconciliation rather than
 * from here; callers that have one pass it, and those that do not pass 0 —
 * which is true of a shop with no confirmed per-listing costs.
 */
export function costInputsFrom(loaded: LoadedCosts, coverage = 0): CostInputs {
  return {
    shippingPerOrder: loaded.costs.shippingPerOrder,
    cogsPercent: loaded.costs.defaultRulePercent,
    labourTotal: loaded.costs.labourTotal,
    otherCosts: loaded.costs.otherCosts,
    coverage,
    hasAnyRule: loaded.hasAnyRule,
  }
}
