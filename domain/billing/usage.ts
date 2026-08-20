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
  limit: number
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
  limit: number
  remaining: number
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

export function limitFor(plan: PlanKey, metric: MetricKey): number {
  return planOf(plan).limits[metric]
}

export function buildMeters(args: {
  plan: PlanKey
  activeListings: number
  aiGenerationsUsed: number
  aiResetsOn: string
}): UsageMeter[] {
  const p = planOf(args.plan)
  return [
    {
      metric: 'listings',
      label: METRIC_LABEL.listings,
      used: args.activeListings,
      limit: p.limits.listings,
      // A standing capacity, not a monthly allowance. Null rather than a date.
      resetsOn: null,
      pauses: PAUSES.listings,
      continues: CONTINUES.listings,
    },
    {
      metric: 'aiGenerations',
      label: METRIC_LABEL.aiGenerations,
      used: args.aiGenerationsUsed,
      limit: p.limits.aiGenerations,
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
export function enforce(args: { plan: PlanKey; metric: MetricKey; used: number }): LimitDecision {
  const { plan, metric, used } = args
  const limit = limitFor(plan, metric)
  const allowed = used < limit
  const next = nextPlanAfter(plan)
  const raisesTo = next ? next.limits[metric] : 0

  return {
    metric,
    allowed,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    blocked: allowed
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
  const pressed = meters
    .filter((m) => m.limit > 0 && m.used / m.limit >= threshold)
    .sort((a, b) => b.used / b.limit - a.used / a.limit)
  return pressed[0] ?? null
}
