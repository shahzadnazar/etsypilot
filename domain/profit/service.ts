/*
 * Profit Reality service.
 *
 * Assembles the four tabs from one pass over the shop's orders: the waterfall,
 * the three scenarios, the cost setup summary and the reconciliation.
 */

import { loadListings } from '@/domain/listings/load'
import { loadOrders } from '@/domain/orders/load'
import { loadCosts } from '@/domain/costs/load'
import { shopHeader, type ShopDataSource } from '@/domain/sync/source'
import { PERIOD_END, PERIOD_START } from '@/lib/etsy/demo-dataset'
import { demoUnmatchedReceiptIds } from '@/domain/costs/demo'
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
  const sellerCosts = await loadCosts(ctx)
  const listings = catalogue.listings

  const verified = totalsFrom(orders)

  /*
   * ── THE SELLER'S OWN ASSUMPTIONS, OR NONE ───────────────────────────────
   *
   * These four were DEMO_COST_INPUTS: the Willow & Fern designed figures,
   * reverse-derived from artboard 92 and handed to a real seller as their own
   * assumptions on the screen whose entire purpose is to separate what is
   * verified from what is assumed. Measured in a browser in live mode: a shop
   * with no costs set reported "Net profit -$1,322.05", a loss made of the
   * fixture's labour and other-costs totals.
   *
   * Null now, where the seller has not said. `computeScenario` withholds the
   * cost lines and the net profit rather than projecting from a fiction.
   */
  const assumptions: SellerAssumptions = {
    shippingPerOrder: sellerCosts.costs.shippingPerOrder,
    cogsPercent: sellerCosts.costs.defaultRulePercent,
    labourTotal: sellerCosts.costs.labourTotal,
    otherCosts: sellerCosts.costs.otherCosts,
    hasAnyRule: sellerCosts.hasAnyRule,
  }

  // Costs exist for most listings, not all. The gap is the point of the screen.
  // One resolver supplies the confirmed-cost set everywhere it is needed, so
  // the coverage figure and the ledger can never describe different sets.
  /*
   * From the loader: the demo fixture in demo mode, and this shop's own
   * per-listing cost rules otherwise. Empty for a seller who has confirmed no
   * per-listing costs — so coverage reads 0% and the ledger excludes every
   * order rather than costing it from anything invented.
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
  /*
   * ── AN EXCEPTION NOBODY HAD ─────────────────────────────────────────────
   *
   * This called `demoUnmatchedOrderIds`, which is `orders.slice(0, 8)`, on
   * whatever orders had just loaded. On a live shop the first eight real
   * receipts were marked UNMATCHED — "Supplier invoice missing" — and held
   * cost coverage down with them. Gated at its single exit now; see
   * domain/costs/demo.ts.
   */
  const unmatchedOrderIds = demoUnmatchedReceiptIds(orders)

  const reconciliation = reconcile({ orders, listings, costs, unmatchedOrderIds })
  const missingData = missingDataFrom({
    summary: reconciliation,
    listingsWithoutCost: listingsMissingCost,
    /*
     * Measured rather than hardcoded false. This said `labourRecorded: false`
     * unconditionally — true of the demo shop, which records no per-product
     * labour, and a claim about a real seller who may have set a labour
     * figure. It is a rule they either set or did not.
     */
    labourRecorded: sellerCosts.costs.labourTotal !== null,
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
      /*
       * ── THERE IS NO DEFAULT RULE UNTIL THE SELLER MAKES ONE ───────────
       *
       * This read "38% of price" for a seller who had set nothing, because
       * `cogsPercent` was DEMO_COST_INPUTS and `(null * 100).toFixed(0)` would
       * read "0% of price" — a rule claiming their products are free.
       *
       * The detail changes with it. "Applies where no specific cost exists" is
       * a description of a rule that exists; with none, the sentence has to
       * say what is missing and not imply a fallback is quietly running.
       */
      defaultRule:
        assumptions.cogsPercent === null
          ? {
              label: 'Not set',
              detail:
                'Nothing is applied where a listing has no cost of its own \u2014 those orders are left out of profit rather than costed by a guess.',
            }
          : {
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
