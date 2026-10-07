import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'

import {
  appendAuditRecord,
  countAuditRecords,
  countChangeJobs,
  readAuditRecords,
  readChangeJobs,
  writeChangeJob,
} from '@/lib/repositories/change-jobs'
import { getChangeHistory } from '@/domain/change-history/service'
import { getAuditLogView } from '@/domain/audit-log/service'
import { getShopOverview } from '@/domain/shop/overview'
import { getSecurityView } from '@/domain/security/service'
import { syncShopListings } from '@/domain/sync/listings'
import { syncShopOrders } from '@/domain/sync/orders'
import { setEtsyService } from '@/lib/etsy'
import { getDb, schema } from '@/lib/db'
import type { AuditRecord } from '@/domain/audit-log/types'
import type { ChangeJob } from '@/domain/change-history/types'
import type { EtsyListing, EtsyOrder } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'

/**
 * The two immutable trails, and the three screens that were showing a
 * stranger's.
 *
 *     DATABASE_URL=postgres://... npm run test:integration
 *
 * ── WHAT A LIVE SELLER SAW BEFORE THIS ───────────────────────────────────
 *
 *   /settings/audit-log   eight records by "Salman", under "Records are
 *                         immutable and cannot be edited or deleted", one of
 *                         them asserting a published change reached Etsy.
 *   /listings/change-history   HTTP 500.
 *   /dashboard            "Gross sales $74.00 ▼ 99.6% vs baseline $20,287.00".
 *   /settings/security    "Connected as salman@willowandfern.com" and three
 *                         active sessions in Dhaka.
 *
 * ── THE CLAIMS THAT MATTER ───────────────────────────────────────────────
 *
 *   a record survives the process that wrote it, and a second instance reads
 *     the same one — which is what "immutable" has to mean
 *   one shop's trail is invisible to another
 *   the sequence is assigned by the store and never repeats
 *   the dashboard compares against this shop's own previous period, or says
 *     there isn't one
 *   the security page invents no session
 *   demo mode reads NO database rows and keeps its narrative
 */

const SHOP_A = 'ch-test-shop-a'
const SHOP_B = 'ch-test-shop-b'
const USER_A = 'ch-test-user-a'
const USER_B = 'ch-test-user-b'
const OURS = [SHOP_A, SHOP_B]

const WINDOW = { since: '2026-07-14T00:00:00.000Z', until: '2026-08-12T23:59:59.999Z' }
const ENV = { ...process.env }

const ctxFor = (shopId: string, actorId = USER_A): ShopContext => ({
  shopId,
  actorId,
  readOnly: false,
})

function job(id: string, overrides: Partial<ChangeJob> = {}): ChangeJob {
  return {
    id,
    at: '2026-08-01T09:00:00.000Z',
    actor: 'Ada L.',
    source: 'BULK_EDIT',
    summary: 'Price +8%',
    items: [
      {
        listingId: '770001',
        listingTitle: 'Linen napkin set',
        field: 'price',
        before: '44.00',
        after: '48.00',
        status: 'SUCCEEDED',
      },
    ],
    ...overrides,
  }
}

function record(id: string, overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    id,
    at: '2026-08-01T09:00:00.000Z',
    actor: { name: 'Ada L.', role: 'Owner', session: '2a··f1', device: 'This browser' },
    action: 'Cost rule changed',
    detail: `${id} · COGS 36% → 38%`,
    target: 'Shop-wide',
    source: 'MANUAL',
    reached: { kind: 'NOT_APPLICABLE', reason: 'ETSYPILOT_ONLY' },
    sequence: [],
    wouldHaveChanged: [],
    wouldHaveChangedMore: 0,
    origin: 'Created 09:00 by Ada L.',
    ...overrides,
  }
}

function listing(id: string, price: number, renewsAt: string | null = null): EtsyListing {
  return {
    etsyListingId: id,
    title: `Listing ${id}`,
    description: 'A description long enough to be unremarkable.',
    tags: ['handmade'],
    price,
    quantity: 7,
    state: 'ACTIVE',
    section: null,
    sku: null,
    attributes: {},
    requiredAttributes: [],
    photoCount: 3,
    renewsAt,
    lastChangedAt: '2026-06-01T00:00:00.000Z',
    hasVariations: false,
    variationSummary: null,
  }
}

function order(id: string, placedAt: string, gross: number): EtsyOrder {
  return {
    etsyReceiptId: id,
    placedAt,
    gross,
    discounts: 0,
    refunds: 0,
    etsyFees: 3,
    paymentProcessing: 1,
    offsiteAds: 0,
    countryCode: 'GB',
    items: [{ etsyListingId: '770001', quantity: 1, unitPrice: gross }],
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
      { id: USER_A, email: 'a@ch.test', name: 'Ada Lovelace', displayName: 'Ada L.' },
      { id: USER_B, email: 'b@ch.test', name: 'B', displayName: 'B' },
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
  vi.restoreAllMocks()
})

/* ═══════════════════════════════════════════════ the trails are persistent */

describe('a record survives the process that wrote it', () => {
  it('is in the table, not in this process', async () => {
    /*
     * The defect, in one assertion. Both stores were Maps on a global Symbol.
     * Reading back through the same imported function passes against a Map —
     * which is why both survived a full suite — so the row is read with a
     * statement of this test's own.
     */
    await writeChangeJob(SHOP_A, USER_A, job('BE-1'))
    await appendAuditRecord(SHOP_A, USER_A, record('OP-1'))

    const jobRows = await getDb()
      .select({ id: schema.changeJobs.id, actorName: schema.changeJobs.actorName })
      .from(schema.changeJobs)
      .where(eq(schema.changeJobs.shopId, SHOP_A))
    expect(jobRows).toHaveLength(1)
    expect(jobRows[0]!.actorName).toBe('Ada L.')

    const auditRows = await getDb()
      .select({ seq: schema.auditRecords.seq, reached: schema.auditRecords.reachedKind })
      .from(schema.auditRecords)
      .where(eq(schema.auditRecords.shopId, SHOP_A))
    expect(auditRows).toEqual([{ seq: 0, reached: 'NOT_APPLICABLE' }])
  })

  it('assigns the sequence itself, and never repeats one', async () => {
    /*
     * `seq` is half of a record's address — domain/audit-log/types.ts records
     * the collision that created it, where "two rollback refusals a moment
     * apart carried the same operation id and the same millisecond".
     */
    await appendAuditRecord(SHOP_A, USER_A, record('BE-2291'))
    await appendAuditRecord(SHOP_A, USER_A, record('BE-2291'))
    await appendAuditRecord(SHOP_A, USER_A, record('BE-2291'))

    const records = await readAuditRecords(SHOP_A)
    expect(records.map((r) => r.seq).sort()).toEqual([0, 1, 2])
    // Same operation id on all three, which is exactly why seq exists.
    expect(new Set(records.map((r) => r.id)).size).toBe(1)
  })

  it('refuses to rewrite a job that is already recorded', async () => {
    await writeChangeJob(SHOP_A, USER_A, job('BE-1', { summary: 'Price +8%' }))
    await writeChangeJob(SHOP_A, USER_A, job('BE-1', { summary: 'TAMPERED' }))

    const jobs = await readChangeJobs(SHOP_A)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.summary, 'a retry rewrote an immutable record').toBe('Price +8%')
  })

  it('keeps one shop out of another shop’s trail', async () => {
    await writeChangeJob(SHOP_A, USER_A, job('BE-1'))
    await appendAuditRecord(SHOP_A, USER_A, record('OP-1'))
    await writeChangeJob(SHOP_B, USER_B, job('BE-2'))

    expect((await readChangeJobs(SHOP_A)).map((j) => j.id)).toEqual(['BE-1'])
    expect((await readChangeJobs(SHOP_B)).map((j) => j.id)).toEqual(['BE-2'])
    expect(await countAuditRecords(SHOP_B)).toBe(0)
    // And B's sequence starts at zero, independent of A's.
    await appendAuditRecord(SHOP_B, USER_B, record('OP-2'))
    expect((await readAuditRecords(SHOP_B))[0]!.seq).toBe(0)
  })
})

/* ═══════════════════════════════════════ the screens read the shop's own */

describe('the change history page', () => {
  it('renders instead of returning 500, and shows this shop’s jobs', async () => {
    /*
     * The page returned HTTP 500 to a live seller because the service asked
     * the Etsy adapter for a catalogue it has no API key for. It is the page a
     * seller opens to find out what EtsyPilot changed, and the only place a
     * write can be undone.
     */
    setEtsyService(fakeAdapter([], [listing('770001', 48)]) as never)
    await syncShopListings(ctxFor(SHOP_A))
    await writeChangeJob(SHOP_A, USER_A, job('BE-1'))

    const view = await getChangeHistory(ctxFor(SHOP_A))
    expect(view.rows.map((r) => r.job.id)).toEqual(['BE-1'])
    expect(view.rows[0]!.job.actor).toBe('Ada L.')
    // Not DEMO_NOW. The window countdown is measured from the real clock.
    expect(Date.parse(view.now)).toBeGreaterThan(Date.parse('2026-08-12T14:06:00.000Z'))
  })

  it('and is empty for a shop that has changed nothing', async () => {
    setEtsyService(fakeAdapter([], [listing('770001', 48)]) as never)
    await syncShopListings(ctxFor(SHOP_A))

    const view = await getChangeHistory(ctxFor(SHOP_A))
    expect(view.rows).toEqual([])
    expect(await countChangeJobs(SHOP_A)).toBe(0)
  })
})

describe('the audit log', () => {
  it('shows this shop’s records and nobody else’s', async () => {
    await appendAuditRecord(SHOP_A, USER_A, record('OP-1'))

    const view = await getAuditLogView(ctxFor(SHOP_A))
    const text = JSON.stringify(view)
    expect(view.records.map((r: AuditRecord) => r.id)).toEqual(['OP-1'])
    for (const fiction of ['Salman', 'BE-2291', 'Linen table runner', 'SY-4410']) {
      expect(text, `the audit log names "${fiction}"`).not.toContain(fiction)
    }
  })

  it('and is empty for a shop nothing has happened on', async () => {
    const view = await getAuditLogView(ctxFor(SHOP_A))
    expect(view.records).toEqual([])
  })
})

/* ════════════════════════════════════ the dashboard compares against itself */

describe('the dashboard baseline', () => {
  it('says there is no earlier period rather than inventing one', async () => {
    /*
     * Measured in a browser before this: "Gross sales $74.00 ▼ 99.6% vs
     * baseline $20,287.00" — Willow & Fern's 90-day revenue, on the first
     * screen a real seller sees after signing in.
     */
    setEtsyService(fakeAdapter([order('R1', '2026-07-20T10:00:00.000Z', 48)], []) as never)
    await syncShopOrders(ctxFor(SHOP_A), WINDOW)

    const view = await getShopOverview(ctxFor(SHOP_A))
    const gross = view.metrics.find((m) => m.key === 'gross')!
    expect(gross.deltaPercent).toBeNull()
    expect(gross.note).toBe('No earlier period to compare against yet')
    expect(JSON.stringify(view)).not.toContain('20287')
  })

  it('and compares against it once there is one', async () => {
    /*
     * THE POSITIVE CONTROL. Without it the assertion above is satisfied by a
     * dashboard that has stopped comparing anything at all. The prior window
     * is the 30 days before the reporting period, same as /analytics.
     */
    setEtsyService(
      fakeAdapter([
        order('R1', '2026-07-20T10:00:00.000Z', 100),
        order('PRIOR', '2026-06-20T10:00:00.000Z', 200),
      ]) as never,
    )
    await syncShopOrders(
      ctxFor(SHOP_A),
      { since: '2026-06-01T00:00:00.000Z', until: WINDOW.until },
    )

    const view = await getShopOverview(ctxFor(SHOP_A))
    const gross = view.metrics.find((m) => m.key === 'gross')!
    // Shop A is GBP. The note takes the shop's currency, not a default.
    expect(gross.note).toBe('vs £200.00 the period before')
    expect(gross.deltaPercent).toBe(-50)
  })
})

/* ═══════════════════════════════════════════════════ the security page */

describe('the security page invents nothing', () => {
  it('lists no session and no sign-in for a real account', async () => {
    /*
     * An adapter is set because getSecurityView asks the selector for the
     * connection's mode and write capability — which is what that function is
     * for. Under vitest the live adapter cannot be constructed (`live.ts` is
     * loaded with require() so the server-only marker stays out of the test
     * module graph), so the fake stands in for it.
     */
    setEtsyService(fakeAdapter([], []) as never)
    const view = await getSecurityView(ctxFor(SHOP_A))
    expect(view.sessions).toEqual([])
    expect(view.events).toEqual([])
    expect(view.googleConnectedAs).toBeNull()
    expect(view.passwordChangedOn).toBeNull()
    expect(JSON.stringify(view)).not.toContain('willowandfern')
    expect(JSON.stringify(view)).not.toContain('Dhaka')
  })
})

/* ══════════════════════════════════════════════════════════════ demo mode */

describe('demo mode is unchanged, and reads no database rows', () => {
  it('serves the authored trails without touching a table', async () => {
    delete process.env.ETSY_MODE
    setEtsyService(null)

    const db = await import('@/lib/db')
    const spy = vi.spyOn(db, 'getDb')

    const audit = await getAuditLogView(ctxFor('demo-shop'))
    const security = await getSecurityView(ctxFor('demo-shop'))

    expect(spy, 'demo mode touched the database').not.toHaveBeenCalled()
    expect(audit.records.length).toBeGreaterThan(0)
    expect(audit.records.some((r: AuditRecord) => r.actor.name === 'Salman')).toBe(true)
    expect(security.googleConnectedAs).toBe('salman@willowandfern.com')
    expect(security.sessions).toHaveLength(3)

    /*
     * THE POSITIVE CONTROL, on the same spy. "Zero calls" is a measurement
     * only if the pair can see a call at all — the costs slice found this
     * exact guard blind once already.
     */
    process.env.ETSY_MODE = 'live'
    await getAuditLogView(ctxFor(SHOP_A))
    expect(spy, 'the spy cannot see a database read, so the assertion above is empty').toHaveBeenCalled()
  })
})
