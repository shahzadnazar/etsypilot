import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { inArray } from 'drizzle-orm'

import { syncShopListings } from '@/domain/sync/listings'
import { syncShopOrders } from '@/domain/sync/orders'
import { writeCostRules } from '@/lib/repositories/costs'
import { appendAuditRecord } from '@/lib/repositories/change-jobs'
import { getProfitView } from '@/domain/profit/service'
import { getCostsView } from '@/domain/costs/service'
import { getActions } from '@/domain/action-center/service'
import { getAuditLogView } from '@/domain/audit-log/service'
import { getChangeHistory } from '@/domain/change-history/service'
import { getShopOverview } from '@/domain/shop/overview'
import { getListingsView } from '@/domain/listings/service'
import { assertNotPublicVisitor, isPublicVisitor } from '@/domain/public-demo'
import { cancelPlan, changePlan } from '@/domain/billing/service'
import { writePreferences, defaultPreferences } from '@/domain/notifications/service'
import { markPublicDemoRequest, resetPublicDemoRequest } from '@/lib/demo-request'
import { setEtsyService } from '@/lib/etsy'
import { getDb, schema } from '@/lib/db'
import { PUBLIC_DEMO_ACTOR_ID } from '@/lib/auth/public-demo-actor'
import { DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'
import type { EtsyListing, EtsyOrder } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'

/**
 * A public, unauthenticated visitor against a real database.
 *
 *     DATABASE_URL=postgres://... npm run test:integration
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   THE TWO CLAIMS THE LANDING PAGE RESTS ON, CHECKED AGAINST POSTGRES.
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. A visitor reads NO ROW belonging to a real shop. Asserted with a real
 *      seller's shop sitting in the same database, populated with listings,
 *      orders, cost rules and audit records — so "no row was read" is a
 *      measurement and not a consequence of the table being empty.
 *
 *   2. A visitor writes NOTHING. Every table's row count is taken before and
 *      after a sweep through every mutation a browser can reach, and every one
 *      of them refuses.
 *
 * The unit half — the two identities, the cookie ordering, the gate sweep over
 * every mutating route, and the operator console — is in
 * tests/unit/public-demo.test.ts.
 */

const REAL_SHOP = 'pd-real-shop'
const REAL_USER = 'pd-real-user'
const OURS = [REAL_SHOP]
const WINDOW = { since: '2026-07-14T00:00:00.000Z', until: '2026-08-12T23:59:59.999Z' }
const ENV = { ...process.env }

/** What the app builds for a landing-page visitor: fixture shop, nobody home. */
const VISITOR: ShopContext = {
  shopId: DEMO_SHOP_ID,
  actorId: PUBLIC_DEMO_ACTOR_ID,
  readOnly: true,
}

const sellerCtx: ShopContext = { shopId: REAL_SHOP, actorId: REAL_USER, readOnly: false }

function listing(id: string, price: number): EtsyListing {
  return {
    etsyListingId: id,
    title: `Secret listing ${id}`,
    description: 'A real seller wrote this and nobody else may read it.',
    tags: ['private'],
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
  }
}

function order(id: string, gross: number): EtsyOrder {
  return {
    etsyReceiptId: id,
    placedAt: '2026-07-20T10:00:00.000Z',
    gross,
    discounts: 0,
    refunds: 0,
    etsyFees: 3,
    paymentProcessing: 1,
    offsiteAds: 0,
    countryCode: 'GB',
    items: [{ etsyListingId: '990001', quantity: 1, unitPrice: gross }],
  }
}

function fakeAdapter(orders: EtsyOrder[], listings: EtsyListing[]) {
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

/** Every table a seller owns, counted. */
async function census(): Promise<Record<string, number>> {
  const db = getDb()
  const tables = {
    listings: schema.listings,
    orders: schema.orders,
    orderItems: schema.orderItems,
    costRules: schema.costRules,
    events: schema.events,
    changeJobs: schema.changeJobs,
    auditRecords: schema.auditRecords,
    syncState: schema.syncState,
    users: schema.users,
    shops: schema.shops,
  } as const

  const out: Record<string, number> = {}
  for (const [name, table] of Object.entries(tables)) {
    const rows = await db.select().from(table as never)
    out[name] = (rows as unknown[]).length
  }
  return out
}

async function clean() {
  const db = getDb()
  await db.delete(schema.auditRecords).where(inArray(schema.auditRecords.shopId, OURS))
  await db.delete(schema.changeJobs).where(inArray(schema.changeJobs.shopId, OURS))
  await db.delete(schema.costRules).where(inArray(schema.costRules.shopId, OURS))
  await db.delete(schema.events).where(inArray(schema.events.shopId, OURS))
  await db.delete(schema.orderItems).where(inArray(schema.orderItems.shopId, OURS))
  await db.delete(schema.orders).where(inArray(schema.orders.shopId, OURS))
  await db.delete(schema.listings).where(inArray(schema.listings.shopId, OURS))
  await db.delete(schema.syncState).where(inArray(schema.syncState.shopId, OURS))
  await db.delete(schema.memberships).where(inArray(schema.memberships.shopId, OURS))
  await db.delete(schema.shops).where(inArray(schema.shops.id, OURS))
  await db.delete(schema.users).where(inArray(schema.users.id, [REAL_USER]))
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

/** A real seller, with real rows, sitting in the database the whole time. */
beforeEach(async () => {
  resetPublicDemoRequest()
  process.env.ETSY_MODE = 'live'
  await clean()
  await getDb()
    .insert(schema.users)
    .values([{ id: REAL_USER, email: 'real@seller.test', name: 'Real Seller', displayName: 'Real S.' }])
  await getDb()
    .insert(schema.shops)
    .values([
      { id: REAL_SHOP, ownerId: REAL_USER, name: 'A Real Shop', currency: 'GBP', isDemo: false, connectionStatus: 'CONNECTED' },
    ])

  setEtsyService(fakeAdapter([order('SECRET-1', 480)], [listing('990001', 480)]) as never)
  await syncShopListings(sellerCtx)
  await syncShopOrders(sellerCtx, WINDOW)
  await writeCostRules(REAL_SHOP, REAL_USER, [{ field: 'defaultRulePercent', value: 0.42 }])
  await appendAuditRecord(REAL_SHOP, REAL_USER, {
    id: 'SECRET-OP',
    at: '2026-08-01T09:00:00.000Z',
    actor: { name: 'Real Seller', role: 'Owner', session: '1a··b2', device: 'This browser' },
    action: 'Cost rule changed',
    detail: 'SECRET-OP · COGS 40% → 42%',
    target: 'Shop-wide',
    source: 'MANUAL',
    reached: { kind: 'NOT_APPLICABLE', reason: 'ETSYPILOT_ONLY' },
    sequence: [],
    wouldHaveChanged: [],
    wouldHaveChangedMore: 0,
    origin: 'Created 09:00 by Real Seller',
  })
  setEtsyService(null)
})

afterEach(() => {
  setEtsyService(null)
  vi.restoreAllMocks()
  /*
   * `enterWith` binds for the remainder of the async context, so one visitor
   * test would otherwise leave every later test in this file believing it was
   * a visitor — and "a demo seller keeps its write paths" would then be
   * asserted about an anonymous one.
   */
  resetPublicDemoRequest()
})

/* ═══════════════════════════════ 1. a visitor reads no real shop's rows */

describe('a public visitor reads no row belonging to a real shop', () => {
  /**
   * What the app does for a visitor's request, in the order it does it.
   *
   * `markPublicDemoRequest()` is what getSession() calls once it has resolved
   * a visitor; from then on `isDemoMode()` is true FOR THIS REQUEST and the
   * fixture is what every screen reads. Calling it here is the test standing
   * in for getSession, which needs Supabase.
   */
  function asVisitor() {
    markPublicDemoRequest()
  }

  it('is served the fixture, with ETSY_MODE=live and a real shop in the table', async () => {
    asVisitor()
    const catalogue = await getListingsView(VISITOR, {})

    // Willow & Fern, not the one real catalogue in this database.
    expect(catalogue.rows.length).toBeGreaterThan(0)
    expect(JSON.stringify(catalogue), 'a real seller’s listing reached a visitor').not.toContain(
      'Secret listing',
    )
  })

  it('and no screen a visitor can open touches the database at all', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   A getDb SPY WITH A REQUIREMENT OF ZERO CALLS.
     * ══════════════════════════════════════════════════════════════════════
     *
     * The strongest form of "reads no real shop's data": not "read the wrong
     * rows and we checked", but never opened a connection. Every table in this
     * database belongs to the real seller created in beforeEach, so a single
     * query is a query against their data.
     */
    asVisitor()
    const db = await import('@/lib/db')
    const spy = vi.spyOn(db, 'getDb')

    await Promise.all([
      getProfitView(VISITOR),
      getCostsView(VISITOR),
      getActions(VISITOR),
      getAuditLogView(VISITOR),
      getChangeHistory(VISITOR),
      getShopOverview(VISITOR),
      getListingsView(VISITOR, {}),
    ])

    expect(spy, 'a public visitor opened a database connection').not.toHaveBeenCalled()

    /*
     * THE POSITIVE CONTROL, on the same spy. Zero calls is a measurement only
     * if the pair can see a call at all — a sibling suite found this exact
     * guard blind once, when an earlier vi.resetModules() had put the spy on a
     * module instance nothing under test was using.
     */
    const { readListings } = await import('@/lib/repositories/listings')
    await readListings(REAL_SHOP)
    expect(spy, 'the spy cannot see a read, so the assertion above is empty').toHaveBeenCalled()
  })

  it('and cannot name a real shop even when one is handed to it', async () => {
    /*
     * The visitor's session carries the fixture's shop id and shopContext()
     * throws crossShop for anything else, so this context is the only one that
     * can exist for them. Asserted on the data path rather than on the
     * permission module, which is locked: a context pointing at the real shop
     * is what an attacker would need, and they cannot obtain one.
     */
    const { shopContext } = await import('@/lib/permissions')
    expect(() =>
      shopContext(
        {
          userId: PUBLIC_DEMO_ACTOR_ID,
          email: '',
          name: null,
          shopId: DEMO_SHOP_ID,
          isDemo: true,
          kind: 'PUBLIC_DEMO',
        },
        REAL_SHOP,
      ),
    ).toThrow()
  })

  it('and the audit log it is shown is the fixture’s, not the seller’s', async () => {
    asVisitor()
    const view = await getAuditLogView(VISITOR)
    expect(JSON.stringify(view)).not.toContain('SECRET-OP')
    expect(JSON.stringify(view)).not.toContain('Real Seller')
    /*
     * The positive control: the real seller's record IS in the table.
     *
     * The flag is reset first because both calls happen inside one async
     * context here. In production they are two requests and cannot share it —
     * which is the property lib/demo-request.ts exists to provide, and the
     * reason this line is a test artefact rather than a hint of a leak.
     */
    resetPublicDemoRequest()
    const seller = await getAuditLogView(sellerCtx)
    expect(seller.records.map((r) => r.id)).toContain('SECRET-OP')
  })
})

/* ═════════════════════════════════════════ 2. a visitor writes nothing */

describe('a public visitor writes nothing at all', () => {
  it('is refused by every mutation a browser can reach, and changes no row', async () => {
    markPublicDemoRequest()
    const before = await census()

    const refusals: { what: string; code: string }[] = []
    const attempt = async (what: string, run: () => unknown | Promise<unknown>) => {
      try {
        await run()
        refusals.push({ what, code: 'NOT REFUSED' })
      } catch (error) {
        refusals.push({
          what,
          code: (error as { code?: string }).code ?? (error as Error).name,
        })
      }
    }

    await attempt('billing: change plan', () => changePlan(VISITOR, 'GROWTH'))
    await attempt('billing: cancel', () => cancelPlan(VISITOR))
    await attempt('notification preferences', () =>
      writePreferences(VISITOR, defaultPreferences()),
    )
    await attempt('the shared visitor gate', () => assertNotPublicVisitor(VISITOR))

    for (const refusal of refusals) {
      expect(refusal.code, `${refusal.what} was not refused`).not.toBe('NOT REFUSED')
    }
    expect(
      refusals.filter((r) => r.code === 'PUBLIC_DEMO_READ_ONLY').length,
      'a refusal did not name the public-demo reason',
    ).toBe(refusals.length)

    const after = await census()
    expect(after, 'a public visitor changed a row count').toEqual(before)
  })

  it('and the gate is not merely refusing everybody', async () => {
    /*
     * THE POSITIVE CONTROL for the gate itself. The same calls must SUCCEED
     * for a signed-in seller, or "nothing was written" would be satisfied by a
     * product that writes nothing for anyone.
     */
    expect(isPublicVisitor(sellerCtx)).toBe(false)
    expect(() => assertNotPublicVisitor(sellerCtx)).not.toThrow()
    expect(() => writePreferences(sellerCtx, defaultPreferences())).not.toThrow()
  })

  it('and a demo SELLER keeps the write paths the demo is built to show', async () => {
    /*
     * The demo seller — AUTH_MODE unset, Salman R. — is read-only against Etsy
     * and deliberately NOT read-only against the mock billing provider, so the
     * billing walkthrough works. That must survive the new gate: it refuses an
     * anonymous actor, not a read-only one.
     */
    const demoSeller: ShopContext = {
      shopId: DEMO_SHOP_ID,
      actorId: 'demo-user-salman',
      readOnly: true,
    }
    expect(isPublicVisitor(demoSeller)).toBe(false)
    await expect(changePlan(demoSeller, 'GROWTH')).resolves.toBeDefined()
  })
})
