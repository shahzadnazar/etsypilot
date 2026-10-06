/*
 * Etsy token storage.
 *
 * Server-only, and the marker is load-bearing rather than decorative: importing
 * this from a client component is a build error, which is the only reliable way
 * to keep a refresh token out of a bundle.
 *
 * The rules this file exists to enforce, from the brief:
 *
 *   - Etsy secrets are never in browser storage. There is no localStorage or
 *     cookie write anywhere in this module; tokens go to the database, keyed by
 *     shop, encrypted at rest.
 *   - Secrets are never exposed through API responses. `TokenSet` has no path
 *     out of the server: nothing returns it, and the one accessor a caller has
 *     hands back a bearer string to the HTTP client inside a closure.
 *   - A user must never operate on another shop's data. Every function here
 *     takes a shopId and the caller must already hold a ShopContext, which is
 *     the only sanctioned way to obtain one.
 *
 * Encryption at rest uses AES-256-GCM with a key from TOKEN_ENCRYPTION_KEY. A
 * database backup is not a place a refresh token should be readable, and "the
 * database is private" is a claim about infrastructure, not about the data.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO STORES, AND WHICH ONE RUNS IS DECIDED BY DATABASE_URL ALONE. See
 * getTokenStore() at the bottom for why the encryption key deliberately does
 * NOT take part in that choice.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb, isDatabaseConfigured, schema } from '@/lib/db'
import { AppError } from '@/lib/errors/types'
import type { TokenSet } from './oauth'

const ALGORITHM = 'aes-256-gcm'

export interface TokenStore {
  /** Human-readable, shown on the connect screen. Never mentions a value. */
  describe(): string
  read(shopId: string): Promise<TokenSet | null>
  write(shopId: string, tokens: TokenSet): Promise<void>
  /** Revocation. Removes the tokens; the shop's own data is untouched. */
  forget(shopId: string): Promise<void>
}

/* --------------------------------------------------------------- crypto */

function encryptionKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) return null
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32).')
  }
  return key
}

/**
 * Encrypt a token set for storage.
 *
 * Returns `iv.tag.ciphertext`, all base64. GCM rather than CBC so the stored
 * value is authenticated: a row edited in the database fails to decrypt instead
 * of decrypting to something else.
 */
export function sealTokens(tokens: TokenSet, key: Buffer, iv: Buffer = randomBytes(12)): string {
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.')
}

export function openTokens(sealed: string, key: Buffer): TokenSet {
  const [iv, tag, body] = sealed.split('.')
  if (!iv || !tag || !body) throw new Error('Stored token is not in the expected format.')

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  const plain = Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()])
  return JSON.parse(plain.toString('utf8')) as TokenSet
}

/* ---------------------------------------------------------------- stores */

/**
 * In-process storage, for a single server with no database configured.
 *
 * Deliberately says what it is. A store that silently loses tokens on restart
 * and describes itself as "connected" would have a seller reconnecting their
 * shop every deploy without knowing why.
 */
export class MemoryTokenStore implements TokenStore {
  private readonly rows = new Map<string, string>()
  private readonly key: Buffer

  constructor(key: Buffer = randomBytes(32)) {
    // Encrypted even in memory: a heap dump is a file like any other.
    this.key = key
  }

  describe(): string {
    return 'Tokens are held in this server process only. They are lost on restart, and a second instance will not see them — set DATABASE_URL to store them properly.'
  }

  async read(shopId: string): Promise<TokenSet | null> {
    const sealed = this.rows.get(shopId)
    return sealed ? openTokens(sealed, this.key) : null
  }

  async write(shopId: string, tokens: TokenSet): Promise<void> {
    this.rows.set(shopId, sealTokens(tokens, this.key))
  }

  async forget(shopId: string): Promise<void> {
    this.rows.delete(shopId)
  }
}

/**
 * Postgres error codes this store has to tell apart.
 *
 * By CODE, never by message. A message is a localised, version-dependent
 * string; `23503` is in the SQL standard and in every Postgres release. Parsing
 * "violates foreign key constraint" would be a guard that breaks on a server
 * locale.
 */
const FOREIGN_KEY_VIOLATION = '23503'

/**
 * The SQLSTATE behind a failed query, found by walking the cause chain.
 *
 * ── DRIZZLE WRAPS THE DRIVER'S ERROR, AND THE WRAPPER HAS NO `code` ──────
 *
 * The obvious `(error as { code }).code` reads undefined for every failure,
 * because what surfaces is a DrizzleQueryError whose `cause` is the postgres-js
 * error carrying the code. Measured, not assumed: the first version of this
 * store translated nothing, and the foreign-key test came back with raw SQL.
 */
function pgCode(error: unknown): string | null {
  let current: unknown = error
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
    current = (current as { cause?: unknown }).cause
  }
  return null
}

/**
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   A FAILED QUERY'S MESSAGE CONTAINS THE SEALED TOKEN. IT MUST NOT ESCAPE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * This was found by the foreign-key test rather than by reasoning, and it is
 * the sharpest thing in this file. Drizzle's error message is the SQL *and the
 * bound parameters*, so a failed write arrives looking like:
 *
 *   Failed query: insert into "etsy_connections" (...) values ($1, $2, $3...)
 *   params: tok-test-shop-does-not-exist,["listings_r"],kmCl7LHYpA4VxBH+.z/z…
 *                                                       ^^^^^^^^^^^^^^^^^^^^
 *                                                       the sealed token
 *
 * Re-throwing that puts a sealed credential into every log line, stack trace
 * and error reporter that records `error.message`. It is ciphertext rather than
 * plaintext — but the entire argument for encrypting at rest is that the stored
 * value should not be lying around in places nobody audited, and a log file is
 * exactly such a place. It is also one key disclosure away from being a usable
 * token, and logs outlive key rotations.
 *
 * So no query error leaves this store. What replaces it carries the SQLSTATE
 * and the constraint name — enough to diagnose, and neither of them a secret —
 * and nothing else.
 */
function queryFailure(args: {
  action: string
  shopId: string
  error: unknown
  recovery: string
  kind?: 'EXTERNAL_SERVICE' | 'NOT_FOUND'
}): AppError {
  const code = pgCode(args.error)
  return new AppError({
    kind: args.kind ?? 'EXTERNAL_SERVICE',
    code: 'TOKEN_QUERY_FAILED',
    message: `The Etsy connection for this shop could not be ${args.action}.`,
    recovery: args.recovery,
    retryable: true,
    /*
     * The SQLSTATE and the constraint, never the message. `detail` is left out
     * too: for a unique violation Postgres puts the conflicting VALUES in it,
     * which is the same leak by a quieter route.
     */
    context: {
      shopId: args.shopId,
      sqlstate: code,
      constraint: constraintName(args.error),
    },
  })
}

function constraintName(error: unknown): string | null {
  let current: unknown = error
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const name =
      (current as { constraint_name?: unknown }).constraint_name ??
      (current as { constraint?: unknown }).constraint
    if (typeof name === 'string') return name
    current = (current as { cause?: unknown }).cause
  }
  return null
}

/**
 * The database-backed store.
 *
 * ── THE KEY IS READ PER CALL, NOT PER CONSTRUCTION ────────────────────────
 *
 * getTokenStore() memoises the store in a module-level variable, so a key read
 * in the constructor would be a decision frozen at whichever moment the first
 * caller happened to arrive. Reading it in each method means `describe()` can
 * tell the connect screen the truth right now, and a deployment that adds the
 * variable and restarts nothing is still wrong in a way that says so.
 *
 * ── EVERY DATA METHOD THROWS WITHOUT A KEY, INCLUDING forget() ────────────
 *
 * read() and write() obviously cannot work. forget() needs no key to null a
 * column — and it throws anyway, because a store that cannot read or write is
 * not a store, and a `forget` that SUCCEEDED there would stamp a revocation
 * date onto a row for a connection this deployment could never have made. A
 * half-working store is harder to diagnose than a broken one.
 *
 * describe() is the exception, and it is not a loophole: its entire purpose is
 * to be rendered on the connect screen. A describe() that threw would replace
 * an explanation with an error page, which is the opposite of what it exists
 * for. It reports the misconfiguration in words instead, naming the variable.
 */
export class DatabaseTokenStore implements TokenStore {
  describe(): string {
    /*
     * encryptionKey() THROWS for a key of the wrong length and returns null
     * for a missing one, so this cannot simply call it. Both are reported, and
     * differently: "you have not set it" and "what you set is not 32 bytes"
     * send someone to two different places.
     */
    let key: Buffer | null = null
    try {
      key = encryptionKey()
    } catch {
      return 'Tokens cannot be stored: TOKEN_ENCRYPTION_KEY is set but is not 32 bytes of base64. Generate one with `openssl rand -base64 32` and restart. Nothing is stored unencrypted.'
    }
    if (!key) {
      return 'Tokens cannot be stored: TOKEN_ENCRYPTION_KEY is not set on the server. Generate one with `openssl rand -base64 32` and restart. Nothing is stored unencrypted.'
    }
    return 'Tokens are stored in your database, encrypted with AES-256-GCM, and are readable only by this server. Disconnecting removes the token and keeps a dated record that you disconnected.'
  }

  /**
   * The key, or a refusal that names the variable.
   *
   * `action` goes in the message so a log line says which call was refused
   * without the caller having to add it.
   */
  private requireKey(action: string): Buffer {
    const key = encryptionKey()
    if (key) return key
    throw new AppError({
      kind: 'EXTERNAL_SERVICE',
      code: 'TOKEN_ENCRYPTION_KEY_MISSING',
      message: `TOKEN_ENCRYPTION_KEY is not set, so Etsy tokens cannot be ${action}.`,
      recovery:
        'Set TOKEN_ENCRYPTION_KEY to 32 bytes of base64 (openssl rand -base64 32) and restart the server. Nothing was stored unencrypted.',
      retryable: false,
    })
  }

  async read(shopId: string): Promise<TokenSet | null> {
    const key = this.requireKey('read')

    let row: { sealed: string | null } | undefined
    try {
      ;[row] = await getDb()
        .select({ sealed: schema.etsyConnections.tokenRef })
        .from(schema.etsyConnections)
        .where(eq(schema.etsyConnections.shopId, shopId))
        .limit(1)
    } catch (error) {
      /*
       * A SELECT binds only the shop id, so this one carries no secret — it is
       * wrapped for the same reason anyway: nothing in this store hands a
       * caller a database error, so there is no path to keep checking.
       */
      throw queryFailure({
        action: 'read',
        shopId,
        error,
        recovery: 'Try again in a moment. Nothing was changed.',
      })
    }

    /*
     * NO ROW and a NULL token_ref are both genuinely "no tokens", and null is
     * the honest answer to both — a never-connected shop and a revoked one
     * have nothing to hand back. They are not the same FACT, and the row keeps
     * that difference for anyone asking why the data stopped updating; this
     * method is just not the place it is reported.
     */
    if (!row?.sealed) return null

    try {
      return openTokens(row.sealed, key)
    } catch (error) {
      /*
       * A row that will not open is NOT "no tokens". Returning null here would
       * tell a seller their shop is disconnected when what actually happened is
       * that the stored value was altered or the key was rotated — and they
       * would reconnect, which is the right remedy, having been told the wrong
       * reason. GCM is what makes this detectable at all: a tampered row fails
       * the auth tag instead of decrypting to something else.
       */
      throw new AppError({
        kind: 'EXTERNAL_SERVICE',
        code: 'TOKEN_UNREADABLE',
        message: 'The stored Etsy token for this shop could not be decrypted.',
        recovery:
          'Reconnect the shop from Settings → Shop connections. This happens if TOKEN_ENCRYPTION_KEY was rotated or the stored row was altered; no shop data is lost by reconnecting.',
        retryable: false,
        context: { shopId, cause: error instanceof Error ? error.message : String(error) },
      })
    }
  }

  async write(shopId: string, tokens: TokenSet): Promise<void> {
    const key = this.requireKey('stored')

    /*
     * Checked here rather than handed to Postgres. `new Date('whenever')` is
     * an Invalid Date, and postgres-js reports that as a parameter error with
     * no hint that the expiry was the problem.
     */
    const expiresAt = new Date(tokens.expiresAt)
    if (Number.isNaN(expiresAt.getTime())) {
      throw new AppError({
        kind: 'VALIDATION',
        code: 'TOKEN_EXPIRY_INVALID',
        message: 'Etsy returned a token expiry that is not a date.',
        recovery: 'Try connecting again. If it keeps happening, this is a bug on our side.',
        retryable: true,
        context: { shopId, expiresAt: tokens.expiresAt },
      })
    }

    /*
     * SEALED ONCE. The sketch in docs/DATABASE-AND-AUTH-SETUP.md called
     * sealTokens() twice — once for the insert and once for the conflict
     * branch — which produces two different ciphertexts, because the IV is
     * random per call. Only one of them is ever stored, so it worked; but it
     * invites a reader to assume the two values match, and the day somebody
     * compares them to decide whether anything changed, they never will.
     */
    const sealed = sealTokens(tokens, key)

    try {
      await getDb()
        .insert(schema.etsyConnections)
        .values({
          shopId,
          tokenRef: sealed,
          scopes: tokens.scopes ?? [],
          expiresAt,
          revokedAt: null,
        })
        .onConflictDoUpdate({
          target: schema.etsyConnections.shopId,
          /*
           * ── ALL FOUR COLUMNS, AND TWO OF THEM THE SKETCH FORGOT ────────
           *
           * `scopes`: a reconnection may grant a different set. Leaving the
           * old one would have Settings telling a seller what breaks if they
           * revoke a scope they no longer hold.
           *
           * `revokedAt: null`: THIS IS THE ONE THAT MATTERS. A shop that
           * reconnects after revoking is connected. A row carrying a live
           * token AND a revocation date says two contradictory things, and
           * every screen reading it has to pick one — which means different
           * screens will.
           */
          set: {
            tokenRef: sealed,
            scopes: tokens.scopes ?? [],
            expiresAt,
            revokedAt: null,
          },
        })
    } catch (error) {
      /*
       * THE FOREIGN KEY, TRANSLATED. shop_id references shops.id, so writing
       * for a shop that does not exist is a constraint violation — and the raw
       * message ("insert or update on table \"etsy_connections\" violates
       * foreign key constraint...") is not something to put in front of a
       * seller whose connection attempt just failed, nor in a log line that
       * reads as a database fault rather than a missing row.
       */
      if (pgCode(error) === FOREIGN_KEY_VIOLATION) {
        throw new AppError({
          kind: 'NOT_FOUND',
          code: 'TOKEN_SHOP_UNKNOWN',
          message: 'There is no shop in EtsyPilot with that id, so the connection cannot be saved.',
          recovery:
            'This is a bug on our side rather than anything you did — the shop has to exist in EtsyPilot before its Etsy tokens can be stored.',
          retryable: false,
          context: { shopId },
        })
      }
      /*
       * EVERYTHING ELSE IS WRAPPED, NOT RE-THROWN, and this is the branch that
       * made it necessary: drizzle's message is the SQL plus the bound
       * parameters, and parameter $3 of this statement is the sealed token.
       * See queryFailure().
       *
       * Keyed on 23503 ALONE rather than on "any write failure", so a dead
       * connection or a full disk is not reported as a missing shop and does
       * not send somebody looking for one.
       */
      throw queryFailure({
        action: 'saved',
        shopId,
        error,
        recovery:
          'Try connecting again in a moment. If it keeps failing, the database is not accepting writes.',
      })
    }
  }

  async forget(shopId: string): Promise<void> {
    /*
     * Keyed, like the others, and for the reason in the class note: a store
     * with no key must not be able to record anything at all.
     */
    this.requireKey('revoked')

    /*
     * UPDATE, NEVER DELETE. "This shop disconnected on this date" and "this
     * shop was never connected" are different answers, and a seller asking why
     * their data stopped updating deserves the first one. Deleting the row
     * throws that away and leaves the second.
     *
     * `scopes` and `expiresAt` are left alone deliberately: they describe the
     * connection that WAS, which is what a dated record is for. Only the
     * credential goes.
     *
     * A shop with NO ROW is a no-op, and that is right rather than lazy —
     * inserting one here would mint "disconnected on this date" for a shop
     * that was never connected, which is a false record rather than a missing
     * one.
     */
    try {
      await getDb()
        .update(schema.etsyConnections)
        .set({ tokenRef: null, revokedAt: new Date() })
        .where(eq(schema.etsyConnections.shopId, shopId))
    } catch (error) {
      throw queryFailure({
        action: 'disconnected',
        shopId,
        error,
        recovery:
          'Try again in a moment. Your token has not been removed, so the shop is still connected.',
      })
    }
  }
}

let store: TokenStore | null = null

/**
 * Which store runs.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   DATABASE_URL DECIDES, ALONE. TOKEN_ENCRYPTION_KEY DELIBERATELY DOES NOT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The obvious tightening is to require both:
 *
 *     store = DATABASE_URL && TOKEN_ENCRYPTION_KEY
 *       ? new DatabaseTokenStore()
 *       : new MemoryTokenStore(key)          // ← NO
 *
 * and it is the wrong default, for three reasons that all point the same way.
 *
 * IT TURNS A LOUD FAILURE INTO A SILENT DOWNGRADE. A deployment that set
 * DATABASE_URL has asked for persistence. Handing it the in-process store
 * instead gives it one that loses every token on restart and is invisible to a
 * second instance — so a seller connects their shop, it works, and it
 * disconnects itself at the next deploy with nothing anywhere saying why. The
 * database store with no key cannot do anything except throw, and a throw that
 * names the missing variable is the better of the two failures by a wide
 * margin. Neither store works; only one of them says so.
 *
 * THE DECISION IS MEMOISED AND THE ENVIRONMENT IS NOT. `store` is cached for
 * the life of the process, so a selector that read the key would freeze
 * whichever answer was true when the first caller happened to arrive. The key
 * is read per call inside the store instead, which is why describe() can tell
 * the connect screen what is true now rather than what was true at startup.
 *
 * THE FAILURE IS ALREADY LEGIBLE AT THE RIGHT PLACE. describe() is rendered on
 * the connect screen and names TOKEN_ENCRYPTION_KEY when it is missing or the
 * wrong length; read, write and forget each throw an AppError naming it. The
 * brief's requirement is that the failure be legible, not that the selector be
 * the thing that enforces it — and the selector is the one place that cannot
 * be, because it runs once and renders nothing.
 *
 * SO WHAT CHANGED HERE. The shape is the same; two things are not. The key is
 * no longer read at selection time, because encryptionKey() THROWS for a
 * malformed one — which meant a deployment with a bad key got a bare
 * "must be 32 bytes" out of getTokenStore() on the first request, from a
 * function whose name suggests nothing about keys, before any store existed to
 * explain itself. And isDatabaseConfigured() replaces the bare env read, so
 * "is there a database" has one answer in this codebase rather than two that
 * can drift.
 *
 * WHAT THIS MEANS ON THE OWNER'S MACHINE TODAY: DATABASE_URL is set, so
 * DatabaseTokenStore is already the one chosen — it was simply unreachable
 * while every method refused. It is live from this commit. With no
 * TOKEN_ENCRYPTION_KEY it refuses every call and says which variable to set;
 * with one, it works.
 */
export function getTokenStore(): TokenStore {
  if (store) return store
  store = isDatabaseConfigured()
    ? new DatabaseTokenStore()
    : /*
       * The memory store generates its own random key when given none, so a
       * demo-mode process still encrypts in memory. encryptionKey() is called
       * HERE rather than above so that a malformed key fails in the branch
       * that actually needs it.
       */
      new MemoryTokenStore(encryptionKey() ?? undefined)
  return store
}

/** Test seam, mirroring the other adapters. */
export function setTokenStore(next: TokenStore | null): void {
  store = next
}
