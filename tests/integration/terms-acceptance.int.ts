import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, inArray, sql } from 'drizzle-orm'

import * as schema from '@/db/schema'
import { getDb } from '@/lib/db'
import {
  appendTermsAcceptance,
  latestAcceptance,
  shopHasAcceptedVersion,
} from '@/lib/repositories/terms-acceptances'
import { applicationTermsVersion } from '@/domain/legal/acceptance'
import { setLegalDocumentsForTests } from '@/lib/legal/documents'
import { setEtsyService } from '@/lib/etsy'
import { syncShopListings } from '@/domain/sync/listings'
import { acceptTermsFor, restoreRealLegalDocuments } from '../support/legal'

/**
 * Per-seller acceptance of the Application Terms, against a real database.
 *
 *     DATABASE_URL=postgres://... npm run test:integration
 *
 * Etsy's API Terms §4 requires executed Application Terms with each Etsy
 * seller, and names the penalty for not having them: suspended or terminated
 * API access. So the claims here are the ones that would matter in that
 * conversation:
 *
 *   - the record exists per shop, and one shop's acceptance is not another's
 *   - a changed document is a different version, so the seller is asked again
 *   - a repeat accept does not move the date of the original agreement
 *   - nothing can edit or delete an acceptance, enforced by the database
 *   - the table has row-level security, like every other table
 */

const SHOP_A = 'ta-test-shop-a'
const SHOP_B = 'ta-test-shop-b'
const USER_A = 'ta-test-user-a'
const USER_B = 'ta-test-user-b'

/** A plausible content hash: 64 hex characters, which the table checks. */
const hash = (seed: string) =>
  seed.padEnd(64, '0').slice(0, 64).replace(/[^0-9a-f]/g, 'a')

const V1 = hash('1b1')
const V2 = hash('2c2')

const OURS = [SHOP_A, SHOP_B]

async function clean() {
  const db = getDb()
  await db.delete(schema.termsAcceptances).where(inArray(schema.termsAcceptances.shopId, OURS))
  // The sync test below writes listings and a sync_state row, both of which
  // reference the shop, so they go before the shop can.
  await db.delete(schema.listings).where(inArray(schema.listings.shopId, OURS))
  await db.delete(schema.syncState).where(inArray(schema.syncState.shopId, OURS))
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('These tests need DATABASE_URL pointing at a migrated database.')
  }
  await clean()
  const db = getDb()
  await db.delete(schema.shops).where(inArray(schema.shops.id, OURS))
  await db.delete(schema.users).where(inArray(schema.users.id, [USER_A, USER_B]))
  await db.insert(schema.users).values([
    { id: USER_A, email: 'a@ta.test', name: 'Ada' },
    { id: USER_B, email: 'b@ta.test', name: 'Bo' },
  ])
  await db.insert(schema.shops).values([
    { id: SHOP_A, ownerId: USER_A, name: 'A Shop', currency: 'GBP', isDemo: false, connectionStatus: 'CONNECTED' },
    { id: SHOP_B, ownerId: USER_B, name: 'B Shop', currency: 'USD', isDemo: false, connectionStatus: 'CONNECTED' },
  ])
})

beforeEach(clean)

afterAll(async () => {
  await clean()
  const db = getDb()
  await db.delete(schema.shops).where(inArray(schema.shops.id, OURS))
  await db.delete(schema.users).where(inArray(schema.users.id, [USER_A, USER_B]))
})

describe('an acceptance is recorded per seller', () => {
  it('records which version, and who accepted it', async () => {
    const written = await appendTermsAcceptance({
      shopId: SHOP_A,
      userId: USER_A,
      version: V1,
      documents: [{ slug: 'terms', title: 'Terms of Service', hash: hash('aaa') }],
    })
    expect(written).toBe(true)

    const latest = await latestAcceptance(SHOP_A)
    expect(latest?.version).toBe(V1)
    expect(latest?.userId).toBe(USER_A)
    expect(latest?.documents[0]?.slug).toBe('terms')
    expect(latest?.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('does not leak one shop’s acceptance to another', async () => {
    /*
     * The cross-shop property the whole product is built on, at the one table
     * where getting it wrong would mean telling Etsy that a seller accepted
     * terms they never saw.
     */
    await appendTermsAcceptance({ shopId: SHOP_A, userId: USER_A, version: V1, documents: [] })

    expect(await shopHasAcceptedVersion(SHOP_A, V1)).toBe(true)
    expect(
      await shopHasAcceptedVersion(SHOP_B, V1),
      'shop B is covered by shop A’s acceptance',
    ).toBe(false)
    expect(await latestAcceptance(SHOP_B)).toBeNull()
  })

  it('covers a shop for the version accepted and no other', async () => {
    await appendTermsAcceptance({ shopId: SHOP_A, userId: USER_A, version: V1, documents: [] })
    expect(await shopHasAcceptedVersion(SHOP_A, V1)).toBe(true)
    /*
     * The re-ask, which is the "material change" requirement: the documents
     * change, the hash changes, and the shop is no longer covered — without
     * anybody remembering to invalidate anything.
     */
    expect(
      await shopHasAcceptedVersion(SHOP_A, V2),
      'a changed document still reads as accepted',
    ).toBe(false)
  })

  it('covers the shop, not only the person who clicked', async () => {
    /*
     * A two-person shop does not need both members to accept before either
     * can sync: the agreement is with the seller. Which human clicked is still
     * on the row.
     */
    await appendTermsAcceptance({ shopId: SHOP_A, userId: USER_A, version: V1, documents: [] })
    expect(await shopHasAcceptedVersion(SHOP_A, V1)).toBe(true)
    const latest = await latestAcceptance(SHOP_A)
    expect(latest?.userId).toBe(USER_A)
  })
})

describe('the record is append-only, and the database enforces it', () => {
  it('treats a repeat accept as a no-op rather than a second row', async () => {
    await appendTermsAcceptance({ shopId: SHOP_A, userId: USER_A, version: V1, documents: [] })
    const first = await latestAcceptance(SHOP_A)

    const again = await appendTermsAcceptance({
      shopId: SHOP_A,
      userId: USER_A,
      version: V1,
      documents: [],
    })
    expect(again, 'a repeat accept wrote a second row').toBe(false)

    const rows = await getDb()
      .select({ id: schema.termsAcceptances.id })
      .from(schema.termsAcceptances)
      .where(eq(schema.termsAcceptances.shopId, SHOP_A))
    expect(rows).toHaveLength(1)

    /*
     * And the ORIGINAL timestamp survives. This is why the conflict does
     * nothing rather than updating: the date an agreement was made is the one
     * field whose value depends on it not moving.
     */
    expect((await latestAcceptance(SHOP_A))?.acceptedAt).toBe(first?.acceptedAt)
  })

  it('keeps both versions when the documents change and the seller re-accepts', async () => {
    await appendTermsAcceptance({ shopId: SHOP_A, userId: USER_A, version: V1, documents: [] })
    await appendTermsAcceptance({ shopId: SHOP_A, userId: USER_A, version: V2, documents: [] })

    const rows = await getDb()
      .select({ version: schema.termsAcceptances.version })
      .from(schema.termsAcceptances)
      .where(eq(schema.termsAcceptances.shopId, SHOP_A))
    expect(rows.map((r) => r.version).sort()).toEqual([V1, V2].sort())

    // Still covered for the old version — the question is whether this exact
    // text was agreed to, not whether it was the most recent thing agreed to.
    expect(await shopHasAcceptedVersion(SHOP_A, V1)).toBe(true)
    expect(await shopHasAcceptedVersion(SHOP_A, V2)).toBe(true)
  })

  it('refuses a version that is not a content hash', async () => {
    /*
     * The CHECK constraint. A row whose version is "v2" or "latest" is an
     * acceptance of nothing identifiable, which would make the table useless
     * as evidence at the exact moment it was needed.
     */
    let threw = false
    try {
      await getDb().insert(schema.termsAcceptances).values({
        id: 'ta-bad-version',
        shopId: SHOP_A,
        userId: USER_A,
        version: 'v2',
        documents: [],
      })
    } catch {
      threw = true
    }
    expect(threw, 'the database accepted a version that is not a sha256').toBe(true)
  })
})

describe('the table is protected like every other table', () => {
  it('has row-level security enabled', async () => {
    const rows = (await getDb().execute<{ relrowsecurity: boolean }>(
      sql`select relrowsecurity from pg_class where relname = 'terms_acceptances'`,
    )) as unknown as { relrowsecurity: boolean }[]

    expect(rows.length, 'terms_acceptances does not exist in this database').toBe(1)
    expect(rows[0]!.relrowsecurity, 'terms_acceptances has row-level security OFF').toBe(true)
  })

  it('has the unique index that makes a repeat accept a no-op', async () => {
    const rows = (await getDb().execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where tablename = 'terms_acceptances'`,
    )) as unknown as { indexname: string }[]

    expect(rows.map((r) => r.indexname)).toContain('terms_acceptances_shop_user_version_idx')
  })
})

describe('the gate bites at runtime, not only in the source', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════════
   *   THE TEST THAT HAD TO EXIST ONCE EVERY OTHER SUITE STARTED PASSING THE
   *   GATE.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * The Application Terms gate broke 101 integration tests when it landed,
   * and the fix was to give those suites an executed agreement — which is
   * what production looks like. The hazard in that fix is obvious: if every
   * suite now sets the agreement up, nothing proves the gate still refuses
   * when it is absent. tests/unit/legal-acceptance.test.ts checks WHERE the
   * call sits; this checks that the call actually stops a sync.
   */

  const ENV = { ...process.env }
  const ctx = { shopId: SHOP_A, actorId: USER_A, readOnly: false }

  /** An adapter that would succeed, so only the gate can be the refusal. */
  const adapter = {
    getListings: async () => ({
      listings: [
        {
          listingId: '770001',
          etsyListingId: '770001',
          title: 'A listing',
          description: '',
          tags: [],
          price: 4800,
          quantity: 3,
          state: 'ACTIVE',
          photoCount: 1,
          attributes: {},
          requiredAttributes: [],
          variations: [],
        },
      ],
      total: 1,
    }),
  }

  beforeEach(() => {
    process.env.ETSY_MODE = 'live'
    setEtsyService(adapter as never)
  })

  afterAll(() => {
    setEtsyService(null)
    restoreRealLegalDocuments()
    process.env = { ...ENV }
  })

  it('refuses a sync when the shop has accepted nothing', async () => {
    // Finished documents, so the refusal is about ACCEPTANCE and not about the
    // documents being drafts — the two refusals are different facts.
    setLegalDocumentsForTests({
      terms: '# T\n\nLast updated: 2026-10-09\n\nComplete.\n',
      privacy: '# P\n\nLast updated: 2026-10-09\n\nComplete.\n',
    })

    await expect(syncShopListings(ctx)).rejects.toThrow(/Application Terms have not been accepted/)

    const rows = await getDb()
      .select({ id: schema.listings.id })
      .from(schema.listings)
      .where(eq(schema.listings.shopId, SHOP_A))
    expect(rows, 'a refused sync still wrote listings').toEqual([])
  })

  it('allows it once the agreement is on file, and refuses again when the documents change', async () => {
    await acceptTermsFor([SHOP_A], USER_A)
    const accepted = applicationTermsVersion()

    const result = await syncShopListings(ctx)
    expect(result.upserted).toBeGreaterThan(0)

    /*
     * Now change a document. The version is a hash of the published text, so
     * this is what a lawyer fixing a clause does — and the seller is asked
     * again before the next sync without anybody invalidating anything.
     */
    setLegalDocumentsForTests({
      terms: '# T\n\nLast updated: 2026-10-10\n\nComplete, with a new clause.\n',
      privacy: '# P\n\nLast updated: 2026-10-09\n\nComplete.\n',
    })
    expect(applicationTermsVersion(), 'editing a document did not change the version').not.toBe(
      accepted,
    )

    await expect(syncShopListings(ctx)).rejects.toThrow(/Application Terms have not been accepted/)
    await getDb().delete(schema.listings).where(eq(schema.listings.shopId, SHOP_A))
  })

  it('refuses outright when the documents are drafts, with a different reason', async () => {
    /*
     * The real documents, which still carry `[[LEGAL_ENTITY]]`. Even with an
     * acceptance row present, a sync refuses — and the message says the
     * agreement is not ready rather than blaming the seller for not accepting
     * it, because there is nothing they could have accepted.
     */
    restoreRealLegalDocuments()
    await appendTermsAcceptance({
      shopId: SHOP_A,
      userId: USER_A,
      version: applicationTermsVersion(),
      documents: [],
    })

    await expect(syncShopListings(ctx)).rejects.toThrow(/not open yet/)
  })
})
