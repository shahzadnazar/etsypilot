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

export function getBillingProvider(): BillingProvider {
  if (instance) return instance

  if (!isDemoMode() && process.env.STRIPE_SECRET_KEY) {
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
