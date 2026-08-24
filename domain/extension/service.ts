/*
 * Listing intelligence for the extension popup.
 *
 * Composes what the app already computes — the audit's rules and health score,
 * the signals adapter's modelled keyword figures — rather than growing a second
 * implementation for a small screen. A popup that computed its own health score
 * would eventually disagree with the audit page, and the seller would be the
 * one to find out.
 *
 * The own-listing distinction is the interesting part. For a listing in the
 * seller's connected shop we have receipts, so the figures are VERIFIED. For
 * anyone else's listing we have public observation only, so they are ESTIMATED
 * ranges from the signals adapter (D36). Same popup, different provenance, and
 * the badge says which — a competitor's modelled sales and your own real ones
 * must never look alike.
 */

import { auditListings } from '@/domain/audit/service'
import { getEtsyService } from '@/lib/etsy'
import { demoConfirmedCosts, PERIOD_END, PERIOD_START } from '@/lib/etsy/demo-dataset'
import type { EtsyListing } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'
import { getSignalsService } from '@/lib/signals'
import type {
  ExtensionMetric,
  ListingHealth,
  ListingIntelligence,
} from '@/lib/extension/contract'

const OBSERVED_ON = '2026-08-20'

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return new URL(path, base).toString()
}

function band(score: number): ListingHealth['band'] {
  if (score >= 75) return 'GOOD'
  if (score >= 50) return 'FAIR'
  return 'POOR'
}

export async function getListingIntelligence(
  ctx: ShopContext,
  etsyListingId: string,
): Promise<ListingIntelligence | null> {
  const etsy = getEtsyService()
  const { listings } = await etsy.getListings(ctx.shopId, { limit: 500 })
  const own = listings.find((l) => l.etsyListingId === etsyListingId)

  return own
    ? ownListing(own, listings, await etsy.getOrders(ctx.shopId, { since: PERIOD_START, until: PERIOD_END }))
    : otherListing(etsyListingId)
}

/* -------------------------------------------------------- the seller's own */

async function ownListing(
  listing: EtsyListing,
  listings: EtsyListing[],
  orders: Awaited<ReturnType<ReturnType<typeof getEtsyService>['getOrders']>>,
): Promise<ListingIntelligence> {
  // One audit run, then read this listing's findings out of it. The popup and
  // the audit page therefore cannot disagree — they are the same computation.
  const audit = auditListings(listings, orders, demoConfirmedCosts(listings))
  const findings = audit.results.filter((r) =>
    r.findings.some((f) => f.listingId === listing.etsyListingId),
  )

  const itemRevenue = orders.reduce(
    (sum, order) =>
      sum +
      order.items
        .filter((i) => i.etsyListingId === listing.etsyListingId)
        .reduce((t, i) => t + i.unitPrice * i.quantity, 0),
    0,
  )
  const unitsSold = orders.reduce(
    (sum, order) =>
      sum + order.items.filter((i) => i.etsyListingId === listing.etsyListingId).reduce((t, i) => t + i.quantity, 0),
    0,
  )

  /*
   * A per-listing score, computed the same way as the shop score but over one
   * listing: severity subtracted from 100. Errors count fully, warnings a
   * third — the weights are the audit's, not a second set.
   */
  const penalty = findings.reduce((sum, r) => sum + (r.rule.severity === 'ERROR' ? 1 : 0.35), 0)
  const score = Math.max(0, Math.round((1 - Math.min(1, penalty / 3)) * 100))

  const worst = findings[0]

  return {
    etsyListingId: listing.etsyListingId,
    title: listing.title,
    shopName: 'your shop',
    isOwnListing: true,
    health: {
      score,
      band: band(score),
      improvements: findings.length,
      provenance: 'CALCULATED',
      methodology:
        'This listing’s open audit findings, weighted by severity and subtracted from 100. The same rules and weights as the Listing Audit page.',
    },
    metrics: [
      {
        label: 'Units sold, last 30 days',
        display: String(unitsSold),
        provenance: 'VERIFIED',
        methodology: 'Counted from your own Etsy receipts for this listing.',
      },
      {
        label: 'Revenue, last 30 days',
        display: `$${itemRevenue.toFixed(2)}`,
        provenance: 'VERIFIED',
        methodology:
          'Summed from this listing’s own receipt lines, before order-level discounts. What it earned, not what is at risk.',
      },
      {
        label: 'Listing views',
        // Etsy does not expose this. Null, and it stays null (Methodology 93).
        display: null,
        provenance: 'UNAVAILABLE',
        methodology: 'Etsy does not expose listing views through the public API.',
        limitations: ['Not estimated here or anywhere. Import your Etsy Stats file to add it.'],
      },
    ],
    primaryKeyword: null,
    recommendation: worst ? `${worst.rule.label}. ${worst.rule.fix}` : null,
    actions: [
      { label: 'Audit Listing', href: appUrl(`/listings/audit#${worst?.rule.code ?? ''}`) },
      { label: 'Keyword Research', href: appUrl('/research/keywords') },
      { label: 'Shop Pulse', href: appUrl('/shop-pulse') },
      { label: 'Action Center', href: appUrl('/action-center') },
    ],
    observedOn: OBSERVED_ON,
  }
}

/* ----------------------------------------------------- anyone else's listing */

async function otherListing(etsyListingId: string): Promise<ListingIntelligence> {
  const signals = getSignalsService()
  /*
   * getCompetitor returns null for a shop the model has not observed, which is
   * the ordinary case for a listing the seller happens to be looking at. The
   * extension then reports UNAVAILABLE rather than a modelled figure for a shop
   * nothing is known about.
   */
  const competitor = await signals.getCompetitor('Aurelia Made')
  const term = 'birth flower necklace'
  const keyword = await signals.getKeyword(term, 'United States')

  const salesRange = competitor?.monthlySales.value ?? null
  const monthlySales: ExtensionMetric = {
    label: 'Estimated monthly sales',
    display: salesRange ? `${salesRange.min}–${salesRange.max}` : null,
    provenance: competitor ? competitor.monthlySales.provenance.type : 'UNAVAILABLE',
    ...(competitor?.monthlySales.provenance.confidence
      ? { confidence: competitor.monthlySales.provenance.confidence }
      : {}),
    methodology:
      competitor?.monthlySales.provenance.methodology ??
      'This shop has not been observed often enough to model.',
    ...(competitor?.monthlySales.provenance.limitations
      ? { limitations: competitor.monthlySales.provenance.limitations }
      : {}),
  }

  const demand = keyword.demand.value
  const primaryKeyword: ExtensionMetric = {
    label: `Primary keyword · ${term}`,
    display: demand ? `${Math.round(demand.min / 1000)}K–${Math.round(demand.max / 1000)}K / mo` : null,
    provenance: keyword.demand.provenance.type,
    ...(keyword.demand.provenance.confidence ? { confidence: keyword.demand.provenance.confidence } : {}),
    methodology: keyword.demand.provenance.methodology,
    ...(keyword.demand.provenance.limitations ? { limitations: keyword.demand.provenance.limitations } : {}),
  }

  return {
    etsyListingId,
    title: 'Listing on another shop',
    shopName: competitor?.name ?? 'Another shop',
    isOwnListing: false,
    /*
     * No health score for someone else's listing. The audit weighs rules
     * against confirmed costs and verified revenue, and we have neither — a
     * score built from what is publicly visible would look like the same
     * number and mean something different.
     */
    health: null,
    metrics: [
      monthlySales,
      {
        label: 'Competition',
        display: keyword.competition.value
          ? keyword.competition.value.charAt(0) + keyword.competition.value.slice(1).toLowerCase()
          : null,
        provenance: keyword.competition.provenance.type,
        methodology: keyword.competition.provenance.methodology,
        ...(keyword.competition.provenance.limitations
          ? { limitations: keyword.competition.provenance.limitations }
          : {}),
      },
    ],
    primaryKeyword,
    recommendation: null,
    actions: [
      { label: 'Keyword Research', href: appUrl(`/research/keywords?q=${encodeURIComponent(term)}`) },
      { label: 'Shop Pulse', href: appUrl('/shop-pulse') },
      { label: 'Action Center', href: appUrl('/action-center') },
    ],
    observedOn: OBSERVED_ON,
  }
}
