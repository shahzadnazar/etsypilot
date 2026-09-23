/*
 * Subscriptions across every account, as data.
 *
 * Pure: no database, no `server-only`, no React.
 *
 * ── THE LIMITS ARE NOT WRITTEN HERE ───────────────────────────────────────
 *
 * D46: a limit is written once and read everywhere. `PLANS` already says what
 * Solo allows and what Growth costs, the seller-facing billing page renders
 * from it, and the usage meters enforce from it. This screen reads the same
 * object. A second statement of "200 listings" next to an operator table is a
 * statement that is correct until the day the plan changes and unowned after
 * it — which is the same defect as a coverage figure that is stated rather
 * than computed (D34).
 *
 * ── THERE IS NO REFUND, ANYWHERE ──────────────────────────────────────────
 *
 * D83 removed subscription refunds outright: no method, no invoice kind, no
 * REFUNDED status, no window, no terms. Nothing in this product can produce a
 * credit for a plan charge, so nothing here may render a column, a state or a
 * count that implies one exists. A screen that can still draw a refund is a
 * screen waiting to lie — an operator who sees the column tells a seller their
 * money is coming back.
 *
 * (The ORDER refund — money a seller returned to a buyer — is untouched and
 * lives in the profit waterfall. Different noun, different money, and not on
 * this screen at all.)
 *
 * ── NO ROW IS NOT THE FREE PLAN ───────────────────────────────────────────
 *
 * The column defaults to FREE/ACTIVE, so an account with a subscription row
 * and an account with none produce identical-looking answers and mean
 * different things: one chose the free tier, the other has never been through
 * billing at all. They are counted separately and rendered separately (D34).
 */

import { PLANS, type Plan, type PlanKey } from '@/domain/billing/plans'
import type { SubscriptionStatus } from '@/lib/billing/interface'

/**
 * Every status a subscription can be in.
 *
 * `satisfies` pins each entry to the real union, and the exhaustiveness check
 * below turns a MISSING one into a compile error — which is the half that
 * matters. A list that merely contains valid entries can still be short by
 * one, and a status missing from this array is a status the summary silently
 * never counts.
 */
export const SUBSCRIPTION_STATUSES = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELLING',
  'CANCELLED',
] as const satisfies readonly SubscriptionStatus[]

/** Compile error if lib/billing/interface.ts grows a status this list lacks. */
type _EveryStatusIsListed =
  Exclude<SubscriptionStatus, (typeof SUBSCRIPTION_STATUSES)[number]> extends never ? true : never
const _exhaustive: _EveryStatusIsListed = true
void _exhaustive

export type KnownSubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

/**
 * The statuses that need a human to look at them.
 *
 * PAST_DUE because a payment failed and the seller may not know. CANCELLING
 * because there is a window in which a conversation is still possible, and it
 * closes. Neither is something an operator can FIX from here — billing is not
 * on the operator allowlist (D94a) — but both are things worth knowing before
 * the seller writes in.
 */
export const NEEDS_ATTENTION_STATUSES: readonly KnownSubscriptionStatus[] = [
  'PAST_DUE',
  'CANCELLING',
]

/** A trial inside this window ends before anyone is likely to notice it did. */
export const TRIAL_ENDING_SOON_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

export const STATUS_COPY: Record<
  KnownSubscriptionStatus,
  { label: string; tone: 'ok' | 'info' | 'warn' | 'danger'; detail: string }
> = {
  TRIALING: {
    label: 'Trialing',
    tone: 'info',
    detail: 'Inside a trial. May have no card on file, which is an honest state rather than a gap.',
  },
  ACTIVE: {
    label: 'Active',
    tone: 'ok',
    detail: 'Paid and current.',
  },
  PAST_DUE: {
    label: 'Past due',
    tone: 'danger',
    detail:
      'A charge failed. The seller keeps access while the provider retries, and may not know anything is wrong.',
  },
  CANCELLING: {
    label: 'Cancelling',
    tone: 'warn',
    detail:
      'Cancelled, and still inside the period they paid for. Access continues to the end of it — this is not a lapsed account.',
  },
  CANCELLED: {
    label: 'Cancelled',
    tone: 'info',
    detail: 'The period has ended. Nothing is being charged.',
  },
}

/** One account's billing state, as the repository returns it. */
export interface SubscriptionRow {
  userId: string
  email: string | null
  shopName: string | null
  /** Null when the account has NO subscription row. Not the same as FREE. */
  plan: string | null
  status: string | null
  renewsAt: Date | null
  trialEndsAt: Date | null
  cancelledAt: Date | null
}

/**
 * How an account's plan reads.
 *
 * NO_RECORD is its own case and does not fall through to FREE. An account that
 * has never been through billing and an account on the free tier are different
 * facts, and the second one is a choice the seller made.
 */
export type PlanBucket = PlanKey | 'NO_RECORD' | 'UNKNOWN'

export function planBucket(plan: string | null): PlanBucket {
  if (plan === null) return 'NO_RECORD'
  const known = PLANS.find((entry) => entry.key === plan)
  /*
   * UNKNOWN rather than a silent fallback to FREE. A row holding a plan key
   * the code does not recognise is a data problem, and hiding it under the
   * cheapest tier is how it stays hidden. The count is small or zero; when it
   * is not, that is the finding.
   */
  return known ? known.key : 'UNKNOWN'
}

export function statusBucket(status: string | null): KnownSubscriptionStatus | 'NO_RECORD' | 'UNKNOWN' {
  if (status === null) return 'NO_RECORD'
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
    ? (status as KnownSubscriptionStatus)
    : 'UNKNOWN'
}

export interface PlanCount {
  bucket: PlanBucket
  /** The plan itself, where there is one. Null for NO_RECORD and UNKNOWN. */
  plan: Plan | null
  label: string
  count: number
}

/**
 * Count by plan, with every plan present and both non-plan buckets after them.
 *
 * Every plan in PLANS, including the ones at zero (D34) — a breakdown that
 * omits Growth when nobody is on it reads exactly like a breakdown written
 * before Growth existed.
 */
export function countByPlan(rows: readonly SubscriptionRow[]): PlanCount[] {
  const counted = rows.map((row) => planBucket(row.plan))
  const planCounts: PlanCount[] = PLANS.map((plan) => ({
    bucket: plan.key,
    plan,
    label: plan.name,
    count: counted.filter((bucket) => bucket === plan.key).length,
  }))

  return [
    ...planCounts,
    {
      bucket: 'NO_RECORD',
      plan: null,
      label: 'No billing record',
      count: counted.filter((bucket) => bucket === 'NO_RECORD').length,
    },
    {
      bucket: 'UNKNOWN',
      plan: null,
      label: 'Unrecognised plan',
      count: counted.filter((bucket) => bucket === 'UNKNOWN').length,
    },
  ]
}

export interface StatusCount {
  bucket: KnownSubscriptionStatus | 'NO_RECORD' | 'UNKNOWN'
  label: string
  tone: 'ok' | 'info' | 'warn' | 'danger'
  count: number
}

export function countByStatus(rows: readonly SubscriptionRow[]): StatusCount[] {
  const counted = rows.map((row) => statusBucket(row.status))
  const known: StatusCount[] = SUBSCRIPTION_STATUSES.map((status) => ({
    bucket: status,
    label: STATUS_COPY[status].label,
    tone: STATUS_COPY[status].tone,
    count: counted.filter((bucket) => bucket === status).length,
  }))

  return [
    ...known,
    {
      bucket: 'NO_RECORD',
      label: 'No billing record',
      tone: 'info',
      count: counted.filter((bucket) => bucket === 'NO_RECORD').length,
    },
    {
      bucket: 'UNKNOWN',
      label: 'Unrecognised status',
      tone: 'warn',
      count: counted.filter((bucket) => bucket === 'UNKNOWN').length,
    },
  ]
}

/** Everything in a status that wants a human, worst first. */
export function needsAttention(rows: readonly SubscriptionRow[]): SubscriptionRow[] {
  const rank = (row: SubscriptionRow) =>
    NEEDS_ATTENTION_STATUSES.indexOf(statusBucket(row.status) as KnownSubscriptionStatus)
  return rows
    .filter((row) => (NEEDS_ATTENTION_STATUSES as readonly string[]).includes(row.status ?? ''))
    .sort((a, b) => rank(a) - rank(b) || (a.email ?? '').localeCompare(b.email ?? ''))
}

export interface EndingTrial {
  row: SubscriptionRow
  daysLeft: number
}

/**
 * Trials ending within the window, soonest first.
 *
 * Only rows whose STATUS is TRIALING. A trialEndsAt left behind on an account
 * that has since converted is a stale column, not a trial — counting it would
 * put paying customers on a list titled "about to lose access".
 *
 * Already-ended trials are excluded: the window is for the ones that can still
 * be reached in time, and mixing in the ones that cannot would bury them.
 */
export function trialsEndingSoon(rows: readonly SubscriptionRow[], now: Date): EndingTrial[] {
  return rows
    .filter((row) => statusBucket(row.status) === 'TRIALING' && row.trialEndsAt !== null)
    .map((row) => ({
      row,
      daysLeft: Math.floor((row.trialEndsAt!.getTime() - now.getTime()) / DAY_MS),
    }))
    .filter((entry) => entry.daysLeft >= 0 && entry.daysLeft <= TRIAL_ENDING_SOON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

/**
 * The plan's limits, in one line, read from PLANS.
 *
 * A limit of 0 means "not offered on this plan" rather than "none allowed",
 * which is the distinction the sidebar meter already makes — Free connects no
 * shop, so it manages no listings, and rendering that as "0 / 0" would read as
 * a shop at its cap.
 */
export function limitsLine(plan: Plan): string {
  const listings =
    plan.limits.listings === 0
      ? 'no shop connection'
      : `${plan.limits.listings.toLocaleString('en-US')} listings`
  return `${listings} · ${plan.limits.aiGenerations.toLocaleString('en-US')} AI generations / month`
}
