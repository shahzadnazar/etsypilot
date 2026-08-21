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
export function errorResponse(error: unknown, fields: { path?: string } = {}): NextResponse {
  const app = error instanceof AppError ? error : Errors.unknown()
  const reference = app.reference || makeReference()

  // Logged here rather than at each call site, so a route that forgets to log
  // still produces a record — and the record carries the reference the caller
  // is about to be shown.
  void import('@/lib/observability/logger').then(({ log }) =>
    log.error('request failed', error, { reference, ...fields, code: app.code }),
  )

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
