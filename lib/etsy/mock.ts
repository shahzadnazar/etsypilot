/*
 * MockEtsyService.
 *
 * The demo adapter. Serves the Willow & Fern dataset behind exactly the same
 * contract LiveEtsyService will implement, so Phase 11 is an adapter swap
 * rather than a rewrite.
 *
 * It cannot write. Demo mode is read-only by design (artboard 103a: "Publish
 * anything to Etsy - demo mode cannot write"), and applyListingChanges says so
 * explicitly instead of silently pretending to succeed.
 */

import { Errors } from '@/lib/errors/types'
import {
  UNAVAILABLE_ADS_PERFORMANCE,
  UNAVAILABLE_LISTING_VIEWS,
} from '@/lib/provenance/builders'
import type { Provenanced } from '@/lib/provenance/types'
import {
  DEMO_COUNTS,
  isEmptyDataset,
  DEMO_LAST_SYNCED,
  DEMO_SHOP_ID,
  buildDemoListings,
  buildDemoOrders,
  buildDemoPriorOrders,
} from './demo-dataset'
import type {
  EtsyListing,
  EtsyOrder,
  EtsyService,
  EtsyShop,
  ListingWriteRequest,
  ListingWriteResult,
  SyncProgress,
} from './interface'

/*
 * The empty variant.
 *
 * Every empty state in this product was unreachable, which is why so few of
 * them existed. The demo shop always has 450 listings and 438 orders, so a
 * screen that renders nonsense with no data — a table of headers and no rows, a
 * "0%" where "nothing yet" belongs, an average over an empty set — renders
 * perfectly in every review and every check.
 *
 * DEMO_DATASET=empty serves the same shop with nothing in it. It is a test
 * seam, not a feature: it changes no behaviour anywhere else, and the browser
 * checks drive it to prove the empty states are real rather than assumed.
 */
/*
 * Re-exported, not defined here.
 *
 * It moved to demo-dataset.ts when a second demo store needed it, because
 * importing it from this file made that store an importer of MockEtsyService —
 * and the architecture test caught it immediately. The mock adapter must stay a
 * one-file swap, so nothing outside lib/etsy/index.ts may reach into it, not
 * even for a two-line env read.
 */
export { isEmptyDataset }

/* Built once per process. Deterministic, so this is safe to memoise. */
let listingCache: EtsyListing[] | null = null
let orderCache: EtsyOrder[] | null = null

function listings(): EtsyListing[] {
  if (isEmptyDataset()) return []
  if (!listingCache) listingCache = buildDemoListings()
  return listingCache
}

/*
 * The reporting period AND the 90 days before it.
 *
 * The adapter used to serve only the 30-day period, so any question about
 * history had to reach around it — Shop Pulse imported the generator directly,
 * with a comment explaining why. That made the seam a claim rather than a fact,
 * and it silently broke the first screen that asked the adapter for a previous
 * period: Shop analytics' comparison came back empty and every change read as
 * "no previous data" rather than the growth the shop actually had.
 *
 * A live shop's receipts do not stop at the period boundary, so neither does
 * this.
 */
function orders(): EtsyOrder[] {
  if (isEmptyDataset()) return []
  if (!orderCache) {
    const catalogue = listings()
    orderCache = [...buildDemoPriorOrders(catalogue), ...buildDemoOrders(catalogue)].sort((a, b) =>
      a.placedAt.localeCompare(b.placedAt),
    )
  }
  return orderCache
}

export class MockEtsyService implements EtsyService {
  readonly canWrite = false
  readonly mode = 'mock' as const

  async getShop(shopId: string): Promise<EtsyShop> {
    assertDemoShop(shopId)
    return {
      etsyShopId: DEMO_SHOP_ID,
      name: 'Willow & Fern Studio',
      currency: 'USD',
      timezone: 'America/New_York',
      connectionStatus: 'DEMO',
      lastSyncedAt: DEMO_LAST_SYNCED,
      // Must agree with listings(). A count that disagrees with the list is the
      // 'shop has 450 listings' header above an empty table.
      activeListingCount: isEmptyDataset() ? 0 : DEMO_COUNTS.activeListings,
      grantedScopes: ['listings_r', 'shops_r', 'transactions_r', 'billing_r'],
    }
  }

  async getListings(
    shopId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<{ listings: EtsyListing[]; total: number }> {
    assertDemoShop(shopId)
    const all = listings()
    const offset = opts.offset ?? 0
    const limit = opts.limit ?? 50
    return { listings: all.slice(offset, offset + limit), total: all.length }
  }

  async getListing(shopId: string, etsyListingId: string): Promise<EtsyListing | null> {
    assertDemoShop(shopId)
    return listings().find((l) => l.etsyListingId === etsyListingId) ?? null
  }

  async getOrders(
    shopId: string,
    opts: { since?: string; until?: string } = {},
  ): Promise<EtsyOrder[]> {
    assertDemoShop(shopId)
    return orders().filter((o) => {
      if (opts.since && o.placedAt < opts.since) return false
      if (opts.until && o.placedAt > opts.until) return false
      return true
    })
  }

  async getSyncProgress(shopId: string): Promise<SyncProgress> {
    assertDemoShop(shopId)
    // The demo shop is static: nothing syncs, and the UI says so rather than
    // showing a progress bar that never moves.
    return {
      overallPercent: 100,
      etaSeconds: 0,
      rateLimitedUntil: null,
      stages: [
        { key: 'shop', label: 'Confirming shop', detail: 'Willow & Fern Studio', status: 'DONE' },
        { key: 'listings', label: 'Importing listings', detail: '450 of 450', status: 'DONE', current: 450, total: 450 },
        { key: 'inventory', label: 'Syncing inventory and variations', detail: '450 of 450', status: 'DONE', current: 450, total: 450 },
        { key: 'orders', label: 'Loading 24 months of orders', detail: '438 of 438', status: 'DONE', current: 438, total: 438 },
        { key: 'metrics', label: 'Calculating profit and catalog health', detail: 'Complete', status: 'DONE' },
      ],
    }
  }

  /**
   * Demo mode cannot write. This throws a named, user-safe error rather than
   * returning a fake success - a demo that pretends to publish is worse than
   * one that refuses.
   */
  async applyListingChanges(
    _shopId: string,
    _requests: ListingWriteRequest[],
  ): Promise<ListingWriteResult[]> {
    throw Errors.demoModeWrite()
  }

  async getListingViews(_shopId: string, _etsyListingId: string): Promise<Provenanced<number>> {
    return { value: null, provenance: UNAVAILABLE_LISTING_VIEWS }
  }

  async getAdsPerformance(_shopId: string): Promise<Provenanced<number>> {
    return { value: null, provenance: UNAVAILABLE_ADS_PERFORMANCE }
  }
}

/**
 * The mock serves its one fictional catalogue to whatever shop asks.
 *
 * This used to be `if (shopId !== DEMO_SHOP_ID) throw crossShop(shopId)`, under
 * the comment "a user must never be able to operate on another shop's data".
 * That property is real and still holds. This check was never what enforced it.
 *
 * WHY IT HAD TO GO. Every account now gets its own demo shop, so the product is
 * explorable before an Etsy key exists. Those shops have real, distinct ids, so
 * a test against one hardcoded constant refuses every single request — it stops
 * being a boundary and becomes an outage.
 *
 * WHY THIS IS NOT D50e. That decision records a cache that DROPPED a shopId, so
 * one shop was served another shop's credentials: the identifier vanished from
 * a keyed lookup and an authorization boundary became a coincidence. Nothing of
 * the sort happens here. This adapter holds no per-shop state and no per-shop
 * credential — one static fictional catalogue, identical for every caller.
 * There is no shop A data for shop B to receive, so there is nothing for a
 * dropped identifier to leak.
 *
 * WHERE THE BOUNDARY ACTUALLY LIVES. `shopContext()` in lib/permissions throws
 * `crossShop` when `session.shopId` is not the shop being requested, and every
 * domain function takes that context rather than a bare id. That is the check
 * that stops a seller reading someone else's shop, and it is untouched — with a
 * test that fails if it ever stops refusing.
 *
 * WHAT REPLACES IT. Not nothing. The assertion now guards the invariant that is
 * still true and still worth failing on: this adapter must never serve data
 * while the product believes it is live. Fictional listings presented as a real
 * shop's is a worse failure than any this file could otherwise produce, and the
 * selector in lib/etsy/index.ts is a second guard on the same property rather
 * than the only one.
 */
function assertDemoShop(shopId: string): void {
  if (process.env.ETSY_MODE === 'live') {
    throw Errors.validation(
      'The demo catalogue was asked to serve a live shop.',
      `EtsyPilot is configured for live Etsy data, so shop ${shopId} must be read through the ` +
        'live adapter. No demo figures were returned — showing invented listings as a real shop ' +
        'is the one failure this adapter must never produce.',
    )
  }
}
