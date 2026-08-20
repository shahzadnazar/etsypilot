/*
 * Etsy OAuth 2.0, Authorization Code with PKCE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NO CREDENTIALS ARE REQUIRED TO READ, BUILD OR TEST THIS FILE.
 *
 *  When you have an Etsy app, set these three in .env.local (never committed):
 *
 *      ETSY_API_KEY=          your app's keystring, from the Etsy dashboard
 *      ETSY_API_SECRET=       only needed for confidential-client flows
 *      ETSY_REDIRECT_URI=     https://your-domain/api/etsy/callback
 *
 *  and flip ETSY_MODE=live. Nothing else in the product changes — that is the
 *  acceptance criterion for this phase, and lib/etsy/index.ts is the only file
 *  that chooses between adapters.
 *
 *  Register the SAME redirect URI in the Etsy app dashboard, character for
 *  character. Etsy rejects a mismatch, and the error it returns is not
 *  specific about why.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Why PKCE, given we have a server that could hold a secret: the code verifier
 * binds the authorization code to the browser that started the flow. Without
 * it, a leaked code from a redirect — a referrer header, a shared screen, a
 * proxy log — is enough to complete the exchange. With it, the code is useless
 * without the verifier, which never leaves our server.
 *
 * Three things that never appear in a URL, a log line, or a response body:
 * the API key, the code verifier, and any token. The verifier and state live in
 * httpOnly cookies for the length of the flow; tokens live server-side only
 * (see tokens.ts). The seller's Etsy PASSWORD never touches this product at
 * all — they type it on etsy.com, which is the entire point of OAuth.
 *
 * Endpoint shapes below follow Etsy's Open API v3 documentation. They are
 * pure functions over inputs, so they are tested without credentials — but
 * verify them against the current docs on the first live run, because a
 * provider's URLs are not ours to guarantee.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** Where the seller approves access. Their password is typed here, on Etsy. */
export const ETSY_AUTHORIZE_URL = 'https://www.etsy.com/oauth/connect'
/** Where codes and refresh tokens are exchanged. Server-to-server only. */
export const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token'
/** The API itself. */
export const ETSY_API_BASE = 'https://openapi.etsy.com/v3/application'

/**
 * The scopes this product asks for, and what breaks without each.
 *
 * Mirrors domain/connect/types.ts, which is what the seller reads. Kept in the
 * same shape deliberately: the consent screen and the request must not be able
 * to describe different things.
 */
export const ETSY_SCOPES = {
  required: ['listings_r', 'shops_r'],
  write: ['listings_w'],
  finance: ['transactions_r', 'billing_r'],
} as const

export interface PkcePair {
  /** Kept server-side, in an httpOnly cookie. Never sent to Etsy until the exchange. */
  verifier: string
  /** Sent to Etsy in the authorize URL. Derived, one-way. */
  challenge: string
}

/**
 * A fresh verifier/challenge pair.
 *
 * 32 random bytes, base64url — within RFC 7636's 43–128 character range. Uses
 * node:crypto rather than Math.random for the obvious reason: a predictable
 * verifier is no verifier.
 */
export function createPkcePair(randomSource: () => Buffer = () => randomBytes(32)): PkcePair {
  const verifier = base64url(randomSource())
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

/** Opaque, single-use, compared in constant time on the way back. */
export function createState(randomSource: () => Buffer = () => randomBytes(16)): string {
  return base64url(randomSource())
}

/**
 * Compare the returned state with the one we issued.
 *
 * Constant-time, and length-checked first because timingSafeEqual throws on a
 * length mismatch. A plain `===` here leaks the comparison through timing,
 * which is a small leak on a small secret — but this is the check standing
 * between a seller's shop and a CSRF-initiated connection, so it gets the
 * careful version.
 */
export function statesMatch(issued: string | undefined, returned: string | null): boolean {
  if (!issued || !returned) return false
  const a = Buffer.from(issued, 'utf8')
  const b = Buffer.from(returned, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface AuthorizeArgs {
  clientId: string
  redirectUri: string
  scopes: readonly string[]
  state: string
  challenge: string
}

/**
 * Build the URL the seller is sent to.
 *
 * Note what is NOT in it: no secret, no verifier, no token. Only the public
 * client id, the redirect, the scopes being requested, an opaque state and a
 * one-way challenge. This URL ends up in browser history and possibly in a
 * referrer; nothing in it is worth stealing.
 */
export function authorizeUrl(args: AuthorizeArgs): string {
  const url = new URL(ETSY_AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', args.clientId)
  url.searchParams.set('redirect_uri', args.redirectUri)
  url.searchParams.set('scope', [...args.scopes].join(' '))
  url.searchParams.set('state', args.state)
  url.searchParams.set('code_challenge', args.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export interface TokenSet {
  accessToken: string
  refreshToken: string
  /** Absolute expiry, ISO. Computed from expires_in at exchange time. */
  expiresAt: string
  scopes: string[]
}

/** Etsy's token response, as documented. Parsed, never spread blindly. */
interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  error?: string
  error_description?: string
}

export interface ExchangeArgs {
  clientId: string
  redirectUri: string
  code: string
  verifier: string
  /** Injected so the exchange is testable without a network or a key (D28). */
  fetchImpl?: typeof fetch
  /** Injected for the same reason — no clock reads inside the parser. */
  now?: () => number
}

/**
 * Exchange an authorization code for tokens.
 *
 * Errors carry Etsy's error CODE but never the request body, because that body
 * contains the verifier. A stack trace or a log line that quotes the request is
 * how a credential ends up in an error tracker.
 */
export async function exchangeCode(args: ExchangeArgs): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    code: args.code,
    code_verifier: args.verifier,
  })
  return postToken(body, args.fetchImpl ?? fetch, args.now ?? Date.now)
}

export interface RefreshArgs {
  clientId: string
  refreshToken: string
  fetchImpl?: typeof fetch
  now?: () => number
}

export async function refreshTokens(args: RefreshArgs): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: args.clientId,
    refresh_token: args.refreshToken,
  })
  return postToken(body, args.fetchImpl ?? fetch, args.now ?? Date.now)
}

async function postToken(
  body: URLSearchParams,
  fetchImpl: typeof fetch,
  now: () => number,
): Promise<TokenSet> {
  const response = await fetchImpl(ETSY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const json = (await response.json().catch(() => ({}))) as TokenResponse

  if (!response.ok || !json.access_token || !json.refresh_token) {
    throw new OAuthError(json.error ?? `http_${response.status}`, json.error_description)
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    // Etsy documents expires_in in seconds. A missing value is treated as the
    // shortest plausible life rather than assumed long: refreshing early is
    // cheap, using a dead token mid-bulk-job is not.
    expiresAt: new Date(now() + (json.expires_in ?? 3600) * 1000).toISOString(),
    scopes: [],
  }
}

/**
 * An OAuth failure, carrying a code and nothing else.
 *
 * `toJSON` is overridden so that even an accidental JSON.stringify of this
 * error cannot serialise anything but the code and a description. There is
 * nowhere on this class to put a token, and no field that could hold one.
 */
export class OAuthError extends Error {
  readonly code: string
  readonly description: string | undefined

  constructor(code: string, description?: string) {
    super(`Etsy OAuth failed: ${code}`)
    this.name = 'OAuthError'
    this.code = code
    this.description = description
  }

  toJSON(): { name: string; code: string; description?: string } {
    return { name: this.name, code: this.code, ...(this.description ? { description: this.description } : {}) }
  }
}

/** True once the token is inside the refresh window. Pure, clock injected. */
export function needsRefresh(tokens: TokenSet, nowMs: number, marginSeconds = 120): boolean {
  return Date.parse(tokens.expiresAt) - nowMs <= marginSeconds * 1000
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
