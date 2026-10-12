import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE TRIGGER. A READ THAT FINDS ITS DATA OUTSIDE ETSY'S WINDOW CAUSES A
 *   REFRESH; NOTHING ELSE DOES.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * domain/sync/listings.ts and domain/sync/orders.ts have said, since they were
 * written, "no timer, no queue, no cron: when and how often is a later
 * decision". This is that decision, and the shape of it comes from the clause
 * rather than from an operations preference.
 *
 * Etsy API Terms §5 bounds DISPLAY, not scheduling: do not display listing
 * content more than six hours older than Etsy's, or other content more than
 * twenty-four. So the enforcement point is the read, not the clock. A read
 * that finds its aggregate outside the window withholds the rows and asks for
 * a refresh; a shop nobody opens is refreshed never and displays nothing
 * stale, because it displays nothing.
 *
 * What that buys, in order of how much it matters:
 *
 *   IT CANNOT FAIL SILENTLY. A cron that stops running leaves every page
 *   rendering happily on month-old data. A window checked at the read cannot:
 *   if the refresh does not happen the page says so, because the same check
 *   that would have triggered it is the one that decides whether to display.
 *
 *   IT RUNS ON HOSTINGER. The deployment target is a VPS behind nginx. There
 *   is no managed queue and no guarantee of a working crontab in the container
 *   the app ships in. An architecture that assumes either is an architecture
 *   that will not run.
 *
 *   IT COSTS NOTHING FOR AN IDLE SELLER. A cron over all shops spends Etsy
 *   requests on sellers who have not logged in for a month, out of a budget
 *   that is 10,000 a day for the WHOLE APP KEY. Read-triggered spends only on
 *   shops somebody is looking at. That argument holds independently of
 *   Hostinger and is the reason not to add a scheduler later "as well".
 *
 * ── WHERE THIS CAN BE REACHED FROM, WHICH IS THE AUTHORIZATION QUESTION ───
 *
 * It takes a ShopContext, and lib/permissions.shopContext() is the only
 * sanctioned way to build one: it throws crossShop() unless the session's own
 * shop id is the one asked for. So the only reachable caller is a seller acting
 * on their own shop — app/api/sync/refresh/route.ts, which reads the shop id
 * from the session and NEVER from the request body, and the OAuth callback,
 * which uses the session shop it has just connected.
 *
 * NOT reachable from the operator area, deliberately. domain/admin/
 * operator-writes.ts declares the four things an operator may write and a sync
 * is not one of them; an operator screen that could refresh a seller's shop
 * would be a fifth. No operator route imports this module, there is no shop-id
 * parameter anywhere in its signature that an operator could supply, and
 * tests/unit/operator-write-boundary asserts the four unchanged.
 */

import { AppError } from '@/lib/errors/types'
import { isDemoMode } from '@/lib/etsy'
import { log } from '@/lib/observability/logger'
import { maxContentAgeMs, withinWindow } from '@/lib/etsy/freshness'
import { withAggregateSyncLock } from '@/lib/repositories/sync-lock'
import { readAggregateSyncedAt, SYNC_AGGREGATES, type SyncAggregate } from '@/lib/repositories/sync-state'
import { readShopSyncState } from '@/lib/repositories/listings'
import { assertCanWrite, type ShopContext } from '@/lib/permissions'
import { baselineWindow, reportingWindow } from '@/domain/clock'
import { syncShopListings } from '@/domain/sync/listings'
import { syncShopOrders } from '@/domain/sync/orders'

/**
 * Why a refresh did not produce fresh data, in terms a seller can act on.
 *
 * Mapped from the AppError kinds the sync can raise rather than passed
 * through, because an AppError's message is written for whoever triggered the
 * action and this one is read by someone who merely loaded a page.
 */
export type RefreshFailure =
  /** The seller has not accepted the current Application Terms. */
  | 'TERMS_NOT_ACCEPTED'
  /**
   * There are no finished Application Terms to accept, so nothing may be read
   * from Etsy for anyone — docs/legal still carry `[[LEGAL_ENTITY]]`.
   *
   * This is the state of every deployment today, and it is why it has its own
   * reason rather than falling through to UNKNOWN: "try again" is false about
   * it, and so is "accept the terms", because there are none to accept. It is
   * the operator's to fix, and the seller should be told that plainly.
   */
  | 'TERMS_NOT_PUBLISHED'
  /** The seller's grant is gone. They can fix it by reconnecting. */
  | 'NOT_CONNECTED'
  /**
   * The SERVER has no Etsy credentials. Separate from NOT_CONNECTED, and the
   * distinction is the difference between honest copy and copy that blames the
   * seller for the operator's problem — "reconnect your shop" cannot fix a
   * missing ETSY_API_KEY, and this is the state every deployment is in until
   * the key arrives.
   */
  | 'NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'ETSY_UNAVAILABLE'
  | 'UNKNOWN'

export type RefreshOutcome =
  /** Already inside the window when we looked. No Etsy request was made. */
  | { kind: 'FRESH'; aggregate: SyncAggregate; lastSyncedAt: string }
  | { kind: 'REFRESHED'; aggregate: SyncAggregate; syncedAt: string; rows: number }
  /** Another process is refreshing this same aggregate right now. */
  | { kind: 'BUSY'; aggregate: SyncAggregate }
  /** Nothing to refresh: demo mode, a demo shop, or no shop row. */
  | { kind: 'SKIPPED'; aggregate: SyncAggregate; reason: 'DEMO' | 'READ_ONLY' | 'NO_SHOP' }
  | { kind: 'FAILED'; aggregate: SyncAggregate; reason: RefreshFailure }

/**
 * In-flight refreshes in THIS process, keyed by shop and aggregate.
 *
 * The race this closes is not occasional. Next renders a layout, a page and
 * several components concurrently, and more than one of them asks where the
 * shop's data comes from on the same request — plus two browser tabs, a
 * double-click, and the client refresh that follows a sync. Without this, the
 * advisory lock would turn all of those into one winner and N callers told
 * BUSY, each of which would have nothing to show. With it they share the
 * winner's promise and its result.
 *
 * A `Map` on the module and not a cache with a TTL: an entry is deleted in the
 * `finally` of the work it stands for, so the map is empty whenever nothing is
 * running and cannot serve a stale answer.
 */
const inFlight = new Map<string, Promise<RefreshOutcome>>()

function flightKey(shopId: string, aggregate: SyncAggregate): string {
  return `${shopId}:${aggregate}`
}

/** How many days of orders a refresh reads. */
function orderSyncWindow(): { since: string; until: string } {
  /*
   * The baseline's start to the reporting window's end — 120 days — because
   * that is the widest window any screen reads: Shop Pulse compares the
   * reporting period against the 90 days before it, and a sync narrower than
   * the widest reader produces a page that is fresh and empty.
   *
   * Not "all history". The first sync of a long-lived shop would be hundreds
   * of requests against a 10,000/day app-wide budget, and how far back to
   * backfill is a separate decision with a retention consequence (Etsy §5's
   * "no longer than is reasonably necessary" is about exactly this). What is
   * here is the window the product currently reports on.
   */
  return { since: baselineWindow().start, until: reportingWindow().end }
}

/**
 * Bring one aggregate inside its window if it is outside it.
 *
 * Idempotent and cheap to call on every read: the first thing it does is
 * compare a timestamp, and the overwhelmingly common answer is FRESH with no
 * lock taken and no Etsy request made.
 */
export async function refreshIfStale(
  ctx: ShopContext,
  aggregate: SyncAggregate,
  now: Date = new Date(),
): Promise<RefreshOutcome> {
  if (isDemoMode()) return { kind: 'SKIPPED', aggregate, reason: 'DEMO' }
  /*
   * `ctx.readOnly` is `shops.is_demo`, which is true until an Etsy connection
   * clears it. Checked here rather than left to assertCanWrite inside the sync
   * so a brand-new signup gets "connect your shop" instead of a thrown
   * authorization error on every page load.
   */
  if (ctx.readOnly) return { kind: 'SKIPPED', aggregate, reason: 'READ_ONLY' }

  const key = flightKey(ctx.shopId, aggregate)
  const existing = inFlight.get(key)
  if (existing) return existing

  const started = runRefresh(ctx, aggregate, now).finally(() => {
    inFlight.delete(key)
  })
  inFlight.set(key, started)
  return started
}

async function runRefresh(
  ctx: ShopContext,
  aggregate: SyncAggregate,
  now: Date,
): Promise<RefreshOutcome> {
  /*
   * ── THE WRITE GATE, AND IT IS A BACKSTOP RATHER THAN THE PLAN ──────────
   *
   * refreshIfStale returns SKIPPED for a read-only shop before it ever calls
   * this, because a brand-new signup loading a page should be told to connect
   * their shop rather than handed an authorization error. So this line is
   * unreachable by construction — which is the point of having it. A sync is a
   * write, this is the function an HTTP route reaches, and
   * tests/unit/public-demo.test.ts requires a write gate somewhere on the path
   * from every mutating route rather than trusting that the soft check above
   * is still there next month.
   *
   * Both syncs assert it again for themselves. One guard is a guard, two is a
   * property — the same reasoning lib/ai/index.ts gives for checking the mode
   * twice.
   */
  assertCanWrite(ctx)

  const state = await readShopSyncState(ctx.shopId)
  if (!state) return { kind: 'SKIPPED', aggregate, reason: 'NO_SHOP' }

  const before = await readAggregateSyncedAt(ctx.shopId, aggregate)
  if (before && withinWindow(before, aggregate, now)) {
    return { kind: 'FRESH', aggregate, lastSyncedAt: before }
  }

  const result = await withAggregateSyncLock(ctx.shopId, aggregate, async () => {
    /*
     * ── THE DOUBLE CHECK, AND IT IS NOT BELT-AND-BRACES ─────────────────
     *
     * Two requests on a shop whose data is seven hours old: the first takes
     * the lock, refreshes, commits and releases. The second was told BUSY and
     * its client retried — or it was waiting on a connection — and it now
     * takes the lock. Without re-reading the timestamp INSIDE the lock it
     * would page the whole catalogue again, one second after the first one
     * did. The lock serialises the refreshes; this is what stops the
     * serialised ones from each spending the budget.
     */
    const inside = await readAggregateSyncedAt(ctx.shopId, aggregate)
    if (inside && withinWindow(inside, aggregate, now)) {
      return { kind: 'FRESH', aggregate, lastSyncedAt: inside } satisfies RefreshOutcome
    }

    try {
      if (aggregate === 'LISTINGS') {
        const synced = await syncShopListings(ctx)
        return {
          kind: 'REFRESHED',
          aggregate,
          syncedAt: synced.syncedAt,
          rows: synced.upserted,
        } satisfies RefreshOutcome
      }
      const synced = await syncShopOrders(ctx, orderSyncWindow())
      return {
        kind: 'REFRESHED',
        aggregate,
        syncedAt: synced.syncedAt,
        rows: synced.upserted,
      } satisfies RefreshOutcome
    } catch (error) {
      /*
       * ── A FAILED REFRESH LEAVES THE OLD TIMESTAMP, WHICH IS THE POINT ──
       *
       * The sync writes its rows and its sync-state row in one transaction
       * (lib/repositories/sync-state.ts: "a timestamp committed separately
       * from its rows would claim a catalogue that is not there"), and
       * domain/sync/listings.ts throws rather than stamping a partial
       * catalogue when it runs past MAX_PAGES. So a failure anywhere in here
       * rolls back to the previous timestamp — the data stays as stale as it
       * was, the read that triggered this still withholds it, and the next
       * read tries again. There is no state in which a half-fetched catalogue
       * is wearing a fresh timestamp.
       *
       * Reported, not rethrown: the caller is a page load or the small POST a
       * page makes, and "Etsy would not answer" is an outcome to show rather
       * than a 500. The failure is logged with its own error for the operator
       * log; the seller gets the mapped reason.
       */
      log.error('refresh could not bring an aggregate inside its window', error, {
        shopId: ctx.shopId,
        aggregate,
      })
      return { kind: 'FAILED', aggregate, reason: classify(error) } satisfies RefreshOutcome
    }
  })

  if (!result.held) return { kind: 'BUSY', aggregate }
  return result.value
}

/**
 * An error from the sync, as something the withheld state can say.
 *
 * Keyed on AppError.kind and code rather than on message text. RATE_LIMITED is
 * separated out because it is the one failure whose remedy is "wait" rather
 * than "do something", and because it is the one the rate-limit arithmetic
 * predicts: if it starts appearing, the app key's daily budget is the thing
 * that has run out, not the seller's connection.
 */
function classify(error: unknown): RefreshFailure {
  if (error instanceof AppError) {
    if (error.code === 'TERMS_NOT_ACCEPTED') return 'TERMS_NOT_ACCEPTED'
    if (error.code === 'TERMS_NOT_PUBLISHED') return 'TERMS_NOT_PUBLISHED'
    if (error.kind === 'RATE_LIMIT') return 'RATE_LIMITED'
    if (error.code === 'ETSY_NOT_CONFIGURED') return 'NOT_CONFIGURED'
    if (error.code === 'ETSY_NOT_CONNECTED') return 'NOT_CONNECTED'
    if (error.code === 'ETSY_HTTP_401' || error.code === 'ETSY_HTTP_403') return 'NOT_CONNECTED'
    if (error.code === 'NOT_AUTHENTICATED') return 'NOT_CONNECTED'
    if (error.kind === 'EXTERNAL_SERVICE') return 'ETSY_UNAVAILABLE'
  }
  return 'UNKNOWN'
}

/**
 * Bring every aggregate inside its window, one at a time.
 *
 * Sequential, not `Promise.all`. Etsy allows ten requests a second for the
 * whole app key; two aggregates firing together from every connected shop that
 * happens to load a page in the same second is how an app spends that burst on
 * itself. Sequential also means a rate-limited first aggregate is visible
 * before the second one is attempted.
 *
 * Used by the OAuth callback, so a shop that has just connected has data
 * before the seller reaches a screen, and by the refresh endpoint when a page
 * found more than one aggregate outside its window.
 */
export async function refreshStaleAggregates(
  ctx: ShopContext,
  aggregates: readonly SyncAggregate[] = SYNC_AGGREGATES,
  now: Date = new Date(),
): Promise<RefreshOutcome[]> {
  const out: RefreshOutcome[] = []
  for (const aggregate of aggregates) {
    out.push(await refreshIfStale(ctx, aggregate, now))
  }
  return out
}

/** The windows, for a caller that wants to report what it enforced. */
export function windowMsFor(aggregate: SyncAggregate): number {
  return maxContentAgeMs(aggregate)
}
