/*
 * The billing selector.
 *
 * Mock unless STRIPE_SECRET_KEY is present AND the app is not in demo mode.
 * Two conditions rather than one, deliberately: a stray key in a developer's
 * environment must not put the demo shop on a live billing path.
 */

import { isDemoMode } from '@/lib/etsy'
import { MockBillingProvider } from './mock'
import type { BillingProvider } from './interface'

let instance: BillingProvider | null = null

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

export function getBillingProvider(): BillingProvider {
  if (instance) return instance

  if (paymentProviderConfigured()) {
    /*
     * Loaded lazily so `server-only` never runs during a client build, and so
     * demo mode never even resolves the module.
     */
    const { StripeBillingProvider } = require('./stripe') as typeof import('./stripe')
    instance = new StripeBillingProvider()
  } else {
    instance = new MockBillingProvider()
  }
  return instance
}

/** Test seam. Mirrors how the Etsy adapter is injected (D28). */
export function setBillingProvider(provider: BillingProvider | null): void {
  instance = provider
}

export type * from './interface'
