/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE KEYWORD DATA ADAPTER GOES HERE. IT IS NOT WRITTEN.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * This file is the seam, and it is deliberately the whole of it. The owner
 * intends to buy clickstream keyword data after the Etsy API key is approved;
 * nothing is bought, so nothing is implemented.
 *
 * ── WHY THE FILE EXISTS AT ALL RATHER THAN BEING ABSENT ───────────────────
 *
 * lib/signals/index.ts loads this module lazily and treats its absence as
 * "no adapter". That worked, and webpack printed
 *
 *     Module not found: Can't resolve './live' in lib/signals
 *
 * on every build — a warning on a deliberate state, which is the kind of
 * noise that teaches people to skim build output. So the module exists and
 * the absence is expressed as a value instead: a null constructor, in one
 * named place, with the contract above it.
 *
 * ── WHAT WRITING THE ADAPTER INVOLVES ─────────────────────────────────────
 *
 * Replace the null below with a class implementing MarketSignalsService whose
 * `mode` is 'LIVE'. Nothing else in the product changes: /data/sources, the
 * sub-processor page, the Research screens and marketSignalsMode() all read
 * the selector.
 *
 * Two constraints it must satisfy, and both are guarded:
 *
 *   IT MAY NOT READ ETSY. Not the API, not the site. That is the whole reason
 *   a bought source is permissible where a sampler is not — Prohibited
 *   Behavior items 24 and 25 are not engaged by data that never touches Etsy.
 *   tests/unit/signals-boundary.test.ts holds this line.
 *
 *   IT MAY NOT SEND SHOP CONTENT. A keyword lookup sends the term the seller
 *   typed. It may not carry a listing, an order, a cost or a title: shop
 *   content has exactly one egress and it is the drafting call.
 *   tests/unit/no-training.test.ts will fail on the day this file grows a
 *   network call AND touches a shop-content type, which is the correct moment
 *   for somebody to be stopped.
 *
 * Every figure it returns is still Provenanced<EstimatedRange> with class
 * ESTIMATED. Bought data is not measured data: it is somebody else's sample of
 * somebody else's traffic, and the Research screens must keep saying so.
 */

import type { MarketSignalsService } from './interface'

/**
 * The adapter's constructor, or null while none is written.
 *
 * `lib/signals/index.ts` checks this and falls back to reporting
 * CONFIGURED_NOT_BUILT, so a deployment that sets SIGNALS_PROVIDER today gets
 * a truthful answer on /data/sources rather than a crash or a blank screen.
 */
export const LiveMarketSignalsService: (new () => MarketSignalsService) | null = null
