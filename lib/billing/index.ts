/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THERE IS NO BILLING PROVIDER UNLESS ONE IS CONFIGURED. NOT A MOCK ONE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * This file read:
 *
 *     if (paymentProviderConfigured()) { … } else { new MockBillingProvider() }
 *
 * and `paymentProviderConfigured()` is false on every deployment, because the
 * owner decided to apply for the Etsy API key before wiring a payment provider
 * at all. So a live seller was served an authored subscription: Solo, renewing
 * 12 September, a Visa ending 4242 they never gave us, four invoices from May
 * to August, and "$10.39 today, for the 23 days left in this period".
 *
 * It did not stay on /billing. `currentPlan()` reads the same subscription, so
 * the chip in the sidebar said "Solo plan" on every screen; /listings/change-
 * history took its rollback window from Solo's limits; /settings/audit-log took
 * its retention from them; and the AI copilot took its monthly allowance. Four
 * surfaces asserting a paid tier to somebody who has never paid, from one
 * fallback.
 *
 * The landing page already said the true thing — "What is not built is billing
 * — there is no payment provider wired up" — which is the third time a public
 * page has been honest while the product was not. See lib/signals/index.ts and
 * domain/data-sources/service.ts for the first two.
 *
 * ── null, FOR THE SAME REASON lib/signals RETURNS null ────────────────────
 *
 * A null-object provider answering "no subscription" for every method was the
 * other candidate and it is the wrong shape: every caller would carry on
 * rendering a billing screen with holes in it, which says "your subscription
 * could not be loaded" and means "nobody can pay us yet". `null` makes the two
 * different at the type level, and the compiler lists the five callers.
 *
 * Demo mode keeps the mock, which is what the demo is for: the subscribe,
 * cancel, resume and plan-change flows are real work and walkable, and nothing
 * in demo mode is presented as real.
 */

import { isDemoMode } from '@/lib/etsy'
import { MockBillingProvider } from './mock'
import type { BillingProvider } from './interface'

/*
 * ── ONE CACHE PER KIND, AND THE DECISION BEFORE THE CACHE ─────────────────
 *
 * This was a single `instance`, returned before the mode was consulted. In a
 * live deployment that also serves the PUBLIC DEMO — which is every deployment
 * — the first anonymous visitor built the mock and cached it, and every
 * signed-in seller after that got the mock's subscription. The gate below
 * would have been defeated by the line above it.
 *
 * Found by writing tests/unit/source-claims.test.ts: flipping ETSY_MODE and
 * asking twice returned the mock both times. lib/etsy/index.ts has had the
 * right shape all along — an override seam, one instance per kind, and the
 * question asked on every call — and this is that shape.
 */
let override: BillingProvider | null = null
let liveInstance: BillingProvider | null = null
let mockInstance: BillingProvider | null = null

/**
 * Is a real payment provider connected in THIS deployment?
 *
 * Exported because the public sub-processor page answers the same question and
 * must not answer it differently: that page tells a reader whether a payment
 * provider receives their data, and "the condition is written out twice" is
 * how one copy ends up stale. One condition, two readers.
 */
export function paymentProviderConfigured(): boolean {
  return !isDemoMode() && Boolean(process.env.STRIPE_SECRET_KEY)
}

/** The environment variable a payment provider needs. */
export const PAYMENT_PROVIDER_VARS = ['STRIPE_SECRET_KEY'] as const

/**
 * Which of them are unset.
 *
 * Named rather than described, the way domain/billing/trial.ts names the email
 * sender's variables: the person who can act on this is a developer, and the
 * useful message is the one that says what to set.
 */
export function missingPaymentProviderConfig(): string[] {
  return PAYMENT_PROVIDER_VARS.filter((name) => !(process.env[name] ?? '').trim())
}

/**
 * The billing provider, or null where this deployment has none.
 *
 * Three answers, not two:
 *
 *   StripeBillingProvider  a key is set and this is not the demo.
 *   MockBillingProvider    demo mode. The flows are real, the money is not.
 *   null                   neither. No subscription exists, no card can be
 *                          taken, and no plan has been bought — which is every
 *                          live deployment today.
 */
export function getBillingProvider(): BillingProvider | null {
  if (override) return override

  if (paymentProviderConfigured()) {
    /*
     * Loaded lazily so `server-only` never runs during a client build, and so
     * demo mode never even resolves the module.
     */
    liveInstance ??= loadStripe()
    return liveInstance
  }

  if (isDemoMode()) {
    mockInstance ??= new MockBillingProvider()
    return mockInstance
  }

  return null
}

function loadStripe(): BillingProvider {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { StripeBillingProvider } = require('./stripe') as typeof import('./stripe')
  return new StripeBillingProvider()
}

/**
 * Is anybody able to pay on this deployment?
 *
 * The question a screen asks before describing a subscription. False means the
 * seller has no plan — not that their plan could not be read.
 */
export function billingIsOpen(): boolean {
  return getBillingProvider() !== null
}

/** Test seam. Mirrors how the Etsy adapter is injected (D28). */
export function setBillingProvider(provider: BillingProvider | null): void {
  override = provider
}

export type * from './interface'
