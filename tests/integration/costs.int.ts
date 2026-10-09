import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { acceptTermsFor } from '../support/legal'

import { syncShopOrders } from '@/domain/sync/orders'
import { syncShopListings } from '@/domain/sync/listings'
import { getProfitView } from '@/domain/profit/service'
import { getCostsView } from '@/domain/costs/service'
import { loadCosts } from '@/domain/costs/load'
import {
  costRuleHistory,
  countCostRules,
  currentCostRules,
  currentListingCosts,
  writeCostRules,
  writeListingCost,
} from '@/lib/repositories/costs'
import { setEtsyService } from '@/lib/etsy'
import { getDb, schema } from '@/lib/db'
import type { EtsyListing, EtsyOrder } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'

/**
 * The costs seam: form -> repository -> table -> every screen that reads a cost.
 *
 *     DATABASE_URL=postgres://... npm run test:integration
 *
 * ── THE CLAIMS THAT MATTER, AND WHY THEY ARE THESE ───────────────────────
 *
 *   a saved cost is IN THE TABLE, not in this process — the defect being
 *     fixed was a module-level Map, and a test that only read back through
 *     the same module would have passed against it
 *   a rule is never UPDATED, so the rows are the audit trail
 *   a retracted rule is NULL, which reads back as null and never as 0
 *   one shop cannot see, cost by, or write against another shop's rules
 *   a seller with NO rules gets a null net profit and the words "Not set",
 *     not a 0% COGS and not the demo shop's 38%
 *   changing a rule RESTATES a closed period — asserted, because it is the
 *     decision this slice made and the one a seller is owed in writing
 *   order_items.cost_snapshot stays NULL, which is what makes that decision
 *     the only one in force
 *   demo mode reads NO database rows at all
 */

const SHOP_A = 'costs-test-shop-a'
const SHOP_B = 'costs-test-shop-b'
const USER_A = 'costs-test-user-a'
const USER_B = 'costs-test-user-b'
const OURS = [SHOP_A, SHOP_B]

const WINDOW = { since: '2026-07-14T00:00:00.000Z', until: '2026-08-12T23:59:59.999Z' }
/** Inside the demo dataset's reporting period, which is what the screens read. */
const IN_PERIOD = '2026-07-20T10:00:00.000Z'
const ENV = { ...process.env }

const ctxFor = (shopId: string, actorId = USER_A): ShopContext => ({
  shopId,
  actorId,
  readOnly: false,
})

/*
 * Orders with REAL fees, unlike the orders suite's fixture.
 *
 * Deliberate: this suite is about costs, and with the fees null the net profit
 * would be null whatever the cost rules said — so every assertion below would
 * pass against a cost layer that was broken. The fees are present so that the
 * only thing withholding a net profit is a cost nobody entered.
 */
function order(id: string, overrides: Partial<EtsyOrder> = {}): EtsyOrder {
  return {
    etsyReceiptId: id,
    placedAt: IN_PERIOD,
    gross: 100,
    discounts: 0,
    refunds: 0,
    etsyFees: 6.5,
    paymentProcessing: 3,
    offsiteAds: 0,
    countryCode: 'GB',
    items: [{ etsyListingId: '9001', quantity: 1, unitPrice: 100 }],
    ...overrides,
  }
}

function listing(id: string, overrides: Partial<EtsyListing> = {}): EtsyListing {
  return {
    etsyListingId: id,
    title: `Listing ${id}`,
    description: 'A description',
    tags: ['handmade'],
    price: 100,
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

function fakeAdapter(orders: EtsyOrder[], listings: EtsyListing[] = []) {
  return {
    canWrite: false as const,
    mode: 'mock' as const,
    async getOrders() {
      return orders
    },
    async getListings(_shopId: string, opts: { limit?: number; offset?: number } = {}) {
      const offset = opts.offset ?? 0
      const limit = opts.limit ?? 50
      return { listings: listings.slice(offset, offset + limit), total: listings.length }
    },
  }
}

async function clean() {
  const db = getDb()
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
      { id: USER_A, email: 'a@costs.test', name: 'A' },
      { id: USER_B, email: 'b@costs.test', name: 'B' },
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

/** The five default-scope fields, as the route posts them. */
const ALL_FIELDS = [
  { field: 'defaultRulePercent' as const, value: 0.415 },
  { field: 'shippingPerOrder' as const, value: 3.2 },
  { field: 'labourTotal' as const, value: 400 },
  { field: 'otherCosts' as const, value: 120 },
  { field: 'adSpend' as const, value: null },
]

describe('a saved cost is in the table, not in this process', () => {
  it('is readable by a freshly imported module graph', async () => {
    /*
     * ── THE DEFECT THIS SUITE EXISTS FOR ────────────────────────────────
     *
     * domain/costs/store.ts held the five figures in a module-level Map keyed
     * on `Symbol.for('etsypilot.costs.store')`. Measured in a browser before
     * it was deleted: save 41.5, restart the server, and the form reads 38.0
     * — the demo fixture's COGS ratio — silently.
     *
     * Note what this test does NOT do: read back through the same imported
     * function it wrote with. That passes against the Map, which is why the
     * old store survived a full test suite. Instead the modules are reset and
     * re-imported, and the row is read with a statement of this test's own.
     *
     * `Symbol.for` lives in the cross-realm registry and would survive
     * vi.resetModules, so the re-import alone is not the whole control. The
     * raw table read below is: a value in `cost_rules` is a value any process
     * on this database can see, which is what "survives a restart" means.
     */
    await writeCostRules(SHOP_A, USER_A, ALL_FIELDS)

    vi.resetModules()
    const fresh = await import('@/lib/repositories/costs')
    const reread = await fresh.currentCostRules(SHOP_A)

    expect(reread.defaultRulePercent).toBe(0.415)
    expect(reread.shippingPerOrder).toBe(3.2)
    expect(reread.labourTotal).toBe(400)
    expect(reread.otherCosts).toBe(120)

    // And in the table itself, which is the part a second instance reads.
    const rows = await getDb()
      .select({ costKind: schema.costRules.costKind, value: schema.costRules.value })
      .from(schema.costRules)
      .where(and(eq(schema.costRules.shopId, SHOP_A), eq(schema.costRules.scope, 'DEFAULT')))
    expect(rows.map((r) => r.costKind).sort()).toEqual(['COGS', 'LABOUR', 'OTHER', 'SHIPPING'])
    expect(rows.find((r) => r.costKind === 'COGS')?.value).toBe('0.4150')
  })

  it('and the settings form reads back exactly what was saved', async () => {
    /*
     * Through getCostsView, which is what the page renders. The form's value
     * came from the store's `defaultCostSettings()` fallback before this, so
     * the figure a seller saw was the fixture's whenever their own save had
     * been lost.
     */
    setEtsyService(fakeAdapter([], []) as never)
    await syncShopListings(ctxFor(SHOP_A))
    await writeCostRules(SHOP_A, USER_A, [{ field: 'defaultRulePercent', value: 0.415 }])

    const view = await getCostsView(ctxFor(SHOP_A))
    expect(view.settings.defaultRulePercent).toBe(0.415)
    // Not 0.38, and not 2.6187214611872145 — the two figures the fixture gave.
    expect(view.settings.shippingPerOrder).toBeNull()
  })
})

describe('the rows are the audit trail', () => {
  it('inserts on every change and never updates', async () => {
    await writeCostRules(SHOP_A, USER_A, [{ field: 'defaultRulePercent', value: 0.38 }])
    await writeCostRules(SHOP_A, USER_B, [{ field: 'defaultRulePercent', value: 0.415 }])

    const history = await costRuleHistory(SHOP_A)
    const cogs = history.filter((row) => row.costKind === 'COGS')
    expect(cogs).toHaveLength(2)
    // Newest first, and each row says who.
    expect(cogs[0]?.value).toBe(0.415)
    expect(cogs[0]?.actorId).toBe(USER_B)
    expect(cogs[1]?.value).toBe(0.38)
    expect(cogs[1]?.actorId).toBe(USER_A)

    // The current read takes the newest, and the older row is still there.
    expect((await currentCostRules(SHOP_A)).defaultRulePercent).toBe(0.415)
    expect(await countCostRules(SHOP_A)).toBe(2)
  })

  it('writes nothing when a save changes nothing', async () => {
    /*
     * The converse, and the reason it is worth asserting: the rows ARE the
     * trail, so a form that re-posts five unchanged fields on every visit
     * would bury the two real edits in a hundred no-ops.
     */
    const first = await writeCostRules(SHOP_A, USER_A, ALL_FIELDS)
    expect(first.written).toBe(4) // adSpend was null and stayed null.

    const second = await writeCostRules(SHOP_A, USER_A, ALL_FIELDS)
    expect(second.written).toBe(0)
    expect(await countCostRules(SHOP_A)).toBe(4)
  })

  it('retracts a rule with null, which reads back as null and not as zero', async () => {
    await writeCostRules(SHOP_A, USER_A, [{ field: 'labourTotal', value: 400 }])
    await writeCostRules(SHOP_A, USER_A, [{ field: 'labourTotal', value: null }])

    /*
     * Both rows, not "the newest" — two inserts a millisecond apart can share
     * a created_at, and ordering on it would make this assertion a coin toss.
     * The claim is about what a retraction STORES, and that is a null column.
     */
    const stored = await getDb()
      .select({ value: schema.costRules.value })
      .from(schema.costRules)
      .where(and(eq(schema.costRules.shopId, SHOP_A), eq(schema.costRules.costKind, 'LABOUR')))
    expect(stored).toHaveLength(2)
    expect(
      stored.filter((row) => row.value === null),
      'a retraction was stored as a number',
    ).toHaveLength(1)

    const current = await currentCostRules(SHOP_A)
    expect(current.labourTotal).toBeNull()
    expect(current.labourTotal).not.toBe(0)

    /*
     * And the shop still "has rules" — which is the distinction the profit
     * copy turns on. A seller who set a labour figure and then cleared it has
     * used this product; one who never opened the page has not.
     */
    const loaded = await loadCosts(ctxFor(SHOP_A))
    expect(loaded.hasAnyRule).toBe(true)
    expect(loaded.costs.labourTotal).toBeNull()
  })

  it('stores a genuine zero as a zero, which is a different answer', async () => {
    await writeCostRules(SHOP_A, USER_A, [{ field: 'otherCosts', value: 0 }])
    const current = await currentCostRules(SHOP_A)
    expect(current.otherCosts).toBe(0)
    expect(current.otherCosts).not.toBeNull()
  })
})

describe('one shop cannot reach another shop’s costs', () => {
  it('reads only its own default rules', async () => {
    await writeCostRules(SHOP_A, USER_A, [{ field: 'defaultRulePercent', value: 0.415 }])
    await writeCostRules(SHOP_B, USER_B, [{ field: 'defaultRulePercent', value: 0.11 }])

    expect((await currentCostRules(SHOP_A)).defaultRulePercent).toBe(0.415)
    expect((await currentCostRules(SHOP_B)).defaultRulePercent).toBe(0.11)
    expect(await countCostRules(SHOP_A)).toBe(1)
    expect((await costRuleHistory(SHOP_B)).every((row) => row.value === 0.11)).toBe(true)
  })

  it('refuses a per-listing cost against another shop’s listing', async () => {
    setEtsyService(fakeAdapter([], [listing('5001')]) as never)
    await syncShopListings(ctxFor(SHOP_A))

    const [owned] = await getDb()
      .select({ id: schema.listings.id })
      .from(schema.listings)
      .where(eq(schema.listings.shopId, SHOP_A))
      .limit(1)
    expect(owned).toBeDefined()

    /*
     * The foreign key is satisfied — the listing exists — so only the explicit
     * ownership check stands between shop B and a rule attached to shop A's
     * catalogue. That is the check this asserts.
     */
    await expect(writeListingCost(SHOP_B, USER_B, owned!.id, 12.5)).rejects.toThrow(
      /does not belong to this shop/,
    )
    expect(await countCostRules(SHOP_B)).toBe(0)
  })

  it('does not let one shop’s per-listing cost appear in another’s coverage', async () => {
    setEtsyService(fakeAdapter([], [listing('5001')]) as never)
    await syncShopListings(ctxFor(SHOP_A))
    await syncShopListings(ctxFor(SHOP_B))

    const [aListing] = await getDb()
      .select({ id: schema.listings.id })
      .from(schema.listings)
      .where(eq(schema.listings.shopId, SHOP_A))
      .limit(1)
    await writeListingCost(SHOP_A, USER_A, aListing!.id, 12.5)

    expect(await currentListingCosts(SHOP_A)).toEqual(new Map([['5001', 12.5]]))
    /*
     * Shop B synced the same Etsy listing id, so a read scoped on the listing
     * id alone would hand it shop A's cost. Both sides are scoped.
     */
    expect(await currentListingCosts(SHOP_B)).toEqual(new Map())
  })
})

describe('a per-listing cost is a confirmed cost', () => {
  it('is keyed by Etsy listing id and drops out when retracted', async () => {
    setEtsyService(fakeAdapter([], [listing('5001'), listing('5002')]) as never)
    await syncShopListings(ctxFor(SHOP_A))

    const rows = await getDb()
      .select({ id: schema.listings.id, etsyListingId: schema.listings.etsyListingId })
      .from(schema.listings)
      .where(eq(schema.listings.shopId, SHOP_A))
    const byEtsyId = new Map(rows.map((r) => [r.etsyListingId, r.id]))

    await writeListingCost(SHOP_A, USER_A, byEtsyId.get('5001')!, 12.5)
    await writeListingCost(SHOP_A, USER_A, byEtsyId.get('5002')!, 40)
    expect(await currentListingCosts(SHOP_A)).toEqual(
      new Map([
        ['5001', 12.5],
        ['5002', 40],
      ]),
    )

    // Retracted: absent from the map, not present as zero.
    await writeListingCost(SHOP_A, USER_A, byEtsyId.get('5002')!, null)
    const after = await currentListingCosts(SHOP_A)
    expect(after.has('5002')).toBe(false)
    expect(after.get('5002')).toBeUndefined()
    expect(after.get('5001')).toBe(12.5)
  })

  it('moves cost coverage off zero, measured through the page view', async () => {
    setEtsyService(fakeAdapter([order('R1')], [listing('9001')]) as never)
    await syncShopListings(ctxFor(SHOP_A))
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const before = await getCostsView(ctxFor(SHOP_A))
    expect(before.coverage.percent).toBe(0)

    const [row] = await getDb()
      .select({ id: schema.listings.id })
      .from(schema.listings)
      .where(and(eq(schema.listings.shopId, SHOP_A), eq(schema.listings.etsyListingId, '9001')))
    await writeListingCost(SHOP_A, USER_A, row!.id, 30)

    const after = await getCostsView(ctxFor(SHOP_A))
    expect(after.coverage.percent).toBe(100)
    expect(after.coverage.listingsCovered).toBe(1)
    expect(after.coverage.listingsMissing).toBe(0)
  })
})

describe('a seller who has set nothing is told nothing, not zero', () => {
  it('gets a null net profit and the words “Not set”', async () => {
    setEtsyService(fakeAdapter([order('R1')], [listing('9001')]) as never)
    await syncShopListings(ctxFor(SHOP_A))
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const view = await getProfitView(ctxFor(SHOP_A))

    /*
     * The fees ARE known here — see the fixture — so this null is about the
     * costs and nothing else. Measured in a browser before this slice: the
     * same shop reported "Net profit -$1,322.05", a loss built entirely from
     * the demo fixture's labour and other-cost totals.
     */
    expect(view.verified.etsyFees).not.toBeNull()
    expect(view.results.BASE.netProfit).toBeNull()
    expect(view.results.BASE.totalCosts).toBeNull()
    expect(view.results.BASE.marginPercent).toBeNull()

    expect(view.assumptions.cogsPercent).toBeNull()
    expect(view.assumptions.hasAnyRule).toBe(false)
    expect(view.costSetup.defaultRule.label).toBe('Not set')

    // And no cost line claims a figure.
    for (const key of ['shipping', 'cogs', 'labour', 'other']) {
      const line = view.results.BASE.lines.find((l) => l.key === key)
      expect(line?.amount, `${key} was given a number nobody entered`).toBeNull()
      expect(line?.provenance.type).toBe('UNAVAILABLE')
    }
  })

  it('and the scenarios withhold the same lines rather than projecting them', async () => {
    setEtsyService(fakeAdapter([order('R1')], [listing('9001')]) as never)
    await syncShopListings(ctxFor(SHOP_A))
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const view = await getProfitView(ctxFor(SHOP_A))
    for (const kind of ['CONSERVATIVE', 'BASE', 'OPTIMISTIC'] as const) {
      expect(view.results[kind].netProfit, `${kind} projected a cost nobody entered`).toBeNull()
    }
    const cogsRow = view.inputs.find((r) => r.key === 'cogs')
    expect(cogsRow?.value).toBe('—')
    expect(cogsRow?.provenance).toBe('UNAVAILABLE')
  })

  it('computes a net profit once the seller has set their costs', async () => {
    /*
     * THE POSITIVE CONTROL. Without it every assertion above would pass
     * against a profit screen that had simply stopped working.
     */
    setEtsyService(fakeAdapter([order('R1')], [listing('9001')]) as never)
    await syncShopListings(ctxFor(SHOP_A))
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)
    await writeCostRules(SHOP_A, USER_A, ALL_FIELDS)

    const view = await getProfitView(ctxFor(SHOP_A))
    expect(view.assumptions.cogsPercent).toBe(0.415)
    expect(view.results.BASE.netProfit).not.toBeNull()
    expect(view.costSetup.defaultRule.label).toBe('42% of price')
  })
})

describe('changing a rule restates a closed period', () => {
  it('moves the net profit of orders that synced before the rule existed', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THIS IS THE DECISION, ASSERTED.
     * ══════════════════════════════════════════════════════════════════════
     *
     * Costs are applied at READ time, so a seller who corrects a COGS
     * percentage today changes what last month's profit says. The alternative
     * — freezing each order's cost at sync time — is defensible too, and the
     * reasons it was rejected are in lib/repositories/costs.ts.
     *
     * The test is here so the decision cannot be reversed by accident, and
     * components/profit/profit-tabs.tsx says it in words next to the figure so
     * a seller is not left to discover it.
     */
    setEtsyService(fakeAdapter([order('R1')], [listing('9001')]) as never)
    await syncShopListings(ctxFor(SHOP_A))
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    await writeCostRules(SHOP_A, USER_A, ALL_FIELDS)
    const first = (await getProfitView(ctxFor(SHOP_A))).results.BASE.netProfit

    await writeCostRules(SHOP_A, USER_A, [{ field: 'defaultRulePercent', value: 0.1 }])
    const second = (await getProfitView(ctxFor(SHOP_A))).results.BASE.netProfit

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(second!, 'the restatement did not happen').toBeGreaterThan(first!)
    // The orders did not change. Only the rule did.
    expect((await getProfitView(ctxFor(SHOP_A))).verified.orderCount).toBe(1)
  })

  it('leaves order_items.cost_snapshot null, which is what keeps that true', async () => {
    /*
     * The column that would hold the frozen answer. If a sync ever started
     * writing it, two parts of the product would disagree about last month —
     * so its emptiness is asserted here rather than assumed from the fact
     * that no code appears to write it.
     */
    setEtsyService(fakeAdapter([order('R1')], [listing('9001')]) as never)
    await syncShopListings(ctxFor(SHOP_A))
    await writeCostRules(SHOP_A, USER_A, ALL_FIELDS)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const lines = await getDb()
      .select({ snapshot: schema.orderItems.costSnapshot })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.shopId, SHOP_A))
    expect(lines.length, 'no order lines were written, so this asserted nothing').toBeGreaterThan(0)
    expect(lines.every((l) => l.snapshot === null)).toBe(true)

    // Stated as a count too, so the assertion survives a change of shape.
    const [withSnapshot] = await getDb()
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.orderItems)
      .where(and(eq(schema.orderItems.shopId, SHOP_A), isNotNull(schema.orderItems.costSnapshot)))
    expect(withSnapshot?.total).toBe(0)
  })
})

describe('demo mode reads no database rows at all', () => {
  it('serves Willow & Fern from the fixture and never touches the table', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THIS GUARD WAS BLIND WHEN IT WAS FIRST WRITTEN, AND A NEGATIVE
     *   CONTROL IS THE ONLY REASON THAT IS KNOWN.
     * ══════════════════════════════════════════════════════════════════════
     *
     * The first version spied on `getDb` and called the `loadCosts` imported
     * at the top of this file. Perturbation: add `await countCostRules(...)`
     * to the DEMO branch of domain/costs/load.ts — a real database read in
     * demo mode, the exact thing this test exists to forbid. Measured: 18
     * passed. The guard did not move.
     *
     * The cause is the `vi.resetModules()` in the persistence test above.
     * After it, `await import('@/lib/db')` hands back a NEW module instance,
     * while the `loadCosts` imported at the top of this file still closes over
     * the old one — so the spy was installed on a module nothing under test
     * was using. The orders suite's version of this test is sound because that
     * file never resets the registry; this one does, two describes earlier.
     *
     * So the loader is re-imported from the same registry as the spied module,
     * and the positive control below proves the pair can see a read at all.
     */
    delete process.env.ETSY_MODE
    setEtsyService(null)

    const db = await import('@/lib/db')
    const spy = vi.spyOn(db, 'getDb')
    const { loadCosts: freshLoadCosts } = await import('@/domain/costs/load')

    const loaded = await freshLoadCosts(ctxFor('demo-shop'))

    expect(spy, 'demo mode touched the database').not.toHaveBeenCalled()
    expect(loaded.source.kind).toBe('DEMO')
    expect(loaded.hasAnyRule).toBe(true)
    // The fixture's own figures, unchanged by this slice.
    const { DEMO_COST_INPUTS } = await import('@/lib/etsy/demo-dataset')
    expect(loaded.costs.defaultRulePercent).toBe(DEMO_COST_INPUTS.cogsPercent)
    expect(loaded.costs.shippingPerOrder).toBe(DEMO_COST_INPUTS.shippingPerOrder)
    expect(loaded.costs.labourTotal).toBe(DEMO_COST_INPUTS.labourTotal)
    expect(loaded.costs.otherCosts).toBe(DEMO_COST_INPUTS.otherCosts)

    /*
     * THE POSITIVE CONTROL, in the same test and on the same spy. The same
     * loader in live mode reads the table, so zero calls above is a
     * measurement of demo mode rather than of a spy that sees nothing.
     */
    process.env.ETSY_MODE = 'live'
    await freshLoadCosts(ctxFor(SHOP_A))
    expect(spy, 'the spy cannot see a database read, so the assertion above is empty').toHaveBeenCalled()
  })

  it('and a live shop’s rules are invisible to it', async () => {
    /*
     * The converse. Demo mode must not pick up a real shop's figures either —
     * the fixture is the whole answer there, and a leak in this direction
     * would put a seller's own costs on a screenshot.
     */
    await writeCostRules(SHOP_A, USER_A, [{ field: 'defaultRulePercent', value: 0.415 }])

    delete process.env.ETSY_MODE
    setEtsyService(null)
    const loaded = await loadCosts(ctxFor(SHOP_A))
    expect(loaded.costs.defaultRulePercent).not.toBe(0.415)
  })
})
