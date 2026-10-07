import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHAT TIME IT IS. ONE ANSWER, AND IN DEMO MODE IT IS THE FIXTURE'S.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * `DEMO_NOW` is 2026-08-12T14:06:00Z — the instant the Willow & Fern dataset
 * is composed around, so that "renews in 3 days" and "last synced 7 minutes
 * ago" line up with the artboards. Nine files imported it directly and used it
 * as the current time on every shop, in every mode.
 *
 * ── WHAT THAT DID TO A REAL SELLER, MEASURED ──────────────────────────────
 *
 * On 7 October 2026, on a live account with two listings:
 *
 *     Linen napkin set   renews Aug 15, 2026   → labelled "Expiring",
 *                                                counted in "1 expiring
 *                                                within 7 days"
 *     Waffle hand towel  renews Oct 10, 2026   → labelled "Active", counted
 *                                                in nothing
 *
 * The first expired fifty-three days ago and the product was still urging
 * action on it. The second genuinely expires in three days and the product
 * said nothing. Exactly inverted — one false alarm and one missed one — and
 * both from the same frozen clock. A listings screen that cannot tell which
 * listings are about to lapse is worse than no listings screen, because the
 * seller stops checking Etsy for it.
 *
 * ── WHY A FUNCTION AND NOT A CONSTANT ─────────────────────────────────────
 *
 * So there is one place to ask, and so the demo answer is reached through a
 * mode check rather than through an import. The guard in
 * tests/unit/fixture-containment.test.ts allows `DEMO_NOW` here and nowhere
 * else outside the dataset itself.
 */

import { isDemoMode } from '@/lib/etsy'
import { DEMO_NOW } from '@/lib/etsy/demo-dataset'

/**
 * The current instant, as an ISO string.
 *
 * In demo mode this is the fixture's clock, so the demo shop's renewal dates,
 * session times and rollback windows read exactly as they were designed to. On
 * every other deployment it is the real one.
 */
export function nowIso(): string {
  return isDemoMode() ? DEMO_NOW : new Date().toISOString()
}
