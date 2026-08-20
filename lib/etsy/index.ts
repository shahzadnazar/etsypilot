/*
 * The adapter selector.
 *
 * This is the ONLY place that decides which Etsy implementation runs. Nothing
 * above the domain layer imports mock.ts or live.ts directly.
 */

import { LiveEtsyService } from './live'
import { MockEtsyService } from './mock'
import type { EtsyService } from './interface'

let instance: EtsyService | null = null

export function getEtsyService(): EtsyService {
  if (!instance) {
    instance = process.env.ETSY_MODE === 'live' ? new LiveEtsyService() : new MockEtsyService()
  }
  return instance
}

/** Demo mode is the default. It requires no credentials of any kind. */
export function isDemoMode(): boolean {
  return process.env.ETSY_MODE !== 'live'
}

export type * from './interface'
