/*
 * Listing audit.
 *
 * Runs the fourteen rules over the shop's listings and weights the result by
 * money rather than by count. A shop with 300 clean listings and 4 broken ones
 * that earn most of the revenue is not a healthy shop, and a score that counted
 * listings would say it was.
 *
 * On the naming: this is `revenueOnListings`, NOT "revenue at risk".
 *
 * The figure is backward-looking — revenue these listings already earned in the
 * period — and "at risk" is forward-looking. A missing attribute on a listing
 * that earned $2,000 last month does not put $2,000 in danger; the money is
 * banked. What the number says is "this much of your revenue passes through
 * listings with a fixable problem", which is a reason to look, not a loss.
 * Everything else in this product is careful about that distinction.
 *
 * Provenance follows D32 throughout:
 *
 *   Revenue on listings  VERIFIED  - the listing's own receipts, summed. Summing
 *                                    does not demote.
 *   Health score      CALCULATED - verified revenue divided into shares and
 *                                  weighted by rule severity. Dividing does.
 *   Coverage          CALCULATED - share of revenue the score could account for.
 *
 * Listings with no orders in the period carry zero weight and are counted
 * separately, so the score never silently speaks for revenue it never saw.
 */

import { getEtsyService } from '@/lib/etsy'
import { demoConfirmedCosts, PERIOD_END, PERIOD_START } from '@/lib/etsy/demo-dataset'
import type { EtsyListing, EtsyOrder } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'
import { calculated, unavailable, verified } from '@/lib/provenance/builders'
import type { Provenanced } from '@/lib/provenance/types'
import { AUDIT_RULES, DEFAULT_THRESHOLDS, type AuditRule, type RuleContext, type Severity } from './rules'

export interface AuditFinding {
  listingId: string
  title: string
  sku: string | null
  /** Verified revenue this listing produced in the period. Earned, not endangered. */
  revenueOnListing: Provenanced<number>
  /** Present only for MISSING_REQUIRED_ATTRIBUTE. */
  missingAttribute?: string
  /** Pre-filled from the listing's own text, and always editable. */
  suggestedValue?: string | null
}

export interface RuleResult {
  rule: AuditRule
  findings: AuditFinding[]
  count: number
  /** Verified revenue earned by the listings this rule flags. */
  revenueOnListings: number
}

export interface AuditView {
  listingsChecked: number
  ruleCount: number
  errors: number
  warnings: number
  passing: number
  healthScore: Provenanced<number>
  /** Rules with at least one finding, worst first. */
  results: RuleResult[]
  /** How many flagged listings a bulk operation could fix. */
  bulkFixable: number
  /**
   * Verified revenue earned by flagged listings, counted once per listing.
   *
   * A union across rules, so the per-rule figures do NOT sum to it: a listing
   * failing three rules appears in three rule rows and once here. That is the
   * correct arithmetic and it looks like an error on screen, so every surface
   * that shows both says so.
   *
   * Summing the per-rule totals instead would double-count, and the shop would
   * read a figure larger than its own revenue.
   */
  revenueOnListings: number
  thresholds: RuleContext['thresholds']
  lastRunAt: string
  /** Listings with no orders in the period, so no weight in the score. */
  listingsWithoutRevenue: number
}

const SEVERITY_WEIGHT: Record<Severity, number> = { ERROR: 1, WARNING: 0.35 }

export async function getAuditView(ctx: ShopContext): Promise<AuditView> {
  const etsy = getEtsyService()
  const { listings } = await etsy.getListings(ctx.shopId, { limit: 500 })
  const orders = await etsy.getOrders(ctx.shopId, { since: PERIOD_START, until: PERIOD_END })

  return auditListings(listings, orders, demoConfirmedCosts(listings))
}

export function auditListings(
  listings: EtsyListing[],
  orders: EtsyOrder[],
  costs: Map<string, number>,
  thresholds = DEFAULT_THRESHOLDS,
): AuditView {
  const revenueByListing = revenueFrom(orders)
  const ruleCtx: RuleContext = { costs, duplicatedTags: duplicatedTags(listings), thresholds }

  const results: RuleResult[] = []
  const worstByListing = new Map<string, Severity>()

  for (const rule of AUDIT_RULES) {
    const flagged = listings.filter((l) => rule.test(l, ruleCtx))
    if (flagged.length === 0) continue

    const findings = flagged.map((l) => toFinding(rule, l, revenueByListing.get(l.etsyListingId) ?? 0))
    for (const l of flagged) {
      const current = worstByListing.get(l.etsyListingId)
      if (current !== 'ERROR') worstByListing.set(l.etsyListingId, rule.severity)
    }

    results.push({
      rule,
      findings,
      count: flagged.length,
      revenueOnListings: round2(findings.reduce((s, f) => s + (f.revenueOnListing.value ?? 0), 0)),
    })
  }

  results.sort((a, b) => {
    if (a.rule.severity !== b.rule.severity) return a.rule.severity === 'ERROR' ? -1 : 1
    return b.revenueOnListings - a.revenueOnListings
  })

  const errors = countBySeverity(worstByListing, 'ERROR')
  const warnings = countBySeverity(worstByListing, 'WARNING')

  return {
    listingsChecked: listings.length,
    ruleCount: AUDIT_RULES.length,
    errors,
    warnings,
    passing: listings.length - worstByListing.size,
    healthScore: healthScore(listings, worstByListing, revenueByListing),
    results,
    bulkFixable: results.filter((r) => r.rule.bulkFixable).reduce((s, r) => s + r.count, 0),
    revenueOnListings: round2(
      [...worstByListing.keys()].reduce((s, id) => s + (revenueByListing.get(id) ?? 0), 0),
    ),
    thresholds,
    lastRunAt: '2026-08-20T00:00:00.000Z',
    listingsWithoutRevenue: listings.filter((l) => !revenueByListing.has(l.etsyListingId)).length,
  }
}

/**
 * Health score, weighted by each listing's share of verified revenue.
 *
 * A listing that earned nothing in the period has no share, so it cannot move
 * the score. That is deliberate and it is stated in the methodology: the score
 * answers "how much of my money is behind a broken listing", not "how many of my
 * listings are broken". Coverage says how much revenue the score could see.
 */
function healthScore(
  listings: EtsyListing[],
  worstByListing: Map<string, Severity>,
  revenueByListing: Map<string, number>,
): Provenanced<number> {
  /*
   * Nothing to score.
   *
   * This used to fall through to the unweighted branch, where an empty listing
   * set produced a penalty of 0 and therefore a score of 100 — a perfect health
   * score for a shop with no listings in it, printed directly above the line
   * "Covers 0% of your listings". The two sentences contradicted each other on
   * the same screen.
   *
   * A score over an empty set is not a good score, it is an absent one, and
   * this product already has a shape for that. Found by rendering the app
   * against an empty shop; the demo shop always has 450 listings, so the branch
   * was unreachable in every review.
   */
  if (listings.length === 0) {
    return unavailable(
      'There are no listings to check yet, so there is no health score to report.',
      'Connect a shop, or add your first listing on Etsy — the audit runs on the next sync.',
    ) as Provenanced<number>
  }

  const totalRevenue = [...revenueByListing.values()].reduce((s, v) => s + v, 0)

  if (totalRevenue === 0) {
    // No revenue means no weights. Fall back to counting listings and say so —
    // a different formula must never hide behind the same number.
    // listings.length is non-zero: the empty case returned above.
    const penalty =
      [...worstByListing.values()].reduce((s, sev) => s + SEVERITY_WEIGHT[sev], 0) / listings.length
    return calculated(Math.round((1 - penalty) * 100), 'No orders in this period, so the score counts listings equally instead of weighting them by revenue.', {
      coverage: 0,
      limitations: ['Unweighted: with no sales, no listing carries more of the shop than another.'],
    })
  }

  let penalty = 0
  for (const [listingId, severity] of worstByListing) {
    const share = (revenueByListing.get(listingId) ?? 0) / totalRevenue
    penalty += share * SEVERITY_WEIGHT[severity]
  }

  const withRevenue = listings.filter((l) => revenueByListing.has(l.etsyListingId)).length
  return calculated(
    Math.max(0, Math.round((1 - penalty) * 100)),
    'Each listing’s share of your verified revenue, weighted by the severity of its worst issue, subtracted from 100. Errors count fully; warnings count a third.',
    {
      coverage: Math.round((withRevenue / Math.max(1, listings.length)) * 100),
      limitations: [
        'Listings with no orders in this period carry no weight, so a broken listing that never sold does not move the score.',
        'Severity weights are ours, not Etsy’s. Edit your thresholds to change what counts.',
      ],
    },
  )
}

function toFinding(rule: AuditRule, listing: EtsyListing, revenue: number): AuditFinding {
  const base: AuditFinding = {
    listingId: listing.etsyListingId,
    title: listing.title,
    sku: listing.sku,
    /*
     * Item revenue from this listing's own receipt lines, summed. An exact
     * aggregate, so it stays VERIFIED (D32).
     *
     * Item revenue, not order gross: order-level discounts and refunds belong
     * to the order, and apportioning them across its items would be a transform
     * that demotes the figure. Better a precise smaller claim than a demoted
     * larger one, and the caption says which it is.
     */
    revenueOnListing: verified(
      round2(revenue),
      'Your Etsy order receipts — item lines, before order-level discounts',
    ) as Provenanced<number>,
  }

  if (rule.code !== 'MISSING_REQUIRED_ATTRIBUTE') return base

  const missing = listing.requiredAttributes.find((key) => !listing.attributes[key])
  return {
    ...base,
    ...(missing ? { missingAttribute: missing } : {}),
    suggestedValue: missing ? suggestFromText(listing, missing) : null,
  }
}

/**
 * Suggested values come from the seller's own listing text, never from a model
 * and never from another shop's listing. A null suggestion renders as "Choose
 * value" — an empty dropdown is honest, an invented default is not.
 */
function suggestFromText(listing: EtsyListing, attribute: string): string | null {
  const haystack = `${listing.title} ${listing.description}`.toLowerCase()
  const candidates: Record<string, [string, string][]> = {
    'Metal purity': [
      ['14k gold filled', '14k gold filled'],
      ['gold filled', '14k gold filled'],
      ['sterling', '925 sterling'],
      ['925', '925 sterling'],
    ],
    'Primary material': [
      ['stoneware', 'Stoneware'],
      ['linen', 'Linen'],
      ['cotton', 'Cotton'],
      ['brass', 'Brass'],
      ['ceramic', 'Ceramic'],
    ],
  }
  for (const [needle, value] of candidates[attribute] ?? []) {
    if (haystack.includes(needle)) return value
  }
  return null
}

function revenueFrom(orders: EtsyOrder[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const order of orders) {
    for (const item of order.items) {
      map.set(item.etsyListingId, (map.get(item.etsyListingId) ?? 0) + item.unitPrice * item.quantity)
    }
  }
  return map
}

function duplicatedTags(listings: EtsyListing[]): Set<string> {
  const counts = new Map<string, number>()
  for (const l of listings) {
    for (const tag of new Set(l.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([tag]) => tag))
}

function countBySeverity(worst: Map<string, Severity>, severity: Severity): number {
  let n = 0
  for (const value of worst.values()) if (value === severity) n += 1
  return n
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
