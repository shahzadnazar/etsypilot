import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE ONE PLACE DEMO_EVENTS AND THE NARRATIVE LISTING SETS ARE ALLOWED TO
 *   LEAVE THE DEMO DATASET.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Same shape as domain/costs/demo.ts, and for the same reason: so "is this
 * fixture on a live path" is answerable by reading one import list rather than
 * by trusting a rule people remember.
 *
 * ── WHAT WAS MEASURED BEFORE THIS EXISTED ─────────────────────────────────
 *
 * domain/shop-pulse/service.ts filtered DEMO_EVENTS unconditionally and built
 * its four change specs from NARRATIVE and buildDemoListings(). Those become
 * DetectedChange rows, and the Action Center turns DetectedChange rows into
 * work. On a live account with two listings and two orders, the Action Center
 * showed four CRITICAL cards:
 *
 *     "Orders fell below your baseline with no recorded change"  × 4
 *     scoped to "3 listings", "12 listings", "1 listing", "4 listings"
 *     with destinations "View the bulk job" and "Review the section"
 *
 * under a banner reading "This shop is not connected to Etsy yet, so there is
 * nothing to show on these screens yet either". Every one of them described
 * Willow & Fern. The sidebar badge said 4.
 *
 * ── THE SPECS ARE AUTHORED, NOT DERIVED, AND THAT IS FINE IN DEMO ─────────
 *
 * Titles like "Price raised on 3 listings · Linen table runner +2" are written
 * copy about a designed narrative. They belong to the fixture. In live mode
 * the specs are derived from the shop's own `events` rows instead — see
 * `specsFromEvents` in ./service.ts — and a shop with no recorded events
 * produces no recorded changes, which is the true answer about it.
 */

import { isDemoMode } from '@/lib/etsy'
import { DEMO_EVENTS } from '@/lib/etsy/demo-events'
import {
  DEMO_BASELINE,
  NARRATIVE,
  buildDemoListings,
  narrativeGroups,
} from '@/lib/etsy/demo-dataset'
import type { DomainEvent } from '@/lib/events/types'
import type { ChangeSpec, TestedAlternative } from './types'

/**
 * The demo shop's event log, or null if this deployment is not serving it.
 *
 * Null rather than an empty array: a caller that forgot to branch gets a
 * type it has to handle, instead of silently reading "this shop has recorded
 * nothing" as if it had asked the database.
 */
export function demoEvents(): DomainEvent[] | null {
  if (!isDemoMode()) return null
  return [...DEMO_EVENTS]
}

/**
 * The four authored change specs behind the demo narrative, or null.
 *
 * Kept exactly as they were, so Shop Pulse and the Action Center look in demo
 * mode precisely as they did before any of this moved.
 */
export function demoChangeSpecs(): ChangeSpec[] | null {
  const events = demoEvents()
  if (!events) return null

  const priceEvents = events.filter((e) => e.type === 'PRICE_CHANGED')
  const tagEvent = events.find((e) => e.operationId === 'BE-2291')
  const stockout = events.find((e) => e.type === 'STOCKOUT')
  const deactivation = events.find((e) => e.type === 'LISTING_DEACTIVATED')

  const specs: ChangeSpec[] = []

  if (priceEvents.length > 0) {
    specs.push({
      id: 'CH-PRICE',
      events: priceEvents,
      title: `Price raised on ${priceEvents.length} listings`,
      scope: 'Linen table runner +2',
      listingIds: NARRATIVE.priceGroup.slice(),
      detailSuffix: '+18.4% average',
      destinations: [
        { label: 'Review these 3 listings', href: '/listings?ids=price-group' },
        { label: 'Open in Bulk Editor', href: '/listings/bulk-editor' },
        { label: 'See profit impact', href: '/profit' },
      ],
    })
  }

  if (tagEvent) {
    specs.push({
      id: 'CH-TAGS',
      events: [tagEvent],
      title: 'Tags replaced on 12 listings',
      scope: 'Wall art section',
      // A different set of listings from the price group - which is exactly why
      // this comes back RULED_OUT rather than CORRELATED.
      listingIds: narrativeGroups(buildDemoListings()).tagGroup.map((l) => l.etsyListingId),
      detailSuffix: 'bulk job BE-2291',
      destinations: [{ label: 'View the bulk job', href: '/listings/change-history' }],
    })
  }

  if (stockout) {
    specs.push({
      id: 'CH-STOCK',
      events: [stockout],
      title: 'Out of stock for 6 days',
      scope: 'Ceramic mug set',
      listingIds: [NARRATIVE.stockoutListing],
      detailSuffix: 'restocked Aug 10',
      destinations: [
        { label: 'Review this listing', href: '/listings?ids=stockout' },
        { label: 'See profit impact', href: '/profit' },
      ],
    })
  }

  if (deactivation) {
    specs.push({
      id: 'CH-DEACT',
      events: [deactivation],
      title: '4 listings deactivated',
      scope: 'Seasonal section',
      listingIds: narrativeGroups(buildDemoListings()).seasonal.map((l) => l.etsyListingId),
      detailSuffix: 'manual',
      destinations: [{ label: 'Review the section', href: '/listings?section=Seasonal' }],
    })
  }

  return specs
}

/**
 * The two alternatives the demo narrative tests every change against, or null.
 *
 * "Tag replacement on Jul 28" and the ceramic-mug stockout are events in the
 * fixture. On a live shop `alternativesFor` was printing "These listings were
 * not in that job" about a bulk job that shop never ran — a RULED_OUT verdict,
 * which is a claim that a real check was made.
 */
export function demoAlternatives(spec: ChangeSpec): TestedAlternative[] | null {
  if (!isDemoMode()) return null

  const out: TestedAlternative[] = []

  if (spec.id !== 'CH-TAGS') {
    const tagGroup = narrativeGroups(buildDemoListings()).tagGroup.map((l) => l.etsyListingId)
    const overlap = tagGroup.some((id) => spec.listingIds.includes(id))
    out.push({
      label: 'Tag replacement on Jul 28',
      verdict: overlap ? 'UNKNOWN' : 'RULED_OUT',
      note: overlap
        ? 'Some of these listings were in that job, so the two changes cannot be separated.'
        : 'These listings were not in that job.',
    })
  }

  if (spec.id !== 'CH-STOCK') {
    const stockAffected = spec.listingIds.includes(NARRATIVE.stockoutListing)
    out.push({
      label: 'Stock',
      verdict: stockAffected ? 'UNKNOWN' : 'RULED_OUT',
      note: stockAffected
        ? 'One of these listings was out of stock during the window.'
        : 'All stayed in stock throughout the window.',
    })
  }

  return out
}

export interface BaselineCoverage {
  coveragePercent: number
  listingsTooNew: number | null
  coverageNote: string
}

/**
 * The demo shop's baseline coverage, or null.
 *
 * DEMO_BASELINE.coveragePercent and .listingsTooNew were passed into
 * `computeBaseline` for EVERY shop, so a live seller's Shop Pulse read "84%
 * baseline coverage · 38 listings too new to baseline" — two figures about
 * Willow & Fern, under the heading of their own shop, on the screen whose
 * whole argument is that the baseline comes only from their own history.
 */
export function demoBaselineCoverage(): BaselineCoverage | null {
  if (!isDemoMode()) return null
  return {
    coveragePercent: DEMO_BASELINE.coveragePercent,
    listingsTooNew: DEMO_BASELINE.listingsTooNew,
    coverageNote: `${DEMO_BASELINE.listingsTooNew} listings are too new to baseline`,
  }
}
