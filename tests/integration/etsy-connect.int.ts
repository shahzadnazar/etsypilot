import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray, sql } from 'drizzle-orm'
import { acceptTermsFor } from '../support/legal'

/**
 * The Etsy OAuth callback, driven against the real table.
 *
 *     DATABASE_URL=postgres://... \
 *     TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
 *     npm run test:integration
 *
 * ── WHAT THIS CAN AND CANNOT PROVE ───────────────────────────────────────
 *
 * It CANNOT prove the flow works against Etsy. There is no API key, no
 * registered redirect URI and no domain, so the exchange has never been run
 * against the real provider and nothing here says otherwise. Etsy's three
 * responses are faked at `globalThis.fetch`, the way the live-adapter tests
 * inject a transport (D28) — so the REAL EtsyClient, the REAL oauth exchange
 * and the REAL route handler run, over a stub.
 *
 * What it does prove is the half that was actually broken, and it is the half a
 * live key would not have helped with: the callback wrote `String(me.shop_id)`
 * — Etsy's numeric id — into a column whose foreign key points at `shops.id`,
 * which holds `shop_<uuid>`. Two namespaces, so every real connection failed
 * the key. That is a database fact, and this is where database facts are
 * checkable.
 *
 * ── THE FIXTURES ─────────────────────────────────────────────────────────
 *
 * Two accounts with a shop each, created here and removed afterwards, with a
 * reserved id prefix. TWO, because "an Etsy shop already connected to another
 * EtsyPilot account is refused" needs a second account to be the other one —
 * and that is the check a single-fixture suite cannot make.
 */

const SHOP_A = 'conn-test-shop-a'
const SHOP_B = 'conn-test-shop-b'
const USER_A = 'conn-test-user-a'
const USER_B = 'conn-test-user-b'
const ETSY_SHOP = '48123456'
const OURS = [SHOP_A, SHOP_B]

const DEMO_NAME = 'My demo shop'
const ETSY_NAME = 'Willow & Fern Supply Co'

/** What the session says. Replaced per test; never read from the request. */
let session: { userId: string; email: string; name: string | null; shopId: string; isDemo: boolean } | null =
  null

/** What the flow cookie holds, as the connect route would have written it. */
let flowCookie: string | undefined

vi.mock('@/lib/auth', () => ({ getSession: async () => session }))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'etsy_oauth_flow' && flowCookie ? { name, value: flowCookie } : undefined) }),
}))

/*
 * Imported AFTER the mocks are registered, which vi.mock hoisting handles —
 * but the database helpers are imported dynamically inside beforeAll so the
 * env is set first. getDb() memoises its client from DATABASE_URL on first
 * call, and a module-level import would resolve it before the guard below has
 * had a chance to complain usefully.
 */
let GET: (request: Request) => Promise<Response>
/** The START of the flow, so the gate before the redirect can be driven too. */
let CONNECT: (request: Request) => Promise<Response>
let getDb: typeof import('@/lib/db').getDb
let schema: typeof import('@/lib/db').schema

const ENV = { ...process.env }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Etsy, faked at the transport.
 *
 * Three calls, in the order the route makes them: the token exchange, then
 * /users/me, then /shops/{id}. `calls` records them so a test can assert the
 * route stopped before reaching one — which is how "refused, and wrote
 * nothing" is distinguished from "refused after asking Etsy for everything".
 */
let calls: string[] = []

function fakeEtsy(overrides: { me?: unknown; shop?: unknown; tokenStatus?: number } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    calls.push(url)

    if (url.includes('/public/oauth/token')) {
      if (overrides.tokenStatus && overrides.tokenStatus >= 400) {
        return jsonResponse({ error: 'invalid_grant' }, overrides.tokenStatus)
      }
      return jsonResponse({
        access_token: '48123456.abcdefghijklmnop',
        refresh_token: '48123456.qrstuvwxyz012345',
        expires_in: 3600,
        token_type: 'Bearer',
      })
    }
    if (url.includes('/users/me')) {
      return jsonResponse(overrides.me ?? { user_id: 991, shop_id: Number(ETSY_SHOP) })
    }
    if (url.includes('/shops/')) {
      return jsonResponse(overrides.shop ?? { shop_name: ETSY_NAME, currency_code: 'GBP' })
    }
    throw new Error(`unexpected fetch in test: ${url}`)
  })
}

function callbackRequest(params: Record<string, string> = {}) {
  const url = new URL('https://etsypilot.test/api/etsy/callback')
  url.searchParams.set('code', 'etsy-auth-code')
  url.searchParams.set('state', 'the-state')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return new Request(url.toString())
}

/** The `connect=` code the route redirected to. */
function outcomeOf(response: Response): string | null {
  const location = response.headers.get('location')
  if (!location) return null
  return new URL(location).searchParams.get('connect')
}

async function shopRow(id: string) {
  const [row] = await getDb().select().from(schema.shops).where(eq(schema.shops.id, id)).limit(1)
  return row ?? null
}

async function connectionRow(shopId: string) {
  const [row] = await getDb()
    .select()
    .from(schema.etsyConnections)
    .where(eq(schema.etsyConnections.shopId, shopId))
    .limit(1)
  return row ?? null
}

async function clean() {
  const db = getDb()
  await db.delete(schema.etsyConnections).where(inArray(schema.etsyConnections.shopId, OURS))
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
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    throw new Error('These tests need TOKEN_ENCRYPTION_KEY set to 32 bytes of base64.')
  }

  /*
   * ETSY_MODE=live is required, and not as scaffolding: the route refuses in
   * demo mode on purpose, because a connection sets is_demo = false and the
   * mock adapter would then serve the demo catalogue as the seller's own shop.
   * One test below asserts that refusal by unsetting this.
   */
  process.env.ETSY_MODE = 'live'
  process.env.ETSY_API_KEY = 'test-keystring'
  process.env.ETSY_REDIRECT_URI = 'https://etsypilot.test/api/etsy/callback'

  const db = await import('@/lib/db')
  getDb = db.getDb
  schema = db.schema
  GET = (await import('@/app/api/etsy/callback/route')).GET
  CONNECT = (await import('@/app/api/etsy/connect/route')).GET

  await clean()
})

afterAll(async () => {
  await clean()
  process.env = { ...ENV }
})

beforeEach(async () => {
  calls = []
  process.env.ETSY_MODE = 'live'
  process.env.ETSY_API_KEY = 'test-keystring'
  process.env.ETSY_REDIRECT_URI = 'https://etsypilot.test/api/etsy/callback'

  await clean()
  await getDb()
    .insert(schema.users)
    .values([
      { id: USER_A, email: 'a@conn.test', name: 'A Seller' },
      { id: USER_B, email: 'b@conn.test', name: 'B Seller' },
    ])
  await getDb()
    .insert(schema.shops)
    .values([
      { id: SHOP_A, ownerId: USER_A, name: DEMO_NAME, currency: 'USD', isDemo: true, connectionStatus: 'DEMO' },
      { id: SHOP_B, ownerId: USER_B, name: DEMO_NAME, currency: 'USD', isDemo: true, connectionStatus: 'DEMO' },
    ])

  /*
   * An executed agreement for both shops, because the callback now refuses
   * without one — Etsy's API Terms §4. Recorded in beforeEach rather than
   * beforeAll because clean() removes it with the shops it references.
   *
   * The refusal itself is asserted in its own test below, by clearing the
   * acceptance: a suite that only ever ran with the agreement in place would
   * not notice the gate disappearing.
   */
  await acceptTermsFor([SHOP_A, SHOP_B], USER_A)

  session = { userId: USER_A, email: 'a@conn.test', name: 'A Seller', shopId: SHOP_A, isDemo: true }
  flowCookie = JSON.stringify({
    state: 'the-state',
    verifier: 'a'.repeat(43),
    userId: USER_A,
    scopes: ['listings_r', 'shops_r'],
  })
  vi.stubGlobal('fetch', fakeEtsy())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a successful connection', () => {
  it('keys the connection row on the SESSION shop id, and the foreign key accepts it', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE ORIGINAL DEFECT, AS A TEST.
     * ══════════════════════════════════════════════════════════════════════
     *
     * Before this change the route wrote '48123456' here — Etsy's id — and
     * the foreign key to shops.id rejected it, so every real connection
     * failed. The assertion is on the VALUE, not merely that a row exists,
     * because a row existing under the wrong key is exactly the state live.ts
     * then cannot read: it looks up by ShopContext's shopId.
     */
    const response = await GET(callbackRequest())
    expect(outcomeOf(response)).toBe('connected')

    const connection = await connectionRow(SHOP_A)
    expect(connection, 'no connection row was written').not.toBeNull()
    expect(connection?.shopId).toBe(SHOP_A)
    expect(connection?.shopId).not.toBe(ETSY_SHOP)
  })

  it('stores a sealed token, not a readable one', async () => {
    await GET(callbackRequest())
    const connection = await connectionRow(SHOP_A)
    expect(connection?.tokenRef).toBeTruthy()
    expect(connection?.tokenRef).not.toContain('48123456.abcdefghijklmnop')
    expect(connection?.tokenRef).not.toContain('48123456.qrstuvwxyz012345')
  })

  it('records the scopes the flow asked for', async () => {
    await GET(callbackRequest())
    expect((await connectionRow(SHOP_A))?.scopes).toEqual(['listings_r', 'shops_r'])
  })

  it('writes Etsy’s id onto the seller’s own shop row', async () => {
    // The column that has existed since 0000 and had never been written.
    await GET(callbackRequest())
    expect((await shopRow(SHOP_A))?.etsyShopId).toBe(ETSY_SHOP)
  })

  it('takes the shop’s name and currency from Etsy, so it stops saying "My demo shop"', async () => {
    const before = await shopRow(SHOP_A)
    expect(before?.name, 'the fixture is not in the demo state').toBe(DEMO_NAME)

    await GET(callbackRequest())

    const after = await shopRow(SHOP_A)
    expect(after?.name).toBe(ETSY_NAME)
    expect(after?.currency).toBe('GBP')
  })

  it('moves connection_status off DEMO, to a value the type already has', async () => {
    /*
     * 'CONNECTED' is read off ConnectionStatus in lib/etsy/interface.ts rather
     * than invented, and live.ts already reports it for a shop it can read.
     * domain/admin/etsy-health.ts cross-checks this column against the
     * connection row, so a made-up value would light up the operator console.
     */
    await GET(callbackRequest())
    expect((await shopRow(SHOP_A))?.connectionStatus).toBe('CONNECTED')
  })

  it('clears is_demo, so a real shop stops claiming demo figures', async () => {
    /*
     * shops.is_demo reaches the session (lib/auth/index.ts) and from there
     * drives the demo banner, the D11 provenance override on every figure, and
     * readOnly in shopContext. A connected shop that kept it would put a
     * "demo" chip and a demo provenance badge on a real seller's real numbers.
     */
    expect((await shopRow(SHOP_A))?.isDemo).toBe(true)
    await GET(callbackRequest())
    expect((await shopRow(SHOP_A))?.isDemo).toBe(false)
  })

  it('leaves the other seller’s shop completely alone', async () => {
    await GET(callbackRequest())
    const other = await shopRow(SHOP_B)
    expect(other?.name).toBe(DEMO_NAME)
    expect(other?.etsyShopId).toBeNull()
    expect(other?.isDemo).toBe(true)
    expect(await connectionRow(SHOP_B)).toBeNull()
  })

  it('reconnecting the same Etsy shop to the same account is allowed', async () => {
    // The ordinary re-authorisation path. The uniqueness rule is about a
    // DIFFERENT EtsyPilot shop holding that Etsy id, not about connecting twice.
    expect(outcomeOf(await GET(callbackRequest()))).toBe('connected')
    vi.stubGlobal('fetch', fakeEtsy({ shop: { shop_name: 'Renamed Shop', currency_code: 'EUR' } }))
    expect(outcomeOf(await GET(callbackRequest()))).toBe('connected')

    const after = await shopRow(SHOP_A)
    expect(after?.name).toBe('Renamed Shop')
    expect(after?.currency).toBe('EUR')
  })
})

describe('a callback completed in a different session', () => {
  it('is refused, and writes nothing', async () => {
    /*
     * Without this check, anyone who obtains a callback URL completes a
     * connection INTO THEIR OWN ACCOUNT using another seller's Etsy grant —
     * and now that the connection writes the session's shop row, that is
     * precisely a cross-account write.
     */
    session = { userId: USER_B, email: 'b@conn.test', name: 'B Seller', shopId: SHOP_B, isDemo: true }
    // The flow still says USER_A started it.

    const response = await GET(callbackRequest())
    expect(outcomeOf(response)).toBe('state_mismatch')

    for (const shop of OURS) {
      expect(await connectionRow(shop), `${shop} got a connection row`).toBeNull()
      expect((await shopRow(shop))?.etsyShopId, `${shop} got an Etsy id`).toBeNull()
      expect((await shopRow(shop))?.isDemo).toBe(true)
    }
  })

  it('refuses before exchanging the code, so no token is even minted', async () => {
    // Asserted on the transport: a refusal that had already spent the code
    // leaves a live credential at Etsy for a connection nobody saved.
    session = { userId: USER_B, email: 'b@conn.test', name: 'B Seller', shopId: SHOP_B, isDemo: true }
    await GET(callbackRequest())
    expect(calls).toEqual([])
  })
})

describe('an Etsy shop already connected to another account', () => {
  it('is refused with its own outcome', async () => {
    /*
     * A real case rather than a contrived one: a shop sold, an agency and its
     * client, one person with two accounts. Attaching it to whoever connected
     * last would move a shop's data between accounts.
     */
    await getDb()
      .update(schema.shops)
      .set({ etsyShopId: ETSY_SHOP, name: 'Already Connected', isDemo: false, connectionStatus: 'CONNECTED' })
      .where(eq(schema.shops.id, SHOP_B))

    const response = await GET(callbackRequest())
    expect(outcomeOf(response)).toBe('shop_already_linked')
  })

  it('leaves both accounts exactly as they were', async () => {
    await getDb()
      .update(schema.shops)
      .set({ etsyShopId: ETSY_SHOP, name: 'Already Connected', isDemo: false, connectionStatus: 'CONNECTED' })
      .where(eq(schema.shops.id, SHOP_B))

    await GET(callbackRequest())

    // The seller who tried: nothing written, not even a partial shop update.
    const mine = await shopRow(SHOP_A)
    expect(mine?.etsyShopId).toBeNull()
    expect(mine?.name).toBe(DEMO_NAME)
    expect(mine?.isDemo).toBe(true)
    expect(mine?.connectionStatus).toBe('DEMO')
    expect(await connectionRow(SHOP_A)).toBeNull()

    // And the account that legitimately holds it keeps it.
    expect((await shopRow(SHOP_B))?.etsyShopId).toBe(ETSY_SHOP)
  })

  it('is still refused on a database where migration 0009 was never applied', async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   WHY THE REPOSITORY'S SELECT IS NOT REDUNDANT — AND HOW THAT WAS
     *   ESTABLISHED.
     * ══════════════════════════════════════════════════════════════════════
     *
     * A negative control removed that SELECT and the whole suite stayed green:
     * the unique index fires on the shop UPDATE, the transaction rolls back,
     * and the 23505 maps to the same outcome. Identical behaviour, so the
     * check was doing nothing any test could see — which is exactly the kind
     * of unmeasured code this repository keeps deleting.
     *
     * It earns its place for one reason, and this test is that reason: a
     * database where 0009 has not been applied. That is not hypothetical here
     * — RLS was left off on the real project twice because a migration was
     * assumed to have run. With the index absent, the SELECT is the only thing
     * between two accounts and one Etsy shop.
     *
     * So the index is dropped, the refusal is still required, and the index is
     * put back in a finally.
     */
    await getDb()
      .update(schema.shops)
      .set({ etsyShopId: ETSY_SHOP, name: 'Already Connected', isDemo: false })
      .where(eq(schema.shops.id, SHOP_B))

    await getDb().execute(sql`drop index if exists shops_etsy_shop_id_idx`)
    try {
      const response = await GET(callbackRequest())
      expect(outcomeOf(response)).toBe('shop_already_linked')
      // And still nothing written, because the SELECT throws before the UPDATE.
      expect((await shopRow(SHOP_A))?.etsyShopId).toBeNull()
      expect(await connectionRow(SHOP_A)).toBeNull()
    } finally {
      /*
       * Clear the attempt before recreating the index. Without this, a FAILING
       * run of this test leaves two shops holding one Etsy id, the unique index
       * cannot be rebuilt, and every test after this one fails against a
       * weaker database — attributing the breakage to the wrong test. Found by
       * the negative control that removed the check.
       */
      await getDb()
        .update(schema.shops)
        .set({ etsyShopId: null })
        .where(eq(schema.shops.id, SHOP_A))
      await getDb().execute(
        sql`create unique index if not exists shops_etsy_shop_id_idx on shops (etsy_shop_id) where etsy_shop_id is not null`,
      )
    }

    // The control for the restore: the index has to be back, or every test
    // after this one would be running against a weaker database.
    const restored = await getDb().execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where tablename = 'shops' and indexname = 'shops_etsy_shop_id_idx'`,
    )
    expect([...restored], 'the index was not restored').toHaveLength(1)
  })

  it('is enforced by the database, not only by the check', async () => {
    /*
     * The SELECT in the repository is for the WORDING. A SELECT followed by an
     * UPDATE is a race, and the unique index is the only part that holds under
     * concurrency — so it is asserted directly, by trying the write the race
     * would produce.
     */
    await getDb()
      .update(schema.shops)
      .set({ etsyShopId: ETSY_SHOP })
      .where(eq(schema.shops.id, SHOP_B))

    const clash = await getDb()
      .update(schema.shops)
      .set({ etsyShopId: ETSY_SHOP })
      .where(eq(schema.shops.id, SHOP_A))
      .then(() => null, (error: unknown) => error as Error)

    expect(clash, 'the unique index is missing — run migration 0009').not.toBeNull()
  })
})

describe('a signed-out callback', () => {
  it('is refused, and writes nothing', async () => {
    session = null
    const response = await GET(callbackRequest())
    // Not an outcome page: a callback landing in a signed-out browser cannot
    // be attributed to anyone, so it goes to the front door.
    expect(outcomeOf(response)).toBeNull()
    expect(response.headers.get('location')).toContain('etsypilot.test/')

    expect(await connectionRow(SHOP_A)).toBeNull()
    expect((await shopRow(SHOP_A))?.etsyShopId).toBeNull()
    expect(calls).toEqual([])
  })
})

describe('demo mode', () => {
  it('refuses, rather than showing sample data as the seller’s own shop', async () => {
    /*
     * The other direction of the is_demo rule. A connection sets is_demo =
     * false, which removes the demo banner and the demo provenance badge from
     * every figure — and with ETSY_MODE unset, getEtsyService() still serves
     * the Willow & Fern catalogue. Handling only the first direction would
     * read as fixed while shipping the opposite lie.
     */
    delete process.env.ETSY_MODE

    const response = await GET(callbackRequest())
    expect(outcomeOf(response)).toBe('demo_mode')
    expect(calls, 'the code was exchanged for a connection that was never saved').toEqual([])
    expect(await connectionRow(SHOP_A)).toBeNull()
    expect((await shopRow(SHOP_A))?.isDemo).toBe(true)
  })
})

describe('the Application Terms gate, at the start of the flow', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════════
   *   DRIVEN, NOT INFERRED. THE CALLBACK GATE IS TESTED BELOW; THIS IS THE
   *   ONE THAT STOPS A SELLER EVER REACHING ETSY.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Etsy's API Terms §4 requires executed Application Terms with each seller.
   * The refusal has to happen before a PKCE verifier is minted, because the
   * verifier in the flow cookie is the thing that makes a callback
   * exchangeable — so this test also establishes the answer to "what stops
   * somebody going straight to the callback": with no verifier, nothing can.
   */
  const connectRequest = () =>
    new Request('https://etsypilot.test/api/etsy/connect?scopes=listings_r')

  it('refuses before the seller leaves for Etsy, and sets no flow cookie', async () => {
    await getDb()
      .delete(schema.termsAcceptances)
      .where(inArray(schema.termsAcceptances.shopId, OURS))

    const response = await CONNECT(connectRequest())
    const location = response.headers.get('location') ?? ''
    expect(new URL(location).searchParams.get('connect')).toBe('terms_not_accepted')
    expect(new URL(location).pathname).toBe('/settings/shops')

    /*
     * No verifier was minted. This is the property the callback's own gate is
     * belt to: a seller with no agreement has no flow cookie, and PKCE makes
     * a code exchange without one impossible.
     */
    expect(response.headers.get('set-cookie') ?? '').not.toContain('etsy_oauth_flow')
  })

  it('sends the seller to Etsy once the agreement is on file', async () => {
    const response = await CONNECT(connectRequest())
    const location = response.headers.get('location') ?? ''
    expect(location, 'an accepted seller was not sent to Etsy').toContain('etsy.com')
    expect(response.headers.get('set-cookie') ?? '').toContain('etsy_oauth_flow')
  })
})

describe('no refusal leaves half a connection', () => {
  it('writes neither row when Etsy reports no shop', async () => {
    vi.stubGlobal('fetch', fakeEtsy({ me: { user_id: 991 } }))
    expect(outcomeOf(await GET(callbackRequest()))).toBe('no_shop')
    expect(await connectionRow(SHOP_A)).toBeNull()
    expect((await shopRow(SHOP_A))?.etsyShopId).toBeNull()
    expect((await shopRow(SHOP_A))?.name).toBe(DEMO_NAME)
  })

  it('writes neither row when the token exchange fails', async () => {
    vi.stubGlobal('fetch', fakeEtsy({ tokenStatus: 400 }))
    expect(outcomeOf(await GET(callbackRequest()))).toBe('exchange_failed')
    expect(await connectionRow(SHOP_A)).toBeNull()
    expect((await shopRow(SHOP_A))?.isDemo).toBe(true)
  })

  it('writes neither row when the session shop does not exist', async () => {
    /*
     * The transaction's own failure path. The shop UPDATE runs first and
     * reports zero rows, so the token insert never happens — which is the
     * ordering that makes "no token row without a shop update" true rather
     * than hoped for.
     */
    session = { userId: USER_A, email: 'a@conn.test', name: 'A Seller', shopId: 'shop-that-is-not-there', isDemo: true }
    flowCookie = JSON.stringify({
      state: 'the-state',
      verifier: 'a'.repeat(43),
      userId: USER_A,
      scopes: ['listings_r'],
    })

    /*
     * The outcome moved from 'exchange_failed' to 'terms_not_accepted' when
     * the Application Terms gate landed, and the new one is reached FIRST
     * because it runs before the code is exchanged. A shop that does not
     * exist holds no acceptance, so that is the honest answer the route can
     * give without a second query — and the property this test is actually
     * about is unchanged and still asserted below: neither row is written.
     *
     * It is also a strictly better failure here. The old path minted a token
     * from Etsy and then discovered the shop was missing; this one never
     * asks Etsy for a token it cannot store.
     */
    expect(outcomeOf(await GET(callbackRequest()))).toBe('terms_not_accepted')
    expect(await connectionRow('shop-that-is-not-there')).toBeNull()
    expect(await connectionRow(SHOP_A)).toBeNull()
    // And no token was minted: the gate refused before the exchange.
    expect(calls).toEqual([])
  })

  it('writes neither row when the flow cookie is missing', async () => {
    flowCookie = undefined
    expect(outcomeOf(await GET(callbackRequest()))).toBe('expired')
    expect(await connectionRow(SHOP_A)).toBeNull()
    expect(calls).toEqual([])
  })

  it('writes neither row when the state does not match', async () => {
    expect(outcomeOf(await GET(callbackRequest({ state: 'somebody-elses-state' })))).toBe(
      'state_mismatch',
    )
    expect(await connectionRow(SHOP_A)).toBeNull()
    expect(calls).toEqual([])
  })

  it('reports cancelled without touching anything when the seller declines', async () => {
    expect(outcomeOf(await GET(callbackRequest({ error: 'access_denied' })))).toBe('cancelled')
    expect(await connectionRow(SHOP_A)).toBeNull()
    expect(calls).toEqual([])
  })
})
