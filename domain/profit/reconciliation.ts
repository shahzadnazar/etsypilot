/*
 * Transaction reconciliation.
 *
 * Three statuses, and the difference between them is what the seller can do:
 *
 *   MATCHED    verified revenue, verified fees, a confirmed cost. Counted.
 *   PARTIAL    verified revenue and fees, no confirmed cost. Excluded from
 *              profit rather than given an assumed one, and resolvable.
 *   UNMATCHED  something upstream is missing entirely. Excluded, resolvable.
 *
 * Every exception carries `resolutions` - a status without a way out is a dead
 * end, and a dead end in a financial screen is where a seller stops trusting
 * the number.
 *
 * `profit` is null wherever `cost` is null. Profit is never computed from an
 * assumption, so there is no row where a plausible-looking figure hides a gap.
 */

import type { EtsyListing, EtsyOrder } from '@/lib/etsy/interface'
import type {
  MissingDataItem,
  ReconciliationSummary,
  Resolution,
  TransactionRow,
} from './types'

export interface ReconcileArgs {
  orders: EtsyOrder[]
  listings: EtsyListing[]
  /** Confirmed per-listing costs. Absence is meaningful, not a zero. */
  costs: Map<string, number>
  /** Orders whose supplier invoice never arrived. */
  unmatchedOrderIds?: Set<string>
}

export function reconcile(args: ReconcileArgs): ReconciliationSummary {
  const titles = new Map(args.listings.map((l) => [l.etsyListingId, l.title]))
  const unmatchedIds = args.unmatchedOrderIds ?? new Set<string>()

  const rows: TransactionRow[] = args.orders.map((order) => {
    const item = order.items[0]
    const listingId = item?.etsyListingId ?? ''
    const title = titles.get(listingId) ?? 'Unknown listing'
    const fees = round2(order.etsyFees + order.paymentProcessing + order.offsiteAds)

    if (unmatchedIds.has(order.etsyReceiptId)) {
      return {
        orderId: order.etsyReceiptId,
        listingTitle: title,
        placedAt: order.placedAt,
        gross: order.gross,
        fees,
        cost: null,
        profit: null,
        status: 'UNMATCHED',
        reason: 'Supplier invoice missing — this order cannot be costed yet.',
        resolutions: unmatchedResolutions(listingId),
      }
    }

    const unitCost = args.costs.get(listingId)
    if (unitCost === undefined) {
      return {
        orderId: order.etsyReceiptId,
        listingTitle: title,
        placedAt: order.placedAt,
        gross: order.gross,
        fees,
        cost: null,
        // Not zero, not estimated. Null, because we do not know.
        profit: null,
        status: 'PARTIAL',
        reason: 'No product cost set for this listing.',
        resolutions: partialResolutions(listingId),
      }
    }

    const cost = round2(unitCost * (item?.quantity ?? 1))
    return {
      orderId: order.etsyReceiptId,
      listingTitle: title,
      placedAt: order.placedAt,
      gross: order.gross,
      fees,
      cost,
      profit: round2(order.gross - fees - cost),
      status: 'MATCHED',
      resolutions: [],
    }
  })

  const excluded = rows.filter((r) => r.status !== 'MATCHED')
  const grossTotal = rows.reduce((s, r) => s + r.gross, 0)
  const confirmedGross = rows
    .filter((r) => r.status === 'MATCHED')
    .reduce((s, r) => s + r.gross, 0)

  return {
    matched: rows.filter((r) => r.status === 'MATCHED').length,
    partial: rows.filter((r) => r.status === 'PARTIAL').length,
    unmatched: rows.filter((r) => r.status === 'UNMATCHED').length,
    excludedValue: round2(excluded.reduce((s, r) => s + r.gross, 0)),
    /*
     * Measured here, never stated. Coverage is the share of order value with a
     * confirmed per-listing cost; the remainder is costed by the seller's
     * default rule. A constant would be an authored figure, and an authored
     * coverage figure is worse than none - it is the number a seller uses to
     * decide how much of the screen to believe.
     */
    confirmedGross: round2(confirmedGross),
    ruleCostedGross: round2(grossTotal - confirmedGross),
    coveragePercent: grossTotal === 0 ? 100 : Math.round((confirmedGross / grossTotal) * 100),
    rows,
  }
}

/*
 * Every one of these used to point at `/profit?tab=costs`.
 *
 * That href resolved — /profit exists — so the link checker was satisfied, and
 * it was still a broken promise: the tab is client state, `?tab=costs` was read
 * by nothing, and a seller who clicked "Add a cost for this listing" arrived on
 * the waterfall they had just left. Cost setup now has a page, and these point
 * at it. `q` is the listing id, which the table matches as well as the title.
 */
function partialResolutions(listingId: string): Resolution[] {
  return [
    { label: 'Add a cost for this listing', href: `/settings/costs?q=${listingId}`, kind: 'PRIMARY' },
    { label: 'Apply the default cost rule', href: '/settings/costs', kind: 'SECONDARY' },
  ]
}

function unmatchedResolutions(listingId: string): Resolution[] {
  return [
    { label: 'Import supplier invoice', href: '/settings/costs', kind: 'PRIMARY' },
    { label: 'Enter the cost manually', href: `/settings/costs?q=${listingId}`, kind: 'SECONDARY' },
  ]
}

/**
 * Turn coverage gaps into a first-class list.
 *
 * These are rendered inside the panel, not appended as a footnote. Incomplete
 * coverage is a state the product is designed for, not an error it apologises
 * for, and each entry says what it would take to close.
 */
export function missingDataFrom(args: {
  summary: ReconciliationSummary
  listingsWithoutCost: number
  labourRecorded: boolean
}): MissingDataItem[] {
  const items: MissingDataItem[] = []

  if (args.listingsWithoutCost > 0) {
    items.push({
      code: 'NO_PRODUCT_COST',
      title: `${args.listingsWithoutCost} listings without a product cost`,
      detail:
        'Their orders fall back to your default cost rule in the waterfall, and are left blank in the ledger — no per-order profit is computed without a confirmed cost.',
      affectedValue: args.summary.excludedValue,
      resolutions: [
        { label: 'Add costs', href: '/settings/costs', kind: 'PRIMARY' },
        { label: 'Set a default rule', href: '/settings/costs', kind: 'SECONDARY' },
      ],
    })
  }

  if (!args.labourRecorded) {
    items.push({
      code: 'NO_LABOUR',
      title: 'No labour minutes recorded per product',
      detail: 'Labour is applied as a period total rather than per unit, so per-listing margin excludes it.',
      resolutions: [
        { label: 'Set a labour rate', href: '/settings/costs', kind: 'PRIMARY' },
      ],
    })
  }

  if (args.summary.unmatched > 0) {
    items.push({
      code: 'UNMATCHED_TRANSACTIONS',
      title: `${args.summary.unmatched} transactions could not be reconciled`,
      detail: 'A supplier invoice is missing, so these orders have no cost and are excluded.',
      resolutions: [
        { label: 'Resolve exceptions', href: '/profit?tab=transactions&filter=unmatched', kind: 'PRIMARY' },
      ],
    })
  }

  /*
   * Always present, and never resolvable by us: Etsy does not break ad spend
   * down per listing. Listed so the seller knows the gap exists rather than
   * wondering why per-listing margin never quite reconciles.
   */
  items.push({
    code: 'ADS_NOT_PER_LISTING',
    title: 'Etsy does not expose ad spend per listing',
    detail:
      'Offsite Ads are verified at shop level only, so they are not attributed to individual listings.',
    resolutions: [
      { label: 'How this is calculated', href: '/data/methodology#net-profit', kind: 'SECONDARY' },
    ],
  })

  return items
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
