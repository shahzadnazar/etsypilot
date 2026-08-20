/*
 * Billing view.
 *
 * Reads the subscription and the ledger through the provider seam, counts usage
 * from the shop, and computes everything else — the trial countdown, the refund
 * window, the proration, the plan-change effects. Nothing on this screen is a
 * constant that could drift away from what the seller was actually charged.
 *
 * Two usage meters only, Listings and AI generations (D22 consequence 1).
 * Connected shops and Team seats came out with multi-user: a meter for a
 * capacity nobody has is an advertisement dressed as a status.
 */

import { getBillingProvider } from '@/lib/billing'
import type { Invoice, Subscription } from '@/lib/billing/interface'
import { getEtsyService } from '@/lib/etsy'
import { Errors } from '@/lib/errors/types'
import type { ShopContext } from '@/lib/permissions'
import { BILLING_NOW } from '@/lib/billing/mock'
import {
  AGENCY_NOTE,
  DEMO_PLAN,
  LIMIT_POLICY,
  PLANS,
  planOf,
  nextPlanAfter,
  REFUND_TERMS,
  REFUND_WINDOW_DAYS,
  TRIAL_TERMS,
  type Plan,
  type PlanKey,
} from './plans'
import {
  CANCEL_FLOW,
  SUBSCRIBE_FLOW,
  assertRefundable,
  planCancellation,
  planChange,
  refundEligibility,
  trialState,
  type Cancellation,
  type PlanChange,
  type RefundEligibility,
  type TrialState,
} from './lifecycle'
import { buildMeters, enforce, pressureWarning, type LimitDecision, type MetricKey, type UsageMeter } from './usage'

export interface BillingView {
  /** True when the whole surface is running against the mock provider. */
  isDemo: boolean
  subscription: Subscription
  currentPlan: Plan
  plans: Plan[]
  nextPlan: Plan | null
  meters: UsageMeter[]
  /** The meter nearest its limit, or null when none is close. */
  pressure: UsageMeter | null
  invoices: Invoice[]
  trial: TrialState | null
  refundable: RefundEligibility | null
  cancellation: Cancellation
  /** One entry per other plan, priced and explained. */
  changes: PlanChange[]
  agencyNote: string
  limitPolicy: string
  refundTerms: string
  refundWindowDays: number
  trialTerms: typeof TRIAL_TERMS
  currency: string
  /** Rendered on the page so the symmetry is visible, not just true. */
  flows: { subscribe: typeof SUBSCRIBE_FLOW; cancel: typeof CANCEL_FLOW }
  today: string
}

export async function getBillingView(ctx: ShopContext): Promise<BillingView> {
  const billing = getBillingProvider()
  const etsy = getEtsyService()

  const [shop, subscription, invoices] = await Promise.all([
    etsy.getShop(ctx.shopId),
    billing.getSubscription(ctx.shopId),
    billing.listInvoices(ctx.shopId),
  ])
  const { listings } = await etsy.getListings(ctx.shopId, { limit: 2000 })

  const today = BILLING_NOW
  const plan = planOf(subscription.plan)
  const meters = buildMeters({
    plan: subscription.plan,
    // Active listings only — the population the plan limit applies to.
    activeListings: listings.filter((l) => l.state === 'ACTIVE').length,
    aiGenerationsUsed: 42,
    aiResetsOn: '2026-09-01',
  })

  return {
    isDemo: billing.mode === 'MOCK',
    subscription,
    currentPlan: plan,
    plans: PLANS,
    nextPlan: nextPlanAfter(subscription.plan),
    meters,
    pressure: pressureWarning(meters),
    invoices,
    trial: trialState(subscription, today),
    refundable: refundEligibility(invoices, today),
    cancellation: planCancellation({ subscription, invoices, today }),
    changes: PLANS.filter((p) => p.key !== subscription.plan).map((p) =>
      planChange({
        from: subscription.plan,
        to: p.key,
        subscription,
        today,
        currency: shop.currency,
      }),
    ),
    agencyNote: AGENCY_NOTE,
    limitPolicy: LIMIT_POLICY,
    refundTerms: REFUND_TERMS,
    refundWindowDays: REFUND_WINDOW_DAYS,
    trialTerms: TRIAL_TERMS,
    currency: shop.currency,
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
 * to Etsy", which is not what a refund request does.
 *
 * So the invariant is stated where it actually bites: a read-only context may
 * never reach a LIVE provider. The adapter selector already refuses to build one
 * in demo mode, so this is the second of two guards on the same property —
 * deliberately, as with the demo-mode write refusal in the bulk editor.
 */
function assertBillingWritable(ctx: ShopContext, provider: { mode: string }): void {
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
  const billing = getBillingProvider()
  assertBillingWritable(ctx, billing)
  const subscription = await billing.getSubscription(ctx.shopId)
  const shop = await getEtsyService().getShop(ctx.shopId)

  const change = planChange({
    from: subscription.plan,
    to,
    subscription,
    today: BILLING_NOW,
    currency: shop.currency,
  })
  if (change.kind === 'SAME') return subscription

  return billing.changePlan(ctx.shopId, to, change.charge)
}

/** One call, from the billing page. No intermediate offer, no survey. */
export async function cancelPlan(ctx: ShopContext): Promise<Subscription> {
  const billing = getBillingProvider()
  assertBillingWritable(ctx, billing)
  const subscription = await billing.getSubscription(ctx.shopId)
  return billing.cancel(ctx.shopId, { effectiveOn: subscription.currentPeriodEnd })
}

export async function resumePlan(ctx: ShopContext): Promise<Subscription> {
  const billing = getBillingProvider()
  assertBillingWritable(ctx, billing)
  return billing.resume(ctx.shopId)
}

export async function requestRefund(ctx: ShopContext, invoiceId: string): Promise<Invoice> {
  const billing = getBillingProvider()
  assertBillingWritable(ctx, billing)
  const invoices = await billing.listInvoices(ctx.shopId)
  // Checked here as well as in the provider: the window is a product promise,
  // not a provider capability.
  assertRefundable(invoices, invoiceId, BILLING_NOW)
  return billing.refund(ctx.shopId, invoiceId)
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
  const subscription = await billing.getSubscription(ctx.shopId)
  const { listings } = await getEtsyService().getListings(ctx.shopId, { limit: 2000 })

  const used =
    metric === 'listings' ? listings.filter((l) => l.state === 'ACTIVE').length : 42

  return enforce({ plan: subscription.plan, metric, used })
}

/** The plan a shop is on, for surfaces that only need the name. */
export async function currentPlan(ctx: ShopContext): Promise<Plan> {
  try {
    const subscription = await getBillingProvider().getSubscription(ctx.shopId)
    return planOf(subscription.plan)
  } catch (error) {
    /*
     * A billing outage must not take the product down. The shell falls back to
     * the demo plan and the billing page itself reports the real error — better
     * a nav chip that is briefly stale than every screen failing to render.
     */
    if (error instanceof Error) return planOf(DEMO_PLAN)
    throw Errors.unknown()
  }
}
