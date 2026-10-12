/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   MARKET SIGNALS EXIST IN DEMO MODE AND NOWHERE ELSE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * This file used to read:
 *
 *     if (!instance) instance = new MockMarketSignalsService()
 *
 * No gate. So in LIVE mode — a real connected shop, a paying seller — every
 * figure on all five Research screens was invented by a mock, and the demo
 * badge was absent too, because `demoData` on those pages is isDemoMode(),
 * which is false exactly then. A seller saw a keyword demand band, a
 * competitor's monthly revenue and a "last observed" date, none of which
 * existed, with nothing on the screen saying so.
 *
 * The landing page already forbade it: "CobaltRank will not ship an estimate
 * dressed as a measurement." /data/sources already told the truth —
 * `signals === 'MOCK' ? 'Modelled sample data' : 'Live sampling'` — so the
 * product contradicted itself about its own provenance, and the honest page
 * was the one nobody opens. That line is the ground truth and everything else
 * is reconciled to it.
 *
 * ── THE GATE IS HERE, NOT ON EACH PAGE ───────────────────────────────────
 *
 * One decision. A sixth Research page added next month cannot forget to ask,
 * because it cannot obtain a service without handling the absence of one.
 *
 * ── WHY null AND NOT A SERVICE THAT ANSWERS "NO SOURCE" ──────────────────
 *
 * A null-object service returning UNAVAILABLE for every metric was the other
 * candidate, and it is the wrong shape here — for a reason this product is
 * careful about elsewhere.
 *
 * UNAVAILABLE means THE FEATURE EXISTS AND THIS FIGURE IS MISSING: Etsy did
 * not return a fee line, the sample was too thin to model. The page still
 * renders, with a hole in it. That is not what is true of Research in live
 * mode. There is no source at all — nothing is missing, nothing was tried,
 * the feature is not built. Rendering the full Keyword Explorer with "Not
 * available" in every tile would say the first thing while meaning the
 * second, and would be a more convincing lie than the mock was.
 *
 * `null` makes the two cases different at the type level. Every caller has to
 * decide, and the compiler lists them: four domain modules render an unbuilt
 * state, /data/sources reports NONE, and the extension's listing endpoint
 * drops the research block. A null-object service would have let all six
 * carry on without noticing, which is precisely how this got shipped.
 *
 * ── WHAT DEMO MODE STILL GETS, AND WHY ───────────────────────────────────
 *
 * The sample, unchanged. The public demo is a sales asset and in demo mode
 * nothing is presented as real — every figure already carries a Demo badge,
 * the banner is unmissable, and the copy now says "sample" rather than
 * "observed". Taking the sample away would make the demo worse at the only
 * job it has without making any claim more honest.
 */

import { isDemoMode } from '@/lib/demo-mode'
import { MockMarketSignalsService } from './mock'
import type { MarketSignalsService } from './interface'

let instance: MarketSignalsService | null = null

/**
 * The market-signals adapter, or null when this deployment has none.
 *
 * Null is the live answer today and will stay the live answer until somebody
 * writes an adapter against a source that is allowed to exist — which
 * lib/signals may not be scraped into: Etsy's Prohibited Behavior item 24,
 * and tests/unit/signals-boundary.test.ts.
 */
export function getSignalsService(): MarketSignalsService | null {
  if (!isDemoMode()) return null
  if (!instance) instance = new MockMarketSignalsService()
  return instance
}

/**
 * What this deployment has, for a surface that reports on sources rather than
 * reading one. /data/sources renders this.
 *
 * 'LIVE' is in the union and unreachable today, on purpose: it is the shape
 * the day an adapter lands, and the string /data/sources already branches on.
 */
export function marketSignalsMode(): 'MOCK' | 'LIVE' | 'NONE' {
  return getSignalsService()?.mode ?? 'NONE'
}

export type * from './interface'
