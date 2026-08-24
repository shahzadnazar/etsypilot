/*
 * Costs & fees (artboards 53–56, the cost setup panel).
 *
 * Two halves that a seller confuses constantly, kept visibly apart:
 *
 *   COSTS are yours. What materials cost, what postage costs, what your time is
 *   worth. Nobody can verify them, so they are SELLER_INPUT and editable here.
 *
 *   FEES are Etsy's. EtsyPilot cannot verify the schedule either — Etsy
 *   publishes no fee-rates endpoint — so the rates carry the date they were
 *   recorded and stay editable, and what they produce is never called an Etsy
 *   charge (D49).
 *
 * The coverage figure is measured from the shop's own orders on every request.
 * It is the number that decides how much of Profit Reality is real, so it is
 * never a stored constant.
 *
 * There is no demo-mode read-only gate here, and that is deliberate rather than
 * an omission. Demo mode blocks WRITES TO ETSY. A cost rule is not one: it
 * changes what EtsyPilot calculates and nothing else, which is exactly what the
 * audit log records it as — "Cost rule changed · Shop-wide · — EtsyPilot only"
 * (artboard 109). Locking it would teach the wrong lesson about what demo mode
 * protects.
 */

import {
  DEFAULT_FEE_RATES,
  FEE_LIMITATIONS,
  FEE_RULES_EFFECTIVE,
  FEE_RULES_SOURCE,
  type FeeRate,
} from '@/domain/fees/rules'
import { reconcile } from '@/domain/profit/reconciliation'
import { getEtsyService } from '@/lib/etsy'
import {
  demoConfirmedCosts,
  demoUnmatchedOrderIds,
  PERIOD_END,
  PERIOD_START,
} from '@/lib/etsy/demo-dataset'
import type { ShopContext } from '@/lib/permissions'
import { readCostSettings } from './store'
import type { CostSettings, MissingCostRow } from './types'

export interface CostCoverage {
  /*
   * Null when there were no orders in the period. Zero is a real answer —
   * "none of your order value is costed" — and the absence of order value is a
   * different one. D34a, the same distinction the net margin makes.
   */
  percent: number | null
  confirmedGross: number
  ruleCostedGross: number
  listingsCovered: number
  listingsMissing: number
  activeListings: number
  orderCount: number
}

export interface CostImports {
  lastImportAt: string | null
  matched: number
  unmatched: number
}

export interface CostsView {
  currency: string
  periodStart: string
  periodEnd: string
  settings: CostSettings
  coverage: CostCoverage
  /** Listings with no cost of their own, priced by the default rule instead. */
  missingCosts: MissingCostRow[]
  imports: CostImports
  feeRates: FeeRate[]
  feeRulesEffective: string
  feeRulesSource: string
  feeLimitations: string[]
}

export async function getCostsView(ctx: ShopContext): Promise<CostsView> {
  const etsy = getEtsyService()
  const [shop, orders, catalogue] = await Promise.all([
    etsy.getShop(ctx.shopId),
    etsy.getOrders(ctx.shopId, { since: PERIOD_START, until: PERIOD_END }),
    etsy.getListings(ctx.shopId, { limit: 500 }),
  ])
  const listings = catalogue.listings

  const settings = readCostSettings(ctx.shopId)
  const costs = demoConfirmedCosts(listings)
  const reconciliation = reconcile({
    orders,
    listings,
    costs,
    unmatchedOrderIds: demoUnmatchedOrderIds(orders),
  })

  const active = listings.filter((l) => l.state === 'ACTIVE')
  const missing = active.filter((l) => !costs.has(l.etsyListingId))

  const coverage: CostCoverage = {
    percent: orders.length === 0 ? null : reconciliation.coveragePercent,
    confirmedGross: reconciliation.confirmedGross,
    ruleCostedGross: reconciliation.ruleCostedGross,
    listingsCovered: active.length - missing.length,
    listingsMissing: missing.length,
    activeListings: active.length,
    orderCount: orders.length,
  }

  const missingCosts: MissingCostRow[] = missing
    .slice()
    .sort((a, b) => b.price - a.price)
    .map((l) => ({
      etsyListingId: l.etsyListingId,
      title: l.title,
      price: l.price,
      section: l.section,
      ruleCost: round2(l.price * settings.defaultRulePercent),
    }))

  return {
    currency: shop.currency,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    settings,
    coverage,
    missingCosts,
    imports: {
      /*
       * Null when nothing has been imported, which is the state a new shop is
       * in. The demo shop has one import behind it, and the counts come from
       * the reconciliation rather than being written down beside it.
       */
      lastImportAt: reconciliation.rows.length > 0 ? '2026-08-09T00:00:00.000Z' : null,
      matched: reconciliation.matched,
      unmatched: reconciliation.unmatched,
    },
    feeRates: DEFAULT_FEE_RATES,
    feeRulesEffective: FEE_RULES_EFFECTIVE,
    feeRulesSource: FEE_RULES_SOURCE,
    feeLimitations: [...FEE_LIMITATIONS],
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
