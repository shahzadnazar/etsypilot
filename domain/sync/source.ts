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
import { maxContentAgeMs, withinWindow } from '@/lib/etsy/freshness'
import { countListings, readShopSyncState } from '@/lib/repositories/listings'
import { readAggregateSyncedAt, type SyncAggregate } from '@/lib/repositories/sync-state'
import type { ShopContext } from '@/lib/permissions'

export type ShopDataSource =
  | { kind: 'DEMO' }
  | { kind: 'NOT_SYNCED' }
  /**
   * Our tables hold this aggregate, and the copy is older than Etsy's API
   * Terms §5 allows us to display.
   *
   * Carries everything the withheld state needs to say so in a sentence: when
   * we last read it, which window it broke, and whether a refresh is being
   * attempted or has just failed. NOT folded into NOT_SYNCED, although both
   * withhold the rows: "we have never read your shop" and "what we have is
   * seven hours old and we are re-reading it now" are different facts with
   * different remedies, and the second one has an age to report.
   */
  | {
      kind: 'STALE'
      aggregate: SyncAggregate
      lastSyncedAt: string
      /** The window this copy is outside, in milliseconds. From the constants. */
      maxAgeMs: number
    }
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
  aggregate: SyncAggregate,
): Promise<{ source: ShopDataSource; currency: string | null }> {
  if (isDemoMode()) return { source: { kind: 'DEMO' }, currency: null }

  const state = await readShopSyncState(ctx.shopId)
  if (!state) return { source: { kind: 'NO_SHOP' }, currency: null }

  /*
   * ── PER AGGREGATE, AND THE SECOND AGGREGATE IS WHY ────────────────────
   *
   * This read `shops.last_synced_at`, which was right while listings were
   * the only aggregate reading our own tables. Orders broke it: after a
   * listings sync that column is set, so an ORDERS reader was told SYNCED
   * and found an empty table — and the Action Center, whose whole job is to
   * say what needs attention, would have said "nothing needs your
   * attention" when the truthful answer was "nothing has been read yet".
   *
   * One timestamp cannot say which aggregate was read, so sync_state holds
   * one row per (shop, aggregate). `shops.last_synced_at` keeps its own
   * meaning — the most recent sync of anything — which is what the app
   * shell shows.
   */
  const lastSyncedAt = await readAggregateSyncedAt(ctx.shopId, aggregate)
  if (!lastSyncedAt) return { source: { kind: 'NOT_SYNCED' }, currency: state.currency }

  /*
   * ── AND THE WINDOW, WHICH IS WHERE ETSY §5 IS ACTUALLY ENFORCED ───────
   *
   * "You will not display listing content more than six (6) hours older than
   * the corresponding information... any other Etsy content more than
   * twenty-four (24) hours." That is a rule about DISPLAY, so it is checked
   * at the one place that decides whether a surface may display an
   * aggregate, and an aggregate outside its window comes back STALE — which
   * every caller already handles, because STALE withholds its rows through
   * exactly the path NOT_SYNCED does.
   *
   * No refresh is triggered from here, and that is deliberate: this function
   * is called from page renders, several times per render, and a GET that
   * writes is a GET that cannot be retried, cached or reasoned about. The
   * withheld state asks for the refresh instead — one POST, from a surface
   * that knows it is withholding — and domain/sync/refresh.ts is where the
   * stampede and the budget are handled.
   */
  if (!withinWindow(lastSyncedAt, aggregate, new Date())) {
    return {
      source: {
        kind: 'STALE',
        aggregate,
        lastSyncedAt,
        maxAgeMs: maxContentAgeMs(aggregate),
      },
      currency: state.currency,
    }
  }

  return {
    source: { kind: 'SYNCED', lastSyncedAt },
    currency: state.currency,
  }
}

/**
 * Why a surface is not showing this aggregate's rows, or null if it may.
 *
 * ── EVERY SURFACE ASKS THIS, AND NONE OF THEM COMPARES `.kind` ITSELF ─────
 *
 * Five pages and three components used to test `source.kind === 'NOT_SYNCED'
 * || source.kind === 'NO_SHOP'` inline. Adding a fourth withholding state to
 * the union therefore meant editing eight places, and the failure mode of
 * missing one is the worst one available: the page falls through to its normal
 * render, the loader has already withheld the rows, and the seller is shown a
 * screen of zeroes computed from nothing — which is the defect
 * tests/browser/reporting-window.py was written for.
 *
 * So the comparison lives here once and the surfaces call this.
 * tests/unit/freshness-window.test.ts fails on any surface that compares
 * `.kind` to a freshness literal of its own, which is what makes a screen
 * added next month covered by construction rather than by somebody remembering.
 */
export type WithheldReason = 'NEVER_SYNCED' | 'STALE' | 'NO_SHOP'

export function withheldReason(source: ShopDataSource): WithheldReason | null {
  switch (source.kind) {
    case 'DEMO':
    case 'SYNCED':
      return null
    case 'NOT_SYNCED':
      return 'NEVER_SYNCED'
    case 'STALE':
      return 'STALE'
    case 'NO_SHOP':
      return 'NO_SHOP'
  }
}

/**
 * True when a refresh could change the answer.
 *
 * NO_SHOP cannot: there is no shop row to read Etsy for, and asking would be a
 * request spent on a certainty.
 */
export function refreshWouldHelp(source: ShopDataSource): boolean {
  const reason = withheldReason(source)
  return reason === 'NEVER_SYNCED' || reason === 'STALE'
}

export interface ShopHeader {
  name: string
  currency: string
  /** The shop's time basis, from our row. Etsy's payload has no timezone. */
  timezone: string
  /** When a sync last completed. Null means never, and the shell says so. */
  lastSyncedAt: string | null
  /**
   * Active listings we hold, or NULL when we may not say.
   *
   * Null rather than 0, and the distinction is load-bearing: the sidebar's
   * plan chip renders "— / 2,000 listings" for a shop that has not been read,
   * because "0 / 2,000" is a claim that the shop is empty. Same argument as
   * ShopDataSource.NOT_SYNCED, one screen further out.
   *
   * ── AND IT IS WITHHELD OUTSIDE THE LISTINGS WINDOW TOO ──────────────────
   *
   * A count of active listings IS Etsy listing content, so Etsy's API Terms §5
   * governs it at six hours like every other listing field — and this was the
   * one place that would have gone on displaying it. It reaches five surfaces
   * (the sidebar's plan chip, the dashboard tile, onboarding, the connect
   * summary and the notification digest), so withholding it here covers all
   * five rather than asking each to remember.
   */
  activeListingCount: number | null
  /**
   * Why the count is null, for a surface that has to word it.
   *
   * "Not synced yet" and "read seven hours ago, which is further behind than
   * we may display" are both em dashes and are not the same sentence. Null
   * when the count is present.
   */
  listingCountWithheld: WithheldReason | null
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
      timezone: shop.timezone,
      lastSyncedAt: shop.lastSyncedAt,
      activeListingCount: shop.activeListingCount,
      /* The demo catalogue is not Etsy content and has no window. */
      listingCountWithheld: null,
    }
  }

  const state = await readShopSyncState(ctx.shopId)
  if (!state) return null

  /*
   * Asked of the LISTINGS aggregate specifically, not of `shops.last_synced_at`
   * — which is the most recent sync of ANYTHING and would report a listing
   * count as current because the orders sync ran. That is the same defect
   * sync_state was created to fix, arriving at the one column that still read
   * the shared timestamp.
   */
  const listingsSyncedAt = await readAggregateSyncedAt(ctx.shopId, 'LISTINGS')
  const countable =
    listingsSyncedAt !== null && withinWindow(listingsSyncedAt, 'LISTINGS', new Date())

  return {
    name: state.name,
    currency: state.currency,
    timezone: state.timezone,
    lastSyncedAt: state.lastSyncedAt,
    /*
     * Counted only when there is a number we are allowed to state. Before the
     * first sync there is none, and `countListings` would return 0 — which the
     * chip would print as a fact about the seller's shop. Outside the six-hour
     * window there is a number and §5 says not to display it.
     */
    activeListingCount: countable ? await countListings(ctx.shopId) : null,
    listingCountWithheld: countable
      ? null
      : listingsSyncedAt === null
        ? 'NEVER_SYNCED'
        : 'STALE',
  }
}

/** True when this source means "read our tables", for callers that only care. */
export function readsDatabase(source: ShopDataSource): boolean {
  return source.kind === 'SYNCED' || source.kind === 'STALE' || source.kind === 'NOT_SYNCED'
}
