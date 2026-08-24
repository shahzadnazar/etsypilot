/*
 * All Listings (artboard 36).
 *
 * Everything on a row is either read from the shop or computed from it. The
 * only two figures that are neither verified nor obvious are called out on the
 * page footnote the artboard specifies: margin, and the views Etsy will not
 * give us.
 */

import { AUDIT_RULES, DEFAULT_THRESHOLDS, type RuleContext } from '@/domain/audit/rules'
import { calculateFees } from '@/domain/fees/calculate'
import { getEtsyService } from '@/lib/etsy'
import { demoConfirmedCosts, DEMO_NOW } from '@/lib/etsy/demo-dataset'
import type { EtsyListing } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'
import {
  LISTING_STATUSES,
  HEALTH_KINDS,
  type HealthKind,
  type ListingFilters,
  type ListingHealth,
  type ListingRow,
  type ListingStatus,
} from './types'

/** An active listing renewing within this many days reads as Expiring. */
export const EXPIRING_WITHIN_DAYS = 7

export const PAGE_SIZE = 25

export interface ListingsView {
  rows: ListingRow[]
  /** Every listing in the shop, before any filter. */
  total: number
  /** After filtering, before paging — what "Showing 1–25 of N" divides. */
  matching: number
  counts: { active: number; drafts: number; expiring: number }
  /** Listings with no confirmed cost, so no margin. Stated in the footnote. */
  withoutCost: number
  sections: string[]
  /*
   * Only the statuses and health kinds this catalogue actually contains.
   *
   * The dropdowns offered all five Etsy states, including INACTIVE, which no
   * listing in this shop has — a filter option that can only ever return an
   * empty table. Same principle as the sections list beside it: offer what is
   * there.
   */
  statuses: ListingStatus[]
  healths: HealthKind[]
  filters: ListingFilters
  page: number
  pageCount: number
  currency: string
  /*
   * The instant "2 d ago" is measured from.
   *
   * Returned rather than left to the component, which is the same defect the
   * Security page's session list had: a relative time needs two instants, and a
   * component with only one will always find them equal.
   */
  now: string
}

export async function getListingsView(
  ctx: ShopContext,
  query: Record<string, string | undefined> = {},
): Promise<ListingsView> {
  const etsy = getEtsyService()
  const [shop, catalogue] = await Promise.all([
    etsy.getShop(ctx.shopId),
    etsy.getListings(ctx.shopId, { limit: 500 }),
  ])
  const listings = catalogue.listings
  const costs = demoConfirmedCosts(listings)

  const ruleCtx: RuleContext = {
    costs,
    duplicatedTags: duplicatedTags(listings),
    thresholds: DEFAULT_THRESHOLDS,
  }

  /*
   * The haystack is built here and never leaves the server.
   *
   * The artboard's search box says "title, tag or SKU", and tags are the
   * reason it is worth having — a seller looking for "wedding favour" is
   * looking for a tag, not a title. Carrying every listing's tags on the row
   * to make that work would ship the whole catalogue's tag list to the browser
   * to support a filter that already ran.
   */
  const indexed = listings.map((listing) => ({
    row: toRow(listing, { costs, ruleCtx }),
    haystack: `${listing.title} ${listing.sku ?? ''} ${listing.tags.join(' ')}`.toLowerCase(),
  }))
  const rows = indexed.map((i) => i.row)
  const filters = parseFilters(query, rows)

  const matching = indexed.filter((i) => matches(i, filters)).map((i) => i.row)
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE))
  // A filter that empties the table must not leave the reader on page 4 of 1.
  const page = Math.min(Math.max(1, filters.page), pageCount)
  const start = (page - 1) * PAGE_SIZE

  return {
    rows: matching.slice(start, start + PAGE_SIZE),
    total: rows.length,
    matching: matching.length,
    counts: {
      active: rows.filter((r) => r.status === 'ACTIVE' || r.status === 'EXPIRING').length,
      drafts: rows.filter((r) => r.status === 'DRAFT').length,
      expiring: rows.filter((r) => r.status === 'EXPIRING').length,
    },
    withoutCost: rows.filter((r) => r.margin === null && r.status !== 'DRAFT').length,
    sections: [...new Set(rows.map((r) => r.section).filter((s): s is string => s !== null))].sort(),
    statuses: LISTING_STATUSES.filter((status) => rows.some((r) => r.status === status)),
    healths: HEALTH_KINDS.filter((kind) => rows.some((r) => r.health.kind === kind)),
    filters: { ...filters, page },
    page,
    pageCount,
    currency: shop.currency,
    now: DEMO_NOW,
  }
}

function toRow(
  listing: EtsyListing,
  args: { costs: Map<string, number>; ruleCtx: RuleContext },
): ListingRow {
  const health = healthOf(listing, args.ruleCtx)
  const cost = args.costs.get(listing.etsyListingId)

  return {
    etsyListingId: listing.etsyListingId,
    title: listing.title,
    sku: listing.sku,
    tagCount: listing.tags.length,
    hasVariations: listing.hasVariations,
    variationSummary: listing.variationSummary,
    status: statusOf(listing),
    price: listing.price,
    /*
     * A digital listing has no finite quantity, and Etsy reports a large
     * placeholder for it. Null renders as ∞ on the row; a number would say the
     * seller has exactly that many left.
     */
    quantity: isDigital(listing) ? null : listing.quantity,
    section: listing.section,
    renewsAt: listing.renewsAt,
    health,
    margin: cost === undefined ? null : marginOf(listing.price, cost),
    lastChangedAt: listing.lastChangedAt,
  }
}

/**
 * Margin from the listing's own price, the published fee rates, and the
 * seller's confirmed cost.
 *
 * CALCULATED rather than verified: the price is the shop's, the cost is the
 * seller's, and the fees are what the recorded rate set produces — Etsy has not
 * charged anything on an unsold listing, so there is no verified fee to use
 * (D49). The page states that beside the column rather than leaving the reader
 * to assume the number came from a receipt.
 */
export function marginOf(price: number, cost: number): number | null {
  if (price <= 0) return null
  const fees = calculateFees({ itemPrice: price, shipping: 0, tax: 0, offsiteAd: false })
  return Math.round(((price - fees.totalFees - cost) / price) * 1000) / 10
}

function healthOf(listing: EtsyListing, ctx: RuleContext): ListingHealth {
  let errors = 0
  let warnings = 0
  for (const rule of AUDIT_RULES) {
    if (!rule.test(listing, ctx)) continue
    if (rule.severity === 'ERROR') errors += 1
    else warnings += 1
  }
  return {
    kind: errors > 0 ? 'ERRORS' : warnings > 0 ? 'NEEDS_WORK' : 'GOOD',
    errors,
    warnings,
  }
}

function statusOf(listing: EtsyListing, now: string = DEMO_NOW): ListingStatus {
  if (listing.state === 'DRAFT') return 'DRAFT'
  if (listing.state === 'EXPIRED') return 'EXPIRED'
  if (listing.state === 'INACTIVE') return 'INACTIVE'
  if (!listing.renewsAt) return 'ACTIVE'
  const days = (Date.parse(listing.renewsAt) - Date.parse(now)) / 86_400_000
  return days >= 0 && days <= EXPIRING_WITHIN_DAYS ? 'EXPIRING' : 'ACTIVE'
}

function isDigital(listing: EtsyListing): boolean {
  return (listing.sku ?? '').includes('DL') || (listing.sku ?? '').includes('SGN')
}

function duplicatedTags(listings: EtsyListing[]): Set<string> {
  const seen = new Map<string, number>()
  for (const listing of listings) {
    for (const tag of new Set(listing.tags)) seen.set(tag, (seen.get(tag) ?? 0) + 1)
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([tag]) => tag))
}

/*
 * Every filter value is checked against a closed set. A query string is
 * somewhere the reader can type, and an unrecognised value must widen to ALL
 * rather than silently match nothing — an empty table with no explanation is
 * the worst answer a filter can give.
 */
function parseFilters(
  query: Record<string, string | undefined>,
  rows: ListingRow[],
): ListingFilters {
  const sections = new Set(rows.map((r) => r.section).filter(Boolean) as string[])
  const page = Number.parseInt(query.page ?? '1', 10)

  return {
    q: (query.q ?? '').trim(),
    status: LISTING_STATUSES.includes(query.status as ListingStatus)
      ? (query.status as ListingStatus)
      : 'ALL',
    health: HEALTH_KINDS.includes(query.health as HealthKind)
      ? (query.health as HealthKind)
      : 'ALL',
    section: query.section && sections.has(query.section) ? query.section : 'ALL',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  }
}

function matches(
  entry: { row: ListingRow; haystack: string },
  filters: ListingFilters,
): boolean {
  const { row } = entry
  if (filters.status !== 'ALL' && row.status !== filters.status) return false
  if (filters.health !== 'ALL' && row.health.kind !== filters.health) return false
  if (filters.section !== 'ALL' && row.section !== filters.section) return false
  if (filters.q === '') return true
  // Title, tag or SKU — the three things the artboard's search box names.
  return entry.haystack.includes(filters.q.toLowerCase())
}
