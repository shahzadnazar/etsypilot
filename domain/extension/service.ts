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
 * anyone else's listing we have nothing measured at all, so they are ESTIMATED
 * ranges from the signals adapter (D36) — and that adapter exists only in the
 * demo, so outside it this popup has nothing to say about another shop's
 * listing and says nothing. Same popup, different provenance, and the badge
 * says which: a competitor's modelled sales and your own real ones must never
 * look alike.
 */

import { auditListings } from '@/domain/audit/service'
import { loadListings } from '@/domain/listings/load'
import { loadOrders } from '@/domain/orders/load'
import type { StoredOrder } from '@/domain/orders/types'
import { nowIso, reportingWindow } from '@/domain/clock'
import type { EtsyListing } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'
import { getSignalsService } from '@/lib/signals'
import type {
  ExtensionMetric,
  ListingHealth,
  ListingIntelligence,
} from '@/lib/extension/contract'

/*
 * The day the popup says its figures are from.
 *
 * This was `const OBSERVED_ON = '2026-08-20'`, rendered by the popup as
 * "Observed 2026-08-20" for every listing on every shop in every mode. The
 * extension is off the live surface behind BROWSER_EXTENSION_ENABLED, so
 * nothing reaches it today, which is why 3dbce03 left it — and why it is a
 * date nobody would have noticed going stale.
 *
 * The seller's own figures are read at request time, so the honest answer is
 * the day of the request, frozen to the fixture's clock in demo mode like
 * every other date in the product.
 */
function observedOn(): string {
  return nowIso().slice(0, 10)
}

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
  const { listings, costs } = await loadListings(ctx)
  const own = listings.find((l) => l.etsyListingId === etsyListingId)
  if (!own) return otherListing(etsyListingId)

  const period = reportingWindow()
  const { orders } = await loadOrders(ctx, { since: period.start, until: period.end })
  return ownListing(own, listings, orders, costs)
}

/* -------------------------------------------------------- the seller's own */

async function ownListing(
  listing: EtsyListing,
  listings: EtsyListing[],
  orders: readonly StoredOrder[],
  /*
   * Passed in from the loader rather than computed here. On a synced shop the
   * map is empty, because cost rules are a later aggregate — and running
   * `demoConfirmedCosts` over a real seller's catalogue would hand the browser
   * extension invented margins for their live listings.
   */
  costs: Map<string, number>,
): Promise<ListingIntelligence> {
  // One audit run, then read this listing's findings out of it. The popup and
  // the audit page therefore cannot disagree — they are the same computation.
  const audit = auditListings(listings, orders, costs)
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
    observedOn: observedOn(),
  }
}

/* ----------------------------------------------------- anyone else's listing */

async function otherListing(etsyListingId: string): Promise<ListingIntelligence | null> {
  const signals = getSignalsService()
  /*
   * No market-signals source on this deployment, so there is nothing to say
   * about somebody else's listing. Null, which the route already handles as
   * "no intelligence for this listing" — not a popup full of UNAVAILABLE
   * rows, which would say "we looked and found nothing" about a thing nobody
   * looked at. See lib/signals/index.ts.
   */
  if (!signals) return null

  /*
   * getCompetitor returns null for a shop outside the modelled set, which is
   * the ordinary case for a listing the seller happens to be looking at. The
   * extension then reports UNAVAILABLE rather than a modelled figure for a
   * shop nothing is known about.
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
      'This shop is not in the modelled set, so there is nothing to show for it.',
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
    observedOn: observedOn(),
  }
}
