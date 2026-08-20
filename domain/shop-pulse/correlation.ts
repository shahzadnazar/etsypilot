/*
 * The correlation engine.
 *
 * What this does: measures the order rate on the listings an event touched,
 * before and after it, and compares the two.
 *
 * What this never does: claim cause. A CORRELATED verdict means two observable
 * things moved together inside a window. It is not an explanation, and the copy
 * that renders it says so.
 *
 * The three verdicts:
 *
 *   CORRELATED  the affected listings moved materially and the event precedes it
 *   RULED_OUT   the event was tested and does not account for the outcome
 *   UNKNOWN     something moved and no recorded event accounts for it
 *
 * UNKNOWN is the honest default, not a failure mode. When the shop dips and the
 * event log is empty, that is the finding - we do not reach for seasonality or
 * "the algorithm" to fill the gap.
 */

import type { EtsyOrder } from '@/lib/etsy/interface'
import type { Diagnosis } from '@/lib/events/types'
import type { Confidence } from '@/lib/provenance/types'

/** Below this, a movement is noise rather than a finding. */
const MATERIAL_CHANGE = 0.15

export interface RateComparison {
  beforePerDay: number
  afterPerDay: number
  changePercent: number
  daysBefore: number
  daysAfter: number
  ordersBefore: number
  ordersAfter: number
}

/** Order rate on a set of listings, before and after an instant. */
export function compareRates(
  orders: EtsyOrder[],
  listingIds: string[],
  at: string,
  windowStart: string,
  windowEnd: string,
): RateComparison {
  const ids = new Set(listingIds)
  const touches = (o: EtsyOrder) =>
    listingIds.length === 0 || o.items.some((i) => ids.has(i.etsyListingId))

  const before = orders.filter((o) => touches(o) && o.placedAt >= windowStart && o.placedAt < at)
  const after = orders.filter((o) => touches(o) && o.placedAt >= at && o.placedAt <= windowEnd)

  const daysBefore = days(windowStart, at)
  const daysAfter = days(at, windowEnd)

  const beforePerDay = daysBefore === 0 ? 0 : before.length / daysBefore
  const afterPerDay = daysAfter === 0 ? 0 : after.length / daysAfter

  return {
    beforePerDay: round2(beforePerDay),
    afterPerDay: round2(afterPerDay),
    changePercent:
      beforePerDay === 0 ? 0 : round1(((afterPerDay - beforePerDay) / beforePerDay) * 100),
    daysBefore,
    daysAfter,
    ordersBefore: before.length,
    ordersAfter: after.length,
  }
}

/**
 * Reach a verdict from a measured comparison.
 *
 * Deliberately conservative: anything that does not clear the materiality
 * threshold is RULED_OUT rather than left ambiguous, because "we checked and it
 * does not explain this" is a more useful thing to tell a seller than silence.
 */
export function diagnose(comparison: RateComparison, hasEvent: boolean): Diagnosis {
  if (!hasEvent) return 'UNKNOWN'
  const magnitude = Math.abs(comparison.changePercent) / 100
  return magnitude >= MATERIAL_CHANGE ? 'CORRELATED' : 'RULED_OUT'
}

/**
 * Confidence in a verdict, from how much evidence stands behind it.
 *
 * Time and breadth only. Confidence never rises because a result looks tidy.
 */
export function confidenceFor(comparison: RateComparison, listingCount: number): Confidence {
  const observations = comparison.ordersBefore + comparison.ordersAfter
  if (comparison.daysAfter >= 14 && observations >= 60 && listingCount >= 3) return 'HIGH'
  if (comparison.daysAfter >= 7 && observations >= 20) return 'MODERATE'
  return 'LOW'
}

/**
 * The limitation that applies to every diagnosis this product will ever make,
 * stated once so it cannot drift between surfaces.
 */
export const ORDERS_ONLY_LIMITATION =
  'Etsy does not release listing views or search impressions through the public API, so this correlation rests on orders alone. Importing your Etsy Stats file would strengthen it.'

export const SEASONALITY_LIMITATION =
  'Ninety days of history is not enough to separate a seasonal effect from a change you made.'

function days(from: string, to: string): number {
  return Math.max(
    1,
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000),
  )
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
