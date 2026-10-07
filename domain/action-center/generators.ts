import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE ACTION GENERATORS. EVERY FIGURE ON EVERY CARD IS MEASURED FROM THIS
 *   SHOP'S OWN LISTINGS, ORDERS AND COST RULES.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * ── WHAT THESE REPLACE ────────────────────────────────────────────────────
 *
 * Four functions returning object literals. Measured in a browser on a live
 * account, before they were gated to demo mode:
 *
 *   ACT-0001  "4 listings are selling below cost ... Every sale of these four
 *             loses money", CRITICAL, provenance CALCULATED, source "your
 *             receipts and cost setup", combined loss $184.20. No listing was
 *             examined; the four, the 38 orders and the $184.20 were typed.
 *   ACT-0002  "{DEMO_COUNTS.listingsWithoutCost} listings have no product
 *             cost" of DEMO_COUNTS.activeListings, 12 done, last worked on by
 *             "Salman R." — a person in the demo dataset.
 *   ACT-0003  a completed bulk job BE-2288 with a rollback point.
 *   ACT-0004  a seasonal window "based on one year of your own order history".
 *
 * An action is an instruction. ACT-0001 told a seller to reprice four listings
 * nothing had looked at.
 *
 * ── THE RULES THESE HOLD ──────────────────────────────────────────────────
 *
 *   1. A COST NOBODY ENTERED IS NOT A FINDING. `belowCostAction` considers
 *      only listings with a CONFIRMED per-listing cost. A listing with no cost
 *      cannot be below it, and guessing one from the default rule would make
 *      the most severe card in the product rest on an assumption.
 *   2. NO NAME THAT IS NOT IN THE DATA. `lastWorkedBy` and `completedBy` are
 *      set from an actor this shop recorded, or left off.
 *   3. NOTHING TO SAY MEANS NO CARD. Every generator returns null when the
 *      shop gives it nothing, and the screen's own empty state takes over.
 *   4. EVERY TIMESTAMP IS AN OBSERVATION. `createdAt` is when EtsyPilot last
 *      read the data the finding came from, not a constant and not `now()`,
 *      which would make every card look new on every page load.
 */

import { auditListings } from '@/domain/audit/service'
import { belowCostShortfall } from '@/domain/audit/rules'
import type { StoredOrder } from '@/domain/orders/types'
import type { EtsyListing } from '@/lib/etsy/interface'
import { formatCurrency } from '@/lib/utils/format'
import type { Action } from './types'

export interface ShopFacts {
  shopId: string
  listings: EtsyListing[]
  /** Confirmed per-listing costs. Absence is meaningful, never a zero. */
  costs: Map<string, number>
  orders: readonly StoredOrder[]
  /** The seller's default COGS rule, or null where they have set none. */
  defaultRulePercent: number | null
  /** Measured share of order value carrying a confirmed cost, 0–100. */
  coveragePercent: number
  /**
   * This shop's currency, from our own `shops` row.
   *
   * Not a detail. `formatCurrency` defaults to USD, so the first version of
   * `belowCostAction` told a GBP seller they had lost "$14.20" — caught by an
   * integration test asserting a pound sign. Every figure on these cards is a
   * sum of that shop's own receipts, and a receipt has a currency.
   */
  currency: string
  /**
   * When the listings and orders behind these findings were last read.
   *
   * Every card is dated from this. The alternative, `new Date()`, would stamp
   * every action with the moment the page rendered — so a finding that has
   * been true for a fortnight would read as having appeared just now, on the
   * one screen whose job is to rank by what needs attention first.
   */
  observedAt: string
  /** The newest cost rule this shop recorded: when, and who. */
  lastCostEdit: { at: string; by: string | null } | null
}

/* ------------------------------------------------------------- below cost */

/**
 * Listings that lose money on every sale, counted from confirmed costs only.
 *
 * The set comes from `auditListings` rather than from a filter written here,
 * so this card and `/listings/audit` can never disagree about which listings
 * are below cost — the DEMO_COUNTS failure was two places counting the same
 * thing and arriving at 38 and 52.
 */
export function belowCostAction(facts: ShopFacts): Action | null {
  const audit = auditListings(facts.listings, facts.orders, facts.costs)
  const result = audit.results.find((r) => r.rule.code === 'BELOW_COST')
  if (!result || result.count === 0) return null

  const flagged = new Set(result.findings.map((f) => f.listingId))
  const priced = facts.listings.filter((l) => flagged.has(l.etsyListingId))

  /*
   * The loss, measured over units actually sold in this period.
   *
   * Per-unit shortfall comes from the same function the audit rule tests with,
   * multiplied by the quantity on this shop's own receipts. A listing that is
   * below cost and sold nothing lost nothing yet — which the copy below says
   * rather than printing a loss of $0.00 beside a CRITICAL badge.
   */
  let units = 0
  let orderCount = 0
  let loss = 0
  const shortfalls = new Map<string, number>()
  for (const listing of priced) {
    const cost = facts.costs.get(listing.etsyListingId)
    if (cost === undefined) continue
    const shortfall = belowCostShortfall(listing.price, cost)
    if (shortfall !== null) shortfalls.set(listing.etsyListingId, shortfall)
  }
  for (const order of facts.orders) {
    let counted = false
    for (const item of order.items) {
      const shortfall = shortfalls.get(item.etsyListingId)
      if (shortfall === undefined) continue
      units += item.quantity
      loss += shortfall * item.quantity
      counted = true
    }
    if (counted) orderCount += 1
  }

  const n = result.count
  const listingWord = `${n} listing${n === 1 ? '' : 's'}`

  return {
    id: 'ACT-BELOW-COST',
    shopId: facts.shopId,
    priority: 10,
    severity: 'CRITICAL',
    title: `${listingWord} ${n === 1 ? 'is' : 'are'} selling below cost`,
    explanation: `Price minus Etsy fees and your confirmed product cost is negative on ${
      n === 1 ? 'this listing' : `these ${n}`
    }. Only listings where you have entered a cost are checked — a listing with no cost cannot be below it.`,
    evidence: {
      summary:
        orderCount === 0
          ? `${listingWord} priced below cost · no orders on ${
              n === 1 ? 'it' : 'them'
            } in this period, so nothing has been lost yet`
          : `${orderCount} order${orderCount === 1 ? '' : 's'} on ${listingWord} in this period · ${units} unit${
              units === 1 ? '' : 's'
            } sold · ${formatCurrency(round2(loss), facts.currency)} lost`,
      provenance: 'CALCULATED',
      source: 'your receipts and the costs you entered',
    },
    destination: { label: 'Review pricing', href: '/listings?filter=below-cost' },
    status: 'OPEN',
    createdAt: facts.observedAt,
  }
}

/* ---------------------------------------------------------- missing costs */

/**
 * Active listings with no confirmed cost of their own.
 *
 * ── THE COPY HAS TO SURVIVE A SELLER WHO HAS SET NO RULE ──────────────────
 *
 * The old explanation said the uncovered share "falls back to your default
 * rule, so profit for those listings rests on an assumption you set". True of
 * a seller who set one. A seller who has set nothing made no assumption, and
 * their orders are not costed at all — the same line /profit and
 * /settings/costs now hold.
 */
export function missingCostsAction(facts: ShopFacts): Action | null {
  const active = facts.listings.filter((l) => l.state === 'ACTIVE')
  if (active.length === 0) return null

  const covered = active.filter((l) => facts.costs.has(l.etsyListingId)).length
  const missing = active.length - covered
  if (missing === 0) return null

  const uncoveredValue = facts.orders
    .filter((o) => o.items.some((i) => !facts.costs.has(i.etsyListingId)))
    .reduce((sum, o) => sum + o.gross, 0)

  const hasRule = facts.defaultRulePercent !== null
  const listingWord = `${missing} listing${missing === 1 ? '' : 's'}`

  return {
    id: 'ACT-MISSING-COSTS',
    shopId: facts.shopId,
    /*
     * ATTENTION, not CRITICAL, even with no rule set. A gap in what EtsyPilot
     * knows is not the same as a listing losing money on every sale, and
     * ranking them equally would bury the one that is.
     */
    severity: 'ATTENTION',
    priority: 11,
    title: `${listingWord} ${missing === 1 ? 'has' : 'have'} no product cost`,
    explanation: hasRule
      ? `${facts.coveragePercent}% of your order value has a confirmed cost. The rest falls back to your default rule, so profit on ${
          missing === 1 ? 'this listing' : 'those listings'
        } rests on an assumption you set rather than a cost you confirmed.`
      : `${facts.coveragePercent}% of your order value has a confirmed cost. You have set no default rule either, so orders on ${
          missing === 1 ? 'this listing' : 'these listings'
        } are left out of profit rather than costed by a guess.`,
    evidence: {
      summary: `${missing} of ${active.length} active listing${
        active.length === 1 ? '' : 's'
      } ${missing === 1 ? 'has' : 'have'} no cost rule · ${formatCurrency(
        round2(uncoveredValue),
        facts.currency,
      )} of order value uncovered`,
      provenance: 'CALCULATED',
      source: 'your listings and your cost setup',
    },
    destination: {
      label: covered === 0 ? 'Set up your costs' : 'Continue cost setup',
      href: '/settings/costs',
    },
    /*
     * IN_PROGRESS is a claim that somebody has started. It needs a cost rule
     * this shop actually recorded — not a count of zero dressed as progress.
     */
    ...(covered > 0 && facts.lastCostEdit
      ? {
          status: 'IN_PROGRESS' as const,
          progress: { current: covered, total: active.length },
          lastWorkedAt: facts.lastCostEdit.at,
          // Only when this shop recorded who. Never a name from a fixture.
          ...(facts.lastCostEdit.by ? { lastWorkedBy: facts.lastCostEdit.by } : {}),
        }
      : { status: 'OPEN' as const }),
    createdAt: facts.lastCostEdit?.at ?? facts.observedAt,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
