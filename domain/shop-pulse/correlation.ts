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

/**
 * Minimum observations before a rate comparison means anything.
 *
 * Twelve listings averaging under one order each produced a +31% swing that was
 * pure noise. A verdict reachable only by labelling is not a verdict, so below
 * this threshold the engine returns UNKNOWN rather than a measured-looking
 * number - the same honest answer the design's "too few samples" state gives.
 */
const MIN_OBSERVATIONS = 20

/** And enough to establish a rate before the event, and enough exposure after. */
const MIN_PER_SIDE = 5

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
 * Order matters here. No event means UNKNOWN whatever the movement. Too little
 * data means UNKNOWN even when an event exists, because the comparison cannot
 * support either of the other two answers. Only once there is an event AND
 * enough observations does materiality decide between CORRELATED and RULED_OUT.
 *
 * RULED_OUT is deliberately reachable rather than left ambiguous: "we checked
 * and it does not explain this" is more useful to a seller than silence - but
 * only when the check was real.
 */
export function diagnose(comparison: RateComparison, hasEvent: boolean): Diagnosis {
  if (!hasEvent) return 'UNKNOWN'
  if (!hasEnoughData(comparison)) return 'UNKNOWN'
  const magnitude = Math.abs(comparison.changePercent) / 100
  return magnitude >= MATERIAL_CHANGE ? 'CORRELATED' : 'RULED_OUT'
}

/**
 * Is this comparison measurable at all?
 *
 * The test is EXPOSURE, not raw counts on both sides. A listing that sold 27
 * times and then nothing after being deactivated is the strongest signal the
 * engine can see - counting its zero after-orders as "too few samples" would
 * report the clearest case as unknown.
 *
 * So: we need a rate before the event, and enough days after it that the prior
 * rate would have produced a meaningful number of orders had nothing changed.
 * Seeing near-zero across that exposure is a finding. Seeing near-zero because
 * we barely looked is not.
 *
 * Exported so the UI can say "not enough data" rather than showing a percentage.
 */
export function hasEnoughData(comparison: RateComparison): boolean {
  const expectedAfterIfUnchanged = comparison.beforePerDay * comparison.daysAfter
  return (
    comparison.ordersBefore >= MIN_PER_SIDE &&
    expectedAfterIfUnchanged >= MIN_PER_SIDE &&
    comparison.ordersBefore + Math.max(comparison.ordersAfter, expectedAfterIfUnchanged) >=
      MIN_OBSERVATIONS
  )
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
