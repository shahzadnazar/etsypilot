/*
 * Profit Reality service.
 *
 * Assembles the four tabs from one pass over the shop's orders: the waterfall,
 * the three scenarios, the cost setup summary and the reconciliation.
 */

import { getEtsyService } from '@/lib/etsy'
import {
  DEMO_COST_INPUTS,
  demoConfirmedCosts,
  demoUnmatchedOrderIds,
  PERIOD_END,
  PERIOD_START,
} from '@/lib/etsy/demo-dataset'
import type { EtsyOrder } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'
import { missingDataFrom, reconcile } from './reconciliation'
import { buildScenarios, inputRows, type InputRow, type ScenarioComparison } from './scenarios'
import type {
  ProfitResult,
  ReconciliationSummary,
  ScenarioKind,
  SellerAssumptions,
  VerifiedTotals,
} from './types'

export interface CostSetupSummary {
  coveragePercent: number
  listingsCovered: number
  listingsMissing: number
  defaultRule: { label: string; detail: string }
  listingCosts: { label: string; detail: string }
  imports: { label: string; detail: string }
  adSpend: { label: string; detail: string }
}

export interface ProfitView {
  periodStart: string
  periodEnd: string
  currency: string
  verified: VerifiedTotals
  assumptions: SellerAssumptions
  results: Record<ScenarioKind, ProfitResult>
  comparison: ScenarioComparison[]
  inputs: InputRow[]
  reconciliation: ReconciliationSummary
  costSetup: CostSetupSummary
}

export async function getProfitView(ctx: ShopContext): Promise<ProfitView> {
  const etsy = getEtsyService()
  const shop = await etsy.getShop(ctx.shopId)
  const orders = await etsy.getOrders(ctx.shopId, { since: PERIOD_START, until: PERIOD_END })
  const { listings } = await etsy.getListings(ctx.shopId, { limit: 500 })

  const verified = totalsFrom(orders)

  const assumptions: SellerAssumptions = {
    shippingPerOrder: DEMO_COST_INPUTS.shippingPerOrder,
    cogsPercent: DEMO_COST_INPUTS.cogsPercent,
    labourTotal: DEMO_COST_INPUTS.labourTotal,
    otherCosts: DEMO_COST_INPUTS.otherCosts,
  }

  // Costs exist for most listings, not all. The gap is the point of the screen.
  // One resolver supplies the confirmed-cost set everywhere it is needed, so
  // the coverage figure and the ledger can never describe different sets.
  const costs = demoConfirmedCosts(listings)
  /*
   * Counted here, from the same catalogue the ledger below is built from.
   *
   * This used to read DEMO_COUNTS.listingsWithoutCost, which said 38 while the
   * ledger on the same screen left 52 listings blank. DEMO_COUNTS measures now
   * too, so the two agree — but the count still belongs here, because it is a
   * fact about the listings this request loaded, not about the demo dataset.
   */
  const activeListings = listings.filter((l) => l.state === 'ACTIVE')
  const withCost = activeListings.filter((l) => costs.has(l.etsyListingId))
  const listingsMissingCost = activeListings.length - withCost.length
  const unmatchedOrderIds = demoUnmatchedOrderIds(orders)

  const reconciliation = reconcile({ orders, listings, costs, unmatchedOrderIds })
  const missingData = missingDataFrom({
    summary: reconciliation,
    listingsWithoutCost: listingsMissingCost,
    labourRecorded: false,
  })

  // Measured from the reconciliation, not stated. See D34.
  const coverage = reconciliation.coveragePercent / 100
  const { results, comparison } = buildScenarios(verified, assumptions, { coverage, missingData })

  return {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    currency: shop.currency,
    verified,
    assumptions,
    results,
    comparison,
    inputs: inputRows(verified, assumptions, shop.currency),
    reconciliation,
    costSetup: {
      coveragePercent: reconciliation.coveragePercent,
      listingsCovered: withCost.length,
      listingsMissing: listingsMissingCost,
      defaultRule: {
        label: `${(assumptions.cogsPercent * 100).toFixed(0)}% of price`,
        detail: 'Applies where no specific cost exists.',
      },
      listingCosts: {
        label: `${withCost.length} set`,
        detail: 'Per-listing amounts, including variation-level costs.',
      },
      imports: {
        label: 'CSV import',
        detail: `Last import Aug 9 · ${reconciliation.matched} lines matched, ${reconciliation.unmatched} unmatched.`,
      },
      adSpend: {
        label: 'Verified at shop level',
        detail: 'Etsy does not expose ad spend per listing.',
      },
    },
  }
}

/**
 * Derive the verified totals.
 *
 * Built here and passed as a readonly value so nothing downstream can adjust a
 * figure Etsy reported.
 */
export function totalsFrom(orders: EtsyOrder[]): VerifiedTotals {
  return {
    grossRevenue: round2(orders.reduce((s, o) => s + o.gross, 0)),
    etsyFees: round2(orders.reduce((s, o) => s + o.etsyFees, 0)),
    paymentProcessing: round2(orders.reduce((s, o) => s + o.paymentProcessing, 0)),
    offsiteAds: round2(orders.reduce((s, o) => s + o.offsiteAds, 0)),
    orderCount: orders.length,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
