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
import { log } from '@/lib/observability/logger'
import { MockMarketSignalsService } from './mock'
import type { MarketSignalsService } from './interface'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE SEAM FOR A BOUGHT KEYWORD DATA SOURCE. BUILT, AND EMPTY.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The intended source is clickstream keyword data, bought from a provider —
 * the route eRank takes. The reason that route is open and scraping is not:
 * the numbers never touch the Etsy API or the Etsy site, so Prohibited
 * Behavior items 24 and 25 are not engaged at all. Nothing is accessed,
 * analysed or scraped from Etsy, and no Etsy content is requested for
 * analytics. tests/unit/signals-boundary.test.ts holds that line from the
 * other side and is unchanged by this.
 *
 * No provider is bought and no adapter is written. What exists is the
 * configuration check that decides, so that the day a provider arrives the
 * change is a new file plus two environment variables rather than an edit to
 * every surface that reports on sources.
 *
 * ── WHY A CONFIGURED-BUT-NOT-BUILT STATE EXISTS AT ALL ────────────────────
 *
 * Because it is reachable and it is not the same as either neighbour. An
 * operator who sets SIGNALS_PROVIDER before the adapter ships has a
 * deployment that believes it has market data and has none. Reporting that as
 * NONE would hide a misconfiguration; reporting it as LIVE would put
 * "Live sampling" on /data/sources with nothing behind it, which is the exact
 * defect 3dbce03 was written to remove. So it is its own answer, and the
 * surfaces say what it is.
 *
 * The sub-processor page does NOT use that distinction, deliberately: GDPR
 * Article 28 attaches to whether a processor is engaged, and configuring one
 * is the moment to name it whether or not we have written the code that calls
 * it. lib/legal/subprocessors.ts therefore reads only
 * keywordDataProviderConfigured().
 */

/** The test seam. Not a cache — nothing in this file assigns it. */
let override: MarketSignalsService | null = null
let mockInstance: MarketSignalsService | null = null
let liveInstance: MarketSignalsService | null = null
let warnedAboutMissingAdapter = false

/**
 * Whether this deployment has a keyword data provider configured.
 *
 * Two conditions, not one, for the same reason lib/ai/index.ts wants two: a
 * deployment that names a provider and holds no credential for it fails at the
 * moment a seller opens a Research screen rather than at the moment somebody
 * misconfigured it.
 *
 * Read on every call. The answer is an environment fact and this must not be
 * memoised beside a per-request mode — see tests/unit/selector-cache.test.ts.
 */
export function keywordDataProviderConfigured(): boolean {
  return Boolean(process.env.SIGNALS_PROVIDER) && Boolean(process.env.SIGNALS_API_KEY)
}

/**
 * The adapter for a configured provider, or null because none is written.
 *
 * `lib/signals/live.ts` exists and exports a NULL constructor. That is the
 * whole of the seam: one named place to fill in, and no change here when it
 * is filled.
 *
 * The first version treated the module as absent and caught the resolution
 * failure, which worked and made webpack print "Module not found: can't
 * resolve './live'" on every build — a warning about a deliberate state, and
 * the kind of noise that teaches people to skim build output. The absence is
 * a value now, not an exception.
 *
 * Still `require` rather than a static import, for the reason lib/ai/index.ts
 * gives: a provider SDK must never be pulled into a build that will not use
 * it.
 */
function loadConfiguredProvider(): MarketSignalsService | null {
  if (liveInstance) return liveInstance

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('./live') as typeof import('./live')
  if (!mod.LiveMarketSignalsService) {
    if (!warnedAboutMissingAdapter) {
      warnedAboutMissingAdapter = true
      log.warn('a keyword data provider is configured and no adapter is built', {
        configured: 'SIGNALS_PROVIDER and SIGNALS_API_KEY are both set',
        consequence: 'the Research screens stay unbuilt and /data/sources reports it',
      })
    }
    return null
  }

  liveInstance = new mod.LiveMarketSignalsService()
  return liveInstance
}

/**
 * The market-signals adapter, or null when this deployment has none.
 *
 * Null is still the live answer, and will stay the live answer until a
 * provider is bought AND an adapter is written against it. Every caller
 * handles null already; nothing about this function's contract changed.
 */
export function getSignalsService(): MarketSignalsService | null {
  if (override) return override
  if (isDemoMode()) {
    mockInstance ??= new MockMarketSignalsService()
    return mockInstance
  }
  if (!keywordDataProviderConfigured()) return null
  return loadConfiguredProvider()
}

/**
 * What this deployment has, for a surface that reports on sources rather than
 * reading one. /data/sources renders this.
 *
 *   MOCK                   the demo's seeded generator
 *   LIVE                   a configured provider with an adapter behind it
 *   CONFIGURED_NOT_BUILT   a provider is configured and no adapter exists
 *   NONE                   nothing is configured; the live answer today
 */
export type SignalsMode = 'MOCK' | 'LIVE' | 'CONFIGURED_NOT_BUILT' | 'NONE'

export function marketSignalsMode(): SignalsMode {
  const service = getSignalsService()
  if (service) return service.mode
  return keywordDataProviderConfigured() ? 'CONFIGURED_NOT_BUILT' : 'NONE'
}

/** True when no figure on a Research screen has a source behind it. */
export function signalsAreUnavailable(mode: SignalsMode = marketSignalsMode()): boolean {
  return mode === 'NONE' || mode === 'CONFIGURED_NOT_BUILT'
}

/** Test seam. Never called by application code. */
export function __setSignalsService(service: MarketSignalsService | null): void {
  override = service
}

export type * from './interface'
