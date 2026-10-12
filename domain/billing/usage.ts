/*
 * Usage and limits.
 *
 * A limit in this product pauses new work. It never deletes, never hides, and
 * never silently degrades a figure — the three things that make a seller
 * distrust a paywall more than the paywall itself.
 *
 * `enforce()` returns a decision that names both halves: what stops and what
 * keeps working. A limit that only says what stopped reads as a fault, and a
 * seller who thinks the product is broken does not upgrade, they leave.
 */

import { nextPlanAfter, planOf, type PlanKey } from './plans'

export type MetricKey = 'listings' | 'aiGenerations'

export interface UsageMeter {
  metric: MetricKey
  label: string
  /** Counted from the shop, never stated. */
  used: number
  /*
   * NULL WHERE NO PLAN IS IN FORCE, WHICH IS NOT THE SAME AS ZERO.
   *
   * Zero already means "not offered on this plan" — Free connects no shop, so
   * it manages no listings — and the meter renders a count with no
   * denominator. Null means there is no plan at all to set a cap, because
   * nobody can pay yet (lib/billing/index.ts). Nothing is limited, so nothing
   * pauses, and the meter is a count rather than a fraction.
   */
  limit: number | null
  /** Calendar date the count resets, or null for a standing capacity. */
  resetsOn: string | null
  /** What stops at the limit. */
  pauses: string
  /** What keeps working. Never omitted. */
  continues: string
}

export interface LimitDecision {
  metric: MetricKey
  allowed: boolean
  used: number
  /** Null where no plan is in force. See UsageMeter.limit. */
  limit: number | null
  /** Null where there is no limit to remain under. */
  remaining: number | null
  /** Present only when blocked. Names the limit, the pause and the way out. */
  blocked: {
    title: string
    pauses: string
    continues: string
    upgrade: { plan: string; raisesTo: number; priceMonthly: number } | null
  } | null
}

const METRIC_LABEL: Record<MetricKey, string> = {
  listings: 'Listings',
  aiGenerations: 'AI generations',
}

const PAUSES: Record<MetricKey, string> = {
  listings: 'New bulk jobs pause.',
  aiGenerations: 'AI drafting pauses until the reset.',
}

const CONTINUES: Record<MetricKey, string> = {
  listings:
    'Every listing stays exactly as it is. Audits, profit, Shop Pulse and manual editing are unaffected, and nothing is removed for you.',
  aiGenerations: 'Manual editing, audits, bulk edits and everything else are unaffected.',
}

export function limitFor(plan: PlanKey | null, metric: MetricKey): number | null {
  return plan === null ? null : planOf(plan).limits[metric]
}

export function buildMeters(args: {
  /** Null where no plan is in force: the meters become counts. */
  plan: PlanKey | null
  activeListings: number
  aiGenerationsUsed: number
  aiResetsOn: string
}): UsageMeter[] {
  const p = args.plan === null ? null : planOf(args.plan)
  return [
    {
      metric: 'listings',
      label: METRIC_LABEL.listings,
      used: args.activeListings,
      limit: p?.limits.listings ?? null,
      // A standing capacity, not a monthly allowance. Null rather than a date.
      resetsOn: null,
      pauses: PAUSES.listings,
      continues: CONTINUES.listings,
    },
    {
      metric: 'aiGenerations',
      label: METRIC_LABEL.aiGenerations,
      used: args.aiGenerationsUsed,
      limit: p?.limits.aiGenerations ?? null,
      resetsOn: args.aiResetsOn,
      pauses: PAUSES.aiGenerations,
      continues: CONTINUES.aiGenerations,
    },
  ]
}

/**
 * Decide whether one more unit of work may start.
 *
 * Called before the work, not after: a job that runs and then fails a limit
 * check has already spent the seller's time.
 */
export function enforce(args: {
  /** Null where no plan is in force. Nothing is limited, so nothing blocks. */
  plan: PlanKey | null
  metric: MetricKey
  used: number
}): LimitDecision {
  const { plan, metric, used } = args
  const limit = limitFor(plan, metric)
  /*
   * NO PLAN MEANS NO LIMIT, AND THAT IS THE HONEST DIRECTION.
   *
   * The alternative was to keep applying Solo's numbers while no longer
   * calling them Solo's, which is the same false claim with the word removed:
   * a seller whose bulk job pauses at 200 listings has been given a cap by a
   * plan they were never sold. Nothing has been bought, so nothing is
   * withheld. The caps in PLANS are what the tiers WILL limit.
   */
  const allowed = limit === null || used < limit
  const next = plan === null ? null : nextPlanAfter(plan)
  const raisesTo = next ? next.limits[metric] : 0

  return {
    metric,
    allowed,
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    blocked: allowed || limit === null || plan === null
      ? null
      : {
          title:
            limit === 0
              ? `${planOf(plan).name} does not connect a shop, so it manages no ${METRIC_LABEL[metric].toLowerCase()}`
              : `You have reached ${limit.toLocaleString('en-US')} ${METRIC_LABEL[metric].toLowerCase()} on ${planOf(plan).name}`,
          pauses: PAUSES[metric],
          continues: CONTINUES[metric],
          upgrade:
            next !== null && raisesTo > limit
              ? { plan: next.name, raisesTo, priceMonthly: next.priceMonthly }
              : null,
        },
  }
}

/**
 * The nearest meter to its limit, for the banner.
 *
 * Returns null when nothing is close. A permanent "you are approaching your
 * limit" strip on a shop at 40% is an advertisement, not a warning.
 */
export function pressureWarning(meters: UsageMeter[], threshold = 0.9): UsageMeter | null {
  // A meter with no limit cannot be near one.
  const pressed = meters
    .filter((m): m is UsageMeter & { limit: number } => m.limit !== null && m.limit > 0)
    .filter((m) => m.used / m.limit >= threshold)
    .sort((a, b) => b.used / b.limit - a.used / a.limit)
  return pressed[0] ?? null
}
