/*
 * Subscription lifecycle: upgrade, downgrade, cancel, resume.
 *
 * Phase 8's acceptance criterion is "billing is transparent and has no dark
 * patterns". That is a claim about behaviour, so this file tries to make the
 * behaviour impossible to get wrong rather than merely documented.
 *
 * Three guarantees, each enforced by something other than good intentions:
 *
 *  1. CANCELLING IS NEVER HARDER THAN SUBSCRIBING.
 *     Both flows are declared as step lists, and the module refuses to load if
 *     cancelling has more steps than subscribing. A retention maze cannot be
 *     added without deleting the invariant, which is a visible act.
 *
 *  2. NO CHARGE WITHOUT DISCLOSURE.
 *     Every money-moving path returns a DisclosedCharge or null. The provider's
 *     charge method accepts only that branded type, so an undisclosed charge is
 *     a compile error rather than a policy breach.
 *
 *  3. NOTHING IS DELETED ON A DOWNGRADE.
 *     `downgradeEffects` enumerates what pauses. There is no delete anywhere in
 *     the billing domain to enumerate.
 *
 * There is no fourth guarantee about refunds, because there are no refunds.
 * This product does not refund a subscription charge, and the honest way to
 * hold that is CANCELLATION_TERMS on the billing screen — not a window that
 * exists in the code and nowhere the seller can reach.
 */

import { disclose, type DisclosedCharge, type Subscription } from '@/lib/billing/interface'
import { planOf, type Plan, type PlanKey } from './plans'

/* ------------------------------------------------------- flow symmetry (1) */

export interface FlowStep {
  key: string
  label: string
}

/** What it takes to start paying. */
export const SUBSCRIBE_FLOW: FlowStep[] = [
  { key: 'choose', label: 'Choose a plan' },
  { key: 'confirm', label: 'Review what you will be charged, and when' },
]

/**
 * What it takes to stop.
 *
 * One step. "Cancel in one click from this page — no email, no retention call,
 * no confirmation maze."
 */
export const CANCEL_FLOW: FlowStep[] = [{ key: 'cancel', label: 'Cancel plan' }]

if (CANCEL_FLOW.length > SUBSCRIBE_FLOW.length) {
  throw new Error(
    `Cancelling takes ${CANCEL_FLOW.length} steps and subscribing takes ${SUBSCRIBE_FLOW.length}. ` +
      'Leaving must never be harder than joining.',
  )
}

/* --------------------------------------------------------- plan change (2) */

export type ChangeKind = 'UPGRADE' | 'DOWNGRADE' | 'SAME'

export interface PlanChange {
  kind: ChangeKind
  from: Plan
  to: Plan
  /** Null when nothing is owed today — a downgrade never charges. */
  charge: DisclosedCharge | null
  /** What the seller gains, in their words. */
  gains: string[]
  /** What pauses. Never "what is deleted", because nothing is. */
  pauses: string[]
  /** When the change takes effect. */
  effectiveOn: string
  /** Stated for every change, including the ones that cost nothing. */
  note: string
}

export function classifyChange(from: PlanKey, to: PlanKey): ChangeKind {
  if (from === to) return 'SAME'
  return planOf(to).priceMonthly > planOf(from).priceMonthly ? 'UPGRADE' : 'DOWNGRADE'
}

/**
 * Price an upgrade, prorated for the days left in the paid period.
 *
 * The proration is shown, not folded into a single number: a seller who has
 * paid for a month and upgrades on day 20 should be able to see that they are
 * being charged for 10 days, not for a fresh month.
 */
export function planChange(args: {
  from: PlanKey
  to: PlanKey
  subscription: Subscription
  today: string
  currency: string
}): PlanChange {
  const { from, to, subscription, today, currency } = args
  const kind = classifyChange(from, to)
  const fromPlan = planOf(from)
  const toPlan = planOf(to)

  if (kind === 'DOWNGRADE') {
    /*
     * No charge, and no refund of the current period either — stated plainly
     * rather than left for the seller to discover. They keep the plan they paid
     * for until it runs out, then drop.
     */
    return {
      kind,
      from: fromPlan,
      to: toPlan,
      charge: null,
      gains: [],
      pauses: downgradeEffects(fromPlan, toPlan),
      effectiveOn: subscription.currentPeriodEnd,
      note: `Nothing is charged and nothing is refunded. You keep ${fromPlan.name} until ${subscription.currentPeriodEnd}, then move to ${toPlan.name}. Your data stays either way.`,
    }
  }

  if (kind === 'SAME') {
    return {
      kind,
      from: fromPlan,
      to: toPlan,
      charge: null,
      gains: [],
      pauses: [],
      effectiveOn: today,
      note: 'This is the plan you are already on.',
    }
  }

  const days = daysBetween(today, subscription.currentPeriodEnd)
  const periodDays = Math.max(1, daysBetween(subscription.currentPeriodStart, subscription.currentPeriodEnd))
  const difference = toPlan.priceMonthly - fromPlan.priceMonthly
  const amountDue = round2((difference * days) / periodDays)

  return {
    kind,
    from: fromPlan,
    to: toPlan,
    charge: disclose({
      amountDue,
      currency,
      onDate: today,
      whatChanges: [
        `${fromPlan.name} → ${toPlan.name}, effective today`,
        `$${difference} per month more, charged for the ${days} days left in this period — $${amountDue.toFixed(2)} today, not a full month`,
        `Your next full charge is $${toPlan.priceMonthly} on ${subscription.currentPeriodEnd}`,
        'This charge is not refundable. Downgrading later stops the next renewal and keeps this period.',
      ],
    }),
    gains: toPlan.includes.filter((line) => !fromPlan.includes.includes(line)),
    pauses: [],
    effectiveOn: today,
    note: `Charged today for the ${days} days remaining, then $${toPlan.priceMonthly} monthly from ${subscription.currentPeriodEnd}.`,
  }
}

/* ------------------------------------------------------ downgrade (3) */

/**
 * What stops working on a downgrade.
 *
 * Every entry is a pause. There is no delete in this domain, so there is none
 * to list: "Downgrading keeps your data. If you exceed a limit, EtsyPilot
 * pauses new bulk jobs rather than deleting anything — you choose what to
 * remove."
 */
export function downgradeEffects(from: Plan, to: Plan): string[] {
  const effects: string[] = []

  if (from.limits.listings > to.limits.listings) {
    effects.push(
      to.limits.listings === 0
        ? `${to.name} connects no shop, so listing tools stop. Your listings stay on Etsy exactly as they are and your history here stays readable — nothing is removed for you.`
        : `Over ${to.limits.listings.toLocaleString('en-US')} listings, new bulk jobs pause. Every listing stays exactly as it is — you choose what to remove, and nothing is removed for you.`,
    )
  }
  if (from.limits.aiGenerations > to.limits.aiGenerations) {
    effects.push(
      `AI drafting drops to ${to.limits.aiGenerations} generations a month. Drafts you already approved are unaffected.`,
    )
  }
  if ((from.limits.rollbackDays ?? 0) > (to.limits.rollbackDays ?? 0)) {
    effects.push(
      to.limits.rollbackDays === null
        ? 'Rollback is no longer available. Your change history stays readable.'
        : `Rollback covers ${to.limits.rollbackDays} days instead of ${from.limits.rollbackDays}. Older history stays readable, just not reversible.`,
    )
  }
  if ((from.limits.pulseHistoryMonths ?? 0) > (to.limits.pulseHistoryMonths ?? 0)) {
    effects.push(
      to.limits.pulseHistoryMonths === null
        ? 'Shop Pulse is no longer computed. The orders behind it are still yours.'
        : `Shop Pulse looks back ${to.limits.pulseHistoryMonths} months instead of ${from.limits.pulseHistoryMonths}.`,
    )
  }

  return effects
}

/* ------------------------------------------------------ cancellation (1) */

export interface Cancellation {
  /** Access continues to here. Cancelling never takes the paid period away. */
  accessUntil: string
  effects: string[]
  /** Always available, at the same cost as cancelling: one click. */
  resumeLabel: string
}

export function planCancellation(args: { subscription: Subscription }): Cancellation {
  const { subscription } = args

  return {
    accessUntil: subscription.currentPeriodEnd,
    effects: [
      `You keep everything until ${subscription.currentPeriodEnd} — the period you have already paid for.`,
      'After that your account moves to Free. Your shop data, history and exports stay.',
      'Nothing is deleted by cancelling, now or later.',
      'The charge for this period is not refunded. Cancelling stops the next one.',
    ],
    resumeLabel: 'Resume plan',
  }
}

/* ------------------------------------------------------------------ trial */

export interface TrialState {
  daysLeft: number
  endsOn: string
  /** True only when a card is on file. Drives the whole message. */
  willCharge: boolean
  message: string
}

export function trialState(subscription: Subscription, today: string): TrialState | null {
  if (subscription.status !== 'TRIALING' || !subscription.trialEndsOn) return null

  const daysLeft = Math.max(0, daysBetween(today, subscription.trialEndsOn))
  const willCharge = subscription.paymentMethod !== null

  return {
    daysLeft,
    endsOn: subscription.trialEndsOn,
    willCharge,
    message: willCharge
      ? `Your card is on file. On ${subscription.trialEndsOn} you will be charged $${planOf(subscription.plan).priceMonthly} for the first month unless you cancel before then — cancelling takes one click from this page.`
      : `No card on file. Nothing is charged when the trial ends — your account moves to Free and your data stays. Add a card only when you decide to continue.`,
  }
}

/* ------------------------------------------------------------- utilities */

/** Whole days between two YYYY-MM-DD dates. Calendar arithmetic, never zoned. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`)
  const b = Date.parse(`${to}T00:00:00.000Z`)
  return Math.round((b - a) / 86_400_000)
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
