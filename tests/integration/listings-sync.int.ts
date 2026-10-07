import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'

import { syncShopListings } from '@/domain/sync/listings'
import { getListingsView } from '@/domain/listings/service'
import { readListings, countListings, writeSyncedListings } from '@/lib/repositories/listings'
import { shopDataSource, shopHeader } from '@/domain/sync/source'
import { getEtsyService, setEtsyService } from '@/lib/etsy'
import { getDb, schema } from '@/lib/db'
import type { EtsyListing } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'

/**
 * The listings seam: adapter -> sync -> table -> screen.
 *
 *     DATABASE_URL=postgres://... npm run test:integration
 *
 * ── WHAT IS BEING TESTED IS THE SEAM, NOT THE SQL ────────────────────────
 *
 * This is the first of five aggregates to read from our own tables, so the
 * claims that matter are the ones the other four will inherit:
 *
 *   the sync fills the table from WHATEVER adapter the selector gives it
 *   running it twice leaves the same rows
 *   a listing Etsy no longer has is dated, not deleted and not shown
 *   the repository cannot be asked for another shop's rows
 *   a shop with no synced rows says "not synced", never "no listings"
 *   demo mode reads NO database rows at all — asserted, not assumed
 *
 * The last one is the one that could only be waved at. It is asserted by
 * replacing the repository's database with a spy and requiring zero calls,
 * which is the only form of "never reads the table" that cannot be satisfied
 * by a test that simply did not look.
 */

const SHOP_A = 'sync-test-shop-a'
const SHOP_B = 'sync-test-shop-b'
const USER_A = 'sync-test-user-a'
const USER_B = 'sync-test-user-b'
const OURS = [SHOP_A, SHOP_B]

const ENV = { ...process.env }

const ctxFor = (shopId: string): ShopContext => ({
  shopId,
  actorId: USER_A,
  // false, because a demo shop is refused by assertCanWrite() — which is the
  // sync's gate and is asserted in its own test below.
  readOnly: false,
})

function listing(id: string, overrides: Partial<EtsyListing> = {}): EtsyListing {
  return {
    etsyListingId: id,
    title: `Listing ${id}`,
    description: 'A description',
    tags: ['handmade', 'gift'],
    price: 24.5,
    quantity: 7,
    state: 'ACTIVE',
    section: 'Prints',
    sku: `SKU-${id}`,
    attributes: { colour: 'blue' },
    requiredAttributes: ['colour'],
    photoCount: 5,
    renewsAt: '2026-12-01T00:00:00.000Z',
    lastChangedAt: '2026-10-01T00:00:00.000Z',
    hasVariations: false,
    variationSummary: null,
    ...overrides,
  }
}

/** An adapter that returns exactly what a test hands it, with real paging. */
function fakeAdapter(listings: EtsyListing[]) {
  const calls: { limit?: number; offset?: number }[] = []
  const service = {
    canWrite: false as const,
    mode: 'mock' as const,
    async getListings(_shopId: string, opts: { limit?: number; offset?: number } = {}) {
      calls.push(opts)
      const offset = opts.offset ?? 0
      const limit = opts.limit ?? 50
      return { listings: listings.slice(offset, offset + limit), total: listings.length }
    },
  }
  return { service, calls }
}

async function clean() {
  const db = getDb()
  await db.delete(schema.listings).where(inArray(schema.listings.shopId, OURS))
  /*
   * sync_state, or `delete from shops` fails the foreign key.
   *
   * Added when the listings sync started writing a per-aggregate sync row:
   * the orders slice needed one timestamp per aggregate, and this teardown
   * did not know about the new table. The whole suite went red in `clean()`,
   * which is the right failure — a suite that leaves its fixtures half
   * deleted poisons every file that runs after it.
   */
  await db.delete(schema.syncState).where(inArray(schema.syncState.shopId, OURS))
  await db.delete(schema.memberships).where(inArray(schema.memberships.shopId, OURS))
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
      { id: USER_A, email: 'a@sync.test', name: 'A' },
      { id: USER_B, email: 'b@sync.test', name: 'B' },
    ])
  await getDb()
    .insert(schema.shops)
    .values([
      { id: SHOP_A, ownerId: USER_A, name: 'A Shop', currency: 'GBP', isDemo: false, connectionStatus: 'CONNECTED' },
      { id: SHOP_B, ownerId: USER_B, name: 'B Shop', currency: 'USD', isDemo: false, connectionStatus: 'CONNECTED' },
    ])
})

afterEach(() => {
  setEtsyService(null)
  /*
   * RESTORED, OR A SPY OUTLIVES THE TEST THAT INSTALLED IT.
   *
   * Two tests here replace `getDb` with a spy to assert demo mode makes zero
   * database calls. Without this line the spy stays attached, and the next
   * beforeEach — which inserts the fixtures, through getDb — records its calls
   * on it. Measured: the later test read three calls it never made and failed
   * with the product behaving correctly. The suite got away with it only while
   * the spying test happened to run last, which is not a property a suite
   * should depend on.
   */
  vi.restoreAllMocks()
})

describe('the sync fills the table from whatever adapter the selector gives it', () => {
  it('writes a row per listing the adapter returned', async () => {
    const { service } = fakeAdapter([listing('101'), listing('102'), listing('103')])
    setEtsyService(service as never)

    const result = await syncShopListings(ctxFor(SHOP_A))

    expect(result.upserted).toBe(3)
    expect(result.reportedTotal).toBe(3)
    // THE ROW COUNT MATCHES WHAT THE ADAPTER RETURNED, asked of the database
    // rather than of the return value.
    expect(await countListings(SHOP_A)).toBe(3)
  })

  it('names no adapter — the real MockEtsyService fills it just as well', async () => {
    /*
     * The property this whole slice exists to prove: the sync is written
     * against EtsyService, so the mock fills it today and Etsy fills it the
     * day a key arrives, with no change to domain/sync/listings.ts.
     *
     * ETSY_MODE is unset here so the selector hands over the real
     * MockEtsyService — the same object demo mode uses — and its demo shop id
     * is used because the mock's assertDemoShop() guard is about the MODE, not
     * the id. The shop row is renamed to match so the foreign key holds.
     */
    delete process.env.ETSY_MODE
    setEtsyService(null)
    const mock = getEtsyService()
    expect(mock.mode).toBe('mock')

    const { listings: fromAdapter, total } = await mock.getListings(SHOP_A, { limit: 500 })
    expect(total, 'the demo catalogue is empty; this test would prove nothing').toBeGreaterThan(0)

    const result = await syncShopListings(ctxFor(SHOP_A))
    expect(result.upserted).toBe(fromAdapter.length)
    expect(await countListings(SHOP_A)).toBe(total)
  })

  it('pages, rather than assuming one call is the whole catalogue', async () => {
    // 250 listings at a page size of 100 is three calls, the last one short.
    const many = Array.from({ length: 250 }, (_, i) => listing(`p${i}`))
    const { service, calls } = fakeAdapter(many)
    setEtsyService(service as never)

    await syncShopListings(ctxFor(SHOP_A))

    expect(calls.map((c) => c.offset)).toEqual([0, 100, 200])
    expect(await countListings(SHOP_A)).toBe(250)
  })

  it('writes shops.last_synced_at, which nothing has ever written', async () => {
    /*
     * The column has existed since migration 0000 and was never written, which
     * is why components/layout/shop-context.tsx could only ever say
     * "Static data · no sync". This is the write that makes the other branch of
     * that string reachable.
     */
    const [before] = await getDb()
      .select({ at: schema.shops.lastSyncedAt })
      .from(schema.shops)
      .where(eq(schema.shops.id, SHOP_A))
    expect(before?.at).toBeNull()

    const { service } = fakeAdapter([listing('101')])
    setEtsyService(service as never)
    const result = await syncShopListings(ctxFor(SHOP_A))

    const [after] = await getDb()
      .select({ at: schema.shops.lastSyncedAt })
      .from(schema.shops)
      .where(eq(schema.shops.id, SHOP_A))
    expect(after?.at).toBeInstanceOf(Date)
    expect(after?.at?.toISOString()).toBe(result.syncedAt)
  })

  it('refuses a demo shop, so the demo catalogue never lands in a seller table', async () => {
    /*
     * assertCanWrite() is the gate, and ctx.readOnly is shops.is_demo. If the
     * mock's catalogue were ever written into these tables it would survive a
     * switch to live mode and be served as that seller's own figures — the
     * same hazard the last task found from the other end.
     */
    const { service } = fakeAdapter([listing('101')])
    setEtsyService(service as never)

    await expect(syncShopListings({ ...ctxFor(SHOP_A), readOnly: true })).rejects.toThrow()
    expect(await countListings(SHOP_A)).toBe(0)
  })
})

describe('running the sync twice', () => {
  it('leaves the same rows, not double', async () => {
    const payload = [listing('101'), listing('102')]
    const { service } = fakeAdapter(payload)
    setEtsyService(service as never)

    await syncShopListings(ctxFor(SHOP_A))
    const firstIds = (
      await getDb()
        .select({ id: schema.listings.id })
        .from(schema.listings)
        .where(eq(schema.listings.shopId, SHOP_A))
    ).map((r) => r.id)

    await syncShopListings(ctxFor(SHOP_A))

    expect(await countListings(SHOP_A)).toBe(2)
    const secondIds = (
      await getDb()
        .select({ id: schema.listings.id })
        .from(schema.listings)
        .where(eq(schema.listings.shopId, SHOP_A))
    ).map((r) => r.id)
    /*
     * The SAME ids, not merely the same count. Eight tables carry a foreign
     * key to listings.id — cost_rules, order_items, events among them — so a
     * sync that re-minted ids would orphan every one of them while looking
     * perfectly idempotent on a count.
     */
    expect(secondIds.sort()).toEqual(firstIds.sort())
  })

  it('updates a changed listing rather than adding a second one', async () => {
    setEtsyService(fakeAdapter([listing('101', { title: 'Before', price: 10 })]).service as never)
    await syncShopListings(ctxFor(SHOP_A))

    setEtsyService(fakeAdapter([listing('101', { title: 'After', price: 99.99 })]).service as never)
    await syncShopListings(ctxFor(SHOP_A))

    const rows = await readListings(SHOP_A)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('After')
    expect(rows[0]?.price).toBe(99.99)
  })
})

describe('a listing removed upstream', () => {
  it('is dated rather than deleted, because eight foreign keys point at it', async () => {
    setEtsyService(fakeAdapter([listing('101'), listing('102')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))

    setEtsyService(fakeAdapter([listing('101')]).service as never)
    const result = await syncShopListings(ctxFor(SHOP_A))

    expect(result.removed).toBe(1)

    // The ROW survives...
    const all = await getDb()
      .select({ etsyListingId: schema.listings.etsyListingId, removedAt: schema.listings.removedAt })
      .from(schema.listings)
      .where(eq(schema.listings.shopId, SHOP_A))
    expect(all).toHaveLength(2)
    expect(all.find((r) => r.etsyListingId === '102')?.removedAt).toBeInstanceOf(Date)

    // ...and the seller does not see it.
    const visible = await readListings(SHOP_A)
    expect(visible.map((l) => l.etsyListingId)).toEqual(['101'])
    expect(await countListings(SHOP_A)).toBe(1)
  })

  it('keeps the date it first went missing, rather than re-stamping it', async () => {
    /*
     * "When did my listing vanish" is the question this column answers, and an
     * answer that moves forward on every sync answers it wrongly — it would
     * always say "just now".
     */
    setEtsyService(fakeAdapter([listing('101'), listing('102')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))
    setEtsyService(fakeAdapter([listing('101')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))

    const first = await getDb()
      .select({ removedAt: schema.listings.removedAt })
      .from(schema.listings)
      .where(and(eq(schema.listings.shopId, SHOP_A), eq(schema.listings.etsyListingId, '102')))
    const firstAt = first[0]?.removedAt

    await new Promise((resolve) => setTimeout(resolve, 10))
    const again = await syncShopListings(ctxFor(SHOP_A))
    expect(again.removed, 'a listing already gone was dated a second time').toBe(0)

    const second = await getDb()
      .select({ removedAt: schema.listings.removedAt })
      .from(schema.listings)
      .where(and(eq(schema.listings.shopId, SHOP_A), eq(schema.listings.etsyListingId, '102')))
    expect(second[0]?.removedAt?.toISOString()).toBe(firstAt?.toISOString())
  })

  it('comes back when Etsy has it again', async () => {
    setEtsyService(fakeAdapter([listing('101'), listing('102')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))
    setEtsyService(fakeAdapter([listing('101')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))
    expect(await countListings(SHOP_A)).toBe(1)

    setEtsyService(fakeAdapter([listing('101'), listing('102')]).service as never)
    const result = await syncShopListings(ctxFor(SHOP_A))

    expect(result.restored).toBe(1)
    expect(await countListings(SHOP_A)).toBe(2)
    const rows = await getDb()
      .select({ removedAt: schema.listings.removedAt })
      .from(schema.listings)
      .where(and(eq(schema.listings.shopId, SHOP_A), isNotNull(schema.listings.removedAt)))
    expect(rows).toHaveLength(0)
  })

  it('dates every listing when a sync returns an empty catalogue', async () => {
    // The edge the `seen.length > 0` branch exists for: an empty payload must
    // still mean "Etsy has none of these", not "change nothing".
    setEtsyService(fakeAdapter([listing('101'), listing('102')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))

    setEtsyService(fakeAdapter([]).service as never)
    const result = await syncShopListings(ctxFor(SHOP_A))

    expect(result.removed).toBe(2)
    expect(await countListings(SHOP_A)).toBe(0)
  })
})

describe('the repository cannot be asked for another shop', () => {
  it('returns nothing for a shop id it does not own', async () => {
    setEtsyService(fakeAdapter([listing('101'), listing('102')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))

    expect(await readListings(SHOP_B)).toEqual([])
    expect(await countListings(SHOP_B)).toBe(0)
  })

  it('keeps two shops’ catalogues apart', async () => {
    setEtsyService(fakeAdapter([listing('a1'), listing('a2')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))
    setEtsyService(fakeAdapter([listing('b1')]).service as never)
    await syncShopListings(ctxFor(SHOP_B))

    expect((await readListings(SHOP_A)).map((l) => l.etsyListingId)).toEqual(['a1', 'a2'])
    expect((await readListings(SHOP_B)).map((l) => l.etsyListingId)).toEqual(['b1'])
  })

  it('does not let one shop’s sync remove another shop’s listings', async () => {
    /*
     * The failure a missing shopId in the removal predicate would produce, and
     * it would be invisible to every single-shop test: syncing shop A would
     * date every listing shop B has.
     */
    setEtsyService(fakeAdapter([listing('b1')]).service as never)
    await syncShopListings(ctxFor(SHOP_B))

    setEtsyService(fakeAdapter([listing('a1')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))

    expect(await countListings(SHOP_B)).toBe(1)
  })
})

describe('what a seller sees before their first sync', () => {
  it('says NOT SYNCED, not "no listings"', async () => {
    const { source } = await shopDataSource(ctxFor(SHOP_A), 'LISTINGS')
    expect(source.kind).toBe('NOT_SYNCED')

    const view = await getListingsView(ctxFor(SHOP_A))
    expect(view.total).toBe(0)
    /*
     * The discriminator the screen renders from. "No listings yet" is a claim,
     * and it is false for a shop nobody has read — the same line the operator
     * account page holds with "No usage records. That means nothing has been
     * metered for this account — not that every meter reads zero."
     */
    expect(view.source.kind).toBe('NOT_SYNCED')
  })

  it('says SYNCED once a sync has run, even if it found nothing', async () => {
    setEtsyService(fakeAdapter([]).service as never)
    await syncShopListings(ctxFor(SHOP_A))

    const view = await getListingsView(ctxFor(SHOP_A))
    expect(view.total).toBe(0)
    // Zero listings, and now it IS a claim we can make.
    expect(view.source.kind).toBe('SYNCED')
  })

  it('reports a shop that is gone as its own thing', async () => {
    const { source } = await shopDataSource(ctxFor('shop-that-does-not-exist'), 'LISTINGS')
    expect(source.kind).toBe('NO_SHOP')
  })

  it('reads the synced rows once a sync has run', async () => {
    setEtsyService(fakeAdapter([listing('101'), listing('102')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))

    const view = await getListingsView(ctxFor(SHOP_A))
    expect(view.source.kind).toBe('SYNCED')
    expect(view.total).toBe(2)
    expect(view.currency).toBe('GBP') // from shops.currency, not the adapter
    /*
     * And the rows went through the domain's own shaping untouched — the
     * status derivation, the audit rules and the margin rule all ran on what
     * the repository returned, because it returns the adapter's own type.
     */
    expect(view.rows[0]?.status).toBe('ACTIVE')
    expect(view.rows[0]?.margin, 'a synced shop has no confirmed costs yet (D65)').toBeNull()
  })
})

describe('the shell above every seller screen', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════
   *   THE SHELL ASKED THE ADAPTER FOR THE SHOP, AND THAT RETURNED 500 ON
   *   EVERY SELLER SCREEN IN A LIVE DEPLOYMENT.
   * ══════════════════════════════════════════════════════════════════════
   *
   * Found in a browser, not reasoned about: against a live-mode server with
   * no ETSY_API_KEY, /listings rendered "Something went wrong on our side"
   * and the never-synced empty state above was unreachable. The cause was
   * app/(dashboard)/layout.tsx calling getEtsyService().getShop() for a name
   * and a sync time that are both columns on `shops`.
   */
  it('reads the shop name and sync time from our own row', async () => {
    const before = await shopHeader(ctxFor(SHOP_A))
    expect(before?.name, 'the name on the row, not from any adapter').toBe('A Shop')
    expect(before?.lastSyncedAt, 'nothing has synced').toBeNull()
    /*
     * NULL, NOT ZERO, and this is the whole point of the field. The sidebar
     * prints "— / 2,000 listings" for a shop nobody has read; "0 / 2,000"
     * would be the same false claim the listings table refuses to make.
     */
    expect(before?.activeListingCount).toBeNull()

    setEtsyService(fakeAdapter([listing('101'), listing('102')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))

    const after = await shopHeader(ctxFor(SHOP_A))
    expect(after?.lastSyncedAt, 'a sync has now run').not.toBeNull()
    expect(after?.activeListingCount).toBe(2)
  })

  it('does not count a listing Etsy no longer has', async () => {
    setEtsyService(fakeAdapter([listing('101'), listing('102')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))
    setEtsyService(fakeAdapter([listing('101')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))

    // The removed row is still in the table, dated. The chip must not count it.
    expect(await countListings(SHOP_A)).toBe(1)
    expect((await shopHeader(ctxFor(SHOP_A)))?.activeListingCount).toBe(1)
  })

  it('says a shop that is gone is gone, rather than a shop with no name', async () => {
    expect(await shopHeader(ctxFor('shop-that-does-not-exist'))).toBeNull()
  })

  it('asks the adapter in demo mode and reads no row', async () => {
    delete process.env.ETSY_MODE
    setEtsyService(null)

    const db = await import('@/lib/db')
    const getDb = vi.spyOn(db, 'getDb')

    const { MockEtsyService } = await import('@/lib/etsy/mock')
    setEtsyService(new MockEtsyService() as never)
    const header = await shopHeader({ shopId: 'demo-shop', actorId: USER_A, readOnly: true })

    expect(header?.name, 'the demo catalogue still names the demo shop').toBeTruthy()
    expect(getDb, 'the demo shell touched the database').not.toHaveBeenCalled()
  })
})

describe('demo mode reads no database rows at all', () => {
  it('asks the adapter and never the table', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   ASSERTED, NOT ASSUMED — which is what the brief asked for, and the
     *   only form of it that cannot be satisfied by a test that did not look.
     * ══════════════════════════════════════════════════════════════════════
     *
     * getDb() is spied on for the length of this test. Demo mode must produce
     * ZERO calls: not zero rows, zero queries. A read that returned nothing
     * would pass a row-count assertion while still having gone to the
     * database, which is the thing being ruled out.
     */
    delete process.env.ETSY_MODE
    setEtsyService(null)

    const db = await import('@/lib/db')
    const spy = vi.spyOn(db, 'getDb')

    const view = await getListingsView(ctxFor(SHOP_A))

    expect(spy, 'demo mode touched the database').not.toHaveBeenCalled()
    expect(view.source.kind).toBe('DEMO')
    expect(view.total, 'the demo catalogue did not load').toBeGreaterThan(0)
    spy.mockRestore()
  })

  it('and the mock refuses to serve at all in live mode, as the backstop', async () => {
    /*
     * The guard that makes the branch safe rather than merely correct. If a
     * future edit sent a live deployment down the DEMO path, the mock throws
     * instead of serving invented listings as a seller's own — which is the
     * failure it says it exists to prevent.
     */
    process.env.ETSY_MODE = 'live'
    setEtsyService(null)
    const { MockEtsyService } = await import('@/lib/etsy/mock')
    await expect(new MockEtsyService().getListings(SHOP_A)).rejects.toThrow(/demo catalogue/i)
  })
})

describe('the write is one transaction', () => {
  it('leaves no rows and no timestamp when the write fails part way', async () => {
    /*
     * The timestamp is the dangerous half: `last_synced_at` is what the UI
     * uses to tell "never synced" from "synced and empty", so a timestamp
     * written beside an incomplete catalogue is the one value that must not be
     * optimistic.
     *
     * Forced by a price Postgres itself refuses: numeric(12,2) overflows above
     * 10^10, so this fails INSIDE the loop, after '101' has already been
     * inserted. That ordering is the point — a poison rejected before the
     * first write would leave an empty table either way and prove nothing
     * about rollback. Measured directly: `insert into q values ('1e15')` on a
     * numeric(12,2) column gives "numeric field overflow".
     */
    const poison = listing('bad', { price: 1e15 })
    await expect(writeSyncedListings(SHOP_A, [listing('101'), poison])).rejects.toThrow()

    expect(await countListings(SHOP_A)).toBe(0)
    const [row] = await getDb()
      .select({ at: schema.shops.lastSyncedAt })
      .from(schema.shops)
      .where(eq(schema.shops.id, SHOP_A))
    expect(row?.at, 'a partial catalogue was stamped as synced').toBeNull()
  })

  it('refuses a price that is not a number rather than storing NaN', async () => {
    /*
     * This case was found by the test above failing: NaN was the original
     * poison, and it did not poison anything. Postgres numeric ACCEPTS 'NaN',
     * so the row went in and `Number(row.price)` read it back as NaN — a
     * non-figure that renders as a figure. Now refused in the repository,
     * before the transaction opens, so there is nothing to roll back.
     */
    await expect(writeSyncedListings(SHOP_A, [listing('101', { price: Number.NaN })])).rejects.toThrow(
      /cannot be stored/i,
    )
    await expect(
      writeSyncedListings(SHOP_A, [listing('102', { price: Number.POSITIVE_INFINITY })]),
    ).rejects.toThrow(/cannot be stored/i)

    expect(await countListings(SHOP_A)).toBe(0)

    /*
     * The converse: a price Postgres CAN hold is stored and read back as
     * itself. Without this, a guard that rejected every price would pass the
     * two assertions above.
     */
    await writeSyncedListings(SHOP_A, [listing('103', { price: 12.34 })])
    const [stored] = await readListings(SHOP_A)
    expect(stored?.price).toBe(12.34)
  })
})
