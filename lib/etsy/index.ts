/*
 * The adapter selector.
 *
 * This is the ONLY place that decides which Etsy implementation runs. Nothing
 * above the domain layer imports mock.ts or live.ts directly.
 */

import { MockEtsyService } from './mock'
import type { EtsyService } from './interface'

let instance: EtsyService | null = null

export function getEtsyService(): EtsyService {
  if (!instance) {
    instance = process.env.ETSY_MODE === 'live' ? loadLive() : new MockEtsyService()
  }
  return instance
}

/**
 * Loaded lazily, and the laziness is load-bearing.
 *
 * `live.ts` is marked `server-only`, which is what keeps an Etsy token out of a
 * browser bundle. A static import here would put that marker in the module
 * graph of every file that merely asks whether demo mode is on — including the
 * tests, which is exactly how this was found: adding the marker turned twelve
 * green test files red at once.
 *
 * The answer is the one D28 already gives: change the architecture, never the
 * property. Demo mode now never resolves the module at all, and the marker
 * stays. Same shape as the AI and billing adapters.
 */
function loadLive(): EtsyService {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { LiveEtsyService } = require('./live') as typeof import('./live')
  return new LiveEtsyService()
}

/** Test seam, mirroring the other adapters (D28). */
export function setEtsyService(service: EtsyService | null): void {
  instance = service
}

/** Demo mode is the default. It requires no credentials of any kind. */
export function isDemoMode(): boolean {
  return process.env.ETSY_MODE !== 'live'
}

export type * from './interface'
