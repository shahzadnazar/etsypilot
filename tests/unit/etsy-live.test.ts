/*
 * Phase 11 — live Etsy integration.
 *
 * Every test in this file runs with NO Etsy credentials, no network and no
 * Etsy account, because the transport, the clock and the randomness are all
 * injected (D28). That is not a convenience: an integration whose security
 * properties can only be checked against a live provider is an integration
 * whose security properties are never checked.
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  authorizeUrl,
  createPkcePair,
  createState,
  exchangeCode,
  needsRefresh,
  OAuthError,
  refreshTokens,
  statesMatch,
  type TokenSet,
} from '@/lib/etsy/oauth'
import { backoff, EtsyClient, redact } from '@/lib/etsy/http'
import type { AppError } from '@/lib/errors/types'
import { MemoryTokenStore, openTokens, sealTokens } from '@/lib/etsy/tokens'
import { LiveEtsyService, toListing, toOrder } from '@/lib/etsy/live'
import { readFlowCookie } from '@/app/api/etsy/_flow'
import { CONNECT_OUTCOMES, connectOutcome } from '@/domain/connect/types'

const ROOT = process.cwd()
const KEY = Buffer.alloc(32, 7)

const TOKENS: TokenSet = {
  accessToken: '12345.abcdefghijklmnop',
  refreshToken: '12345.qrstuvwxyz012345',
  expiresAt: '2026-08-20T12:00:00.000Z',
  scopes: ['listings_r'],
}

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
}

/* ------------------------------------------------------------------- PKCE */

describe('PKCE', () => {
  it('derives the challenge from the verifier with S256, one way', () => {
    const { verifier, challenge } = createPkcePair()
    const expected = createHash('sha256').update(verifier).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    expect(challenge).toBe(expected)
    // One way: the challenge cannot be turned back into the verifier, which is
    // the entire reason the challenge is the half that goes to Etsy.
    expect(challenge).not.toContain(verifier)
  })

  it('produces a verifier inside RFC 7636 length limits, from base64url only', () => {
    const { verifier } = createPkcePair()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/)
  })

  it('never repeats a verifier or a state', () => {
    const verifiers = new Set(Array.from({ length: 50 }, () => createPkcePair().verifier))
    const states = new Set(Array.from({ length: 50 }, () => createState()))
    expect(verifiers.size).toBe(50)
    expect(states.size).toBe(50)
  })
})

describe('state comparison', () => {
  it('accepts only the state it issued', () => {
    const state = createState()
    expect(statesMatch(state, state)).toBe(true)
    expect(statesMatch(state, createState())).toBe(false)
  })

  it('refuses a missing state on either side instead of matching nothing to nothing', () => {
    expect(statesMatch(undefined, 'abc')).toBe(false)
    expect(statesMatch('abc', null)).toBe(false)
    expect(statesMatch(undefined, null)).toBe(false)
    expect(statesMatch('', '')).toBe(false)
  })

  it('does not throw on a length mismatch', () => {
    // timingSafeEqual throws when the buffers differ in length. A CSRF attempt
    // must be refused, not turned into a 500 with a stack trace.
    expect(() => statesMatch('short', 'a-much-longer-value')).not.toThrow()
    expect(statesMatch('short', 'a-much-longer-value')).toBe(false)
  })
})

/* ----------------------------------------------------------- authorize URL */

describe('the authorize URL', () => {
  const url = new URL(
    authorizeUrl({
      clientId: 'test-keystring',
      redirectUri: 'https://example.test/api/etsy/callback',
      scopes: ['listings_r', 'shops_r'],
      state: 'state-value',
      challenge: 'challenge-value',
    }),
  )

  it('sends the browser to etsy.com, where the password is typed', () => {
    expect(url.origin).toBe('https://www.etsy.com')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toBe('listings_r shops_r')
  })

  it('carries nothing worth stealing', () => {
    const { verifier, challenge } = createPkcePair()
    const built = authorizeUrl({
      clientId: 'test-keystring',
      redirectUri: 'https://example.test/api/etsy/callback',
      scopes: ['listings_r'],
      state: 'state-value',
      challenge,
    })
    // This URL ends up in browser history and possibly a referrer header.
    expect(built).not.toContain(verifier)
    expect(built).not.toContain('secret')
    expect(built).not.toContain('code_verifier')
  })
})

/* -------------------------------------------------------------- exchange */

describe('the token exchange', () => {
  it('sends the verifier and never the challenge', async () => {
    let sentBody = ''
    const tokens = await exchangeCode({
      clientId: 'k',
      redirectUri: 'https://example.test/cb',
      code: 'auth-code',
      verifier: 'the-verifier',
      now: () => Date.parse('2026-08-20T10:00:00.000Z'),
      fetchImpl: async (_url, init) => {
        sentBody = String((init as RequestInit).body)
        return jsonResponse({ access_token: 'a', refresh_token: 'r', expires_in: 3600 })
      },
    })

    expect(sentBody).toContain('code_verifier=the-verifier')
    expect(sentBody).toContain('grant_type=authorization_code')
    expect(tokens.expiresAt).toBe('2026-08-20T11:00:00.000Z')
  })

  it('treats a missing expires_in as the shortest plausible life, not a long one', async () => {
    const tokens = await refreshTokens({
      clientId: 'k',
      refreshToken: 'r',
      now: () => Date.parse('2026-08-20T10:00:00.000Z'),
      fetchImpl: async () => jsonResponse({ access_token: 'a', refresh_token: 'r2' }),
    })
    // Refreshing early is cheap. A dead token mid-bulk-job is not.
    expect(tokens.expiresAt).toBe('2026-08-20T11:00:00.000Z')
  })

  it('refuses a 200 that carries no tokens rather than storing undefined', async () => {
    await expect(
      exchangeCode({
        clientId: 'k',
        redirectUri: 'https://example.test/cb',
        code: 'c',
        verifier: 'v',
        fetchImpl: async () => jsonResponse({ token_type: 'Bearer' }),
      }),
    ).rejects.toBeInstanceOf(OAuthError)
  })

  it('cannot serialise a credential even if the error is stringified', () => {
    const error = new OAuthError('invalid_grant', 'The code has expired.')
    const serialised = JSON.stringify(error)
    expect(serialised).toContain('invalid_grant')
    // There is nowhere on this class to put a token, and toJSON is closed.
    expect(serialised).not.toContain('verifier')
    expect(serialised).not.toContain('access_token')
    expect(Object.keys(JSON.parse(serialised)).sort()).toEqual(['code', 'description', 'name'])
  })
})

describe('refresh timing', () => {
  const now = Date.parse('2026-08-20T11:59:00.000Z')

  it('refreshes inside the margin, not at the moment of death', () => {
    expect(needsRefresh(TOKENS, now)).toBe(true)
    expect(needsRefresh(TOKENS, now - 10 * 60_000)).toBe(false)
  })
})

/* ------------------------------------------------------- the HTTP client */

describe('rate limiting', () => {
  function client(responses: Response[], record: { waits: number[] }) {
    let call = 0
    return new EtsyClient({
      apiKey: 'test-key',
      accessToken: async () => 'test-token',
      sleep: async (ms) => void record.waits.push(ms),
      jitter: () => 0.5,
      maxRetries: 2,
      fetchImpl: async () => responses[Math.min(call++, responses.length - 1)]!,
    })
  }

  it('honours Retry-After exactly rather than guessing shorter', async () => {
    const record = { waits: [] as number[] }
    const c = client(
      [
        new Response('', { status: 429, headers: { 'retry-after': '30' } }),
        jsonResponse({ ok: true }),
      ],
      record,
    )

    await c.get('/shops/1')
    // Guessing shorter than a provider asked is how a rate limit becomes a ban.
    expect(record.waits).toEqual([30_000])
  })

  it('backs off exponentially with jitter when Etsy gives no Retry-After', async () => {
    const record = { waits: [] as number[] }
    const c = client([new Response('', { status: 503 }), jsonResponse({ ok: true })], record)

    await c.get('/shops/1')
    expect(record.waits).toEqual([backoff(1, () => 0.5)])
    expect(backoff(1, () => 0.5)).toBeLessThan(backoff(3, () => 0.5))
    // Capped, so a long outage does not turn into a half-hour sleep.
    expect(backoff(20, () => 0.5)).toBeLessThanOrEqual(10_000)
  })

  it('waits before spending a budget Etsy said was empty', async () => {
    const record = { waits: [] as number[] }
    const c = client(
      [
        jsonResponse({ ok: true }, { headers: { 'x-remaining-this-second': '0', 'x-remaining-today': '4980' } }),
        jsonResponse({ ok: true }),
      ],
      record,
    )

    await c.get('/shops/1')
    expect(c.rateBudget().remainingToday).toBe(4980)
    await c.get('/shops/1')
    // Pacing, not discovering the limit by being refused.
    expect(record.waits).toEqual([1000])
  })

  it('gives up honestly after the retry budget, saying nothing was lost', async () => {
    const record = { waits: [] as number[] }
    const c = client([new Response('', { status: 429, headers: { 'retry-after': '120' } })], record)

    await expect(c.get('/shops/1')).rejects.toMatchObject({
      code: 'ETSY_RATE_LIMIT',
      retryable: true,
    })
  })
})

describe('credentials never reach an error or a log', () => {
  it('attaches the path but not the query string or the headers', async () => {
    const c = new EtsyClient({
      apiKey: 'super-secret-keystring',
      accessToken: async () => 'super-secret-token',
      fetchImpl: async () => jsonResponse({ error: 'listing not found' }, { status: 404 }),
    })

    const error = (await c
      .get('/shops/1/listings', { limit: 100, offset: 0 })
      .catch((e: unknown) => e)) as AppError
    const serialised = JSON.stringify({ message: error.message, context: error.context })

    expect(error.code).toBe('ETSY_HTTP_404')
    expect(serialised).toContain('/v3/application/shops/1/listings')
    expect(serialised).not.toContain('super-secret-keystring')
    expect(serialised).not.toContain('super-secret-token')
    expect(serialised).not.toContain('limit=100')
  })

  it('redacts anything credential-shaped that a caller attaches anyway', () => {
    expect(redact('Authorization: Bearer abc.def-ghi')).toBe('Authorization: Bearer [redacted]')
    expect(redact('code_verifier=abcdef&code=1')).toBe('code_verifier=[redacted]&code=1')
    expect(redact({ apiKey: 'abc', nested: { refresh_token: 'xyz' } })).toEqual({
      apiKey: '[redacted]',
      nested: { refresh_token: '[redacted]' },
    })
    // Ordinary values are untouched: a redactor that eats real detail gets
    // turned off.
    expect(redact({ shopId: 'shop_1', count: 4 })).toEqual({ shopId: 'shop_1', count: 4 })
  })
})

/* -------------------------------------------------------- token storage */

describe('tokens at rest', () => {
  it('round-trips through AES-256-GCM', () => {
    const sealed = sealTokens(TOKENS, KEY)
    expect(openTokens(sealed, KEY)).toEqual(TOKENS)
  })

  it('stores no readable fragment of the token', () => {
    const sealed = sealTokens(TOKENS, KEY)
    // A database backup is a file like any other.
    expect(sealed).not.toContain(TOKENS.accessToken)
    expect(sealed).not.toContain(TOKENS.refreshToken)
    expect(sealed).not.toContain('abcdefghijklmnop')
  })

  it('refuses a tampered row instead of decrypting it to something else', () => {
    const [iv, tag, body] = sealTokens(TOKENS, KEY).split('.')
    const flipped = Buffer.from(body!, 'base64')
    flipped[0] = flipped[0]! ^ 0xff
    expect(() => openTokens([iv, tag, flipped.toString('base64')].join('.'), KEY)).toThrow()
  })

  it('keeps one shop’s tokens away from another’s', async () => {
    const store = new MemoryTokenStore(KEY)
    await store.write('shop_a', TOKENS)
    expect(await store.read('shop_b')).toBeNull()
    await store.forget('shop_a')
    expect(await store.read('shop_a')).toBeNull()
  })

  it('says what it is rather than reporting a false “connected”', () => {
    expect(new MemoryTokenStore(KEY).describe()).toMatch(/lost on restart/i)
  })
})

/* --------------------------------------------------------------- mappers */

describe('mapping Etsy’s shapes to ours', () => {
  it('reads a price as integer minor units over a divisor', () => {
    const listing = toListing({
      listing_id: 1400001001,
      title: 'Birth Flower Necklace',
      description: 'Handmade',
      tags: ['necklace'],
      price: { amount: 3450, divisor: 100, currency_code: 'USD' },
      quantity: 12,
      state: 'active',
      last_modified_timestamp: 1_755_000_000,
    })

    expect(listing.price).toBe(34.5)
    expect(listing.state).toBe('ACTIVE')
    expect(listing.etsyListingId).toBe('1400001001')
    expect(listing.lastChangedAt).toBe(new Date(1_755_000_000_000).toISOString())
  })

  it('leaves unfetched attributes empty on BOTH sides, so no rule fires on absent data', () => {
    const listing = toListing({
      listing_id: 1,
      title: 't',
      description: '',
      tags: [],
      quantity: 0,
      state: 'draft',
    })
    // Empty attributes with a populated requiredAttributes would flag every
    // listing in the shop for a field that was never loaded.
    expect(listing.attributes).toEqual({})
    expect(listing.requiredAttributes).toEqual([])
    expect(listing.state).toBe('DRAFT')
  })

  it('maps an unknown listing state to INACTIVE rather than inventing one', () => {
    expect(toListing({ listing_id: 1, title: 't', description: '', tags: [], quantity: 0, state: 'sold_out' }).state)
      .toBe('INACTIVE')
  })

  it('marks an unknown buyer country XX, with no second field to disagree with it', () => {
    const order = toOrder({ receipt_id: 9, created_timestamp: 1_755_000_000 })
    expect(order.countryCode).toBe('XX')
    expect(Object.keys(order)).not.toContain('buyerCountry')
  })

  it('leaves fees at zero because they come from the ledger, not the receipt', () => {
    const order = toOrder({
      receipt_id: 9,
      created_timestamp: 1_755_000_000,
      grandtotal: { amount: 4200, divisor: 100 },
      transactions: [{ listing_id: 1, quantity: 2, price: { amount: 1800, divisor: 100 } }],
    })
    expect(order.gross).toBe(42)
    expect(order.items[0]!.unitPrice).toBe(18)
    expect(order.etsyFees).toBe(0)
  })
})

/* ---------------------------------------------------------------- writes */

describe('applying listing changes', () => {
  function adapter(handler: (path: string, body: Record<string, unknown>) => Response) {
    const sent: { path: string; body: Record<string, unknown> }[] = []
    const service = new LiveEtsyService(
      () =>
        new EtsyClient({
          apiKey: 'k',
          accessToken: async () => 't',
          maxRetries: 0,
          sleep: async () => {},
          fetchImpl: async (url, init) => {
            const body = JSON.parse(String((init as RequestInit).body ?? '{}')) as Record<string, unknown>
            const path = new URL(String(url)).pathname
            sent.push({ path, body })
            return handler(path, body)
          },
        }),
    )
    return { service, sent }
  }

  it('sends only the fields the confirmed operation changed', async () => {
    const { service, sent } = adapter(() => jsonResponse({ listing_id: 1 }))

    const results = await service.applyListingChanges('shop_1', [
      { etsyListingId: '1400001001', changes: { tags: ['a', 'b'] } },
    ])

    expect(results).toEqual([{ etsyListingId: '1400001001', status: 'SUCCEEDED' }])
    // Sending the whole listing back would overwrite a title the seller edited
    // on Etsy between the diff and the apply.
    expect(sent[0]!.body).toEqual({ tags: ['a', 'b'] })
    expect(sent[0]!.path).toContain('/shops/shop_1/listings/1400001001')
  })

  it('reports an empty change as SKIPPED, so the audit log records no write', async () => {
    const { service, sent } = adapter(() => jsonResponse({}))
    const results = await service.applyListingChanges('shop_1', [{ etsyListingId: '2', changes: {} }])

    expect(results).toEqual([{ etsyListingId: '2', status: 'SKIPPED' }])
    expect(sent).toHaveLength(0)
  })

  it('keeps going after a failure, and reports each item independently', async () => {
    const { service } = adapter((_path, body) =>
      body.price === 99 ? jsonResponse({ error: 'price too low' }, { status: 400 }) : jsonResponse({}),
    )

    const results = await service.applyListingChanges('shop_1', [
      { etsyListingId: '1', changes: { price: 10 } },
      { etsyListingId: '2', changes: { price: 99 } },
      { etsyListingId: '3', changes: { price: 12 } },
    ])

    // Item 2 failing must not roll back item 1 or stop item 3 being attempted.
    expect(results.map((r) => r.status)).toEqual(['SUCCEEDED', 'FAILED', 'SUCCEEDED'])
    expect(results[1]!.error).toBe('Etsy could not complete that request.')
    expect(results[1]!.error).not.toContain('price too low')
  })

  it('lowercases state for Etsy without leaking our vocabulary', async () => {
    const { service, sent } = adapter(() => jsonResponse({}))
    await service.applyListingChanges('shop_1', [{ etsyListingId: '1', changes: { state: 'DRAFT' } }])
    expect(sent[0]!.body).toEqual({ state: 'draft' })
  })
})

describe('one shop’s credentials never serve another shop', () => {
  it('builds a client per shop, not one client for the process', async () => {
    /*
     * The token closure captures a shopId. A single cached client would capture
     * the FIRST shop it was built for and serve every later shop from those
     * credentials — silently, with no error, on a process-wide singleton
     * adapter. Found by reading the cache, not by a failure.
     */
    const built: string[] = []
    const service = new LiveEtsyService((shopId) => {
      built.push(shopId)
      return new EtsyClient({
        apiKey: 'k',
        accessToken: async () => `token-for-${shopId}`,
        fetchImpl: async (url) => {
          const path = new URL(String(url)).pathname
          return jsonResponse({ shop_id: 1, shop_name: path, currency_code: 'USD', listing_active_count: 0 })
        },
      })
    })

    const a = await service.getShop('shop_a')
    const b = await service.getShop('shop_b')

    expect(built).toEqual(['shop_a', 'shop_b'])
    expect(a.name).toContain('/shops/shop_a')
    expect(b.name).toContain('/shops/shop_b')
  })

  it('reuses the client for the same shop, so the cache is still a cache', async () => {
    const built: string[] = []
    const service = new LiveEtsyService((shopId) => {
      built.push(shopId)
      return new EtsyClient({
        apiKey: 'k',
        accessToken: async () => 't',
        fetchImpl: async () =>
          jsonResponse({ shop_id: 1, shop_name: 'x', currency_code: 'USD', listing_active_count: 0 }),
      })
    })

    await service.getShop('shop_a')
    await service.getShop('shop_a')
    expect(built).toEqual(['shop_a'])
  })
})

describe('a live connection does not conjure data Etsy withholds', () => {
  it('still refuses listing views and ads performance', async () => {
    const service = new LiveEtsyService(() => new EtsyClient({ apiKey: 'k', accessToken: async () => 't' }))

    const views = await service.getListingViews('shop_1', '1')
    const ads = await service.getAdsPerformance('shop_1')

    expect(views.value).toBeNull()
    expect(ads.value).toBeNull()
    expect(views.provenance.type).toBe('UNAVAILABLE')
    expect(ads.provenance.type).toBe('UNAVAILABLE')
  })

  it('reports a sync that has not started as 0% with an unknown ETA, not 0 seconds', async () => {
    const service = new LiveEtsyService(() => new EtsyClient({ apiKey: 'k', accessToken: async () => 't' }))
    const progress = await service.getSyncProgress('shop_1')

    expect(progress.overallPercent).toBe(0)
    // null is how this product says unknown. 0 would read as "arriving now".
    expect(progress.etaSeconds).toBeNull()
    expect(progress.stages.every((s) => s.status === 'PENDING')).toBe(true)
  })
})

/* ------------------------------------------------------------ the flow */

describe('the OAuth flow cookie', () => {
  it('accepts a complete flow', () => {
    const flow = { state: 's', verifier: 'v', userId: 'u', scopes: ['listings_r'] }
    expect(readFlowCookie(JSON.stringify(flow))).toEqual(flow)
  })

  /*
   * One field at a time, not "some fields missing". A deliberate break that
   * deleted the userId check left the earlier version of this test green,
   * because every case it tried was also missing `scopes` — a check nothing
   * exercises is a check that is not there. Dropping the userId check is what
   * would let a callback be completed in someone else's session.
   */
  it.each([
    ['state', { verifier: 'v', userId: 'u', scopes: [] }],
    ['verifier', { state: 's', userId: 'u', scopes: [] }],
    ['userId', { state: 's', verifier: 'v', scopes: [] }],
    ['scopes', { state: 's', verifier: 'v', userId: 'u' }],
  ])('rejects a flow missing only %s, rather than half-completing a connection', (_field, flow) => {
    expect(readFlowCookie(JSON.stringify(flow))).toBeNull()
  })

  it('never throws on a malformed cookie', () => {
    // A JSON parse trace is exactly the stack trace a user must never see.
    expect(() => readFlowCookie('not json')).not.toThrow()
    expect(readFlowCookie('not json')).toBeNull()
    expect(readFlowCookie(undefined)).toBeNull()
    expect(readFlowCookie('null')).toBeNull()
  })
})

describe('every outcome the routes can emit has copy a seller reads', () => {
  const routes = ['app/api/etsy/callback/route.ts', 'app/api/etsy/connect/route.ts']
    .map((p) => fs.readFileSync(path.join(ROOT, p), 'utf8'))
    .join('\n')

  it('emits nothing CONNECT_OUTCOMES does not describe', () => {
    const emitted = [...routes.matchAll(/(?:done|outcomeUrl\(request,\s*)\('([a-z_]+)'\)/g)].map((m) => m[1]!)
    expect(emitted.length).toBeGreaterThan(3)
    for (const outcome of emitted) {
      expect(Object.keys(CONNECT_OUTCOMES)).toContain(outcome)
    }
  })

  it('tells every failure that nothing was connected and nothing changed on Etsy', () => {
    for (const [key, copy] of Object.entries(CONNECT_OUTCOMES)) {
      if (key === 'connected' || key === 'not_configured') continue
      expect(copy.detail.toLowerCase()).toContain('nothing was connected')
    }
  })

  it('ignores an outcome someone typed into the URL bar', () => {
    expect(connectOutcome('made_up')).toBeNull()
    expect(connectOutcome(undefined)).toBeNull()
    expect(connectOutcome('connected')).toBe('connected')
  })
})

/* ------------------------------------------------------- the architecture */

describe('swapping the adapter is a one-file change', () => {
  const sources = listSources(['app', 'components', 'domain', 'lib'])

  it('is imported by nothing but the selector', () => {
    const importers = sources.filter(
      (f) =>
        /from\s+['"](@\/lib\/etsy\/live|\.\/live)['"]/.test(fs.readFileSync(f, 'utf8')) ||
        /require\(['"]\.\/live['"]\)/.test(fs.readFileSync(f, 'utf8')),
    )
    expect(importers.map((f) => path.relative(ROOT, f))).toEqual(['lib/etsy/index.ts'])
  })

  it('keeps the mock the same one-file change in the other direction', () => {
    const importers = sources.filter(
      (f) =>
        f !== path.join(ROOT, 'lib/etsy/index.ts') &&
        // Each adapter family has its own ./mock; only the Etsy one is in
        // question, so a relative import counts only from inside lib/etsy.
        (/from\s+['"]@\/lib\/etsy\/mock['"]/.test(fs.readFileSync(f, 'utf8')) ||
          (f.startsWith(path.join(ROOT, 'lib/etsy')) &&
            /from\s+['"]\.\/mock['"]/.test(fs.readFileSync(f, 'utf8')))),
    )
    expect(importers.map((f) => path.relative(ROOT, f))).toEqual([])
  })

  it('never exposes an Etsy credential to the browser', () => {
    // NEXT_PUBLIC_ is the only prefix that reaches the bundle. No Etsy value
    // may ever carry it, in source or in the template.
    const offenders = sources.filter((f) => /NEXT_PUBLIC_[A-Z_]*(ETSY|TOKEN)/.test(fs.readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
    expect(fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8')).not.toMatch(/NEXT_PUBLIC_[A-Z_]*ETSY/)
  })

  it('ships an env template with placeholders and no values', () => {
    const template = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8')
    for (const key of ['ETSY_API_KEY', 'ETSY_API_SECRET', 'ETSY_REDIRECT_URI', 'TOKEN_ENCRYPTION_KEY']) {
      expect(template).toMatch(new RegExp(`^${key}=\\s*$`, 'm'))
    }
  })
})

function listSources(roots: string[]): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name)) out.push(full)
    }
  }
  for (const root of roots) walk(path.join(ROOT, root))
  return out
}

/*
 * The alias in vitest.config.ts makes `server-only` a no-op for the test
 * runner. This is the guard that stops it becoming a way to delete the marker:
 * the runner may ignore it, but it must still be there for Next to enforce.
 */
describe('the server-only marker is still on every module that holds a secret', () => {
  it.each([
    'lib/etsy/tokens.ts',
    'lib/etsy/live.ts',
    'lib/ai/claude.ts',
    'lib/billing/stripe.ts',
  ])('%s', (file) => {
    expect(fs.readFileSync(path.join(ROOT, file), 'utf8')).toMatch(/^import 'server-only'$/m)
  })
})

/*
 * The build already refuses a client component that reaches the Etsy adapter.
 * This is here because one fixed surface is not a fixed class: the build says
 * WHICH import broke, this says WHAT the rule is, and it runs in three seconds
 * rather than ninety.
 */
describe('no client component can reach an Etsy credential', () => {
  const clientFiles = listSources(['app', 'components', 'domain', 'lib']).filter((f) =>
    /^['"]use client['"]/.test(fs.readFileSync(f, 'utf8').trimStart()),
  )

  it('finds the client components to check', () => {
    // A guard that silently checks nothing is worse than no guard.
    expect(clientFiles.length).toBeGreaterThan(5)
  })

  it.each([
    ['@/lib/etsy', 'the adapter selector, which resolves the live adapter'],
    ['@/lib/etsy/live', 'the live adapter itself'],
    ['@/lib/etsy/tokens', 'the token store'],
    ['@/domain/bulk-editor/service', 'the apply half, which reaches the adapter'],
  ])('imports neither %s (%s)', (module) => {
    const offenders = clientFiles.filter((f) =>
      new RegExp(`from\\s+['"]${module.replace(/[/\-]/g, '\\$&')}['"]`).test(fs.readFileSync(f, 'utf8')),
    )
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([])
  })
})
