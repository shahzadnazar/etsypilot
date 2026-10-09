import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { acceptTermsFor } from '../support/legal'

import { syncShopOrders } from '@/domain/sync/orders'
import { syncShopListings } from '@/domain/sync/listings'
import { getActions } from '@/domain/action-center/service'
import { getShopPulse } from '@/domain/shop-pulse/service'
import { writeCostRules, writeListingCost } from '@/lib/repositories/costs'
import { setEtsyService } from '@/lib/etsy'
import { getDb, schema } from '@/lib/db'
import type { EtsyListing, EtsyOrder } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'

/**
 * The Action Center, on three shapes of shop.
 *
 *     DATABASE_URL=postgres://... npm run test:integration
 *
 * ── WHAT A LIVE SELLER SAW BEFORE THIS ───────────────────────────────────
 *
 * Measured in a browser on an account with two listings and two orders: four
 * CRITICAL cards, each reading "Orders fell below your baseline with no
 * recorded change", scoped to "3 listings", "12 listings", "1 listing" and
 * "4 listings", offering to "View the bulk job" and "Review the section".
 * Every one of them described the demo shop, reached through
 * domain/shop-pulse/service.ts filtering DEMO_EVENTS. Each card's own evidence
 * line refuted it: "too few orders on 3 listings to measure a rate (0 before,
 * 0 after)".
 *
 * ── THE CLAIMS THAT MATTER, AND WHY THEY ARE THESE ───────────────────────
 *
 *   a listing with NO confirmed cost is never called below cost — the rule
 *     the most severe card in the product rests on
 *   a shop with nothing wrong gets ZERO actions, so the empty state is
 *     reachable rather than theoretical
 *   every figure on every card is a count of this shop's own rows
 *   no card names a person, a bulk job or a listing set this shop has no
 *     record of
 *   a finding nobody could measure is not work
 *   demo mode reads NO database rows and keeps all four authored actions
 */

const SHOP_A = 'ac-test-shop-a'
const SHOP_B = 'ac-test-shop-b'
const USER_A = 'ac-test-user-a'
const USER_B = 'ac-test-user-b'
const OURS = [SHOP_A, SHOP_B]

const WINDOW = { since: '2026-07-14T00:00:00.000Z', until: '2026-08-12T23:59:59.999Z' }
const IN_PERIOD = '2026-07-20T10:00:00.000Z'
const ENV = { ...process.env }

const ctxFor = (shopId: string, actorId = USER_A): ShopContext => ({
  shopId,
  actorId,
  readOnly: false,
})

function order(id: string, listingId: string, gross: number, quantity = 1): EtsyOrder {
  return {
    etsyReceiptId: id,
    placedAt: IN_PERIOD,
    gross,
    discounts: 0,
    refunds: 0,
    etsyFees: round2(gross * 0.065),
    paymentProcessing: round2(gross * 0.03),
    offsiteAds: 0,
    countryCode: 'GB',
    items: [{ etsyListingId: listingId, quantity, unitPrice: round2(gross / quantity) }],
  }
}

function listing(id: string, price: number, overrides: Partial<EtsyListing> = {}): EtsyListing {
  return {
    etsyListingId: id,
    title: `Listing ${id}`,
    description: 'A description long enough to be unremarkable for this test.',
    tags: ['handmade'],
    price,
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

/** Sync a shop and return the row id of each listing, by Etsy id. */
async function seed(shopId: string, orders: EtsyOrder[], listings: EtsyListing[]) {
  setEtsyService(fakeAdapter(orders, listings) as never)
  await syncShopListings(ctxFor(shopId))
  await syncShopOrders(ctxFor(shopId), WINDOW)
  const rows = await getDb()
    .select({ id: schema.listings.id, etsyListingId: schema.listings.etsyListingId })
    .from(schema.listings)
    .where(eq(schema.listings.shopId, shopId))
  return new Map(rows.map((r) => [r.etsyListingId, r.id]))
}

async function clean() {
  const db = getDb()
  await db.delete(schema.costRules).where(inArray(schema.costRules.shopId, OURS))
  await db.delete(schema.events).where(inArray(schema.events.shopId, OURS))
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
      { id: USER_A, email: 'a@ac.test', name: 'Ada Lovelace', displayName: 'Ada L.' },
      { id: USER_B, email: 'b@ac.test', name: 'B', displayName: 'B' },
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

/* ════════════════════════════════════════════════ shape 1: no costs at all */

describe('a shop that has entered no costs', () => {
  it('is told so, once, with its own counts', async () => {
    await seed(SHOP_A, [order('R1', '770001', 48)], [listing('770001', 48), listing('770002', 26)])

    const { actions } = await getActions(ctxFor(SHOP_A))
    expect(actions.map((a) => a.id)).toEqual(['ACT-MISSING-COSTS'])

    const card = actions[0]!
    expect(card.title).toBe('2 listings have no product cost')
    expect(card.severity).toBe('ATTENTION')
    expect(card.status).toBe('OPEN')
    expect(card.evidence.summary).toContain('2 of 2 active listings')
    expect(card.destination.href).toBe('/settings/costs')
  })

  it('and is not told its listings sell below cost, because nothing was costed', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE RULE THE MOST SEVERE CARD IN THE PRODUCT RESTS ON.
     * ══════════════════════════════════════════════════════════════════════
     *
     * £2 for a listing is almost certainly below cost. EtsyPilot does not know
     * that, because nobody entered a cost — and a CRITICAL card that tells a
     * seller to reprice is the last place to infer one. The default rule is
     * not a substitute either: it is the seller's assumption about listings
     * they have not costed, and an assumption cannot establish a loss.
     */
    await seed(SHOP_A, [order('R1', '770001', 2)], [listing('770001', 2)])
    await writeCostRules(SHOP_A, USER_A, [{ field: 'defaultRulePercent', value: 0.9 }])

    const { actions } = await getActions(ctxFor(SHOP_A))
    expect(actions.map((a) => a.id)).not.toContain('ACT-BELOW-COST')
  })

  it('and the copy does not credit them with a default rule they never set', async () => {
    await seed(SHOP_A, [order('R1', '770001', 48)], [listing('770001', 48)])

    const [card] = (await getActions(ctxFor(SHOP_A))).actions
    expect(card?.explanation).toContain('You have set no default rule')
    expect(card?.explanation).not.toContain('falls back to your default rule')
  })

  it('and names a default rule once the seller has set one', async () => {
    // The converse, so the branch above is measuring the copy and not its absence.
    await seed(SHOP_A, [order('R1', '770001', 48)], [listing('770001', 48)])
    await writeCostRules(SHOP_A, USER_A, [{ field: 'defaultRulePercent', value: 0.38 }])

    const [card] = (await getActions(ctxFor(SHOP_A))).actions
    expect(card?.explanation).toContain('falls back to your default rule')
  })
})

/* ═══════════════════════════════════════════ shape 2: a below-cost listing */

describe('a shop with a listing that loses money on every sale', () => {
  it('leads with it, and measures what it has cost', async () => {
    const ids = await seed(
      SHOP_A,
      [order('R1', '770001', 20, 2), order('R2', '770002', 48)],
      [listing('770001', 20), listing('770002', 48)],
    )
    // £20 priced, £25 to make, £2.10 of fees: £7.10 lost on each of 2 units.
    await writeListingCost(SHOP_A, USER_A, ids.get('770001')!, 25)
    await writeListingCost(SHOP_A, USER_A, ids.get('770002')!, 10)

    const { actions } = await getActions(ctxFor(SHOP_A))
    const card = actions.find((a) => a.id === 'ACT-BELOW-COST')
    expect(card, 'the below-cost listing produced no action').toBeDefined()
    expect(card!.severity).toBe('CRITICAL')
    expect(card!.title).toBe('1 listing is selling below cost')

    // Two units on one order. Both numbers come from this shop's receipts.
    expect(card!.evidence.summary).toContain('1 order')
    expect(card!.evidence.summary).toContain('2 units sold')
    expect(card!.evidence.summary).toContain('£14.20 lost')
    /*
     * The pound sign is the assertion that caught a real defect: the first
     * version of this card called formatCurrency without a currency, so it
     * defaulted to USD and told a GBP seller they had lost "$14.20".
     */
    expect(card!.evidence.summary).not.toContain('$')

    // CRITICAL sorts above the ATTENTION cost-coverage card.
    expect(actions[0]!.id).toBe('ACT-BELOW-COST')
  })

  it('counts only the listings the audit counts', async () => {
    /*
     * The Action Center and /listings/audit must never disagree about which
     * listings are below cost — two places counting the same thing is how
     * DEMO_COUNTS came to say 38 while the ledger showed 52. Both read the
     * same rule through the same function.
     */
    const ids = await seed(
      SHOP_A,
      [order('R1', '770001', 20)],
      [listing('770001', 20), listing('770002', 48), listing('770003', 30)],
    )
    await writeListingCost(SHOP_A, USER_A, ids.get('770001')!, 25)
    await writeListingCost(SHOP_A, USER_A, ids.get('770002')!, 10)
    // 770003 is left uncosted on purpose: it must not be counted either way.

    const { actions } = await getActions(ctxFor(SHOP_A))
    const below = actions.find((a) => a.id === 'ACT-BELOW-COST')
    expect(below!.title).toBe('1 listing is selling below cost')

    const { auditListings } = await import('@/domain/audit/service')
    const { loadListings } = await import('@/domain/listings/load')
    const catalogue = await loadListings(ctxFor(SHOP_A))
    const audit = auditListings(catalogue.listings, [], catalogue.costs)
    expect(audit.results.find((r) => r.rule.code === 'BELOW_COST')?.count).toBe(1)
  })

  it('says nothing has been lost yet when the listing has not sold', async () => {
    /*
     * "£0.00 lost" beside a CRITICAL badge reads as a rounding error rather
     * than as "this has not sold". The card says which.
     */
    const ids = await seed(SHOP_A, [], [listing('770001', 20)])
    await writeListingCost(SHOP_A, USER_A, ids.get('770001')!, 25)

    const card = (await getActions(ctxFor(SHOP_A))).actions.find((a) => a.id === 'ACT-BELOW-COST')
    expect(card!.evidence.summary).toContain('no orders')
    expect(card!.evidence.summary).not.toContain('0.00')
  })

  it('does not reach into another shop for its listings or its costs', async () => {
    const idsA = await seed(SHOP_A, [order('R1', '770001', 20)], [listing('770001', 20)])
    await writeListingCost(SHOP_A, USER_A, idsA.get('770001')!, 25)
    await seed(SHOP_B, [order('R2', '770001', 20)], [listing('770001', 20)])

    const a = await getActions(ctxFor(SHOP_A))
    const b = await getActions(ctxFor(SHOP_B, USER_B))

    expect(a.actions.map((x) => x.id)).toContain('ACT-BELOW-COST')
    // B synced the same Etsy listing id and set no cost for it.
    expect(b.actions.map((x) => x.id)).not.toContain('ACT-BELOW-COST')
    for (const action of [...a.actions, ...b.actions]) {
      expect(action.shopId).toBe(action.shopId === SHOP_A ? SHOP_A : SHOP_B)
    }
  })
})

/* ═════════════════════════════════════════════════ shape 3: a healthy shop */

describe('a shop with nothing wrong', () => {
  it('gets an empty queue, which is what makes the empty state honest', async () => {
    const ids = await seed(
      SHOP_A,
      [order('R1', '770001', 48), order('R2', '770002', 26)],
      [listing('770001', 48), listing('770002', 26)],
    )
    await writeListingCost(SHOP_A, USER_A, ids.get('770001')!, 12)
    await writeListingCost(SHOP_A, USER_A, ids.get('770002')!, 6)

    const { actions, counts, source } = await getActions(ctxFor(SHOP_A))
    expect(source.kind).toBe('SYNCED')
    expect(actions, `a healthy shop was given work: ${actions.map((a) => a.title).join(', ')}`).toEqual([])
    expect(counts).toEqual({ OPEN: 0, DONE: 0, DISMISSED: 0 })
  })

  it('and the queue fills the moment something is actually wrong', async () => {
    /*
     * THE POSITIVE CONTROL. Without it, every assertion above is satisfied by
     * an Action Center that has simply stopped producing anything.
     */
    const ids = await seed(SHOP_A, [order('R1', '770001', 48)], [listing('770001', 48)])
    await writeListingCost(SHOP_A, USER_A, ids.get('770001')!, 12)
    expect((await getActions(ctxFor(SHOP_A))).actions).toEqual([])

    await writeListingCost(SHOP_A, USER_A, ids.get('770001')!, 60)
    const after = await getActions(ctxFor(SHOP_A))
    expect(after.actions.map((a) => a.id)).toEqual(['ACT-BELOW-COST'])
    expect(after.counts.OPEN).toBe(1)
  })
})

/* ══════════════════════════════════════════════ nothing is named that is not there */

describe('no card names anything this shop has no record of', () => {
  const FICTION = [
    'Salman',
    'BE-2288',
    'BE-2291',
    'holiday linens',
    'Wall art',
    'Seasonal section',
    'Ceramic mug',
    'Linen table runner',
    'below your baseline',
  ]

  it('across every shape of shop', async () => {
    const shapes: (() => Promise<unknown>)[] = [
      () => seed(SHOP_A, [order('R1', '770001', 48)], [listing('770001', 48)]),
      () => seed(SHOP_A, [], [listing('770001', 48)]),
      () => seed(SHOP_A, [order('R1', '770001', 48)], []),
    ]

    for (const shape of shapes) {
      await clean()
      await getDb().insert(schema.users).values([{ id: USER_A, email: 'a@ac.test', name: 'Ada Lovelace', displayName: 'Ada L.' }])
      await getDb().insert(schema.shops).values([
        { id: SHOP_A, ownerId: USER_A, name: 'A Shop', currency: 'GBP', isDemo: false, connectionStatus: 'CONNECTED' },
      ])
      // This test re-seeds inside the loop, so the agreement clean() removed
      // has to be put back before anything syncs.
      await acceptTermsFor([SHOP_A], USER_A)
      await shape()

      const { actions } = await getActions(ctxFor(SHOP_A))
      const text = JSON.stringify(actions)
      for (const fiction of FICTION) {
        expect(text, `a card names "${fiction}", which is in the demo dataset`).not.toContain(fiction)
      }
      for (const action of actions) {
        // Rule 2: no name that is not in the data.
        if (action.lastWorkedBy) expect(action.lastWorkedBy).toBe('Ada L.')
        expect(action.completedBy).toBeUndefined()
      }
    }
  })

  it('and attributes cost work to the person who actually did it', async () => {
    /*
     * The positive control for the name rule: when this shop HAS recorded who
     * edited a cost, the card says so — and the name is read from `users`,
     * not from a constant.
     */
    const ids = await seed(
      SHOP_A,
      [order('R1', '770001', 48)],
      [listing('770001', 48), listing('770002', 26)],
    )
    await writeListingCost(SHOP_A, USER_A, ids.get('770001')!, 12)

    const card = (await getActions(ctxFor(SHOP_A))).actions.find(
      (a) => a.id === 'ACT-MISSING-COSTS',
    )
    expect(card!.status).toBe('IN_PROGRESS')
    expect(card!.progress).toEqual({ current: 1, total: 2 })
    expect(card!.lastWorkedBy).toBe('Ada L.')
  })
})

/* ═══════════════════════════════════════════════ unmeasured is not actionable */

describe('a finding nobody could measure is not work', () => {
  it('leaves Shop Pulse with no recorded changes to invent', async () => {
    /*
     * `events` is empty for this shop — nothing writes it yet — so there are
     * no recorded changes. Before this, Shop Pulse filtered DEMO_EVENTS and
     * produced four, each one diagnosed UNKNOWN for want of data and rendered
     * as a CRITICAL "orders fell" card.
     */
    await seed(SHOP_A, [order('R1', '770001', 48)], [listing('770001', 48)])

    const pulse = await getShopPulse(ctxFor(SHOP_A))
    expect(pulse.changes).toEqual([])

    const { actions } = await getActions(ctxFor(SHOP_A))
    expect(actions.filter((a) => a.id.startsWith('ACT-PULSE'))).toEqual([])
  })

  it('and builds a recorded change from this shop’s own event rows', async () => {
    /*
     * The positive control: the live path is a real generator, not a deleted
     * one. One event row, and Shop Pulse reports one recorded change named
     * from it. It still produces no ACTION, because two orders cannot support
     * a rate comparison — which is the distinction this whole describe is
     * about.
     */
    const ids = await seed(SHOP_A, [order('R1', '770001', 48)], [listing('770001', 48)])
    await getDb().insert(schema.events).values({
      eventId: 'ev-ac-1',
      shopId: SHOP_A,
      listingId: ids.get('770001')!,
      actorId: USER_A,
      timestamp: new Date('2026-07-18T09:00:00.000Z'),
      type: 'PRICE_CHANGED',
      source: 'MANUAL',
      field: 'price',
      beforeValue: '40.00',
      afterValue: '48.00',
      operationId: null,
      reason: null,
    })

    const pulse = await getShopPulse(ctxFor(SHOP_A))
    expect(pulse.changes).toHaveLength(1)
    expect(pulse.changes[0]!.title).toBe('Price changed on 1 listing')
    expect(pulse.changes[0]!.scope).toBe('1 listing')
    // Not measurable on one order, so no percentage is published and no action.
    expect(pulse.changes[0]!.ordersAfterPercent).toBeNull()

    const { actions } = await getActions(ctxFor(SHOP_A))
    expect(actions.filter((a) => a.id.startsWith('ACT-PULSE'))).toEqual([])
  })

  it('and reports baseline coverage it measured rather than the fixture’s', async () => {
    await seed(SHOP_A, [order('R1', '770001', 48)], [listing('770001', 48), listing('770002', 26)])

    const pulse = await getShopPulse(ctxFor(SHOP_A))
    // Not 88, which is DEMO_BASELINE.coveragePercent.
    expect(pulse.orders.coveragePercent).toBe(0)
    expect(pulse.orders.listingsTooNew, 'claimed to know which listings are new').toBeNull()
    expect(pulse.orders.coverageNote).toContain('2 of 2 active listings')
  })
})

/* ══════════════════════════════════════════════════════════════ demo mode */

describe('demo mode is unchanged, and reads no database rows', () => {
  it('serves all four authored actions without touching a table', async () => {
    delete process.env.ETSY_MODE
    setEtsyService(null)

    const db = await import('@/lib/db')
    const spy = vi.spyOn(db, 'getDb')

    const { actions, counts } = await getActions(ctxFor('demo-shop'))

    expect(spy, 'demo mode touched the database').not.toHaveBeenCalled()
    expect(actions.map((a) => a.id)).toEqual(
      expect.arrayContaining(['ACT-0001', 'ACT-0002', 'ACT-0003', 'ACT-0004']),
    )
    expect(counts.DONE).toBe(1)
    expect(counts.DISMISSED).toBe(1)

    /*
     * THE POSITIVE CONTROL, on the same spy. The costs slice found this guard
     * blind once already — a `vi.resetModules()` earlier in that file had put
     * the spy on a module instance nothing under test was using — so "zero
     * calls" is only a measurement if the pair can see a call at all.
     */
    process.env.ETSY_MODE = 'live'
    await getActions(ctxFor(SHOP_A))
    expect(spy, 'the spy cannot see a database read, so the assertion above is empty').toHaveBeenCalled()
  })
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
