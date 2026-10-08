/*
 * The API error envelope.
 *
 * Every route handler returns JSON on failure — including the failures nobody
 * wrote a catch for.
 *
 * Measured before it was written: an unhandled throw in a route handler
 * returned `500` with an EMPTY body and no content-type. A caller doing
 * `await response.json()` gets a parse error on top of the original failure,
 * and has nothing to show a user. The browser extension is exactly such a
 * caller.
 *
 * The shape is AppError's `toUserFacing()` — message, recovery, retryable,
 * reference — because that is already the only shape allowed to cross the
 * wire. Nothing here can serialise a stack, a context object, or a code path.
 */

import { NextResponse } from 'next/server'
import { AppError, Errors, makeReference, type ErrorKind } from './types'

const STATUS: Record<ErrorKind, number> = {
  AUTHENTICATION: 401,
  AUTHORIZATION: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  PLAN_LIMIT: 402,
  RATE_LIMIT: 429,
  EXTERNAL_SERVICE: 502,
  /*
   * A queued job failed. 500, not 202: the request the caller made did not
   * succeed, and reporting "accepted" for work that has already failed is the
   * kind of optimism this product spends its effort removing.
   *
   * This entry exists because Record<ErrorKind, number> refused to compile
   * without it. An error kind added later cannot silently fall through to a
   * default status — the map has to be completed deliberately.
   */
  BACKGROUND_JOB: 500,
  AI_UNAVAILABLE: 503,
  UNKNOWN: 500,
}

export function statusFor(error: AppError): number {
  return STATUS[error.kind] ?? 500
}

/**
 * Turn anything thrown into a response a client can render.
 *
 * An unknown error becomes `Errors.unknown()`, whose message and recovery are
 * written for a seller. The original is logged, never returned: the caller
 * learns that it failed and what to do, and learns nothing about our internals.
 */
/**
 * Normalise anything thrown, and record it.
 *
 * Separate from errorResponse because not every failure is answered with the
 * JSON envelope — a browser navigation is answered with a redirect back to the
 * page it came from. That path must still produce a log line, and it must be
 * the SAME line: a failure that is invisible in the logs whenever the caller
 * happened to be a browser is a blind spot precisely where real sellers are.
 */
export function logFailure(error: unknown, fields: { path?: string } = {}): AppError {
  const app = error instanceof AppError ? error : Errors.unknown()
  const reference = app.reference || makeReference()

  // Logged here rather than at each call site, so a route that forgets to log
  // still produces a record — and the record carries the reference the caller
  // is about to be shown.
  void import('@/lib/observability/logger').then(({ log }) =>
    log.error('request failed', error, { reference, ...fields, code: app.code }),
  )

  return app
}

export function errorResponse(
  error: unknown,
  fields: { path?: string; request?: Request } = {},
): NextResponse {
  const app = logFailure(error, fields)
  const reference = app.reference || makeReference()

  /*
   * ── A PUBLIC VISITOR GETS A PAGE, NOT A JSON ERROR DOCUMENT ────────────
   *
   * Every mutation on this product is a plain <form method="post">, so a
   * refusal answered with JSON replaces the seller's screen with a blob of
   * machine text. That is a dead end, and for the one visitor who arrived
   * with no idea what this product is, it is the worst possible first
   * impression of a refusal that is actually a FEATURE: nothing can be
   * changed, because they are looking at somebody else's fictional shop.
   *
   * So this one code goes back to the page it came from with a flag, and
   * components/layout/public-demo-notice.tsx renders the explanation. One
   * place, every form, including the ones written later.
   *
   * The Referer is used only to pick a path on this origin and is parsed
   * against the request's own URL — an absolute or cross-origin Referer
   * cannot redirect anybody off-site, because only `pathname` survives.
   */
  if (app.code === 'PUBLIC_DEMO_READ_ONLY' && fields.request) {
    const base = new URL(fields.request.url)
    const referer = fields.request.headers.get('referer')
    let target = new URL('/dashboard', base)
    if (referer) {
      try {
        target = new URL(new URL(referer).pathname, base)
      } catch {
        // Unparseable Referer. The dashboard is a fine place to land.
      }
    }
    target.searchParams.set('demo', 'blocked')
    return NextResponse.redirect(target, 303)
  }

  return NextResponse.json(
    { error: { ...app.toUserFacing(), reference } },
    { status: statusFor(app) },
  )
}

/**
 * Wrap a route handler so an unhandled throw becomes the envelope above.
 *
 * The point is that it cannot be forgotten per-branch: one wrap covers every
 * path through the handler, including the ones added later.
 */
export function withErrors<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
  fields: { path?: string } = {},
) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (error) {
      return errorResponse(error, fields)
    }
  }
}
