/*
 * Profit Reality service.
 *
 * Assembles the four tabs from one pass over the shop's orders: the waterfall,
 * the three scenarios, the cost setup summary and the reconciliation.
 */

import { loadListings } from '@/domain/listings/load'
import { loadOrders } from '@/domain/orders/load'
import { shopHeader, type ShopDataSource } from '@/domain/sync/source'
import {
  DEMO_COST_INPUTS,
  demoUnmatchedOrderIds,
  PERIOD_END,
  PERIOD_START,
} from '@/lib/etsy/demo-dataset'
import { feeTotals, feesAreKnown, type StoredOrder } from '@/domain/orders/types'
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
  /**
   * Where the orders behind every figure here came from.
   *
   * NOT_SYNCED is not "you made no profit". The screen renders it as its own
   * state; without this it would show a complete waterfall of zeroes, which
   * for a profit screen is the most misleading possible output.
   */
  source: ShopDataSource
  verified: VerifiedTotals
  assumptions: SellerAssumptions
  results: Record<ScenarioKind, ProfitResult>
  comparison: ScenarioComparison[]
  inputs: InputRow[]
  reconciliation: ReconciliationSummary
  costSetup: CostSetupSummary
}

export async function getProfitView(ctx: ShopContext): Promise<ProfitView> {
  const [shop, { orders, source }, catalogue] = await Promise.all([
    shopHeader(ctx),
    loadOrders(ctx, { since: PERIOD_START, until: PERIOD_END }),
    loadListings(ctx),
  ])
  const listings = catalogue.listings

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
  /*
   * From the loader. Empty on a synced shop, because cost rules are a later
   * aggregate — so coverage reads 0% and the ledger excludes every order
   * rather than costing it from the demo fixture. That is the honest state of
   * a freshly connected shop and the screen is built to say it.
   */
  const costs = catalogue.costs
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
    feesKnown: feesAreKnown(orders),
  })

  // Measured from the reconciliation, not stated. See D34.
  const coverage = reconciliation.coveragePercent / 100
  const { results, comparison } = buildScenarios(verified, assumptions, { coverage, missingData })

  return {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    currency: shop?.currency ?? 'USD',
    source,
    verified,
    assumptions,
    results,
    comparison,
    inputs: inputRows(verified, assumptions, shop?.currency ?? 'USD'),
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
export function totalsFrom(orders: readonly StoredOrder[]): VerifiedTotals {
  /*
   * Fees via feeTotals, which returns null unless EVERY order has all three.
   *
   * The three `reduce` calls this replaces could not fail: a period whose
   * fees had never been read summed to 0, and every downstream line labelled
   * that 0 VERIFIED. A partial period is worse still — the sum would be a real
   * number, smaller than the truth, and indistinguishable from a complete one.
   */
  const fees = feeTotals(orders)
  return {
    grossRevenue: round2(orders.reduce((s, o) => s + o.gross, 0)),
    discounts: round2(orders.reduce((s, o) => s + o.discounts, 0)),
    refunds: round2(orders.reduce((s, o) => s + o.refunds, 0)),
    etsyFees: fees === null ? null : round2(fees.etsyFees),
    paymentProcessing: fees === null ? null : round2(fees.paymentProcessing),
    offsiteAds: fees === null ? null : round2(fees.offsiteAds),
    orderCount: orders.length,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
