/*
 * The one-flow cookie that carries an OAuth attempt from /connect to /callback.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NO ETSY CREDENTIALS ARE NEEDED TO READ OR TEST THIS FILE. When you have a
 *  key, see docs/ETSY-SETUP.md — nothing here changes.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Why one cookie rather than three. The state, the PKCE verifier, the user the
 * flow belongs to and the scopes that were asked for are only meaningful
 * together: a callback holding a verifier but no state, or a state issued to a
 * different user, is not a partially valid flow — it is an invalid one. Packing
 * them into a single httpOnly cookie means there is no partial state to reason
 * about and one delete ends the flow completely.
 *
 * Properties, each deliberate:
 *
 *   httpOnly   The verifier is a secret. Script must never be able to read it,
 *              which is also why it is not in localStorage — the brief forbids
 *              Etsy secrets in browser storage, and this is the closest thing
 *              to one that ever touches a browser.
 *   sameSite   'lax', not 'strict'. Etsy sends the seller back with a
 *              top-level GET; a strict cookie would not be sent and every
 *              connection would fail state validation.
 *   secure     On in production. Off on http://localhost, where it would stop
 *              the cookie being stored at all.
 *   path       Scoped to /api/etsy, so it is not attached to any other request.
 *   maxAge     Ten minutes. A flow a seller abandoned is not a flow to resume
 *              an hour later, and a short-lived verifier is a smaller target.
 */

import type { NextResponse } from 'next/server'
import type { ConnectOutcome } from '@/domain/connect/types'

export const FLOW_COOKIE = 'etsy_oauth_flow'
export const FLOW_TTL_SECONDS = 600

export interface OAuthFlow {
  state: string
  verifier: string
  /** The user who started it. A callback for anyone else is refused. */
  userId: string
  /** Etsy scope strings, so the callback records what was actually asked for. */
  scopes: string[]
}

export function writeFlowCookie(response: NextResponse, flow: OAuthFlow): void {
  response.cookies.set(FLOW_COOKIE, JSON.stringify(flow), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/etsy',
    maxAge: FLOW_TTL_SECONDS,
  })
}

export function clearFlowCookie(response: NextResponse): void {
  response.cookies.set(FLOW_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/etsy',
    maxAge: 0,
  })
}

/**
 * Parse the cookie, returning null for anything that is not a complete flow.
 *
 * Never throws. A malformed cookie is an invalid flow like any other, and a
 * 500 with a JSON parse trace is exactly the stack trace the brief says a user
 * must never see.
 */
export function readFlowCookie(raw: string | undefined): OAuthFlow | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<OAuthFlow>
    if (
      typeof parsed.state !== 'string' ||
      typeof parsed.verifier !== 'string' ||
      typeof parsed.userId !== 'string' ||
      !Array.isArray(parsed.scopes)
    ) {
      return null
    }
    return {
      state: parsed.state,
      verifier: parsed.verifier,
      userId: parsed.userId,
      scopes: parsed.scopes.filter((s): s is string => typeof s === 'string'),
    }
  } catch {
    return null
  }
}

/**
 * Where a finished or failed attempt lands.
 *
 * Resolved against the REQUEST's own origin, not an env var with a localhost
 * default — the billing routes learned that one the hard way, and curl does not
 * follow redirects so it never notices.
 *
 * The only thing ever put in the query string is one of our own outcome codes.
 * Etsy's error_description is not passed through: it is provider text of
 * unknown content heading for a URL bar, a browser history and a referrer
 * header.
 */
export type { ConnectOutcome } from '@/domain/connect/types'

export function outcomeUrl(request: Request, outcome: ConnectOutcome): URL {
  const url = new URL('/settings/shops', request.url)
  url.searchParams.set('connect', outcome)
  return url
}
