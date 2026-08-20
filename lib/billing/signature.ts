/*
 * Webhook signature verification.
 *
 * Its own module, with NO `server-only` import, for one reason: this function
 * is a security boundary and therefore the thing most worth testing at its
 * edges — wrong secret, tampered body, replayed signature, missing header.
 * Marking it server-only made it unimportable from a test, and the answer to
 * that is never to weaken the property (D28): the adapter that holds the secret
 * stays server-only, and the pure predicate moves here.
 *
 * Nothing in this file reads process.env, opens a socket, or holds a key. It
 * takes bytes and a secret as arguments and returns a verdict.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { Errors } from '@/lib/errors/types'
import type { WebhookEvent } from './interface'

/** Reject a signed payload older than this. Stripe's own recommendation. */
export const TOLERANCE_SECONDS = 300

/**
 * Pure and exported so it can be tested without a server or a live secret.
 *
 * `nowSeconds` is a parameter for the same reason every clock in this codebase
 * is: a check that depends on the wall clock cannot be tested at its boundary.
 */
export function verifyStripeSignature(args: {
  rawBody: string
  signatureHeader: string | null
  signingSecret: string
  nowSeconds: number
  toleranceSeconds?: number
}): WebhookEvent {
  const { rawBody, signatureHeader, signingSecret, nowSeconds } = args
  const tolerance = args.toleranceSeconds ?? TOLERANCE_SECONDS

  if (!signatureHeader) {
    throw Errors.validation('Missing webhook signature.', 'The request was not signed.')
  }

  const parts = new Map(
    signatureHeader
      .split(',')
      .map((p) => p.trim().split('='))
      .filter((p): p is [string, string] => p.length === 2 && p[0] !== undefined && p[1] !== undefined)
      .map(([k, v]) => [k, v] as [string, string]),
  )

  const timestamp = parts.get('t')
  const provided = parts.get('v1')
  if (!timestamp || !provided) {
    throw Errors.validation('Webhook signature is malformed.', 'Nothing was applied.')
  }

  const age = Math.abs(nowSeconds - Number(timestamp))
  if (!Number.isFinite(age) || age > tolerance) {
    // A replayed signature is still a valid signature. Age is the only defence.
    throw Errors.validation('Webhook signature is too old.', 'Nothing was applied.')
  }

  const expected = createHmac('sha256', signingSecret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, and the length is not a secret.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw Errors.validation('Webhook signature does not match.', 'Nothing was applied.')
  }

  const parsed = JSON.parse(rawBody) as { id?: string; type?: string; data?: Record<string, unknown> }
  if (!parsed.id || !parsed.type) {
    throw Errors.validation('Webhook payload is not an event.', 'Nothing was applied.')
  }

  return {
    id: parsed.id,
    type: parsed.type,
    payload: parsed.data ?? {},
    receivedAt: new Date(Number(timestamp) * 1000).toISOString().slice(0, 10),
  }
}
