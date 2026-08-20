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
 * NOT YET WIRED TO A DATABASE. Phase 1 built the schema and Phase 11 builds the
 * cryptography and the interface; the repository lands with DATABASE_URL. Until
 * then `MemoryTokenStore` runs, which is honest for a single process and
 * refuses to pretend otherwise — it says so in `describe()`, and the connect
 * screen shows that description.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
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
 * The database-backed store.
 *
 * Left explicitly unimplemented rather than half-written: it needs the shops
 * repository, which arrives with DATABASE_URL. `describe()` says so, and every
 * method refuses with a reason instead of returning null — a store that
 * silently returns "no tokens" would present a configured shop as disconnected.
 */
export class DatabaseTokenStore implements TokenStore {
  describe(): string {
    return 'Token storage is not wired to the database yet. Set DATABASE_URL and run the migration in db/migrations.'
  }

  private refuse(): never {
    throw new Error(this.describe())
  }

  async read(_shopId: string): Promise<TokenSet | null> {
    this.refuse()
  }
  async write(_shopId: string, _tokens: TokenSet): Promise<void> {
    this.refuse()
  }
  async forget(_shopId: string): Promise<void> {
    this.refuse()
  }
}

let store: TokenStore | null = null

export function getTokenStore(): TokenStore {
  if (store) return store
  const key = encryptionKey()
  store = process.env.DATABASE_URL ? new DatabaseTokenStore() : new MemoryTokenStore(key ?? undefined)
  return store
}

/** Test seam, mirroring the other adapters. */
export function setTokenStore(next: TokenStore | null): void {
  store = next
}
