import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { acceptTermsFor } from '../support/legal'
import { inReportingWindow } from '../support/window'

import { refreshIfStale, refreshStaleAggregates } from '@/domain/sync/refresh'
import { shopDataSource, shopHeader, withheldReason } from '@/domain/sync/source'
import { loadListings } from '@/domain/listings/load'
import { loadOrders } from '@/domain/orders/load'
import { withAggregateSyncLock } from '@/lib/repositories/sync-lock'
import { readAggregateSyncedAt } from '@/lib/repositories/sync-state'
import {
  LISTING_CONTENT_MAX_AGE_MS,
  OTHER_CONTENT_MAX_AGE_MS,
} from '@/lib/etsy/freshness'
import { EtsyHttpError } from '@/lib/etsy/http'
import { AppError } from '@/lib/errors/types'
import { setEtsyService } from '@/lib/etsy'
import { getDb, schema } from '@/lib/db'
import type { EtsyListing, EtsyOrder } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'

/**
 * The trigger: a read that finds its data outside Etsy's display window.
 *
 *     DATABASE_URL=postgres://... npm run test:integration
 *
 * ── WHAT THIS FILE EXISTS TO PROVE ───────────────────────────────────────
 *
 * Before this task the sync layer was unreachable. syncShopListings and
 * syncShopOrders were written and tested, and every caller of either was in
 * this directory — so a seller connected a shop and nothing ever populated
 * `listings` or `orders`. /profit read "Not synced yet" for ever, while
 * docs/legal/PRIVACY-POLICY-DRAFT.md §5 told sellers we display nothing more
 * than six and twenty-four hours behind Etsy.
 *
 * The claims, in the order they matter:
 *
 *   a read of never-synced data triggers a sync, and the next read is SYNCED
 *   SIX HOURS and TWENTY-FOUR HOURS are separate windows over the same
 *     timestamp — at seven hours old, listings are withheld and orders are not
 *   a withheld aggregate hands out NO ROWS, with the rows sitting in the table
 *   a fresh aggregate costs ZERO Etsy requests, however many reads arrive
 *   two concurrent reads cost ONE Etsy request, in one process and across two
 *   a failed sync leaves the OLD timestamp and no rows — never a fresh
 *     timestamp over a partial catalogue
 *   a rate-limited sync is reported as rate-limited, not as a generic failure
 *   demo mode and a read-only shop touch no adapter and write no rows
 *   refreshing one shop does nothing to another
 */

const SHOP_A = 'refresh-test-shop-a'
const SHOP_B = 'refresh-test-shop-b'
const USER_A = 'refresh-test-user-a'
const USER_B = 'refresh-test-user-b'
const OURS = [SHOP_A, SHOP_B]
const ENV = { ...process.env }

const ctxFor = (shopId: string, readOnly = false): ShopContext => ({
  shopId,
  actorId: USER_A,
  readOnly,
})

function listing(id: string): EtsyListing {
  return {
    etsyListingId: id,
    title: `Listing ${id}`,
    description: 'A description',
    tags: ['handmade'],
    price: 24,
    quantity: 7,
    state: 'ACTIVE',
    section: null,
    sku: null,
    attributes: {},
    requiredAttributes: [],
    photoCount: 3,
    renewsAt: null,
    lastChangedAt: '2026-06-01T00:00:00.000Z',
    hasVariations: false,
    variationSummary: null,
  }
}

function order(id: string): EtsyOrder {
  return {
    etsyReceiptId: id,
    placedAt: inReportingWindow(),
    gross: 48,
    discounts: 2,
    refunds: 0,
    etsyFees: null,
    paymentProcessing: null,
    offsiteAds: null,
    countryCode: 'GB',
    items: [{ etsyListingId: '9001', quantity: 2, unitPrice: 24 }],
  }
}

/**
 * An adapter that counts its calls and can be told to fail.
 *
 * The counter is the measurement for every rate-limit claim in this file: the
 * windows ARE the limiter, and "a fresh aggregate costs zero requests" is only
 * a claim about this number.
 */
function countingAdapter(options: {
  listings?: EtsyListing[]
  orders?: EtsyOrder[]
  failListingsWith?: unknown
  failOrdersWith?: unknown
  onGetListings?: () => Promise<void>
} = {}) {
  const calls = { getListings: 0, getOrders: 0 }
  const service = {
    canWrite: false as const,
    mode: 'mock' as const,
    async getOrders() {
      calls.getOrders += 1
      if (options.failOrdersWith) throw options.failOrdersWith
      return options.orders ?? []
    },
    async getListings(_shopId: string, opts: { limit?: number; offset?: number } = {}) {
      calls.getListings += 1
      if (options.onGetListings) await options.onGetListings()
      if (options.failListingsWith) throw options.failListingsWith
      const all = options.listings ?? []
      const offset = opts.offset ?? 0
      const limit = opts.limit ?? 100
      return { listings: all.slice(offset, offset + limit), total: all.length }
    },
  }
  return { service, calls }
}

/** Listing rows actually in the table, as against listing rows handed to a screen. */
async function countListingRows(shopId: string): Promise<number> {
  const [row] = await getDb()
    .select({ rows: sql<number>`count(*)::int` })
    .from(schema.listings)
    .where(eq(schema.listings.shopId, shopId))
  return row?.rows ?? -1
}

/** Move an aggregate's recorded sync time back, which is what "stale" is. */
async function ageSyncedAt(shopId: string, aggregate: 'LISTINGS' | 'ORDERS', ms: number) {
  await getDb()
    .update(schema.syncState)
    .set({ lastSyncedAt: new Date(Date.now() - ms) })
    .where(and(eq(schema.syncState.shopId, shopId), eq(schema.syncState.aggregate, aggregate)))
}

async function clean() {
  const db = getDb()
  await db.delete(schema.costRules).where(inArray(schema.costRules.shopId, OURS))
  await db.delete(schema.orderItems).where(inArray(schema.orderItems.shopId, OURS))
  await db.delete(schema.orders).where(inArray(schema.orders.shopId, OURS))
  await db.delete(schema.listings).where(inArray(schema.listings.shopId, OURS))
  await db.delete(schema.syncState).where(inArray(schema.syncState.shopId, OURS))
  await db.delete(schema.memberships).where(inArray(schema.memberships.shopId, OURS))
  await db.delete(schema.termsAcceptances).where(inArray(schema.termsAcceptances.shopId, OURS))
  await db.delete(schema.shops).where(inArray(schema.shops.id, OURS))
  await db.delete(schema.users).where(inArray(schema.users.id, [USER_A, USER_B]))
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('These tests need DATABASE_URL pointing at a migrated database.')
  }
  await clean()
})

afterAll(async () => {
  await clean()
  process.env = { ...ENV }
  setEtsyService(null)
})

beforeEach(async () => {
  process.env.ETSY_MODE = 'live'
  await clean()
  await getDb()
    .insert(schema.users)
    .values([
      { id: USER_A, email: 'a@refresh.test', name: 'A' },
      { id: USER_B, email: 'b@refresh.test', name: 'B' },
    ])
  await getDb()
    .insert(schema.shops)
    .values([
      { id: SHOP_A, ownerId: USER_A, name: 'A Shop', currency: 'GBP', isDemo: false, connectionStatus: 'CONNECTED' },
      { id: SHOP_B, ownerId: USER_B, name: 'B Shop', currency: 'USD', isDemo: false, connectionStatus: 'CONNECTED' },
    ])
  await acceptTermsFor(OURS, USER_A)
})

afterEach(() => {
  setEtsyService(null)
})

describe('a read of never-synced data is what causes the first sync', () => {
  it('goes NOT_SYNCED -> refresh -> SYNCED, and the table fills', async () => {
    const { service, calls } = countingAdapter({ listings: [listing('L1'), listing('L2')] })
    setEtsyService(service as never)
    const ctx = ctxFor(SHOP_A)

    const before = await shopDataSource(ctx, 'LISTINGS')
    expect(before.source.kind).toBe('NOT_SYNCED')
    expect(withheldReason(before.source)).toBe('NEVER_SYNCED')

    const outcome = await refreshIfStale(ctx, 'LISTINGS')
    expect(outcome.kind).toBe('REFRESHED')
    expect(calls.getListings).toBe(1)

    const after = await shopDataSource(ctx, 'LISTINGS')
    expect(after.source.kind).toBe('SYNCED')
    expect(withheldReason(after.source)).toBeNull()

    const loaded = await loadListings(ctx)
    expect(loaded.listings).toHaveLength(2)
  })

  it('and both aggregates fill, one at a time rather than in parallel', async () => {
    /*
     * Sequential by design: Etsy allows ten requests a second for the WHOLE
     * app key, so two aggregates firing together from every shop that loads a
     * page in the same second is how an app spends its own burst. Asserted on
     * the outcomes rather than on timing, which would be a flake.
     */
    const { service, calls } = countingAdapter({
      listings: [listing('L1')],
      orders: [order('R1')],
    })
    setEtsyService(service as never)
    const ctx = ctxFor(SHOP_A)

    const outcomes = await refreshStaleAggregates(ctx)
    expect(outcomes.map((o) => `${o.aggregate}:${o.kind}`)).toEqual([
      'LISTINGS:REFRESHED',
      'ORDERS:REFRESHED',
    ])
    expect(calls).toEqual({ getListings: 1, getOrders: 1 })
  })
})

describe('six hours and twenty-four hours are two windows, not one', () => {
  it('at seven hours old, listings are withheld and orders are not', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *  THE ASSERTION THAT WOULD HAVE CAUGHT ONE WINDOW OVER EVERYTHING.
     * ══════════════════════════════════════════════════════════════════════
     *
     * Both aggregates are aged to EXACTLY the same instant, so nothing but
     * the window itself can produce a different answer. Twenty-four hours
     * over listings is the term breach; six over orders is four times the
     * Etsy requests for nothing.
     */
    const { service } = countingAdapter({ listings: [listing('L1')], orders: [order('R1')] })
    setEtsyService(service as never)
    const ctx = ctxFor(SHOP_A)
    await refreshStaleAggregates(ctx)

    const sevenHours = 7 * 3_600_000
    await ageSyncedAt(SHOP_A, 'LISTINGS', sevenHours)
    await ageSyncedAt(SHOP_A, 'ORDERS', sevenHours)

    const listings = await shopDataSource(ctx, 'LISTINGS')
    const orders = await shopDataSource(ctx, 'ORDERS')
    expect(listings.source.kind).toBe('STALE')
    expect(orders.source.kind).toBe('SYNCED')

    if (listings.source.kind !== 'STALE') throw new Error('unreachable')
    expect(listings.source.aggregate).toBe('LISTINGS')
    expect(listings.source.maxAgeMs).toBe(LISTING_CONTENT_MAX_AGE_MS)
  })

  it('at twenty-five hours old, both are withheld', async () => {
    const { service } = countingAdapter({ listings: [listing('L1')], orders: [order('R1')] })
    setEtsyService(service as never)
    const ctx = ctxFor(SHOP_A)
    await refreshStaleAggregates(ctx)

    await ageSyncedAt(SHOP_A, 'LISTINGS', 25 * 3_600_000)
    await ageSyncedAt(SHOP_A, 'ORDERS', 25 * 3_600_000)

    expect((await shopDataSource(ctx, 'LISTINGS')).source.kind).toBe('STALE')
    const orders = await shopDataSource(ctx, 'ORDERS')
    expect(orders.source.kind).toBe('STALE')
    if (orders.source.kind !== 'STALE') throw new Error('unreachable')
    expect(orders.source.maxAgeMs).toBe(OTHER_CONTENT_MAX_AGE_MS)
  })

  it('and the active-listing count is withheld too, because a count is listing content', async () => {
    /*
     * The one Etsy figure that does not come through a loader. `shopHeader`
     * feeds the sidebar's plan chip, the dashboard tile, onboarding, the
     * connect summary and the notification digest, and it counted rows
     * whenever `shops.last_synced_at` was set — which the ORDERS sync also
     * sets. So a catalogue seven hours old was still being counted on five
     * surfaces, which is Etsy listing content displayed outside its window.
     */
    const { service } = countingAdapter({ listings: [listing('L1'), listing('L2')], orders: [order('R1')] })
    setEtsyService(service as never)
    const ctx = ctxFor(SHOP_A)
    await refreshStaleAggregates(ctx)

    const fresh = await shopHeader(ctx)
    expect(fresh?.activeListingCount).toBe(2)
    expect(fresh?.listingCountWithheld).toBeNull()

    // Listings out of window, orders still in it — the count must not survive
    // on the strength of the orders sync having run.
    await ageSyncedAt(SHOP_A, 'LISTINGS', 7 * 3_600_000)
    const stale = await shopHeader(ctx)
    expect(stale?.activeListingCount).toBeNull()
    expect(stale?.listingCountWithheld).toBe('STALE')
    expect(stale?.lastSyncedAt, 'the shell still says when anything last synced').not.toBeNull()
  })

  it('and a withheld aggregate hands out no rows, with the rows still in the table', async () => {
    /*
     * The literal reading of §5 — "you will not display" — enforced by not
     * handing the rows to anything that could display them. The rows are NOT
     * deleted: they are what the next read compares against, and deleting
     * them would turn a seven-hour-old catalogue into a shop with no listings.
     */
    const { service } = countingAdapter({ listings: [listing('L1'), listing('L2')], orders: [order('R1')] })
    setEtsyService(service as never)
    const ctx = ctxFor(SHOP_A)
    await refreshStaleAggregates(ctx)

    await ageSyncedAt(SHOP_A, 'LISTINGS', 7 * 3_600_000)
    await ageSyncedAt(SHOP_A, 'ORDERS', 25 * 3_600_000)

    const loadedListings = await loadListings(ctx)
    const loadedOrders = await loadOrders(ctx, {
      since: '2026-01-01T00:00:00.000Z',
      until: '2026-12-31T00:00:00.000Z',
    })
    expect(loadedListings.listings).toEqual([])
    expect(loadedOrders.orders).toEqual([])

    expect(await countListingRows(SHOP_A), 'the rows were deleted rather than withheld').toBe(2)
  })
})

describe('the windows are the rate limiter', () => {
  it('a fresh aggregate costs zero Etsy requests, however many reads arrive', async () => {
    /*
     * The whole rate-limit argument rests on this number. Six hours means at
     * most four listings refreshes per shop per day no matter how many times
     * the seller loads the page — against a budget of 10,000 a day for the
     * entire app key, shared by every seller.
     */
    const { service, calls } = countingAdapter({ listings: [listing('L1')] })
    setEtsyService(service as never)
    const ctx = ctxFor(SHOP_A)

    await refreshIfStale(ctx, 'LISTINGS')
    expect(calls.getListings).toBe(1)

    for (let i = 0; i < 20; i += 1) {
      const outcome = await refreshIfStale(ctx, 'LISTINGS')
      expect(outcome.kind).toBe('FRESH')
      await shopDataSource(ctx, 'LISTINGS')
    }
    expect(calls.getListings, 'a fresh read reached Etsy').toBe(1)
  })

  it('two concurrent reads in one process cost one Etsy request', async () => {
    /*
     * The stampede, in the form it actually takes: Next renders a layout, a
     * page and several components concurrently, and more than one asks where
     * the shop's data comes from. Without the in-flight map both would sync.
     */
    const { service, calls } = countingAdapter({ listings: [listing('L1')] })
    setEtsyService(service as never)
    const ctx = ctxFor(SHOP_A)

    const [a, b, c] = await Promise.all([
      refreshIfStale(ctx, 'LISTINGS'),
      refreshIfStale(ctx, 'LISTINGS'),
      refreshIfStale(ctx, 'LISTINGS'),
    ])
    expect(calls.getListings, 'three concurrent reads reached Etsy more than once').toBe(1)
    expect(a.kind).toBe('REFRESHED')
    // The losers get the winner's result rather than a worse answer.
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it('and a second process is refused the lock rather than allowed to sync too', async () => {
    /*
     * The other half, which the in-flight map cannot see: two node workers
     * behind one nginx, which is what `pm2 -i` gives you. The outer call holds
     * the advisory lock on its own connection; the inner one is a different
     * connection, so it is exactly the cross-process case.
     */
    const { service, calls } = countingAdapter({ listings: [listing('L1')] })
    setEtsyService(service as never)
    const ctx = ctxFor(SHOP_A)

    const inner = await withAggregateSyncLock(SHOP_A, 'LISTINGS', async () => {
      return refreshIfStale(ctx, 'LISTINGS')
    })

    expect(inner.held).toBe(true)
    if (!inner.held) throw new Error('unreachable')
    expect(inner.value.kind).toBe('BUSY')
    expect(calls.getListings, 'the loser synced anyway').toBe(0)
  })

  it('and the lock is released when its transaction ends, including on a throw', async () => {
    /*
     * Why the lock is `pg_try_advisory_xact_lock` and not the session-scoped
     * `pg_try_advisory_lock`: a session lock survives on a pooled connection
     * handed back to the pool still holding it, and the bug that produces is a
     * shop that can never refresh again.
     */
    await expect(
      withAggregateSyncLock(SHOP_A, 'LISTINGS', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    const again = await withAggregateSyncLock(SHOP_A, 'LISTINGS', async () => 'ok')
    expect(again.held, 'the lock leaked past the transaction that took it').toBe(true)
  })
})

describe('a failed sync is better than a partial one, and must stay that way', () => {
  it('leaves the old timestamp and writes no rows', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *  A SYNC THAT FETCHES HALF THE CATALOGUE AND STAMPS A FRESH TIMESTAMP
     *  IS WORSE THAN ONE THAT FAILS.
     * ══════════════════════════════════════════════════════════════════════
     *
     * The rows and the timestamp are written in one transaction, so a failure
     * anywhere rolls back to the previous timestamp: the data stays as stale
     * as it was, the read that triggered this still withholds it, and the next
     * read tries again. There is no state in which a half-fetched catalogue
     * wears a fresh timestamp.
     */
    const good = countingAdapter({ listings: [listing('L1')] })
    setEtsyService(good.service as never)
    const ctx = ctxFor(SHOP_A)
    await refreshIfStale(ctx, 'LISTINGS')
    await ageSyncedAt(SHOP_A, 'LISTINGS', 7 * 3_600_000)
    const stampBefore = await readAggregateSyncedAt(SHOP_A, 'LISTINGS')

    const bad = countingAdapter({ failListingsWith: new Error('etsy fell over') })
    setEtsyService(bad.service as never)

    const outcome = await refreshIfStale(ctx, 'LISTINGS')
    expect(outcome.kind).toBe('FAILED')
    expect(await readAggregateSyncedAt(SHOP_A, 'LISTINGS')).toBe(stampBefore)
    expect((await shopDataSource(ctx, 'LISTINGS')).source.kind).toBe('STALE')

    // The one row from the successful sync is untouched — not replaced by none.
    expect(await countListingRows(SHOP_A)).toBe(1)
  })

  it('and the next read tries again, so a failure is not sticky', async () => {
    const bad = countingAdapter({ failListingsWith: new Error('etsy fell over') })
    setEtsyService(bad.service as never)
    const ctx = ctxFor(SHOP_A)
    expect((await refreshIfStale(ctx, 'LISTINGS')).kind).toBe('FAILED')

    const good = countingAdapter({ listings: [listing('L1')] })
    setEtsyService(good.service as never)
    expect((await refreshIfStale(ctx, 'LISTINGS')).kind).toBe('REFRESHED')
    expect((await shopDataSource(ctx, 'LISTINGS')).source.kind).toBe('SYNCED')
  })

  it('reports a rate limit as a rate limit, because the remedy is only to wait', async () => {
    /*
     * The one failure whose answer is "wait" rather than "do something", and
     * the one the rate-limit arithmetic predicts: if sellers start seeing it,
     * the app key's daily budget has run out, not their connection.
     */
    const limited = countingAdapter({
      failListingsWith: new EtsyHttpError({ status: 429, method: 'GET', path: '/listings' }),
    })
    setEtsyService(limited.service as never)

    const outcome = await refreshIfStale(ctxFor(SHOP_A), 'LISTINGS')
    expect(outcome.kind).toBe('FAILED')
    if (outcome.kind !== 'FAILED') throw new Error('unreachable')
    expect(outcome.reason).toBe('RATE_LIMITED')
  })

  it('and a revoked connection is reported as a connection problem, not a server one', async () => {
    const revoked = countingAdapter({
      failListingsWith: new EtsyHttpError({ status: 401, method: 'GET', path: '/listings' }),
    })
    setEtsyService(revoked.service as never)

    const outcome = await refreshIfStale(ctxFor(SHOP_A), 'LISTINGS')
    if (outcome.kind !== 'FAILED') throw new Error(`expected FAILED, got ${outcome.kind}`)
    expect(outcome.reason).toBe('NOT_CONNECTED')
  })

  it('and a server with no Etsy key is NOT reported as the seller\'s connection', async () => {
    /*
     * The failure every deployment has today, and the one it would be easiest
     * to word dishonestly. ETSY_NOT_CONFIGURED means the operator has not set
     * ETSY_API_KEY; telling the seller to "reconnect the shop from Settings"
     * sends them round a loop that cannot work and blames them for it.
     */
    const unconfigured = countingAdapter({
      failListingsWith: new AppError({
        kind: 'EXTERNAL_SERVICE',
        code: 'ETSY_NOT_CONFIGURED',
        message: 'Live Etsy access is not configured.',
        recovery: 'ETSY_API_KEY is not set on the server.',
      }),
    })
    setEtsyService(unconfigured.service as never)

    const outcome = await refreshIfStale(ctxFor(SHOP_A), 'LISTINGS')
    if (outcome.kind !== 'FAILED') throw new Error(`expected FAILED, got ${outcome.kind}`)
    expect(outcome.reason).toBe('NOT_CONFIGURED')
  })
})

describe('what a refresh must never do', () => {
  it('touches no adapter and writes no rows in demo mode', async () => {
    const { service, calls } = countingAdapter({ listings: [listing('L1')] })
    setEtsyService(service as never)
    process.env.ETSY_MODE = 'demo'

    const outcome = await refreshIfStale(ctxFor(SHOP_A), 'LISTINGS')
    expect(outcome.kind).toBe('SKIPPED')
    if (outcome.kind !== 'SKIPPED') throw new Error('unreachable')
    expect(outcome.reason).toBe('DEMO')
    expect(calls.getListings).toBe(0)
    expect(await readAggregateSyncedAt(SHOP_A, 'LISTINGS')).toBeNull()
  })

  it('refuses a read-only shop, so the demo catalogue cannot land in a seller table', async () => {
    /*
     * `ctx.readOnly` is `shops.is_demo`, true until a connection clears it. A
     * brand-new signup loading /profit gets SKIPPED rather than an
     * authorization error — and the hard gate inside runRefresh is still there
     * behind it, which tests/unit/public-demo.test.ts requires.
     */
    const { service, calls } = countingAdapter({ listings: [listing('L1')] })
    setEtsyService(service as never)

    const outcome = await refreshIfStale(ctxFor(SHOP_A, true), 'LISTINGS')
    expect(outcome.kind).toBe('SKIPPED')
    if (outcome.kind !== 'SKIPPED') throw new Error('unreachable')
    expect(outcome.reason).toBe('READ_ONLY')
    expect(calls.getListings).toBe(0)
  })

  it('refreshes one shop without reading or writing another', async () => {
    const { service } = countingAdapter({ listings: [listing('L1'), listing('L2')] })
    setEtsyService(service as never)

    await refreshIfStale(ctxFor(SHOP_A), 'LISTINGS')

    expect(await readAggregateSyncedAt(SHOP_A, 'LISTINGS')).not.toBeNull()
    expect(await readAggregateSyncedAt(SHOP_B, 'LISTINGS')).toBeNull()
    expect((await shopDataSource(ctxFor(SHOP_B), 'LISTINGS')).source.kind).toBe('NOT_SYNCED')

    expect(await countListingRows(SHOP_B)).toBe(0)
  })
})
