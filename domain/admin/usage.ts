/*
 * Plan usage across every shop, as data.
 *
 * Pure: no database, no `server-only`, no React.
 *
 * ── IT COUNTS. IT DOES NOT READ A COUNTER. ────────────────────────────────
 *
 * `usage_records` exists in the schema, with a `used` column and a `limit`
 * column, and it looked like the obvious source. Grepping for its writers
 * found NONE: nothing in the product increments it, so every row in it came
 * from a seed or a migration. A screen reading it would have reported figures
 * that are not usage — stale where rows exist and blank where they do not, and
 * indistinguishable from a shop that has genuinely used nothing.
 *
 * So both meters are COUNTED from the rows that are the usage:
 *
 *   listings          active listings the shop actually has
 *   AI generations    ai_generations rows created in the current month
 *
 * D34 in its original form: a figure that is measured can be missing; a figure
 * that is stored is wrong the day after nobody updates it. The screen says
 * which it is showing.
 *
 * ── D37: A QUOTA IS A BOUNDARY, NOT A PENALTY ─────────────────────────────
 *
 * The meters come from `buildMeters()` — the SELLER's own usage model — rather
 * than from limits restated here (D46). That is not only about the numbers: it
 * carries `pauses` and `continues` with them, and `continues` is the half that
 * stops a limit reading as a punishment. An operator looking at a shop over
 * its cap should be reading the same sentence the seller is: new bulk jobs
 * pause, nothing is deleted, everything else is unaffected.
 *
 * A FAILED GENERATION IS NEVER COUNTED, and here that is structural rather
 * than filtered: `ai_generations.status` is DRAFT | ACCEPTED | REJECTED, with
 * no failure state at all, so a generation that failed leaves no row to count.
 * REJECTED is a seller declining a draft that was produced — it spent the
 * allowance, and excluding it would understate what the seller used.
 */

import { buildMeters, type MetricKey, type UsageMeter } from '@/domain/billing/usage'
import { PLANS, type PlanKey } from '@/domain/billing/plans'

/**
 * How close a meter is to its limit.
 *
 * NOT_OFFERED is separate from UNDER, and the distinction is the one the
 * sidebar meter already makes: a limit of 0 means "this plan connects no shop"
 * rather than "none allowed", so rendering it as 0 / 0 would read as a shop
 * sitting exactly at its cap.
 */
export type UsageBand = 'OVER' | 'AT_LIMIT' | 'NEAR' | 'UNDER' | 'NOT_OFFERED'

/** Most urgent first. Also the order the summary renders in. */
export const BAND_ORDER: readonly UsageBand[] = [
  'OVER',
  'AT_LIMIT',
  'NEAR',
  'UNDER',
  'NOT_OFFERED',
] as const

/** A meter this full is worth a conversation before it stops anything. */
export const NEAR_THRESHOLD = 0.8

export const BAND_COPY: Record<
  UsageBand,
  { label: string; tone: 'ok' | 'info' | 'warn' | 'danger'; detail: string }
> = {
  OVER: {
    label: 'Over',
    tone: 'danger',
    detail:
      'Past the plan’s limit. New work of this kind pauses; nothing is deleted and nothing else is affected.',
  },
  AT_LIMIT: {
    label: 'At the limit',
    tone: 'warn',
    detail: 'Exactly at the limit. The next unit of this kind of work will not start.',
  },
  NEAR: {
    label: 'Near',
    tone: 'warn',
    detail: 'Within reach of the limit. Nothing has stopped and nothing is about to break.',
  },
  UNDER: {
    label: 'Under',
    tone: 'ok',
    detail: 'Comfortably inside the plan.',
  },
  NOT_OFFERED: {
    label: 'Not on this plan',
    tone: 'info',
    detail:
      'The plan does not offer this at all — a limit of zero here means "not included", not "none allowed".',
  },
}

export function bandFor(used: number, limit: number): UsageBand {
  if (limit === 0) return 'NOT_OFFERED'
  if (used > limit) return 'OVER'
  if (used === limit) return 'AT_LIMIT'
  if (used / limit >= NEAR_THRESHOLD) return 'NEAR'
  return 'UNDER'
}

/** One shop's counted usage, as the repository returns it. */
export interface UsageRow {
  shopId: string
  shopName: string
  ownerEmail: string | null
  isDemo: boolean
  /** Null when the account has no subscription row at all. */
  plan: string | null
  /** Counted, not stored: active listings the shop actually has. */
  activeListings: number
  /** Counted: ai_generations rows created in the current month. */
  aiGenerationsThisMonth: number
}

export interface AssessedMeter {
  meter: UsageMeter
  band: UsageBand
  /** 0–100, capped for the bar. The raw ratio is on `meter`. */
  percent: number
}

export interface AssessedUsage {
  row: UsageRow
  /** The plan actually in force, or null when there is no billing record. */
  plan: PlanKey | null
  meters: AssessedMeter[]
}

/**
 * The plan to measure against.
 *
 * An account with no subscription row is measured against nothing, and the
 * screen says so, rather than being measured against Free. "Never been through
 * billing" and "chose the free tier" are different facts (D34), and quietly
 * assuming the second would report a shop as over a limit it was never given.
 */
export function planInForce(plan: string | null): PlanKey | null {
  return PLANS.find((entry) => entry.key === plan)?.key ?? null
}

export function assessUsage(row: UsageRow, now: Date): AssessedUsage {
  const plan = planInForce(row.plan)
  if (plan === null) return { row, plan: null, meters: [] }

  /*
   * The SELLER's own meters, not a second set built here (D46). They carry the
   * limit, and they carry `pauses` and `continues` with it — which is what
   * keeps an operator reading the same sentence the seller reads rather than a
   * harsher paraphrase of it.
   */
  const meters = buildMeters({
    plan,
    activeListings: row.activeListings,
    aiGenerationsUsed: row.aiGenerationsThisMonth,
    aiResetsOn: firstOfNextMonth(now),
  })

  return {
    row,
    plan,
    meters: meters.map((meter) => ({
      meter,
      band: bandFor(meter.used, meter.limit),
      percent: meter.limit === 0 ? 0 : Math.min(100, Math.round((meter.used / meter.limit) * 100)),
    })),
  }
}

/** The calendar date the monthly allowance resets. YYYY-MM-DD, never zoned (D24). */
export function firstOfNextMonth(now: Date): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return next.toISOString().slice(0, 10)
}

export interface BandCount {
  band: UsageBand
  metric: MetricKey
  count: number
}

/**
 * Count by band, per metric, with every band present.
 *
 * Every band including the empty ones (D34): a summary that hides "Over" when
 * nobody is over reads exactly like a summary rendered before the band
 * existed, and the reader cannot tell which they are looking at.
 */
export function countByBand(
  assessed: readonly AssessedUsage[],
  metric: MetricKey,
): BandCount[] {
  return BAND_ORDER.map((band) => ({
    band,
    metric,
    count: assessed.filter((entry) =>
      entry.meters.some((m) => m.meter.metric === metric && m.band === band),
    ).length,
  }))
}

/** Accounts with no billing record, so nothing to measure them against. */
export function unmeasurable(assessed: readonly AssessedUsage[]): AssessedUsage[] {
  return assessed.filter((entry) => entry.plan === null)
}

/**
 * Everything at or past a limit, worst first, then everything near one.
 *
 * NOT_OFFERED is excluded even though a Free account with listings would look
 * dramatic: the plan never offered the capability, so the shop has not
 * exceeded an allowance — it has rows from before a downgrade, or from a
 * connection it no longer has. Filing that under "over limit" would send an
 * operator to tell a seller they are over a cap that does not exist.
 */
export function atOrOverLimit(assessed: readonly AssessedUsage[]): AssessedUsage[] {
  const rank = (entry: AssessedUsage) =>
    Math.min(...entry.meters.map((m) => BAND_ORDER.indexOf(m.band)))
  return assessed
    .filter((entry) =>
      entry.meters.some((m) => m.band === 'OVER' || m.band === 'AT_LIMIT' || m.band === 'NEAR'),
    )
    .sort((a, b) => rank(a) - rank(b) || a.row.shopName.localeCompare(b.row.shopName))
}
