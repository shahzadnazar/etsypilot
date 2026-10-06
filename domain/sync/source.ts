import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHERE A SELLER'S DATA COMES FROM. ONE DECISION, ONE PLACE, FIVE
 *   AGGREGATES TO COME.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Listings is the first aggregate to read from our own tables. Orders, profit,
 * keywords and the rest are the same shape, so this question gets answered once
 * rather than inside each service:
 *
 *     DEMO         the mock adapter, the Willow & Fern catalogue, the demo
 *                  chip on every figure. Touches none of these tables.
 *     NOT_SYNCED   our tables, and nothing has ever been written to them.
 *     SYNCED       our tables, as of `lastSyncedAt`.
 *
 * ── WHAT DECIDES IT, AND WHAT DELIBERATELY DOES NOT ───────────────────────
 *
 * `ETSY_MODE` decides, through isDemoMode(), and nothing else does.
 *
 * The tempting alternative is `ctx.readOnly` — which is `shops.is_demo` — and
 * it is wrong, measurably so. `is_demo` describes the SHOP: whether its figures
 * are real, which drives the demo banner, the D11 provenance override and
 * read-only writes. `ETSY_MODE` describes the DEPLOYMENT: which adapter exists
 * at all. They answer different questions and they disagree in the case that
 * actually happens — a live deployment where a brand-new signup has a shop
 * still flagged `is_demo` because they have not connected Etsy yet.
 *
 * Branching on `is_demo` there would send that seller down the DEMO path, into
 * MockEtsyService, which refuses:
 *
 *     "The demo catalogue was asked to serve a live shop... showing invented
 *      listings as a real shop is the one failure this adapter must never
 *      produce."
 *
 * That guard is right and it is the backstop, not the plan. Branching on
 * ETSY_MODE means the DEMO path only ever runs where the mock is the adapter,
 * and the mock's own refusal is then unreachable by construction rather than by
 * care. tests/unit/sync-source.test.ts asserts the branch is on isDemoMode(),
 * and the integration suite asserts a live-mode read touches no adapter.
 *
 * ── AND WHY NOT_SYNCED IS A THIRD ANSWER RATHER THAN AN EMPTY LIST ────────
 *
 * Because an empty list is a CLAIM. "You have no listings" is false for a
 * seller whose sync has not run, and this codebase already holds that line
 * everywhere else — the operator account page says "No usage records. That
 * means nothing has been metered for this account — not that every meter reads
 * zero." A count cannot tell absence from zero; `shops.last_synced_at` can,
 * which is why it is read here and not inferred from `count(*) === 0`.
 */

import { getEtsyService, isDemoMode } from '@/lib/etsy'
import { countListings, readShopSyncState } from '@/lib/repositories/listings'
import type { ShopContext } from '@/lib/permissions'

export type ShopDataSource =
  | { kind: 'DEMO' }
  | { kind: 'NOT_SYNCED' }
  | { kind: 'SYNCED'; lastSyncedAt: string }
  /**
   * The shop row is gone, which is not the same as not synced.
   *
   * Reachable only if a session names a shop that no longer exists. Its own
   * kind rather than folded into NOT_SYNCED, because "nothing has synced" is a
   * thing a seller can fix and this is not.
   */
  | { kind: 'NO_SHOP' }

/**
 * Where this request should read a seller's data from.
 *
 * Takes a ShopContext rather than a shop id so a caller cannot ask about a shop
 * they have no context for — the same reason every repository function here
 * takes one. `currency` comes back with it because every aggregate's view needs
 * it and the alternative is a second read of the same row per screen.
 */
export async function shopDataSource(
  ctx: ShopContext,
): Promise<{ source: ShopDataSource; currency: string | null }> {
  if (isDemoMode()) return { source: { kind: 'DEMO' }, currency: null }

  const state = await readShopSyncState(ctx.shopId)
  if (!state) return { source: { kind: 'NO_SHOP' }, currency: null }
  if (!state.lastSyncedAt) return { source: { kind: 'NOT_SYNCED' }, currency: state.currency }
  return {
    source: { kind: 'SYNCED', lastSyncedAt: state.lastSyncedAt },
    currency: state.currency,
  }
}

export interface ShopHeader {
  name: string
  currency: string
  /** When a sync last completed. Null means never, and the shell says so. */
  lastSyncedAt: string | null
  /**
   * Active listings we hold, or NULL when nothing has synced.
   *
   * Null rather than 0, and the distinction is load-bearing: the sidebar's
   * plan chip renders "— / 2,000 listings" for a shop that has not been read,
   * because "0 / 2,000" is a claim that the shop is empty. Same argument as
   * ShopDataSource.NOT_SYNCED, one screen further out.
   */
  activeListingCount: number | null
}

/**
 * What the app shell puts above every seller screen: the shop's name and when
 * it last synced.
 *
 * ── WHY THIS EXISTS, AND IT IS NOT A CONVENIENCE ──────────────────────────
 *
 * app/(dashboard)/layout.tsx asked the ADAPTER for this, on every page. In a
 * live deployment with no ETSY_API_KEY, LiveEtsyService.getShop() throws
 * ETSY_NOT_CONFIGURED — so every seller screen returned 500 before reaching
 * its own data. Measured, in a browser, against a live-mode server: /listings
 * rendered "Something went wrong on our side" and the never-synced empty state
 * this slice exists to produce was unreachable.
 *
 * The shell does not need Etsy for either value. `shops.name` is written by
 * the connection and `shops.last_synced_at` is written by the sync in this
 * slice — which is also what finally retires the shell's "Static data · no
 * sync", a string that was permanent because nothing had ever written the
 * column.
 *
 * Demo mode still asks the adapter, unchanged, so the Willow & Fern header and
 * its chip are exactly what they were.
 */
export async function shopHeader(ctx: ShopContext): Promise<ShopHeader | null> {
  if (isDemoMode()) {
    const shop = await getEtsyService().getShop(ctx.shopId)
    return {
      name: shop.name,
      currency: shop.currency,
      lastSyncedAt: shop.lastSyncedAt,
      activeListingCount: shop.activeListingCount,
    }
  }

  const state = await readShopSyncState(ctx.shopId)
  if (!state) return null
  return {
    name: state.name,
    currency: state.currency,
    lastSyncedAt: state.lastSyncedAt,
    /*
     * Counted only once a sync has run. Before that there is no number to
     * report, and `countListings` would return 0 — which the chip would print
     * as a fact about the seller's shop.
     */
    activeListingCount: state.lastSyncedAt === null ? null : await countListings(ctx.shopId),
  }
}

/** True when this source means "read our tables", for callers that only care. */
export function readsDatabase(source: ShopDataSource): boolean {
  return source.kind === 'SYNCED' || source.kind === 'NOT_SYNCED'
}
