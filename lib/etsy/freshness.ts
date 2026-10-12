/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   HOW OLD ETSY CONTENT MAY BE WHEN WE SHOW IT. SIX HOURS FOR LISTINGS,
 *   TWENTY-FOUR FOR EVERYTHING ELSE, AND THE NUMBERS ARE NOT OURS.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Etsy's API Terms, Section 5, "Display of Data":
 *
 *     "You will not display listing content more than six (6) hours older
 *      than the corresponding information [on the Etsy Site or Etsy Apps].
 *      You will not display any other Etsy content more than twenty-four (24)
 *      hours older than the content displayed [on the Etsy Site or Etsy
 *      Apps]."
 *
 * Two numbers over two kinds of content, so there are two windows and not one.
 * Writing 24h over listings would be a term breach; writing 6h over orders
 * would be four times the Etsy requests for nothing.
 *
 * ── A WINDOW IS A RULE ABOUT DISPLAY, NOT ABOUT SCHEDULES ─────────────────
 *
 * The clause does not say "refresh every six hours". It says do not DISPLAY
 * content older than six hours. Those are different obligations and only one
 * of them is testable: a scheduler either ran or did not, and if it did not
 * the page still renders. So the rule is enforced where the display decision
 * is made — domain/sync/source.ts asks this module on every read, and an
 * aggregate outside its window is withheld rather than shown.
 *
 * That also means no cron and no queue. A read that finds its data outside the
 * window is the trigger; a shop nobody looks at is never refreshed and never
 * displays anything stale, because it displays nothing. domain/sync/refresh.ts
 * is the other half.
 *
 * ── WHY "OLDER THAN ETSY'S" IS MEASURED AS "SINCE WE READ IT" ─────────────
 *
 * The clause compares our copy against Etsy's current content, and we cannot
 * know how far Etsy's has moved without asking — which is the request the
 * window exists to bound. What we do know exactly is when we last read it, and
 * our copy cannot be more than that old relative to Etsy's: if Etsy changed a
 * listing one minute after our read, our copy is behind by the age of the
 * read, never more. So the age of the read is a safe upper bound on the age of
 * the content, and bounding it bounds the clause.
 *
 * ── THE WINDOW IS ALSO THE RATE LIMITER ───────────────────────────────────
 *
 * Etsy allows 10 requests/second and 10,000/day PER APP KEY — shared across
 * every seller, not per seller. A refresh triggered by a read is therefore a
 * per-seller multiplier on a global budget, and the thing that bounds it is
 * this constant: six hours means at most four listings refreshes per shop per
 * day however many times the seller loads the page. docs/legal and the report
 * carry the arithmetic.
 */

import type { SyncAggregate } from '@/lib/repositories/sync-state'

const HOUR_MS = 3_600_000

/** Etsy API Terms §5, first sentence. Listing content. */
export const LISTING_CONTENT_MAX_AGE_MS = 6 * HOUR_MS

/** Etsy API Terms §5, second sentence. Any other Etsy content. */
export const OTHER_CONTENT_MAX_AGE_MS = 24 * HOUR_MS

/**
 * Which window governs which aggregate.
 *
 * A total map over SyncAggregate, not a lookup with a default. A default would
 * silently give a new aggregate the looser of the two windows, and the looser
 * one is the term breach if the content turns out to be listing content.
 * Adding an aggregate to SYNC_AGGREGATES without a decision here is a compile
 * error, which is the point.
 */
export const MAX_CONTENT_AGE_MS: Readonly<Record<SyncAggregate, number>> = {
  LISTINGS: LISTING_CONTENT_MAX_AGE_MS,
  ORDERS: OTHER_CONTENT_MAX_AGE_MS,
}

/** How old this aggregate's copy may be before it must not be displayed. */
export function maxContentAgeMs(aggregate: SyncAggregate): number {
  return MAX_CONTENT_AGE_MS[aggregate]
}

/**
 * How Etsy's two sentences read in a sentence a seller can act on.
 *
 * Used by the withheld state's copy, so the number on screen and the number
 * enforced are the same number rather than two that agree today.
 */
export function windowHours(aggregate: SyncAggregate): number {
  return maxContentAgeMs(aggregate) / HOUR_MS
}

/**
 * True when a copy read at `lastSyncedAt` may still be displayed.
 *
 * `null` is not fresh and not stale — it is "never read", a different state
 * with different copy and no age to report — so this takes a string and the
 * caller handles null. Exactly at the boundary counts as fresh: "more than six
 * hours older" is the clause's own wording, so six hours exactly is inside it.
 *
 * A `lastSyncedAt` in the future is treated as fresh rather than clamped. It
 * means a clock moved, which is not something to resolve by firing an Etsy
 * request at it.
 */
export function withinWindow(lastSyncedAt: string, aggregate: SyncAggregate, now: Date): boolean {
  const age = now.getTime() - new Date(lastSyncedAt).getTime()
  if (Number.isNaN(age)) return false
  return age <= maxContentAgeMs(aggregate)
}
