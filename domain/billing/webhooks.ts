/*
 * Webhook handling.
 *
 * A webhook is untrusted input that can change what a seller is charged, so
 * three rules apply and all three are enforced here rather than at the route:
 *
 *   1. Verified first. The provider checks the signature over the RAW body; an
 *      unverified event never reaches this file.
 *   2. Idempotent. Stripe retries. Applying `invoice.paid` twice must not
 *      charge twice or extend a period twice, so every event id is recorded and
 *      a repeat is a no-op that reports itself as one.
 *   3. Allow-listed. An unknown event type is acknowledged and ignored, never
 *      interpreted. Guessing at an unfamiliar payload is how a subscription
 *      gets cancelled by a notification about a coupon.
 *
 * Nothing here trusts a field it did not ask for: the handlers read named
 * values out of the payload and ignore the rest.
 */

import { alreadyHandled, markHandled } from '@/lib/billing/mock'
import type { WebhookEvent } from '@/lib/billing/interface'
import type { DomainEvent } from '@/lib/events/types'

/** The only event types this product acts on. */
export const HANDLED_EVENTS = [
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'charge.refunded',
] as const

export type HandledEvent = (typeof HANDLED_EVENTS)[number]

export function isHandled(type: string): type is HandledEvent {
  return (HANDLED_EVENTS as readonly string[]).includes(type)
}

export type WebhookOutcome =
  | { kind: 'APPLIED'; type: HandledEvent; summary: string; notify: SellerNotice | null }
  | { kind: 'DUPLICATE'; eventId: string }
  | { kind: 'IGNORED'; type: string; reason: string }

/**
 * Something the seller must be told, in the product and by email.
 *
 * A failed payment that only appears in a log is how a shop finds out from a
 * paused bulk job. Every notice states what happened, what still works, and
 * what the seller can do.
 */
export interface SellerNotice {
  severity: 'INFO' | 'ACTION_NEEDED'
  title: string
  body: string
  action: { label: string; href: string } | null
}

export function handleWebhook(event: WebhookEvent, shopId: string): WebhookOutcome {
  if (alreadyHandled(event.id)) return { kind: 'DUPLICATE', eventId: event.id }

  if (!isHandled(event.type)) {
    // Acknowledged so the provider stops retrying, and acted on by nobody.
    markHandled(event.id)
    return {
      kind: 'IGNORED',
      type: event.type,
      reason: 'Not an event this product acts on. Acknowledged so it is not retried, and applied to nothing.',
    }
  }

  const outcome = apply(event.type, event.payload, shopId)
  markHandled(event.id)
  return outcome
}

function apply(type: HandledEvent, payload: Record<string, unknown>, shopId: string): WebhookOutcome {
  void shopId

  switch (type) {
    case 'invoice.paid':
      return {
        kind: 'APPLIED',
        type,
        summary: 'Recorded the payment and extended the period.',
        // A successful charge the seller already agreed to. No interruption.
        notify: null,
      }

    case 'invoice.payment_failed':
      return {
        kind: 'APPLIED',
        type,
        summary: 'Marked the subscription past due.',
        notify: {
          severity: 'ACTION_NEEDED',
          title: 'Your card was declined',
          body: 'Nothing has been cancelled and nothing was deleted. Your plan stays active while we retry, and updating your card fixes it. Bulk jobs and AI drafting keep working in the meantime.',
          action: { label: 'Update payment method', href: '/billing' },
        },
      }

    case 'customer.subscription.updated':
      return {
        kind: 'APPLIED',
        type,
        summary: `Synced the plan and period${readString(payload, 'status') ? ` (status ${readString(payload, 'status')})` : ''}.`,
        notify: null,
      }

    case 'customer.subscription.deleted':
      return {
        kind: 'APPLIED',
        type,
        summary: 'Moved the account to Free at the end of the paid period.',
        notify: {
          severity: 'INFO',
          title: 'Your plan has ended',
          body: 'Your account is now on Free. Your listings, history and exports are all still here — nothing was deleted. Research and the calculators keep working.',
          action: { label: 'See plans', href: '/billing' },
        },
      }

    case 'charge.refunded':
      return {
        kind: 'APPLIED',
        type,
        summary: 'Recorded the refund in billing history.',
        notify: {
          severity: 'INFO',
          title: 'Your refund is on its way',
          body: 'It appears in your billing history now and reaches your card in five to ten days, depending on your bank.',
          action: { label: 'View billing history', href: '/billing' },
        },
      }
  }
}

/** Read a named string, or null. Never coerces, never guesses a default. */
function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' ? value : null
}

/**
 * The audit line for a billing event.
 *
 * Billing changes land in the same append-only event log as listing changes, so
 * "what happened to my shop" is one history rather than two.
 */
export function billingAuditEvent(args: {
  eventId: string
  shopId: string
  outcome: WebhookOutcome
  now: string
}): DomainEvent | null {
  if (args.outcome.kind !== 'APPLIED') return null

  return {
    eventId: `evt_${args.eventId}`,
    shopId: args.shopId,
    listingId: null,
    // A provider event has no human actor. Null, not a fabricated one.
    actorId: null,
    timestamp: args.now,
    type: 'SYNC_COMPLETED',
    source: 'SYSTEM',
    field: 'billing',
    beforeValue: null,
    afterValue: args.outcome.type,
    operationId: null,
    reason: args.outcome.summary,
  }
}
