import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { acceptTermsFor } from '../support/legal'

import { syncShopOrders } from '@/domain/sync/orders'
import { syncShopListings } from '@/domain/sync/listings'
import { getActions } from '@/domain/action-center/service'
import { getProfitView } from '@/domain/profit/service'
import { countOrders, readOrders, writeSyncedOrders } from '@/lib/repositories/orders'
import { readAggregateSyncedAt } from '@/lib/repositories/sync-state'
import { writeCostRules } from '@/lib/repositories/costs'
import { shopDataSource } from '@/domain/sync/source'
import { loadOrders } from '@/domain/orders/load'
import { setEtsyService } from '@/lib/etsy'
import { getDb, schema } from '@/lib/db'
import type { EtsyListing, EtsyOrder } from '@/lib/etsy/interface'
import type { StoredOrder } from '@/domain/orders/types'
import type { ShopContext } from '@/lib/permissions'

/**
 * The orders seam: adapter -> sync -> table -> screen.
 *
 *     DATABASE_URL=postgres://... npm run test:integration
 *
 * ── THE CLAIMS THAT MATTER, AND WHY THEY ARE THESE ───────────────────────
 *
 *   a fee of 0 and a fee nobody read are different values, end to end
 *   a re-sync can only ever LEARN a fee, never forget one
 *   a shop with unknown fees gets no net profit, anywhere it is rendered
 *   NO BUYER IDENTITY reaches the database — asserted over the row, not
 *     inferred from the fact that the code does not look like it would
 *   NOT_SYNCED survives a LISTINGS sync, which is the bug one shared
 *     timestamp would have caused
 *   the Action Center says nothing rather than "nothing needs your attention"
 *   demo mode reads NO database rows at all
 */

const SHOP_A = 'orders-test-shop-a'
const SHOP_B = 'orders-test-shop-b'
const USER_A = 'orders-test-user-a'
const USER_B = 'orders-test-user-b'
const OURS = [SHOP_A, SHOP_B]

const WINDOW = { since: '2026-01-01T00:00:00.000Z', until: '2026-12-31T00:00:00.000Z' }
/*
 * Inside the demo dataset's own reporting period, so an order written here is
 * one the profit screen and the Action Center actually read.
 *
 * Found by three tests failing with `verified.etsyFees` reading 0 rather than
 * null: the screens read PERIOD_START..PERIOD_END and my orders were placed
 * outside it, so they were looking at an EMPTY set — for which fees ARE known
 * (there are none) and a net profit IS computable. The assertion was right and
 * the fixture was in the wrong month.
 */
const IN_PERIOD = '2026-07-20T10:00:00.000Z'
const ENV = { ...process.env }

const ctxFor = (shopId: string): ShopContext => ({ shopId, actorId: USER_A, readOnly: false })

function order(id: string, overrides: Partial<EtsyOrder> = {}): EtsyOrder {
  return {
    etsyReceiptId: id,
    placedAt: IN_PERIOD,
    gross: 48,
    discounts: 2,
    refunds: 0,
    /*
     * What the LIVE adapter produces: toOrder() returns all three as NULL and
     * says it has not read Etsy's payment-account ledger.
     *
     * This fixture used to return 0, mirroring the adapter at the time, and
     * the repository wrote NULL regardless — because `EtsyOrder.etsyFees` was
     * `number` and a 0 from that adapter provably meant "not loaded". The type
     * can say it now, so the adapter does, and the repository believes
     * whatever it is told. The tests that encoded the old contract are the
     * ones directly below.
     */
    etsyFees: null,
    paymentProcessing: null,
    offsiteAds: null,
    countryCode: 'GB',
    items: [{ etsyListingId: '9001', quantity: 2, unitPrice: 24 }],
    ...overrides,
  }
}

function listing(id: string, overrides: Partial<EtsyListing> = {}): EtsyListing {
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
    ...overrides,
  }
}

/** An adapter returning exactly what a test hands it. */
function fakeAdapter(orders: EtsyOrder[], listings: EtsyListing[] = []) {
  const windows: { since: string; until: string }[] = []
  const service = {
    canWrite: false as const,
    mode: 'mock' as const,
    async getOrders(_shopId: string, w: { since: string; until: string }) {
      windows.push(w)
      return orders
    },
    async getListings(_shopId: string, opts: { limit?: number; offset?: number } = {}) {
      const offset = opts.offset ?? 0
      const limit = opts.limit ?? 50
      return { listings: listings.slice(offset, offset + limit), total: listings.length }
    },
  }
  return { service, windows }
}

async function clean() {
  const db = getDb()
  /*
   * cost_rules FIRST, and this is the second time this exact bug has been
   * written here.
   *
   * `sync_state` was the first: it was missing from this list, so `delete from
   * shops` hit a foreign key and took the whole FILE red — 26 tests skipped
   * for one unrelated omission. Two tests now write cost rules, and the same
   * constraint fired again (30 failed). Anything that references `shops` has to
   * be deleted before it.
   */
  await db.delete(schema.costRules).where(inArray(schema.costRules.shopId, OURS))
  await db.delete(schema.orderItems).where(inArray(schema.orderItems.shopId, OURS))
  await db.delete(schema.orders).where(inArray(schema.orders.shopId, OURS))
  await db.delete(schema.listings).where(inArray(schema.listings.shopId, OURS))
  await db.delete(schema.syncState).where(inArray(schema.syncState.shopId, OURS))
  await db.delete(schema.memberships).where(inArray(schema.memberships.shopId, OURS))
  // Before the shops: an acceptance row references the shop it covers.
  await db
    .delete(schema.termsAcceptances)
    .where(inArray(schema.termsAcceptances.shopId, OURS))
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
      { id: USER_A, email: 'a@orders.test', name: 'A' },
      { id: USER_B, email: 'b@orders.test', name: 'B' },
    ])
  await getDb()
    .insert(schema.shops)
    .values([
      { id: SHOP_A, ownerId: USER_A, name: 'A Shop', currency: 'GBP', isDemo: false, connectionStatus: 'CONNECTED' },
      { id: SHOP_B, ownerId: USER_B, name: 'B Shop', currency: 'USD', isDemo: false, connectionStatus: 'CONNECTED' },
    ])
  /*
   * An executed agreement for both shops. Etsy's API Terms §4 makes this a
   * precondition of reading any Etsy data, so a sync refuses without it —
   * see tests/support/legal.ts for why the gate is not softened instead.
   */
  await acceptTermsFor([SHOP_A, SHOP_B], USER_A)

})

afterEach(() => {
  setEtsyService(null)
  vi.restoreAllMocks()
})

describe('the sync fills the tables from whatever adapter the selector gives it', () => {
  it('writes a row per receipt and a row per line', async () => {
    const { service } = fakeAdapter([order('R1'), order('R2'), order('R3')])
    setEtsyService(service as never)

    const result = await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    expect(result.received).toBe(3)
    expect(result.upserted).toBe(3)
    expect(result.lines).toBe(3)
    expect(await countOrders(SHOP_A, WINDOW)).toBe(3)
  })

  it('names no adapter — the real MockEtsyService fills it just as well', async () => {
    /*
     * The portability claim. The sync asks lib/etsy/index.ts for an adapter
     * and never names one, so the same function that fills this table from the
     * mock fills it from Etsy with one env var different.
     */
    process.env.ETSY_MODE = 'demo'
    setEtsyService(null)
    const { MockEtsyService } = await import('@/lib/etsy/mock')
    setEtsyService(new MockEtsyService() as never)

    const result = await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    expect(result.upserted).toBeGreaterThan(0)
    expect(await countOrders(SHOP_A, WINDOW)).toBe(result.upserted)
  })

  it('passes the window through to the adapter rather than inventing one', async () => {
    const { service, windows } = fakeAdapter([order('R1')])
    setEtsyService(service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    expect(windows).toEqual([WINDOW])
  })

  it('records the sync against ORDERS, not just against the shop', async () => {
    setEtsyService(fakeAdapter([order('R1')]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    expect(await readAggregateSyncedAt(SHOP_A, 'ORDERS')).not.toBeNull()
    expect(await readAggregateSyncedAt(SHOP_A, 'LISTINGS')).toBeNull()

    // And the shell's own timestamp, which is "the most recent sync of anything".
    const [row] = await getDb()
      .select({ at: schema.shops.lastSyncedAt })
      .from(schema.shops)
      .where(eq(schema.shops.id, SHOP_A))
    expect(row?.at).not.toBeNull()
  })

  it('refuses a demo shop, so invented receipts never land in a seller table', async () => {
    setEtsyService(fakeAdapter([order('R1')]).service as never)
    await expect(
      syncShopOrders({ shopId: SHOP_A, actorId: USER_A, readOnly: true }, WINDOW),
    ).rejects.toThrow()
    expect(await countOrders(SHOP_A, WINDOW)).toBe(0)
  })

  it('writes an empty window as knowledge, not as nothing', async () => {
    setEtsyService(fakeAdapter([]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    // No rows, but the shop HAS been read — which is the distinction the
    // Action Center turns on.
    expect(await countOrders(SHOP_A, WINDOW)).toBe(0)
    expect(await readAggregateSyncedAt(SHOP_A, 'ORDERS')).not.toBeNull()
  })
})

describe('a provider that repeats itself', () => {
  it('collapses duplicate receipts instead of failing on the unique index', async () => {
    /*
     * Found by measurement, not anticipated: MockEtsyService returns 1,968
     * orders over a wide window with only 1,530 distinct receipt ids.
     *
     * Row by row that was merely wasteful. In the multi-row upsert the
     * repository now uses it is a correctness problem — duplicates in one
     * batch make Postgres raise "cannot affect row a second time", and
     * duplicates ACROSS batches quietly return fewer rows than were sent,
     * leaving the receipt-to-id map short and the lines written against the
     * wrong order. De-duplication happens in the repository for that reason.
     */
    setEtsyService(
      fakeAdapter([
        order('R1', { gross: 10 }),
        order('R2'),
        // The same receipt again, with a refund that arrived in between.
        order('R1', { gross: 10, refunds: 10 }),
      ]).service as never,
    )

    const result = await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    expect(result.received, 'the raw count the provider sent').toBe(3)
    expect(result.upserted, 'the de-duplicated count actually written').toBe(2)

    const stored = await readOrders(SHOP_A, WINDOW)
    expect(stored).toHaveLength(2)
    // LAST WINS: a later read is the more recent view of the same receipt.
    expect(stored.find((o) => o.etsyReceiptId === 'R1')?.refunds).toBe(10)
  })

  it('still writes every line of the receipt it kept', async () => {
    // The guard that found the bug: a short receipt-to-id map must not be
    // used to write lines. Proven by the lines all being there.
    setEtsyService(
      fakeAdapter([
        order('R1', { items: [{ etsyListingId: '9001', quantity: 1, unitPrice: 5 }] }),
        order('R1', {
          items: [
            { etsyListingId: '9001', quantity: 1, unitPrice: 5 },
            { etsyListingId: '9002', quantity: 2, unitPrice: 7 },
          ],
        }),
      ]).service as never,
    )
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const [stored] = await readOrders(SHOP_A, WINDOW)
    expect(stored?.items.map((i) => i.etsyListingId).sort()).toEqual(['9001', '9002'])
  })
})

describe('fees', () => {
  it('are written exactly as the adapter reported them', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE SYNC BELIEVES THE ADAPTER. IT USED TO OVERRULE IT.
     * ══════════════════════════════════════════════════════════════════════
     *
     * This test read "are written NULL, never the adapter's zero", because
     * the repository wrote NULL for every sync whatever it was handed. That
     * was right while `EtsyOrder.etsyFees` was `number`: an adapter had no
     * way to distinguish a fee of zero from a fee it had not read, so a 0
     * could only mean the second.
     *
     * The type carries the difference now. `order()` reports null — which is
     * what live.ts produces — and the row holds null. The companion block
     * 'an adapter reporting 0 and an adapter reporting nothing' asserts the
     * other half, which the old contract made unobservable.
     */
    setEtsyService(fakeAdapter([order('R1')]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const [row] = await getDb()
      .select({
        etsyFees: schema.orders.etsyFees,
        paymentProcessing: schema.orders.paymentProcessing,
        offsiteAds: schema.orders.offsiteAds,
      })
      .from(schema.orders)
      .where(eq(schema.orders.shopId, SHOP_A))

    expect(row?.etsyFees, 'a zero fee was stored as a fact').toBeNull()
    expect(row?.paymentProcessing).toBeNull()
    expect(row?.offsiteAds).toBeNull()
  })

  it('come back from the repository as null when the adapter read none', async () => {
    setEtsyService(fakeAdapter([order('R1')]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const [stored] = await readOrders(SHOP_A, WINDOW)
    expect(stored?.etsyFees).toBeNull()
    expect(stored?.paymentProcessing).toBeNull()
    expect(stored?.offsiteAds).toBeNull()
    // The converse: the money that IS on the receipt survives the round trip.
    expect(stored?.gross).toBe(48)
    expect(stored?.discounts).toBe(2)
  })

  it('cannot be erased by a later sync whose adapter read none', async () => {
    /*
     * The COALESCE in the upsert. A ledger import, or an operator correction,
     * may put a real fee on a row. An adapter that has not read the ledger
     * reports null, so without the coalesce the next run would silently
     * revert the period to "fees unknown" — and the seller's net profit would
     * vanish again.
     *
     * `coalesce` skips null, NOT 0, which is why an adapter reporting a
     * genuine zero still overwrites. That direction is asserted in the
     * companion block above.
     */
    setEtsyService(fakeAdapter([order('R1')]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    await getDb()
      .update(schema.orders)
      .set({ etsyFees: '2.40', paymentProcessing: '1.39', offsiteAds: '0.48' })
      .where(eq(schema.orders.shopId, SHOP_A))

    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const [stored] = await readOrders(SHOP_A, WINDOW)
    expect(stored?.etsyFees, 'the re-sync erased a known fee').toBe(2.4)
    expect(stored?.paymentProcessing).toBe(1.39)
    expect(stored?.offsiteAds).toBe(0.48)
  })
})

describe('an adapter reporting 0 and an adapter reporting nothing', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════
   *   THE WHOLE POINT OF WIDENING EtsyOrder. THESE TWO WERE THE SAME VALUE.
   * ══════════════════════════════════════════════════════════════════════
   *
   * `EtsyOrder.etsyFees` was `number`, so an adapter had one way to say "I
   * have no fee for this order": return 0 — indistinguishable from a fully
   * absorbed fee, a free order, or a refunded line. The repository papered
   * over it by writing NULL for every sync, which was correct only because no
   * adapter could report a real fee at all, and which discarded one the day
   * any adapter could.
   *
   * Asserted now, while it is cheap: the two adapters below differ in exactly
   * one respect, and everything downstream must differ with them.
   */
  const ZERO_FEES = { etsyFees: 0, paymentProcessing: 0, offsiteAds: 0 }
  const NO_FEES = { etsyFees: null, paymentProcessing: null, offsiteAds: null }

  it('store different values', async () => {
    setEtsyService(fakeAdapter([order('R-ZERO', ZERO_FEES)]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    setEtsyService(fakeAdapter([order('R-NONE', NO_FEES)]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const rows = await getDb()
      .select({ receipt: schema.orders.etsyReceiptId, fees: schema.orders.etsyFees })
      .from(schema.orders)
      .where(eq(schema.orders.shopId, SHOP_A))
    const byReceipt = new Map(rows.map((row) => [row.receipt, row.fees]))

    expect(byReceipt.get('R-ZERO'), 'a fee the adapter READ as zero').toBe('0.00')
    expect(byReceipt.get('R-NONE'), 'a fee the adapter did not read').toBeNull()
  })

  it('read back as 0 and null, not both as one of them', async () => {
    setEtsyService(
      fakeAdapter([order('R-ZERO', ZERO_FEES), order('R-NONE', NO_FEES)]).service as never,
    )
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const stored = new Map((await readOrders(SHOP_A, WINDOW)).map((o) => [o.etsyReceiptId, o]))
    expect(stored.get('R-ZERO')?.etsyFees).toBe(0)
    expect(stored.get('R-NONE')?.etsyFees).toBeNull()
  })

  it('produce a net profit in one case and withhold it in the other', async () => {
    /*
     * The consequence, which is the reason the distinction matters at all. A
     * shop whose fees are genuinely zero has a knowable net profit; a shop
     * whose fees are unread does not.
     */
    setEtsyService(fakeAdapter([order('R1', ZERO_FEES)], [listing('9001')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    /*
     * The seller's own cost rules, written first.
     *
     * Added when the costs slice made net profit depend on costs as well as
     * fees: the four cost lines came from DEMO_COST_INPUTS when this was
     * written, so "fees known" was enough to produce a net profit. It is not
     * any more, and without these rules this test would assert the fee
     * distinction while measuring the cost one.
     */
    await writeCostRules(SHOP_A, USER_A, [
      { field: 'defaultRulePercent', value: 0.38 },
      { field: 'shippingPerOrder', value: 2.5 },
      { field: 'labourTotal', value: 100 },
      { field: 'otherCosts', value: 50 },
    ])

    const zeroFees = await getProfitView(ctxFor(SHOP_A))
    expect(zeroFees.verified.etsyFees, 'a read zero is a figure').toBe(0)
    expect(zeroFees.results.BASE.netProfit, 'zero fees are still known fees').not.toBeNull()
    expect(zeroFees.results.BASE.lines.find((l) => l.key === 'etsyFees')?.amount).toBe(0)
    expect(
      zeroFees.results.BASE.missingData.map((item) => item.code),
      'a shop with real zero fees has no fee gap',
    ).not.toContain('FEES_NOT_LOADED')

    // The same shop, the same orders, one adapter difference.
    setEtsyService(fakeAdapter([order('R1', NO_FEES)], [listing('9001')]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    /*
     * COALESCE preserves the zero this shop already had, which is correct —
     * the sync may learn a fee, never forget one — so the fee has to be
     * cleared to observe the unread case on the same row.
     */
    await getDb()
      .update(schema.orders)
      .set({ etsyFees: null, paymentProcessing: null, offsiteAds: null })
      .where(eq(schema.orders.shopId, SHOP_A))

    const noFees = await getProfitView(ctxFor(SHOP_A))
    expect(noFees.verified.etsyFees).toBeNull()
    expect(noFees.results.BASE.netProfit).toBeNull()
    expect(noFees.results.BASE.missingData.map((item) => item.code)).toContain('FEES_NOT_LOADED')
  })

  it('and a zero the adapter read overwrites a fee, while nothing defers to it', async () => {
    /*
     * The COALESCE, read in both directions. `coalesce` skips null, not 0 —
     * so an adapter reporting a genuine zero replaces a stored figure (an
     * order was refunded, its fee reversed), and an adapter reporting nothing
     * leaves it alone.
     */
    setEtsyService(fakeAdapter([order('R1', NO_FEES)]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    await getDb()
      .update(schema.orders)
      .set({ etsyFees: '2.40' })
      .where(eq(schema.orders.shopId, SHOP_A))

    // Nothing reported: the stored figure survives.
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    expect((await readOrders(SHOP_A, WINDOW))[0]?.etsyFees).toBe(2.4)

    // A read zero: it replaces it.
    setEtsyService(fakeAdapter([order('R1', ZERO_FEES)]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    expect((await readOrders(SHOP_A, WINDOW))[0]?.etsyFees).toBe(0)
  })

  it('treats a fee that is not a number as unknown rather than storing NaN', async () => {
    /*
     * Postgres numeric accepts the literal 'NaN'. The listings write path
     * refuses a non-finite price outright, but "unknown" is a legitimate
     * value for a fee, so failing the whole sync would be worse than
     * recording that we do not know it.
     */
    setEtsyService(
      fakeAdapter([order('R1', { etsyFees: Number.NaN, paymentProcessing: 1, offsiteAds: 2 })])
        .service as never,
    )
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const [stored] = await readOrders(SHOP_A, WINDOW)
    expect(stored?.etsyFees).toBeNull()
    // The two that WERE numbers are still stored, so this is not a blanket wipe.
    expect(stored?.paymentProcessing).toBe(1)
    expect(stored?.offsiteAds).toBe(2)
  })
})

describe('a seller never sees a net profit computed from fees nobody has', () => {
  it('withholds it on the profit screen, and says why', async () => {
    setEtsyService(fakeAdapter([order('R1'), order('R2')], [listing('9001')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const view = await getProfitView(ctxFor(SHOP_A))

    expect(view.verified.etsyFees, 'a fee total was invented').toBeNull()
    for (const kind of ['CONSERVATIVE', 'BASE', 'OPTIMISTIC'] as const) {
      const result = view.results[kind]
      expect(result.netProfit, `${kind} produced a net profit`).toBeNull()
      expect(result.totalCosts, `${kind} produced a cost total`).toBeNull()
      expect(result.marginPercent).toBeNull()

      const fees = result.lines.find((line) => line.key === 'etsyFees')
      expect(fees?.amount, `${kind} drew a fee amount`).toBeNull()
      expect(fees?.provenance.type).toBe('UNAVAILABLE')

      const net = result.lines.find((line) => line.key === 'net')
      expect(net?.amount).toBeNull()
      expect(net?.provenance.type).toBe('UNAVAILABLE')
    }

    const codes = view.results.BASE.missingData.map((item) => item.code)
    expect(codes, 'the screen does not say why').toContain('FEES_NOT_LOADED')
  })

  it('and the gap names the ledger rather than blaming the seller', async () => {
    setEtsyService(fakeAdapter([order('R1')], [listing('9001')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const view = await getProfitView(ctxFor(SHOP_A))
    const gap = view.results.BASE.missingData.find((item) => item.code === 'FEES_NOT_LOADED')
    expect(gap?.detail).toMatch(/payment-account ledger/)
    // Nothing the seller can do, so no button that cannot help.
    expect(gap?.resolutions).toEqual([])
  })

  it('and the per-order ledger withholds the row profit too', async () => {
    setEtsyService(fakeAdapter([order('R1')], [listing('9001')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const view = await getProfitView(ctxFor(SHOP_A))
    for (const row of view.reconciliation.rows) {
      expect(row.fees, 'a per-order fee was invented').toBeNull()
      expect(row.profit, 'a per-order profit was computed without fees').toBeNull()
    }
  })

  it('but a shop WITH fees still gets its net profit', async () => {
    /*
     * THE CONVERSE, and without it every assertion above is satisfied by a
     * product that simply never computes a net profit.
     */
    setEtsyService(fakeAdapter([order('R1')], [listing('9001')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    await getDb()
      .update(schema.orders)
      .set({ etsyFees: '2.40', paymentProcessing: '1.39', offsiteAds: '0.48' })
      .where(eq(schema.orders.shopId, SHOP_A))
    /*
     * The seller's own cost rules, written first.
     *
     * Added when the costs slice made net profit depend on costs as well as
     * fees: the four cost lines came from DEMO_COST_INPUTS when this was
     * written, so "fees known" was enough to produce a net profit. It is not
     * any more, and without these rules this test would assert the fee
     * distinction while measuring the cost one.
     */
    await writeCostRules(SHOP_A, USER_A, [
      { field: 'defaultRulePercent', value: 0.38 },
      { field: 'shippingPerOrder', value: 2.5 },
      { field: 'labourTotal', value: 100 },
      { field: 'otherCosts', value: 50 },
    ])


    const view = await getProfitView(ctxFor(SHOP_A))
    expect(view.verified.etsyFees).toBe(2.4)
    expect(view.results.BASE.netProfit).not.toBeNull()
    expect(view.results.BASE.lines.find((l) => l.key === 'etsyFees')?.provenance.type).toBe(
      'VERIFIED',
    )
    expect(view.results.BASE.missingData.map((i) => i.code)).not.toContain('FEES_NOT_LOADED')
  })
})

describe('no buyer identity reaches the database', () => {
  it('stores the country code and nothing else about the buyer', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   ASSERTED OVER THE COLUMNS AND THE ROW, NOT INFERRED FROM THE FACT
     *   THAT THE CODE DOES NOT CURRENTLY LOOK LIKE IT WOULD.
     * ══════════════════════════════════════════════════════════════════════
     *
     * Two halves. First: the orders table HAS no column that could hold a
     * name, an address, an email or a receipt-level note — read from
     * information_schema, so adding one turns this red. Second: a payload
     * carrying all of those is synced, and the stored row is searched for
     * every one of them.
     */
    const columns = await getDb().execute(
      sql`select column_name from information_schema.columns where table_name in ('orders','order_items')`,
    )
    const rowsOf = (result: unknown): { column_name: string }[] =>
      Array.isArray(result)
        ? (result as { column_name: string }[])
        : ((result as { rows?: { column_name: string }[] }).rows ?? [])
    const names = rowsOf(columns)
      .map((row) => row.column_name)
      .join(' ')
    expect(names, 'the column sweep found nothing to sweep').toMatch(/etsy_receipt_id/)
    for (const forbidden of ['name', 'email', 'address', 'buyer', 'phone', 'note', 'message', 'zip', 'postcode', 'city']) {
      expect(names, `a column that could identify a buyer: ${forbidden}`).not.toMatch(
        new RegExp(forbidden, 'i'),
      )
    }

    const PII = {
      buyerName: 'Jane Q. Doe',
      buyerEmail: 'jane.doe@example.com',
      address: '42 Mulberry Lane, Bristol',
      note: 'please gift wrap, it is for Tom',
    }
    const poisoned = {
      ...order('R-PII'),
      // Fields EtsyOrder does not declare. If the sync ever spreads the whole
      // payload into the row, they land in the database and this finds them.
      ...PII,
    } as EtsyOrder
    setEtsyService(fakeAdapter([poisoned]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const rows = await getDb().select().from(schema.orders).where(eq(schema.orders.shopId, SHOP_A))
    const lines = await getDb()
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.shopId, SHOP_A))
    const stored = JSON.stringify([...rows, ...lines])

    for (const [field, value] of Object.entries(PII)) {
      expect(stored, `${field} was stored`).not.toContain(value)
    }
    // The positive control: the row IS there, so the search had something to
    // search. Without this, a sync that wrote nothing would pass.
    expect(rows).toHaveLength(1)
    expect(rows[0]?.countryCode).toBe('GB')
  })

  it('keeps an unknown country as XX rather than inventing one or leaving it blank', async () => {
    setEtsyService(fakeAdapter([order('R1', { countryCode: 'XX' })]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    const [stored] = await readOrders(SHOP_A, WINDOW)
    expect(stored?.countryCode).toBe('XX')
  })
})

describe('running the sync twice', () => {
  it('leaves the same rows, not double, and the same ids', async () => {
    setEtsyService(fakeAdapter([order('R1'), order('R2')]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    const first = await getDb()
      .select({ id: schema.orders.id, receipt: schema.orders.etsyReceiptId })
      .from(schema.orders)
      .where(eq(schema.orders.shopId, SHOP_A))

    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    const second = await getDb()
      .select({ id: schema.orders.id, receipt: schema.orders.etsyReceiptId })
      .from(schema.orders)
      .where(eq(schema.orders.shopId, SHOP_A))

    expect(second).toHaveLength(2)
    /*
     * The ids matter as much as the count: order_items points at orders.id, so
     * a sync that re-minted them would orphan every line on the second run.
     */
    expect(new Set(second.map((r) => r.id))).toEqual(new Set(first.map((r) => r.id)))
  })

  it('updates a refund that arrived after the sale, on the same receipt', async () => {
    setEtsyService(fakeAdapter([order('R1', { refunds: 0 })]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    // Days later, the buyer is refunded. Etsy reports it on the SAME receipt.
    setEtsyService(fakeAdapter([order('R1', { refunds: 48 })]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const stored = await readOrders(SHOP_A, WINDOW)
    expect(stored, 'a refund created a second order').toHaveLength(1)
    expect(stored[0]?.refunds).toBe(48)
  })

  it('never deletes an order the window did not return', async () => {
    /*
     * Different from listings ON PURPOSE. getListings reads a whole catalogue,
     * so absence is a fact and the listings sync dates it. getOrders reads a
     * WINDOW — a slice of history — so absence from one window says nothing,
     * and a seller cannot unsell an order anyway.
     */
    setEtsyService(fakeAdapter([order('R1'), order('R2')]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    setEtsyService(fakeAdapter([order('R1')]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    expect(await countOrders(SHOP_A, WINDOW), 'an order was removed').toBe(2)
  })

  it('does not erase a cost snapshot something else recorded', async () => {
    setEtsyService(fakeAdapter([order('R1')]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    await getDb()
      .update(schema.orderItems)
      .set({ costSnapshot: '7.25' })
      .where(eq(schema.orderItems.shopId, SHOP_A))

    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const [line] = await getDb()
      .select({ cost: schema.orderItems.costSnapshot })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.shopId, SHOP_A))
    expect(line?.cost, 'a re-sync erased a confirmed cost').toBe('7.25')
  })

  it('never writes a cost snapshot of its own', async () => {
    // Cost rules are a later aggregate. Null means "excluded from profit
    // rather than given an assumed cost", which is right for an uncosted order.
    setEtsyService(fakeAdapter([order('R1'), order('R2')]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const lines = await getDb()
      .select({ cost: schema.orderItems.costSnapshot })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.shopId, SHOP_A))
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line.cost).toBeNull()
  })
})

describe('order lines', () => {
  it('resolves our listing id when we hold the listing, and null when we do not', async () => {
    const { service } = fakeAdapter([order('R1')], [listing('9001')])
    setEtsyService(service as never)
    await syncShopListings(ctxFor(SHOP_A))
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const [matched] = await getDb()
      .select({ listingId: schema.orderItems.listingId, etsy: schema.orderItems.etsyListingId })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.shopId, SHOP_A))
    expect(matched?.etsy).toBe('9001')
    expect(matched?.listingId, 'the sale was not linked to the listing we hold').not.toBeNull()

    // An order for a listing we do not hold still records WHAT sold.
    setEtsyService(
      fakeAdapter([order('R2', { items: [{ etsyListingId: '7777', quantity: 1, unitPrice: 9 }] })])
        .service as never,
    )
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    const [unheld] = await getDb()
      .select({ listingId: schema.orderItems.listingId })
      .from(schema.orderItems)
      .where(
        and(eq(schema.orderItems.shopId, SHOP_A), eq(schema.orderItems.etsyListingId, '7777')),
      )
    expect(unheld?.listingId).toBeNull()
  })

  it('merges two lines for one listing instead of aborting on the unique index', async () => {
    /*
     * A receipt CAN carry one listing twice — two variations of the same
     * listing are two Etsy transactions with one listing_id — and
     * (order_id, etsy_listing_id) is the only key the adapter's type permits,
     * because EtsyOrderItem carries no transaction id.
     *
     * Quantities add and the unit price becomes the value-weighted average, so
     * quantity x unitPrice still equals the summed line value.
     */
    setEtsyService(
      fakeAdapter([
        order('R1', {
          items: [
            { etsyListingId: '9001', quantity: 1, unitPrice: 10 },
            { etsyListingId: '9001', quantity: 3, unitPrice: 20 },
          ],
        }),
      ]).service as never,
    )
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const [stored] = await readOrders(SHOP_A, WINDOW)
    expect(stored?.items).toHaveLength(1)
    expect(stored?.items[0]?.quantity).toBe(4)
    // (1x10 + 3x20) / 4 = 17.50, and 4 x 17.50 = 70 = the true line value.
    expect(stored?.items[0]?.unitPrice).toBe(17.5)
    expect((stored?.items[0]?.quantity ?? 0) * (stored?.items[0]?.unitPrice ?? 0)).toBe(70)
  })

  it('drops a line the receipt no longer carries', async () => {
    setEtsyService(
      fakeAdapter([
        order('R1', {
          items: [
            { etsyListingId: '9001', quantity: 1, unitPrice: 10 },
            { etsyListingId: '9002', quantity: 1, unitPrice: 20 },
          ],
        }),
      ]).service as never,
    )
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    expect((await readOrders(SHOP_A, WINDOW))[0]?.items).toHaveLength(2)

    setEtsyService(
      fakeAdapter([
        order('R1', { items: [{ etsyListingId: '9001', quantity: 1, unitPrice: 10 }] }),
      ]).service as never,
    )
    const result = await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    expect(result.linesRemoved).toBe(1)
    expect((await readOrders(SHOP_A, WINDOW))[0]?.items).toHaveLength(1)
  })
})

describe('the repository cannot be asked for another shop', () => {
  it('returns nothing for a shop id it does not own', async () => {
    setEtsyService(fakeAdapter([order('R1')]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    expect(await readOrders(SHOP_B, WINDOW)).toEqual([])
    expect(await countOrders(SHOP_B, WINDOW)).toBe(0)
  })

  it('keeps two shops’ orders apart', async () => {
    setEtsyService(fakeAdapter([order('R1'), order('R2')]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    setEtsyService(fakeAdapter([order('R9')]).service as never)
    await syncShopOrders({ shopId: SHOP_B, actorId: USER_B, readOnly: false }, WINDOW)

    expect((await readOrders(SHOP_A, WINDOW)).map((o) => o.etsyReceiptId).sort()).toEqual([
      'R1',
      'R2',
    ])
    expect((await readOrders(SHOP_B, WINDOW)).map((o) => o.etsyReceiptId)).toEqual(['R9'])
  })

  it('lets two shops hold the same receipt id without colliding', async () => {
    // The unique index is (shop_id, etsy_receipt_id), not etsy_receipt_id.
    setEtsyService(fakeAdapter([order('SAME')]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    await syncShopOrders({ shopId: SHOP_B, actorId: USER_B, readOnly: false }, WINDOW)

    expect(await countOrders(SHOP_A, WINDOW)).toBe(1)
    expect(await countOrders(SHOP_B, WINDOW)).toBe(1)
  })

  it('does not let one shop’s sync touch another’s lines', async () => {
    setEtsyService(fakeAdapter([order('R1')]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    const before = await countOrders(SHOP_A, WINDOW)

    setEtsyService(fakeAdapter([order('R9')]).service as never)
    await syncShopOrders({ shopId: SHOP_B, actorId: USER_B, readOnly: false }, WINDOW)

    expect(await countOrders(SHOP_A, WINDOW)).toBe(before)
    const linesA = await getDb()
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.shopId, SHOP_A))
    expect(linesA).toHaveLength(1)
  })

  it('does not return a window it was not asked for', async () => {
    setEtsyService(
      fakeAdapter([order('OLD', { placedAt: '2025-01-01T00:00:00.000Z' }), order('NEW')])
        .service as never,
    )
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const inWindow = await readOrders(SHOP_A, WINDOW)
    expect(inWindow.map((o) => o.etsyReceiptId)).toEqual(['NEW'])
    // Still stored, though: the row is there, outside the window.
    expect(await countOrders(SHOP_A, { since: '2024-01-01T00:00:00.000Z', until: WINDOW.until })).toBe(2)
  })
})

describe('what a seller sees before their first orders sync', () => {
  it('says NOT_SYNCED even after a LISTINGS sync has run', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE BUG ONE SHARED TIMESTAMP WOULD HAVE CAUSED.
     * ══════════════════════════════════════════════════════════════════════
     *
     * shops.last_synced_at is set by the listings sync. If orders read that
     * column, this shop would report SYNCED with an empty orders table, and
     * every screen would present "no orders" as a fact. sync_state holds one
     * row per aggregate, so listings being read says nothing about orders.
     */
    setEtsyService(fakeAdapter([], [listing('9001')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))

    const [row] = await getDb()
      .select({ at: schema.shops.lastSyncedAt })
      .from(schema.shops)
      .where(eq(schema.shops.id, SHOP_A))
    expect(row?.at, 'the listings sync should have stamped the shop').not.toBeNull()

    const { source } = await shopDataSource(ctxFor(SHOP_A), 'ORDERS')
    expect(source.kind).toBe('NOT_SYNCED')

    const listingsSource = await shopDataSource(ctxFor(SHOP_A), 'LISTINGS')
    expect(listingsSource.source.kind).toBe('SYNCED')
  })

  it('says SYNCED once orders have been read, even if there were none', async () => {
    setEtsyService(fakeAdapter([]).service as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    const { source } = await shopDataSource(ctxFor(SHOP_A), 'ORDERS')
    expect(source.kind).toBe('SYNCED')
  })

  it('reports a shop that is gone as its own thing', async () => {
    const { source } = await shopDataSource(ctxFor('shop-that-does-not-exist'), 'ORDERS')
    expect(source.kind).toBe('NO_SHOP')
  })

  it('reads nothing at all when nothing has synced', async () => {
    const loaded = await loadOrders(ctxFor(SHOP_A), WINDOW)
    expect(loaded.orders).toEqual([])
    expect(loaded.source.kind).toBe('NOT_SYNCED')
  })
})

describe('the Action Center does not say "nothing needs your attention"', () => {
  it('produces no actions and reports NOT_SYNCED before the first sync', async () => {
    /*
     * The sharpest case in this slice. Every generator derives its finding
     * from observed state; handed an empty order list they observe nothing
     * wrong and the screen reads as an all-clear. So the queue is empty AND
     * the source says why, and components/action-center/action-list.tsx
     * renders the second rather than the first.
     */
    const view = await getActions(ctxFor(SHOP_A))

    expect(view.actions).toEqual([])
    expect(view.source.kind).toBe('NOT_SYNCED')
    expect(view.counts).toEqual({ OPEN: 0, DONE: 0, DISMISSED: 0 })
  })

  it('and produces findings once the orders are there', async () => {
    /*
     * The converse. Without it, a product that never produced an action at
     * all would satisfy the test above perfectly.
     */
    setEtsyService(fakeAdapter([order('R1'), order('R2')], [listing('9001')]).service as never)
    await syncShopListings(ctxFor(SHOP_A))
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const view = await getActions(ctxFor(SHOP_A))
    expect(view.source.kind).toBe('SYNCED')
    expect(view.actions.length, 'a synced shop produced no actions at all').toBeGreaterThan(0)
  })
})

describe('demo mode reads no database rows at all', () => {
  it('asks the adapter and never the table', async () => {
    /*
     * Asserted with a spy on getDb and a requirement of ZERO calls, which is
     * the only form of "never reads the table" that cannot be satisfied by a
     * test that simply did not look.
     */
    delete process.env.ETSY_MODE
    setEtsyService(null)

    const db = await import('@/lib/db')
    const spy = vi.spyOn(db, 'getDb')

    const loaded = await loadOrders(ctxFor('demo-shop'), WINDOW)

    expect(spy, 'demo mode touched the database').not.toHaveBeenCalled()
    expect(loaded.source.kind).toBe('DEMO')
    expect(loaded.orders.length, 'the demo catalogue did not load').toBeGreaterThan(0)
  })

  it('and the demo receipts carry real fees, so net profit still computes', async () => {
    /*
     * The other half of "demo mode keeps working exactly as now". The mock's
     * receipts have fee figures on them, so feesAreKnown is true and nothing
     * about the demo waterfall changed when the columns became nullable.
     */
    delete process.env.ETSY_MODE
    setEtsyService(null)

    const loaded = await loadOrders(ctxFor('demo-shop'), WINDOW)
    for (const order of loaded.orders.slice(0, 5)) {
      expect(order.etsyFees).not.toBeNull()
      expect(order.paymentProcessing).not.toBeNull()
      expect(order.offsiteAds).not.toBeNull()
    }
  })
})

describe('the write is one transaction', () => {
  it('leaves no rows and no sync state when the write fails part way', async () => {
    /*
     * The sync-state row is the dangerous half, exactly as last_synced_at was
     * for listings: it is what every screen uses to tell "never read" from
     * "read and empty", so it must never be written beside an incomplete
     * catalogue of orders.
     *
     * Forced by a gross Postgres refuses: numeric(12,2) overflows above 10^10,
     * which fails INSIDE the loop after 'R1' has been inserted.
     */
    const poison: StoredOrder = { ...order('BAD'), gross: 1e15 }
    await expect(writeSyncedOrders(SHOP_A, [order('R1'), poison])).rejects.toThrow()

    expect(await countOrders(SHOP_A, WINDOW)).toBe(0)
    expect(await readAggregateSyncedAt(SHOP_A, 'ORDERS')).toBeNull()
  })
})
