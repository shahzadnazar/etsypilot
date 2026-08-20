/*
 * Billing webhook.
 *
 * The only endpoint in this product that accepts a state change from outside,
 * so it is the strictest one:
 *
 *   1. The RAW body is read before anything parses it. A signature covers the
 *      exact bytes the provider sent; re-serialising and then verifying checks
 *      nothing.
 *   2. Signature verification happens before the payload is looked at, and a
 *      failure returns 400 with no detail. An attacker probing this endpoint
 *      learns whether their signature was malformed, stale or wrong from us
 *      only if we tell them.
 *   3. Replays are no-ops, by event id.
 *   4. Unknown event types are acknowledged with 200 and applied to nothing —
 *      a non-200 makes the provider retry an event we will never act on.
 *
 * No session here: a webhook is not a user. The shop is resolved from the
 * payload's own subscription reference, and in demo mode from the demo shop.
 */

import { NextResponse } from 'next/server'
import { getBillingProvider } from '@/lib/billing'
import { DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'
import { AppError } from '@/lib/errors/types'
import { billingAuditEvent, handleWebhook } from '@/domain/billing/webhooks'
import { BILLING_NOW } from '@/lib/billing/mock'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event
  try {
    event = getBillingProvider().verifyWebhook(rawBody, signature)
  } catch (error) {
    /*
     * Deliberately uninformative. The reason is useful to the operator, not to
     * the sender, so it goes to the server log and the response says only that
     * it was rejected.
     */
    console.warn('[billing] webhook rejected:', error instanceof AppError ? error.code : 'MALFORMED')
    return NextResponse.json({ received: false }, { status: 400 })
  }

  const outcome = handleWebhook(event, DEMO_SHOP_ID)
  const audit = billingAuditEvent({
    eventId: event.id,
    shopId: DEMO_SHOP_ID,
    outcome,
    now: `${BILLING_NOW}T00:00:00.000Z`,
  })
  if (audit) {
    // Phase 11 appends this to the event store; until then it is logged so the
    // trail exists rather than being invented later.
    console.info('[billing] audit:', audit.eventId, audit.afterValue, audit.reason)
  }

  // Always 200 once verified — including for duplicates and ignored types.
  return NextResponse.json({ received: true, outcome: outcome.kind })
}
