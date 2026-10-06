import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'

import { DatabaseTokenStore } from '@/lib/etsy/tokens'
import { getDb, schema } from '@/lib/db'
import type { TokenSet } from '@/lib/etsy/oauth'

/**
 * DatabaseTokenStore against a real Postgres table.
 *
 *     DATABASE_URL=postgres://... \
 *     TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
 *     npm run test:integration
 *
 * ── WHY THIS IS A SEPARATE SUITE AND NOT PART OF `npm test` ──────────────
 *
 * It needs a migrated database. `npm test` runs with no DATABASE_URL — that is
 * the Phase 1 acceptance gate, and the demo path must keep working without one
 * — so these tests cannot live there. The alternative, a `.skipIf` that
 * silently passes when the database is absent, is the shape this repository
 * keeps finding and removing: a check that passes when the thing it measures
 * is not there is not a check.
 *
 * So the file is excluded from the default `include` by its `.int.ts`
 * extension, has its own config, and FAILS LOUDLY rather than skipping if it
 * is run without a database. tests/unit/etsy-token-store.test.ts covers
 * everything that does not need one — including, deliberately, the missing-key
 * refusals, which are the most security-relevant rule here and are checkable
 * without a table because the key is checked before the first query.
 *
 * ── WHAT IT DOES TO THE DATABASE ─────────────────────────────────────────
 *
 * It creates two shops of its own with a reserved id prefix, and removes them
 * and their connection rows afterwards. It touches nothing it did not create.
 * That matters more than usual here: a suite that left rows behind in a table
 * of OAuth tokens would be leaving sealed credentials in a developer's
 * database, and this project has already been bitten once by a browser suite
 * that walked away from a fixture it had changed.
 */

const SHOP_A = 'tok-test-shop-a'
const SHOP_B = 'tok-test-shop-b'
const MISSING = 'tok-test-shop-does-not-exist'
const OURS = [SHOP_A, SHOP_B, MISSING]

const TOKENS_A: TokenSet = {
  accessToken: 'at-shop-a-secret',
  refreshToken: 'rt-shop-a-secret',
  expiresAt: '2026-06-01T12:00:00.000Z',
  scopes: ['listings_r', 'listings_w'],
}

const TOKENS_B: TokenSet = {
  accessToken: 'at-shop-b-secret',
  refreshToken: 'rt-shop-b-secret',
  expiresAt: '2026-07-02T09:30:00.000Z',
  scopes: ['listings_r'],
}

const store = new DatabaseTokenStore()

/** The connection row as the database holds it, decrypted by nobody. */
async function row(shopId: string) {
  const [found] = await getDb()
    .select()
    .from(schema.etsyConnections)
    .where(eq(schema.etsyConnections.shopId, shopId))
    .limit(1)
  return found ?? null
}

async function clean() {
  const db = getDb()
  await db.delete(schema.etsyConnections).where(inArray(schema.etsyConnections.shopId, OURS))
  await db.delete(schema.shops).where(inArray(schema.shops.id, OURS))
}

beforeAll(async () => {
  /*
   * NOT skipIf. A missing database here is a run that proved nothing, and it
   * says so rather than reporting green.
   */
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'These tests need DATABASE_URL pointing at a migrated database. ' +
        'They are excluded from `npm test` for that reason — see the note at the top of this file.',
    )
  }
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    throw new Error(
      'These tests need TOKEN_ENCRYPTION_KEY set to 32 bytes of base64 ' +
        '(openssl rand -base64 32). The missing-key behaviour is covered in ' +
        'tests/unit/etsy-token-store.test.ts, which needs no database.',
    )
  }

  await clean()
  await getDb()
    .insert(schema.shops)
    .values([
      { id: SHOP_A, name: 'Token Test A' },
      { id: SHOP_B, name: 'Token Test B' },
    ])
})

afterAll(clean)

beforeEach(async () => {
  // Only the connection rows; the shops stay, because the foreign key needs
  // them and recreating them per test would prove nothing extra.
  await getDb()
    .delete(schema.etsyConnections)
    .where(inArray(schema.etsyConnections.shopId, OURS))
})

describe('the round trip', () => {
  it('write then read returns the same tokens', async () => {
    await store.write(SHOP_A, TOKENS_A)
    expect(await store.read(SHOP_A)).toEqual(TOKENS_A)
  })

  it('stores the scopes and the expiry alongside, not only the token', async () => {
    /*
     * Settings tells a seller what stops working if they revoke a scope, and
     * the refresh path compares the expiry before spending a round trip on
     * Etsy. Both read these columns rather than opening the token, so a store
     * that sealed everything and populated neither would look correct here and
     * be useless there.
     */
    await store.write(SHOP_A, TOKENS_A)
    const stored = await row(SHOP_A)
    expect(stored?.scopes).toEqual(TOKENS_A.scopes)
    expect(stored?.expiresAt?.toISOString()).toBe(TOKENS_A.expiresAt)
  })

  it('writes nothing readable — the row holds no token in the clear', async () => {
    /*
     * The point of the whole file. A database backup is not a place a refresh
     * token should be readable, so the assertion is made against the stored
     * TEXT rather than against what read() hands back.
     */
    await store.write(SHOP_A, TOKENS_A)
    const stored = await row(SHOP_A)
    expect(stored?.tokenRef).toBeTruthy()
    expect(stored?.tokenRef).not.toContain(TOKENS_A.accessToken)
    expect(stored?.tokenRef).not.toContain(TOKENS_A.refreshToken)
  })

  it('overwrites rather than accumulating, when a shop reconnects', async () => {
    await store.write(SHOP_A, TOKENS_A)
    await store.write(SHOP_A, TOKENS_B)
    expect(await store.read(SHOP_A)).toEqual(TOKENS_B)
    const all = await getDb()
      .select()
      .from(schema.etsyConnections)
      .where(eq(schema.etsyConnections.shopId, SHOP_A))
    expect(all).toHaveLength(1)
  })
})

describe('a shop with no row', () => {
  it('reads as null rather than raising', async () => {
    /*
     * The ordinary case for every shop that has never connected, which on a
     * fresh deployment is all of them. An error here would make the connect
     * screen fail to render for exactly the people who need it.
     */
    expect(await store.read(SHOP_A)).toBeNull()
  })

  it('can be forgotten without error, and without inventing a row', async () => {
    /*
     * A no-op, and that is the right answer rather than a lazy one. Inserting
     * a row would mint "disconnected on this date" for a shop that was never
     * connected — a false record, which is worse than a missing one.
     */
    await expect(store.forget(SHOP_A)).resolves.toBeUndefined()
    expect(await row(SHOP_A)).toBeNull()
  })
})

describe('revocation keeps the row', () => {
  it('forget then read returns null, and the row still exists with revokedAt set', async () => {
    await store.write(SHOP_A, TOKENS_A)
    await store.forget(SHOP_A)

    expect(await store.read(SHOP_A)).toBeNull()

    const stored = await row(SHOP_A)
    expect(stored, 'the row was deleted, which loses the fact of the revocation').not.toBeNull()
    expect(stored?.tokenRef).toBeNull()
    expect(stored?.revokedAt).toBeInstanceOf(Date)
  })

  it('keeps the scopes and expiry that describe the connection that was', async () => {
    // A dated record of a revocation is only useful if it still says what was
    // revoked.
    await store.write(SHOP_A, TOKENS_A)
    await store.forget(SHOP_A)
    const stored = await row(SHOP_A)
    expect(stored?.scopes).toEqual(TOKENS_A.scopes)
    expect(stored?.expiresAt?.toISOString()).toBe(TOKENS_A.expiresAt)
  })

  it('reconnecting after forget clears revokedAt', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   A ROW WITH A LIVE TOKEN AND A REVOCATION DATE SAYS TWO
     *   CONTRADICTORY THINGS, AND EVERY SCREEN READING IT PICKS ONE.
     * ══════════════════════════════════════════════════════════════════════
     *
     * Which means different screens pick differently. The sketch in
     * docs/DATABASE-AND-AUTH-SETUP.md left revoked_at out of its conflict
     * branch, so this is the assertion that catches the implementation it
     * would have produced.
     */
    await store.write(SHOP_A, TOKENS_A)
    await store.forget(SHOP_A)
    expect((await row(SHOP_A))?.revokedAt).toBeInstanceOf(Date)

    await store.write(SHOP_A, TOKENS_B)

    const stored = await row(SHOP_A)
    expect(stored?.revokedAt, 'a reconnected shop is still marked revoked').toBeNull()
    expect(await store.read(SHOP_A)).toEqual(TOKENS_B)
  })

  it('updates the scopes on reconnection, not just the token', async () => {
    // Same conflict branch, second column the sketch omitted. TOKENS_B grants
    // one scope where TOKENS_A granted two.
    await store.write(SHOP_A, TOKENS_A)
    await store.write(SHOP_A, TOKENS_B)
    expect((await row(SHOP_A))?.scopes).toEqual(TOKENS_B.scopes)
  })
})

describe('one shop never sees another shop', () => {
  it('returns each shop its own tokens', async () => {
    /*
     * The brief's standing rule — a user must never operate on another shop's
     * data — at the storage layer. The store takes a shopId and trusts it;
     * what it must never do is confuse two.
     */
    await store.write(SHOP_A, TOKENS_A)
    await store.write(SHOP_B, TOKENS_B)

    expect(await store.read(SHOP_A)).toEqual(TOKENS_A)
    expect(await store.read(SHOP_B)).toEqual(TOKENS_B)
  })

  it('does not leak one shop into another shop when only one is connected', async () => {
    // The failure this catches is a missing WHERE, which returns the first row
    // in the table for every id asked about.
    await store.write(SHOP_A, TOKENS_A)
    expect(await store.read(SHOP_B)).toBeNull()
  })

  it('forgetting one shop leaves the other connected', async () => {
    await store.write(SHOP_A, TOKENS_A)
    await store.write(SHOP_B, TOKENS_B)
    await store.forget(SHOP_A)

    expect(await store.read(SHOP_A)).toBeNull()
    expect(await store.read(SHOP_B)).toEqual(TOKENS_B)
  })
})

describe('a tampered token_ref', () => {
  it('fails to open rather than decrypting to something else', async () => {
    /*
     * GCM rather than CBC is what buys this. An authenticated cipher makes an
     * edited row FAIL; an unauthenticated one would hand back plausible
     * rubbish, and the caller would send it to Etsy as a bearer token.
     *
     * The row is edited through SQL rather than through the store, because
     * editing it through the store is exactly what an attacker with database
     * access does not have to do.
     */
    await store.write(SHOP_A, TOKENS_A)
    const original = (await row(SHOP_A))!.tokenRef!

    const [iv, tag, body] = original.split('.')
    const bytes = Buffer.from(body!, 'base64')
    bytes[0] = bytes[0]! ^ 0xff
    const tampered = [iv, tag, bytes.toString('base64')].join('.')
    expect(tampered).not.toBe(original)

    await getDb()
      .update(schema.etsyConnections)
      .set({ tokenRef: tampered })
      .where(eq(schema.etsyConnections.shopId, SHOP_A))

    await expect(store.read(SHOP_A)).rejects.toThrow()
  })

  it('does not report a tampered row as "not connected"', async () => {
    /*
     * The failure mode worth separating. Returning null would send a seller to
     * reconnect — the correct remedy — having told them the wrong reason, and
     * it would hide an altered row from everybody. The error names
     * reconnection AND says the stored value could not be decrypted.
     */
    await store.write(SHOP_A, TOKENS_A)
    await getDb()
      .update(schema.etsyConnections)
      .set({ tokenRef: 'not.even.ciphertext' })
      .where(eq(schema.etsyConnections.shopId, SHOP_A))

    const outcome = await store.read(SHOP_A).then(
      (value) => ({ resolved: value }),
      (error: unknown) => ({ rejected: error as Error }),
    )
    expect(outcome).not.toHaveProperty('resolved')
    expect((outcome as { rejected: Error }).rejected.message).toMatch(/could not be decrypted/i)
  })

  it('leaves a row sealed under a rotated key unreadable, not silently empty', async () => {
    // Key rotation is the innocent version of the same event, and it has to
    // produce the same loud answer.
    await store.write(SHOP_A, TOKENS_A)
    const previous = process.env.TOKEN_ENCRYPTION_KEY
    try {
      process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 42).toString('base64')
      await expect(store.read(SHOP_A)).rejects.toThrow(/could not be decrypted/i)
    } finally {
      process.env.TOKEN_ENCRYPTION_KEY = previous
    }
  })
})

describe('the foreign key', () => {
  it('fails clearly for a shop id that does not exist', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE ERROR A SELLER'S CONNECTION ATTEMPT PRODUCES MUST NOT BE A RAW
     *   POSTGRES CONSTRAINT MESSAGE.
     * ══════════════════════════════════════════════════════════════════════
     *
     * shop_id references shops.id, so this is a real 23503. What comes back
     * says which thing is missing, in a sentence, and carries the shop id in
     * its context rather than in its text.
     *
     * This is not hypothetical plumbing: app/api/etsy/callback/route.ts calls
     * write() with ETSY's shop id, while this column references EtsyPilot's
     * own — so on a real connection this is the path that runs. The store
     * cannot fix that; it can refuse to report it as a database fault.
     */
    const outcome = await store.write(MISSING, TOKENS_A).then(
      () => ({ resolved: true }),
      (error: unknown) => ({ rejected: error as Error }),
    )
    expect(outcome).not.toHaveProperty('resolved')

    const error = (outcome as { rejected: Error }).rejected
    expect(error.message).toMatch(/no shop in etsypilot with that id/i)
    // The thing that must NOT surface.
    expect(error.message).not.toMatch(/violates foreign key constraint/i)
    expect(error.message).not.toMatch(/etsy_connections_shop_id_shops_id_fk/)
  })

  it('does not put the sealed token in the error, which is where it was', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   FOUND BY THIS TEST, NOT BY READING THE CODE.
     * ══════════════════════════════════════════════════════════════════════
     *
     * The first implementation re-threw whatever the database layer produced.
     * Drizzle's message is the SQL *and the bound parameters*, and parameter
     * $3 of this insert is the sealed token — so every log line, stack trace
     * and error reporter recording `error.message` would have held a sealed
     * credential. Ciphertext, not plaintext; but the whole argument for
     * encrypting at rest is that the stored value should not be lying around
     * in places nobody audited, and logs outlive key rotations.
     *
     * Asserted against the ciphertext ITSELF rather than against a shape, so
     * it cannot be satisfied by a reworded message that still carries it.
     */
    await store.write(SHOP_A, TOKENS_A)
    const sealed = (await row(SHOP_A))!.tokenRef!

    const error = await store.write(MISSING, TOKENS_A).then(
      () => null,
      (caught: unknown) => caught as Error,
    )
    expect(error).not.toBeNull()

    const everything = `${error!.message} ${error!.stack ?? ''} ${JSON.stringify(error, Object.getOwnPropertyNames(error!))}`
    expect(everything).not.toContain(TOKENS_A.accessToken)
    expect(everything).not.toContain(TOKENS_A.refreshToken)
    // The sealed form is a different string each write, so the one just stored
    // stands in for "any ciphertext for these tokens".
    expect(everything).not.toContain(sealed.split('.')[2])
    expect(everything).not.toMatch(/Failed query|params:/)
  })

  it('writes no row when it refuses', async () => {
    await store.write(MISSING, TOKENS_A).catch(() => undefined)
    expect(await row(MISSING)).toBeNull()
  })

  it('still lets a real database error through rather than mislabelling it', async () => {
    /*
     * The converse, and the reason the handler keys on code 23503 alone. A
     * store that translated EVERY write failure into "no such shop" would
     * report a dead connection or a full disk as a missing row, and somebody
     * would go looking for the shop.
     */
    const expiryIsNotADate: TokenSet = { ...TOKENS_A, expiresAt: 'the day after tomorrow' }
    await expect(store.write(SHOP_A, expiryIsNotADate)).rejects.toThrow(/not a date/i)
    expect(await row(SHOP_A)).toBeNull()
  })
})
