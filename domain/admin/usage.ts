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
 * So the meter is COUNTED from the rows that are the usage: the active
 * listings the shop actually has.
 *
 * It was two meters. `AI generations` counted ai_generations rows created in
 * the current month, and D95 removed the Copilot that wrote them — a meter is
 * a claim about what a seller is consuming, and this one would have gone on
 * claiming it for a feature nobody can reach. The table stays in the schema
 * (an applied migration is never edited); nothing counts it.
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
 */

import { buildMeters, type MetricKey, type UsageMeter } from '@/domain/billing/usage'
import { countedUsage } from './provenance'
import type { Provenanced } from '@/lib/provenance/types'
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
  const meters = buildMeters({ plan, activeListings: row.activeListings })

  return {
    row,
    plan,
    meters: meters.map((meter) => ({
      meter,
      /*
       * The limit cannot be null here: this reads a subscription ROW, so there
       * is always a plan. Coerced to 0 rather than asserted, because 0 already
       * means "not offered on this plan" and bands and renders safely — an `!`
       * here would be the one place this file trusts a type over a row.
       */
      band: bandFor(meter.used, meter.limit ?? 0),
      percent:
        meter.limit === null || meter.limit === 0
          ? 0
          : Math.min(100, Math.round((meter.used / meter.limit) * 100)),
    })),
  }
}

/*
 * ── firstOfNextMonth() IS GONE WITH THE MONTHLY METER ────────────────────
 *
 * It gave the operator screen the date the AI generation allowance reset,
 * UTC and unzoned (D24), over an injected `now` so a test could pin it. The
 * one meter left is a standing capacity: active listings reset on no date,
 * and `UsageMeter.resetsOn` is null for them.
 *
 * Nothing else asked for it — the only other reset date in the product was
 * domain/clock.ts's allowanceResetsOn(), removed in the same change for the
 * same reason. A monthly allowance arriving again brings both back; the
 * arithmetic is three lines and is in `with-ai-and-extension`.
 */

export interface BandCount {
  band: UsageBand
  metric: MetricKey
  /*
   * Provenanced, so the count cannot reach a screen without saying where it
   * came from. components/admin/operator-figure.tsx only accepts
   * Provenanced<T>, so a bare number here would not compile against it.
   */
  count: Provenanced<number>
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
    count: countedUsage(
      assessed.filter((entry) =>
        entry.meters.some((m) => m.meter.metric === metric && m.band === band),
      ).length,
      /*
       * One metric, so no ternary. It read `metric === 'listings' ? 'active
       * listing' : 'AI generation'`, and the second arm would now describe
       * every future metric as an AI generation — a default that is wrong for
       * anything but the one thing that no longer exists.
       */
      `Shops whose active listing meter is ${BAND_COPY[band].label.toLowerCase()}.`,
    ),
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
