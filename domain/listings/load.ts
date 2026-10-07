import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE LISTINGS LOADER — THE MIRROR OF domain/orders/load.ts, EXTRACTED
 *   BECAUSE ORDERS PROVED ONE SERVICE WAS NOT ENOUGH.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The listings slice put its branch inside domain/listings/service.ts, which
 * was right for one reader. Surveying the order readers found SEVEN other
 * services calling `getEtsyService().getListings()` directly — the audit, the
 * profit screen, analytics, experiments, the seasonal calendar, the extension
 * and billing — every one of them bypassing that branch and throwing
 * ETSY_NOT_CONFIGURED in a live deployment.
 *
 * So the branch lives here, the service calls it, and switching one of those
 * seven is a one-line change. That is the same claim domain/orders/load.ts
 * makes, and the reason the two files look alike is that they should: the
 * three aggregates still to come copy this shape.
 *
 * ── WHY THE COSTS MAP COMES BACK WITH IT ──────────────────────────────────
 *
 * `demoConfirmedCosts` is the demo dataset's own fixture, and a synced shop
 * has no confirmed costs at all — `cost_rules` is a later aggregate and
 * nothing writes it. Returning the map from here means no caller has to know
 * that, and no caller can accidentally pair a synced catalogue with the demo
 * cost fixture, which would put invented margins on a real seller's listings.
 */

import { getEtsyService } from '@/lib/etsy'
import { demoConfirmedCosts, DEMO_NOW } from '@/lib/etsy/demo-dataset'
import type { EtsyListing } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'
import { readListings } from '@/lib/repositories/listings'
import { currentListingCosts } from '@/lib/repositories/costs'
import { shopDataSource, type ShopDataSource } from '@/domain/sync/source'

export interface LoadedListings {
  listings: EtsyListing[]
  /** Confirmed costs. Empty on a synced shop: cost rules are a later aggregate. */
  costs: Map<string, number>
  currency: string
  /** The instant relative dates are measured from. */
  now: string
  source: ShopDataSource
}

export async function loadListings(ctx: ShopContext): Promise<LoadedListings> {
  const { source, currency } = await shopDataSource(ctx, 'LISTINGS')

  if (source.kind === 'DEMO') {
    const etsy = getEtsyService()
    const [shop, catalogue] = await Promise.all([
      etsy.getShop(ctx.shopId),
      etsy.getListings(ctx.shopId, { limit: 500 }),
    ])
    const listings = catalogue.listings
    return {
      listings,
      costs: demoConfirmedCosts(listings),
      currency: shop.currency,
      now: DEMO_NOW,
      source,
    }
  }

  /*
   * NOT_SYNCED and NO_SHOP read nothing: there is provably nothing to read,
   * and a query returning an empty array would make the two indistinguishable
   * from a synced-and-empty shop at the only place the difference is still
   * knowable.
   */
  if (source.kind !== 'SYNCED') {
    return {
      listings: [],
      costs: new Map(),
      currency: currency ?? 'USD',
      now: new Date().toISOString(),
      source,
    }
  }

  /*
   * ── THE COSTS MAP IS REAL NOW ───────────────────────────────────────────
   *
   * This returned `new Map()` with a comment saying cost rules were "a later
   * aggregate and nothing writes it". They are this aggregate, and
   * `currentListingCosts` reads them: the seller's own confirmed per-listing
   * costs, newest rule per listing, retracted rules absent rather than zero.
   *
   * Still empty for a seller who has confirmed none — which is most sellers,
   * and which the coverage figure then reports as 0% rather than inventing a
   * cost per listing.
   */
  const [listings, costs] = await Promise.all([
    readListings(ctx.shopId),
    currentListingCosts(ctx.shopId),
  ])
  return {
    listings,
    costs,
    currency: currency ?? 'USD',
    now: new Date().toISOString(),
    source,
  }
}

/** True when this source means the caller is looking at a real answer. */
export function listingsWereRead(source: ShopDataSource): boolean {
  return source.kind === 'DEMO' || source.kind === 'SYNCED'
}
