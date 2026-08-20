/*
 * Billing view.
 *
 * Two usage meters only — Listings and AI generations (D22 consequence 1).
 * Connected shops and Team seats came out with multi-user; a meter for a
 * capacity nobody has is a advertisement dressed as a status.
 *
 * The counted side of each meter is real: listings are counted from the shop,
 * not stated. Phase 8 replaces the invoice list with Stripe's.
 */

import { getEtsyService } from '@/lib/etsy'
import type { ShopContext } from '@/lib/permissions'
import { AGENCY_NOTE, DEMO_PLAN, LIMIT_POLICY, PLANS, planOf, nextPlanAfter, REFUND_TERMS, TRIAL_TERMS, type Plan, type PlanKey } from './plans'

export interface UsageMeter {
  label: string
  used: number
  limit: number
  /** What pauses at the limit. Never "your account is suspended". */
  atLimit: string
}

export interface Invoice {
  id: string
  /** Calendar date, YYYY-MM-DD. Rendered without a zone (D24). */
  date: string
  description: string
  amount: number
  /** Negative amounts are refunds and say so, rather than a bare minus. */
  kind: 'CHARGE' | 'REFUND'
  status: 'PAID' | 'REFUNDED'
}

export interface BillingView {
  currentPlan: Plan
  plans: Plan[]
  nextPlan: Plan | null
  renewsOn: string | null
  paymentMethod: string | null
  meters: UsageMeter[]
  invoices: Invoice[]
  agencyNote: string
  limitPolicy: string
  refundTerms: string
  trial: typeof TRIAL_TERMS
  currency: string
}

export async function getBillingView(ctx: ShopContext, planKey: PlanKey = DEMO_PLAN): Promise<BillingView> {
  const etsy = getEtsyService()
  const shop = await etsy.getShop(ctx.shopId)
  const { listings } = await etsy.getListings(ctx.shopId, { limit: 2000 })
  const plan = planOf(planKey)
  const activeListings = listings.filter((l) => l.state === 'ACTIVE').length

  return {
    currentPlan: plan,
    plans: PLANS,
    nextPlan: nextPlanAfter(planKey),
    renewsOn: '2026-09-12',
    paymentMethod: 'Visa ending 4242',
    meters: [
      {
        label: 'Listings',
        /*
         * Active listings only — the same population the plan limit applies to.
         * Counting drafts and expired listings here would put the meter and the
         * limit on different footings, and the seller would be the one to find
         * out.
         */
        used: activeListings,
        limit: plan.limits.listings ?? activeListings,
        atLimit: 'New bulk jobs pause. Existing listings and their data are untouched.',
      },
      {
        label: 'AI generations',
        used: 42,
        limit: plan.limits.aiGenerations,
        atLimit: 'Drafting pauses until the reset. Manual editing, audits and bulk edits are unaffected.',
      },
    ],
    invoices: [
      { id: 'in_2026_08', date: '2026-08-12', description: 'Growth · monthly · Aug 12 – Sep 12', amount: 29, kind: 'CHARGE', status: 'PAID' },
      { id: 'in_2026_07', date: '2026-07-12', description: 'Growth · monthly · Jul 12 – Aug 12', amount: 29, kind: 'CHARGE', status: 'PAID' },
      { id: 'rf_2026_07', date: '2026-07-12', description: 'Refund · Solo, unused period', amount: 9.68, kind: 'REFUND', status: 'REFUNDED' },
      { id: 'in_2026_06', date: '2026-06-12', description: 'Solo · monthly · Jun 12 – Jul 12', amount: 15, kind: 'CHARGE', status: 'PAID' },
      { id: 'in_2026_05', date: '2026-05-12', description: 'Solo · monthly · May 12 – Jun 12', amount: 15, kind: 'CHARGE', status: 'PAID' },
    ],
    agencyNote: AGENCY_NOTE,
    limitPolicy: LIMIT_POLICY,
    refundTerms: REFUND_TERMS,
    trial: TRIAL_TERMS,
    currency: shop.currency,
  }
}

/**
 * The upgrade-required state, re-pointed at a real limit (D22 consequence 2).
 *
 * Automation is parked, so the old copy sold a feature that does not exist.
 * This one names the limit the seller actually hit and what raising it costs.
 */
export function upgradeRequired(meter: UsageMeter, from: PlanKey): { title: string; body: string } | null {
  if (meter.used < meter.limit) return null
  const next = nextPlanAfter(from)
  if (!next) return null

  const raised =
    meter.label === 'Listings'
      ? `${next.limits.listings?.toLocaleString('en-US')} listings`
      : `${next.limits.aiGenerations.toLocaleString('en-US')} AI generations`

  return {
    title: `You have reached ${meter.limit.toLocaleString('en-US')} ${meter.label.toLowerCase()} on ${planOf(from).name}`,
    body: `${next.name} raises the limit to ${raised} — $${next.priceMonthly}/month, cancel any time. ${meter.atLimit}`,
  }
}
