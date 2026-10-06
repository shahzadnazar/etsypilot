import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

import {
  DatabaseTokenStore,
  MemoryTokenStore,
  getTokenStore,
  openTokens,
  sealTokens,
  setTokenStore,
} from '@/lib/etsy/tokens'
import type { TokenSet } from '@/lib/etsy/oauth'

/*
 * The database token store — the half that needs no database.
 *
 * ── WHAT IS HERE AND WHAT IS NEXT DOOR ───────────────────────────────────
 *
 * Everything in this file runs in `npm test`, with no Postgres anywhere, and
 * it is not the leftovers: the most security-relevant requirement — that a
 * missing key refuses every call rather than quietly storing plaintext or
 * answering "not connected" — is checkable here precisely because the key is
 * checked BEFORE the first query. A test that needed a database to prove that
 * would be a test nobody runs.
 *
 * The behaviours that genuinely need a real table — the round trip, the
 * foreign key, a tampered row, revocation keeping its row — are in
 * tests/integration/etsy-tokens.int.ts, run against live Postgres by
 * `npm run test:integration`. That split follows what this repository already
 * does with the admin repositories: their logic is asserted structurally in
 * tests/unit, and their behaviour against real tables by a suite that is run
 * deliberately with a database in front of it.
 */

const TOKENS: TokenSet = {
  accessToken: 'at-abc',
  refreshToken: 'rt-def',
  expiresAt: '2026-01-01T00:00:00.000Z',
  scopes: ['listings_r', 'listings_w'],
}

const KEY = process.env.TOKEN_ENCRYPTION_KEY

afterEach(() => {
  if (KEY === undefined) delete process.env.TOKEN_ENCRYPTION_KEY
  else process.env.TOKEN_ENCRYPTION_KEY = KEY
  setTokenStore(null)
})

describe('with no TOKEN_ENCRYPTION_KEY, nothing happens quietly', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════
   *   THE TWO FAILURES THAT MUST NOT HAPPEN ARE "STORED UNENCRYPTED" AND
   *   "RETURNED NULL". NULL READS AS "NOT CONNECTED".
   * ══════════════════════════════════════════════════════════════════════
   *
   * A seller told their shop is disconnected reconnects it. If the real
   * problem was a missing server key, they will reconnect, be told the same
   * thing, and conclude the product is broken — having been given a remedy
   * that cannot work. The throw is what makes the misconfiguration land on us
   * instead of on them.
   */
  const store = new DatabaseTokenStore()

  it('refuses a read, and names the variable', async () => {
    delete process.env.TOKEN_ENCRYPTION_KEY
    await expect(store.read('shop-1')).rejects.toThrow(/TOKEN_ENCRYPTION_KEY/)
  })

  it('refuses a write, and names the variable', async () => {
    delete process.env.TOKEN_ENCRYPTION_KEY
    await expect(store.write('shop-1', TOKENS)).rejects.toThrow(/TOKEN_ENCRYPTION_KEY/)
  })

  it('refuses a forget, and names the variable', async () => {
    /*
     * forget() needs no key to null a column, and throws anyway. A store that
     * can neither read nor write is not a store, and a forget that SUCCEEDED
     * here would stamp a revocation date onto a row for a connection this
     * deployment could never have made — a false record rather than a missing
     * one, and the harder of the two to notice.
     */
    delete process.env.TOKEN_ENCRYPTION_KEY
    await expect(store.forget('shop-1')).rejects.toThrow(/TOKEN_ENCRYPTION_KEY/)
  })

  it('never returns null instead of refusing', async () => {
    // The converse of the three above, and the assertion that would catch a
    // "helpful" future edit that swapped the throw for a null.
    delete process.env.TOKEN_ENCRYPTION_KEY
    const outcome = await store.read('shop-1').then(
      (value) => ({ resolved: value }),
      (error: unknown) => ({ rejected: error }),
    )
    expect(outcome).not.toHaveProperty('resolved')
  })

  it('refuses a key of the wrong length rather than padding it', async () => {
    // 16 bytes, not 32. AES-256 needs exactly 32, and a store that stretched
    // or truncated one would encrypt with a key nobody chose.
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64')
    await expect(store.read('shop-1')).rejects.toThrow(/TOKEN_ENCRYPTION_KEY/)
  })
})

describe('describe() is shown to sellers, so it says what is true', () => {
  const store = new DatabaseTokenStore()

  it('no longer claims the store is unwired', () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32).toString('base64')
    const text = store.describe()
    expect(text).not.toMatch(/not wired|not yet/i)
    expect(text).toMatch(/encrypted/i)
    // The connect screen's reader wants to know what disconnecting does, and
    // this is the only string on that screen that can tell them.
    expect(text).toMatch(/disconnect/i)
  })

  it('names the variable when there is no key, instead of throwing', () => {
    /*
     * The one method that must NOT throw without a key. Its whole purpose is
     * to be rendered; a describe() that threw would replace an explanation
     * with an error page, which is the opposite of the job.
     */
    delete process.env.TOKEN_ENCRYPTION_KEY
    expect(() => store.describe()).not.toThrow()
    expect(store.describe()).toMatch(/TOKEN_ENCRYPTION_KEY/)
  })

  it('tells a missing key apart from a malformed one', () => {
    /*
     * "You have not set it" and "what you set is not 32 bytes" send someone to
     * two different places. encryptionKey() signals them differently too —
     * null for the first, a throw for the second — so collapsing them here
     * would be throwing away information the function went to trouble to
     * provide.
     */
    delete process.env.TOKEN_ENCRYPTION_KEY
    const missing = store.describe()
    process.env.TOKEN_ENCRYPTION_KEY = 'not-base64-32-bytes'
    const malformed = store.describe()
    expect(missing).not.toBe(malformed)
    expect(missing).toMatch(/not set/i)
    expect(malformed).toMatch(/32 bytes/i)
  })

  it('mentions no token value, ever', () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32).toString('base64')
    for (const text of [store.describe(), new MemoryTokenStore().describe()]) {
      expect(text).not.toMatch(/at-|rt-|bearer/i)
    }
  })
})

describe('the selector', () => {
  const DB = process.env.DATABASE_URL

  afterEach(() => {
    if (DB === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = DB
    setTokenStore(null)
  })

  it('chooses the database store whenever DATABASE_URL is set', () => {
    process.env.DATABASE_URL = 'postgres://unused@127.0.0.1:1/none'
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32).toString('base64')
    setTokenStore(null)
    expect(getTokenStore()).toBeInstanceOf(DatabaseTokenStore)
  })

  it('still chooses it with NO encryption key — a loud failure beats a silent downgrade', () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE DECISION THIS FILE EXISTS TO PIN DOWN.
     * ══════════════════════════════════════════════════════════════════════
     *
     * Requiring the key in the selector looks like the safer rule and is the
     * more dangerous one. A deployment that set DATABASE_URL asked for
     * persistence; handing it MemoryTokenStore instead gives it a store that
     * loses every token on restart and is invisible to a second instance — so
     * a shop connects, works, and disconnects itself at the next deploy with
     * nothing saying why.
     *
     * Neither store works without a key. Only one of them says so.
     */
    process.env.DATABASE_URL = 'postgres://unused@127.0.0.1:1/none'
    delete process.env.TOKEN_ENCRYPTION_KEY
    setTokenStore(null)
    expect(getTokenStore()).toBeInstanceOf(DatabaseTokenStore)
    expect(getTokenStore().describe()).toMatch(/TOKEN_ENCRYPTION_KEY/)
  })

  it('chooses the memory store only when there is no database', () => {
    delete process.env.DATABASE_URL
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32).toString('base64')
    setTokenStore(null)
    expect(getTokenStore()).toBeInstanceOf(MemoryTokenStore)
  })

  it('does not read the key while choosing', () => {
    /*
     * A malformed key used to come out of getTokenStore() as a bare
     * "must be 32 bytes", from a function whose name suggests nothing about
     * keys, before any store existed to explain itself. Selection is now
     * key-free in the database branch, so the explanation comes from the store
     * — which is also the only thing that can render it.
     */
    process.env.DATABASE_URL = 'postgres://unused@127.0.0.1:1/none'
    process.env.TOKEN_ENCRYPTION_KEY = 'nowhere-near-32-bytes'
    setTokenStore(null)
    expect(() => getTokenStore()).not.toThrow()
  })
})

describe('the memory store stays the honest fallback', () => {
  it('still says tokens are lost on restart', () => {
    // Unchanged on purpose. The database store arriving does not make this
    // store's warning less true for a process running without one.
    expect(new MemoryTokenStore().describe()).toMatch(/lost on restart/i)
  })

  it('round trips, which is what makes it a usable reference', async () => {
    const store = new MemoryTokenStore(Buffer.alloc(32, 7))
    await store.write('shop-a', TOKENS)
    expect(await store.read('shop-a')).toEqual(TOKENS)
    expect(await store.read('shop-b')).toBeNull()
  })
})

describe('the cryptography the store leans on is unchanged', () => {
  /*
   * Asserted here rather than taken on trust, because the store's whole claim
   * rests on it. These are the properties the database tests then exercise
   * through real rows.
   */
  const key = Buffer.alloc(32, 3)

  it('seals and opens the same token set', () => {
    expect(openTokens(sealTokens(TOKENS, key), key)).toEqual(TOKENS)
  })

  it('produces a different ciphertext each time, from a random IV', () => {
    // Which is why write() seals ONCE and reuses the value: two calls would
    // never produce matching strings, and a future comparison between them
    // would always report a change.
    expect(sealTokens(TOKENS, key)).not.toBe(sealTokens(TOKENS, key))
  })

  it('fails to open a tampered value rather than decrypting to something else', () => {
    const sealed = sealTokens(TOKENS, key)
    const [iv, tag, body] = sealed.split('.')
    const flipped = Buffer.from(body!, 'base64')
    flipped[0] = flipped[0]! ^ 0xff
    expect(() => openTokens([iv, tag, flipped.toString('base64')].join('.'), key)).toThrow()
  })

  it('refuses a value sealed under a different key', () => {
    expect(() => openTokens(sealTokens(TOKENS, key), Buffer.alloc(32, 9))).toThrow()
  })
})

describe('the store is not reachable from the operator console', () => {
  /*
   * The operator area may write exactly four things and etsy_connections is
   * not one of them. tests/unit/operator-write-boundary.test.ts walks the
   * import graph and is the authority; this asserts the direction nobody
   * checks from the other end — that the token store does not reach back into
   * the operator modules and quietly join that closure.
   */
  const source = readFileSync('lib/etsy/tokens.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('imports nothing from domain/admin or the admin repositories', () => {
    expect(source).not.toMatch(/from '@\/domain\/admin/)
    expect(source).not.toMatch(/from '@\/lib\/repositories\/admin-/)
  })

  it('keeps the server-only marker that keeps a refresh token out of a bundle', () => {
    expect(source).toContain("import 'server-only'")
  })

  it('writes to exactly one table', () => {
    // A store that touched `shops` to repair a missing row would be a token
    // store writing seller data, which is a different thing wearing this
    // thing's name.
    const written = [...source.matchAll(/\.(?:insert|update|delete)\(schema\.(\w+)\)/g)].map(
      (match) => match[1],
    )
    expect([...new Set(written)]).toEqual(['etsyConnections'])
  })

  it('never deletes a connection row', () => {
    // Revocation is a fact worth keeping. A delete is how "disconnected on
    // this date" silently becomes "never connected".
    expect(source).not.toMatch(/\.delete\(schema\.etsyConnections\)/)
  })
})

describe('the database behaviours are covered next door, and the index says where', () => {
  /*
   * AN INDEX, NOT A PROOF, and labelled as one. It cannot tell you the
   * integration suite passes — only that it exists and still names each
   * behaviour the brief asked for. That is worth having anyway: a suite that
   * is run deliberately is a suite that can be quietly deleted, and this fails
   * when it is.
   */
  const FILE = 'tests/integration/etsy-tokens.int.ts'

  it('exists', () => {
    expect(existsSync(FILE), `${FILE} is missing`).toBe(true)
  })

  it('still covers every behaviour that needs a real table', () => {
    const source = readFileSync(FILE, 'utf8')
    for (const behaviour of [
      'round trip',
      'no row',
      'revokedAt',
      'another shop',
      'tampered',
      'foreign key',
    ]) {
      expect(source.toLowerCase(), behaviour).toContain(behaviour.toLowerCase())
    }
  })
})
