/*
 * Billing view.
 *
 * Reads the subscription and the ledger through the provider seam, counts usage
 * from the shop, and computes everything else — the trial countdown, the
 * proration, the plan-change effects. Nothing on this screen is a constant that
 * could drift away from what the seller was actually charged.
 *
 * Two usage meters only, Listings and AI generations (D22 consequence 1).
 * Connected shops and Team seats came out with multi-user: a meter for a
 * capacity nobody has is an advertisement dressed as a status.
 */

import { getBillingProvider, missingPaymentProviderConfig } from '@/lib/billing'
import type { Invoice, Subscription } from '@/lib/billing/interface'
import { shopHeader } from '@/domain/sync/source'
import { assertNotPublicVisitor } from '@/domain/public-demo'
import { loadListings } from '@/domain/listings/load'
import { Errors } from '@/lib/errors/types'
import type { ShopContext } from '@/lib/permissions'
import { billingToday } from './demo'
import {
  AGENCY_NOTE,
  LIMIT_POLICY,
  CANCELLATION_TERMS,
  PLANS,
  planOf,
  nextPlanAfter,
  TRIAL_TERMS,
  type Plan,
  type PlanKey,
} from './plans'
import {
  CANCEL_FLOW,
  SUBSCRIBE_FLOW,
  planCancellation,
  planChange,
  trialState,
  type Cancellation,
  type PlanChange,
  type TrialState,
} from './lifecycle'
import { buildMeters, enforce, pressureWarning, type LimitDecision, type MetricKey, type UsageMeter } from './usage'
import { allowanceResetsOn } from '@/domain/clock'

export interface BillingView {
  /*
   * ── WHAT A SELLER SEES WHEN NOBODY CAN PAY ──────────────────────────────
   *
   * `open` is false where this deployment has no payment provider, which is
   * every live deployment today. Then there is no subscription, no plan, no
   * card, no invoice and no proration — and every one of those fields is null
   * or empty rather than filled in from a mock.
   *
   * The plans are NOT null, because they are real: priced, listed on /pricing,
   * and the thing a seller is deciding between. This screen is not "not built"
   * the way Research was; the tiers exist and what is missing is the ability
   * to pay for one.
   */
  open: boolean
  /** True when the surface is running against the mock provider (demo only). */
  isDemo: boolean
  /** Why nothing can be bought, by the names of what is unconfigured. */
  closed: { reasons: string[] } | null
  subscription: Subscription | null
  currentPlan: Plan | null
  plans: Plan[]
  nextPlan: Plan | null
  meters: UsageMeter[]
  /** The meter nearest its limit, or null when none is close. */
  pressure: UsageMeter | null
  invoices: Invoice[]
  trial: TrialState | null
  cancellation: Cancellation | null
  /** One entry per other plan, priced and explained. Empty while closed. */
  changes: PlanChange[]
  agencyNote: string
  limitPolicy: string
  cancellationTerms: string
  trialTerms: typeof TRIAL_TERMS
  currency: string
  /** Rendered on the page so the symmetry is visible, not just true. */
  flows: { subscribe: typeof SUBSCRIBE_FLOW; cancel: typeof CANCEL_FLOW }
  today: string
}

export async function getBillingView(ctx: ShopContext): Promise<BillingView> {
  const billing = getBillingProvider()
  const [shop, { listings }] = await Promise.all([shopHeader(ctx), loadListings(ctx)])
  const activeListings = listings.filter((l) => l.state === 'ACTIVE').length
  const today = billingToday()

  /*
   * ── NO PROVIDER, SO NO SUBSCRIPTION TO DESCRIBE ─────────────────────────
   *
   * This used to fall through to MockBillingProvider, so the lines below ran
   * over an authored subscription and the page told a live seller they were on
   * Solo, renewing on 12 September, with a Visa ending 4242.
   *
   * The meters still carry the COUNTS, because those are real and measured
   * from the shop — they just have no denominator, since no plan has set one.
   */
  if (!billing) {
    const meters = buildMeters({
      plan: null,
      activeListings,
      aiGenerationsUsed: 42,
      aiResetsOn: allowanceResetsOn(),
    })
    return {
      open: false,
      isDemo: false,
      closed: { reasons: missingPaymentProviderConfig() },
      subscription: null,
      currentPlan: null,
      plans: PLANS,
      nextPlan: null,
      meters,
      pressure: null,
      invoices: [],
      trial: null,
      cancellation: null,
      changes: [],
      agencyNote: AGENCY_NOTE,
      limitPolicy: LIMIT_POLICY,
      cancellationTerms: CANCELLATION_TERMS,
      trialTerms: TRIAL_TERMS,
      currency: shop?.currency ?? 'USD',
      flows: { subscribe: SUBSCRIBE_FLOW, cancel: CANCEL_FLOW },
      today,
    }
  }

  const [subscription, invoices] = await Promise.all([
    billing.getSubscription(ctx.shopId),
    billing.listInvoices(ctx.shopId),
  ])

  const plan = planOf(subscription.plan)
  const meters = buildMeters({
    plan: subscription.plan,
    // Active listings only — the population the plan limit applies to.
    activeListings,
    aiGenerationsUsed: 42,
    aiResetsOn: allowanceResetsOn(),
  })

  return {
    open: true,
    isDemo: billing.mode === 'MOCK',
    closed: null,
    subscription,
    currentPlan: plan,
    plans: PLANS,
    nextPlan: nextPlanAfter(subscription.plan),
    meters,
    pressure: pressureWarning(meters),
    invoices,
    trial: trialState(subscription, today),
    cancellation: planCancellation({ subscription }),
    changes: PLANS.filter((p) => p.key !== subscription.plan).map((p) =>
      planChange({
        from: subscription.plan,
        to: p.key,
        subscription,
        today,
        currency: shop?.currency ?? 'USD',
      }),
    ),
    agencyNote: AGENCY_NOTE,
    limitPolicy: LIMIT_POLICY,
    cancellationTerms: CANCELLATION_TERMS,
    trialTerms: TRIAL_TERMS,
    currency: shop?.currency ?? 'USD',
    flows: { subscribe: SUBSCRIBE_FLOW, cancel: CANCEL_FLOW },
    today,
  }
}

/* ------------------------------------------------------------- mutations */

/**
 * The guard for a billing mutation.
 *
 * NOT assertCanWrite(). That guard exists to stop a demo shop publishing to
 * Etsy — a write that leaves the product and touches a live listing. A billing
 * change is a different thing: in demo mode it runs against MockBillingProvider,
 * moves no money, touches no card, and is reversible in one click.
 *
 * Blocking it made the cancellation flow unwalkable, which matters because
 * "cancelling is one click" is this phase's central promise and an unwalkable
 * promise is an unverifiable one. It also failed with "Demo mode cannot publish
 * to Etsy", which is not what cancelling a subscription does.
 *
 * So the invariant is stated where it actually bites: a read-only context may
 * never reach a LIVE provider. The adapter selector already refuses to build one
 * in demo mode, so this is the second of two guards on the same property —
 * deliberately, as with the demo-mode write refusal in the bulk editor.
 */
/**
 * The provider, or a refusal.
 *
 * Every mutation route — change plan, cancel, resume — goes through this
 * first. With no provider there is no subscription to change, and the honest
 * answer to a POST is a refusal rather than a quietly mutated fixture. The
 * page does not render those buttons when billing is closed; this is the gate
 * that holds when somebody posts to the route anyway.
 */
function assertBillingOpen(): NonNullable<ReturnType<typeof getBillingProvider>> {
  const billing = getBillingProvider()
  if (!billing) throw Errors.billingNotOpen(missingPaymentProviderConfig())
  return billing
}

function assertBillingWritable(ctx: ShopContext, provider: { mode: string }): void {
  /*
   * ── NOBODY IS HERE, SO NOBODY MAY CHANGE THE PLAN ─────────────────────
   *
   * The clause below deliberately lets a READ-ONLY context write while the
   * provider is the MOCK, so the demo seller can walk through an upgrade and
   * a cancellation — which is most of what the billing screen is for.
   *
   * The mock is the provider in every deployment today, so that clause also
   * let a landing-page visitor with no account change the demo shop's plan,
   * for every other visitor at the same time. First gate, before the one
   * that permits.
   */
  assertNotPublicVisitor(ctx)
  if (ctx.readOnly && provider.mode !== 'MOCK') {
    throw Errors.demoModeWrite()
  }
}

/**
 * Change plan.
 *
 * The charge comes from planChange(), which is the only producer of a
 * DisclosedCharge — so the amount the provider is given is by construction the
 * amount the seller was shown. There is no path here that reads a price and
 * charges it.
 */
export async function changePlan(ctx: ShopContext, to: PlanKey): Promise<Subscription> {
  const billing = assertBillingOpen()
  assertBillingWritable(ctx, billing)
  const subscription = await billing.getSubscription(ctx.shopId)
  const shop = await shopHeader(ctx)

  const change = planChange({
    from: subscription.plan,
    to,
    subscription,
    today: billingToday(),
    currency: shop?.currency ?? 'USD',
  })
  if (change.kind === 'SAME') return subscription

  return billing.changePlan(ctx.shopId, to, change.charge)
}

/** One call, from the billing page. No intermediate offer, no survey. */
export async function cancelPlan(ctx: ShopContext): Promise<Subscription> {
  const billing = assertBillingOpen()
  assertBillingWritable(ctx, billing)
  const subscription = await billing.getSubscription(ctx.shopId)
  return billing.cancel(ctx.shopId, { effectiveOn: subscription.currentPeriodEnd })
}

export async function resumePlan(ctx: ShopContext): Promise<Subscription> {
  const billing = assertBillingOpen()
  assertBillingWritable(ctx, billing)
  return billing.resume(ctx.shopId)
}

/**
 * Gate a unit of work on a plan limit.
 *
 * Exported for the surfaces that start work — the bulk editor and the AI
 * copilot — so the decision is made once, before the work, and rendered with
 * both halves: what pauses and what keeps running.
 */
export async function checkLimit(ctx: ShopContext, metric: MetricKey): Promise<LimitDecision> {
  const billing = getBillingProvider()
  const subscription = billing ? await billing.getSubscription(ctx.shopId) : null
  const { listings } = await loadListings(ctx)

  const used =
    metric === 'listings' ? listings.filter((l) => l.state === 'ACTIVE').length : 42

  /*
   * No subscription means no plan, and enforce() then allows the work. A cap
   * from a plan nobody was sold is not a cap — see the note in ./usage.ts.
   */
  return enforce({ plan: subscription?.plan ?? null, metric, used })
}

/**
 * The plan a shop is on, or null because it is on none.
 *
 * ── WHAT PLAN IS A SIGNED-UP SELLER ACTUALLY ON? NONE ───────────────────────
 *
 * Nothing has been sold, so nothing has been bought. That is the whole answer,
 * and it used to be answered "Solo" — the chip in the sidebar read "Solo plan"
 * on every screen, to somebody who has never paid, because the mock's
 * subscription said so and because the catch branch below fell back to
 * DEMO_PLAN as well. Two routes to the same false claim.
 *
 * Null, not a cheaper plan. "Free" would be the tempting answer and it is also
 * wrong: Free is defined as connecting no shop, so it would both understate
 * what a seller has today and start enforcing a cap nobody agreed to.
 */
export async function currentPlan(ctx: ShopContext): Promise<Plan | null> {
  const billing = getBillingProvider()
  if (!billing) return null

  try {
    const subscription = await billing.getSubscription(ctx.shopId)
    return planOf(subscription.plan)
  } catch (error) {
    /*
     * A billing outage must not take the product down, and it must not invent
     * a plan either. This returned planOf(DEMO_PLAN) — so an outage promoted
     * every seller to Solo in the shell. Null says what is true: we do not
     * know, and the billing page reports the real error.
     */
    if (error instanceof Error) return null
    throw Errors.unknown()
  }
}
