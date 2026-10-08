/*
 * The adapter selector.
 *
 * This is the ONLY place that decides which Etsy implementation runs. Nothing
 * above the domain layer imports mock.ts or live.ts directly.
 */

import { MockEtsyService } from './mock'
import { isPublicDemoRequest } from '@/lib/demo-request'
import type { EtsyService } from './interface'

/*
 * Three slots, not one, and the third is what the public demo needs.
 *
 * `instance` was a single cached adapter chosen once from ETSY_MODE. A live
 * deployment built LiveEtsyService on its first request and kept it — so a
 * public demo visitor arriving afterwards would have been handed the live
 * adapter for the fictional shop, and `shopHeader`'s DEMO branch would have
 * thrown ETSY_NOT_CONFIGURED before rendering anything.
 *
 * `override` keeps the test seam exactly as it was and still wins over both,
 * so setEtsyService() behaves identically.
 */
let override: EtsyService | null = null
let liveInstance: EtsyService | null = null
let mockInstance: EtsyService | null = null

export function getEtsyService(): EtsyService {
  if (override) return override
  /*
   * The mock for a demo deployment OR a public demo request. Same condition as
   * isDemoMode() below, deliberately: "which adapter" and "is the fixture
   * being served" must never be able to disagree.
   */
  if (process.env.ETSY_MODE !== 'live' || isPublicDemoRequest()) {
    mockInstance ??= new MockEtsyService()
    return mockInstance
  }
  liveInstance ??= loadLive()
  return liveInstance
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
  override = service
}

/**
 * Is the fictional catalogue being served to THIS request?
 *
 * The meaning has not changed — every one of the ~40 call sites asks exactly
 * this — but the answer is now per request rather than per process, because a
 * public demo visitor and a signed-in seller are served by the same server at
 * the same time. See lib/demo-request.ts for why it is a request-scoped flag
 * and not a parameter, and for how it fails closed.
 */
export function isDemoMode(): boolean {
  return process.env.ETSY_MODE !== 'live' || isPublicDemoRequest()
}

export type * from './interface'
