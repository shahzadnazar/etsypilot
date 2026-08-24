/*
 * Stripe.
 *
 * Server-only. The secret is read from process.env at call time and never
 * stored on the instance, never returned, never logged. `import 'server-only'`
 * makes an accidental client import a build error rather than a leaked key in
 * a bundle.
 *
 * No Stripe SDK: this is a handful of REST calls and one HMAC verification, and
 * an SDK here would add a dependency for the sake of shapes we already type.
 * Every method maps to a documented endpoint.
 *
 * Webhook signatures are verified against the RAW body with a timing-safe
 * comparison and a timestamp tolerance, because a signature over a re-serialised
 * body is not a signature and a replay of a valid one is still an attack.
 *
 * What is real here and what is not:
 *
 *   verifyWebhook          REAL, and tested. It is a security boundary, not a
 *                          feature — an unverified webhook lets anyone who can
 *                          reach the URL change a subscription — so it ships
 *                          working rather than as a stub. The verification
 *                          itself lives in ./signature, which is deliberately
 *                          NOT server-only so it can be tested at its edges;
 *                          the secret never leaves this file.
 *
 *   every other method     Refuses with a stated reason. They need a shop →
 *                          Stripe customer mapping, which arrives with the
 *                          database in Phase 11. A method that half-worked
 *                          would be worse than one that says it is not wired:
 *                          this way the failure is legible and demo mode is
 *                          untouched.
 */

import 'server-only'
import type { PlanKey } from '@/domain/billing/plans'
import { Errors } from '@/lib/errors/types'
import type {
  BillingProvider,
  DisclosedCharge,
  Invoice,
  Subscription,
  WebhookEvent,
} from './interface'
import { verifyStripeSignature } from './signature'

export class StripeBillingProvider implements BillingProvider {
  readonly mode = 'STRIPE' as const

  async getSubscription(shopId: string): Promise<Subscription> {
    void shopId
    throw notWired()
  }

  async listInvoices(shopId: string): Promise<Invoice[]> {
    void shopId
    /*
     * Not an empty ledger — that would render as "no charges yet", which is a
     * claim. Refuse, so the screen shows why it cannot list them.
     */
    throw notWired()
  }

  async chargeDisclosed(shopId: string, charge: DisclosedCharge): Promise<Invoice> {
    void shopId
    /*
     * The signature is the guarantee: reaching this call at all required a
     * DisclosedCharge, which required stating the amount, the date and what
     * changes. Stripe is told the same figure the seller was shown.
     */
    void charge
    throw notWired()
  }

  async cancel(shopId: string, args: { effectiveOn: string }): Promise<Subscription> {
    void shopId
    void args
    throw notWired()
  }

  async resume(shopId: string): Promise<Subscription> {
    void shopId
    throw notWired()
  }

  async changePlan(shopId: string, plan: PlanKey, charge: DisclosedCharge | null): Promise<Subscription> {
    void shopId
    void plan
    void charge
    throw notWired()
  }

  /**
   * Verify `Stripe-Signature` over the raw body.
   *
   * Implemented rather than stubbed, because this is the one part of live
   * billing that is a security boundary rather than a feature: an unverified
   * webhook lets anyone who can reach the URL change a subscription.
   */
  verifyWebhook(rawBody: string, signatureHeader: string | null): WebhookEvent {
    const signingSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!signingSecret) {
      throw Errors.validation('Webhooks are not configured.', 'STRIPE_WEBHOOK_SECRET is not set.')
    }
    const event = verifyStripeSignature({
      rawBody,
      signatureHeader,
      signingSecret,
      nowSeconds: Math.floor(Date.parse(new Date().toISOString()) / 1000),
    })
    return event
  }
}

function notWired() {
  return Errors.validation(
    'Live billing is not wired yet.',
    'It needs a shop-to-Stripe customer mapping, which arrives with the database in Phase 11. Demo mode is unaffected and nothing was charged.',
  )
}
