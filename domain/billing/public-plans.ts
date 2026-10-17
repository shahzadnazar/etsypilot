/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE THREE PUBLIC PLANS, AND THE PRICES NOBODY HAS APPROVED.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The public plan structure is exactly Free, Basic and Pro. This file is what
 * `/pricing` and `/pricing/compare` render, and it is deliberately a DISPLAY
 * layer sitting beside the billing system rather than inside it:
 *
 *     ./plans.ts              entitlements and limits. What a plan DOES.
 *                             Read by the usage meters, change history, the
 *                             audit log and Shop Pulse. Its keys — FREE, SOLO,
 *                             GROWTH — are what the subscriptions table holds.
 *     ./founding-pricing.ts   the four legacy founding tiers. Historical.
 *     THIS FILE               what a visitor is shown, and what may be sold.
 *
 * Three concerns, three files, and the separation is the point rather than
 * tidiness: a display name may be changed by anybody with an opinion, a price
 * may only be changed by whoever is accountable for the revenue, and a plan
 * KEY may not be changed at all without a migration and a rewrite of every
 * stored subscription row.
 *
 * ── WHY TWO OF THE THREE PRICES ARE PENDING ──────────────────────────────
 *
 * Because no price for Basic or Pro has been approved as a public price, and
 * this file is not allowed to invent one.
 *
 * There are two sets of numbers in this repository and NEITHER is an approved
 * public price for these plans:
 *
 *   ./plans.ts           Free $0, Basic $15, Pro $29. These are historical
 *                        repository values from D22. They have never been
 *                        shown on a public page — /pricing rendered the
 *                        founding tiers — and they were not set as the public
 *                        price of this new three-plan structure.
 *   ./founding-pricing.ts Starter $20, Growth $27, Pro $35, Studio $45. Four
 *                        legacy tiers whose names do not map onto three public
 *                        plans; the tier called Pro there is a different
 *                        product at a different price from the plan called Pro
 *                        here, and connecting them because the words match is
 *                        exactly the mistake this file exists to prevent.
 *
 * So Basic and Pro carry PENDING, with the reason attached, and the screens
 * render that state instead of a number. A pricing page that is honest about
 * not having a price yet costs a visitor one click; a pricing page with an
 * invented price on it costs whoever has to honour it.
 *
 * FREE IS THE EXCEPTION, and it is a verified one rather than a convenient
 * one: the Free plan exists in ./plans.ts, its entitlements are real and
 * enforced, `priceMonthly` is 0, it connects no shop and nothing in the
 * product charges for it. "$0" is therefore a description of what is, not a
 * price somebody has to approve. Free is $0 on any interval, because free does
 * not have an interval.
 *
 * ── AND WHY EVERY stripePriceId IS null ──────────────────────────────────
 *
 * Because there is not one anywhere in this repository, on any branch, for any
 * plan. Searched: no `price_…`, no `prod_…`, no price-id column, no mapping
 * table. `lib/billing/stripe.ts` implements exactly one method — webhook
 * signature verification, because that is a security boundary — and every
 * other method throws "Live billing is not wired yet". `paymentProviderConfigured()`
 * requires STRIPE_SECRET_KEY, which no deployment sets.
 *
 * The field is here, null, rather than absent, so the absence is DECLARED. An
 * absent field is a thing somebody forgot; a null field with this comment on
 * it is a thing somebody decided, and `checkoutState()` below cannot be made
 * to return AVAILABLE while it is null.
 */

import { PLANS, type Plan, type PlanKey } from './plans'

/*
 * The interval a visitor is choosing between on the public page.
 *
 * DELIBERATELY NOT `BillingPeriod` from ./founding-pricing.ts, which is
 * 'MONTHLY' | 'SIX_MONTH'. Six months at 15% off is the founding tiers' offer
 * and it is not this one; reusing that type would make an annual price and a
 * six-month price interchangeable at the type level, which is how a seller
 * ends up charged for one and promised the other.
 */
export type PublicBillingInterval = 'MONTHLY' | 'ANNUAL'

export const PUBLIC_BILLING_INTERVALS: readonly PublicBillingInterval[] = [
  'MONTHLY',
  'ANNUAL',
] as const

export const INTERVAL_LABEL: Record<PublicBillingInterval, string> = {
  MONTHLY: 'Monthly',
  ANNUAL: 'Annually',
}

/** Read an interval out of a URL. Anything unrecognised is Monthly. */
export function intervalFromParam(raw: string | undefined): PublicBillingInterval {
  return raw?.toLowerCase() === 'annual' ? 'ANNUAL' : 'MONTHLY'
}

/** The query value for an interval. Monthly is the default and carries none. */
export function intervalParam(interval: PublicBillingInterval): string | null {
  return interval === 'ANNUAL' ? 'annual' : null
}

/**
 * A path with the interval preserved, so a link does not lose the choice.
 *
 * ── THE FRAGMENT GOES LAST, AND THE FIRST VERSION PUT IT FIRST ───────────
 *
 * This was `${path}?billing=${param}`, which is correct for `/pricing` and
 * silently wrong for the landing page's toggle, whose path is `/#pricing`:
 * it produced `/#pricing?billing=annual`, where the query string is part of
 * the FRAGMENT and no server ever sees it. The toggle appeared to do nothing
 * on `/`, and the link pointed at an anchor that does not exist.
 *
 * Caught by tests/browser/landing-page.py, which resolves every fragment on
 * the page against the ids the page renders and found `#pricing?billing=annual`
 * had no target.
 */
export function withInterval(path: string, interval: PublicBillingInterval): string {
  const param = intervalParam(interval)
  if (!param) return path

  const hash = path.indexOf('#')
  if (hash === -1) return `${path}?billing=${param}`

  const base = path.slice(0, hash) || '/'
  return `${base}?billing=${param}${path.slice(hash)}`
}

/**
 * A price, or the stated absence of one.
 *
 * A discriminated union rather than `number | null`, because the screens owe a
 * visitor the REASON. "Pricing is being finalised" is information; a blank
 * space where a number should be is a bug report.
 */
export type PublicPrice =
  | { state: 'SET'; amount: number; currency: 'USD' }
  | { state: 'PENDING'; reason: string }

export interface PublicPlan {
  id: 'FREE' | 'BASIC' | 'PRO'
  name: string
  /** One line under the name. What this plan is FOR. */
  tagline: string
  /**
   * The entitlement plan this card describes.
   *
   * The display name and the database key are different things and only the
   * first one moved when the tiers were renamed. SOLO and GROWTH are what the
   * subscriptions table, every migration and every audit record hold.
   */
  planKey: PlanKey
  price: Record<PublicBillingInterval, PublicPrice>
  /**
   * The Stripe price this card would check out against. Null everywhere — see
   * the module note. Nothing may be sold against a null.
   */
  stripePriceId: Record<PublicBillingInterval, string | null>
  /** The call to action's words. */
  cta: string
  /**
   * The visually prominent card.
   *
   * NOT labelled "most popular". There are no customers, so popularity is not
   * a fact this product has — and it is the easiest claim on a pricing page to
   * make up and the hardest for a reader to check. The accent carries a
   * neutral word instead.
   */
  featured: boolean
  featuredLabel?: string
}

/* ── the two reasons a price is missing, written once each ──────────────── */

/*
 * Why Basic and Pro carry no monthly price.
 *
 * Both numbers that exist in this repository are historical: ./plans.ts has
 * carried $15 and $29 since D22 without either ever appearing on a public
 * page, and ./founding-pricing.ts holds four legacy tiers that do not map onto
 * three plans. Neither was set as the public price of this structure, so
 * neither is printed as one.
 */
const PENDING_PRICE =
  'The public price for this plan has not been set. The figures in the repository are ' +
  'historical values from the earlier tier structure, not approved prices for this one.'

/*
 * Why nothing has an annual price.
 *
 * There is no annual billing interval anywhere in this product. The only
 * non-monthly period that has ever existed here is SIX_MONTH, on the legacy
 * founding tiers, at 15% off — a different offer on a different cadence. An
 * annual price is therefore not "the monthly one times twelve, less a
 * discount": it is a commercial decision that has not been made, and
 * inventing the discount is the part that would be hardest to walk back.
 */
const PENDING_ANNUAL =
  'Annual billing is not set up yet. This product has never had an annual interval, and ' +
  'no annual price or discount has been approved.'

export const PUBLIC_PLANS: readonly PublicPlan[] = [
  {
    id: 'FREE',
    name: 'Free',
    tagline: 'For sellers exploring the platform.',
    planKey: 'FREE',
    price: {
      // Verified, not assumed: the Free plan exists, costs nothing, connects
      // no shop, and nothing in the product charges for it.
      MONTHLY: { state: 'SET', amount: 0, currency: 'USD' },
      ANNUAL: { state: 'SET', amount: 0, currency: 'USD' },
    },
    // No Stripe price is needed to charge nothing, and none exists.
    stripePriceId: { MONTHLY: null, ANNUAL: null },
    cta: 'Start for Free',
    featured: false,
  },
  {
    id: 'BASIC',
    name: 'Basic',
    tagline: 'For growing Etsy sellers.',
    planKey: 'SOLO',
    price: {
      MONTHLY: { state: 'PENDING', reason: PENDING_PRICE },
      ANNUAL: { state: 'PENDING', reason: PENDING_ANNUAL },
    },
    stripePriceId: { MONTHLY: null, ANNUAL: null },
    cta: 'Choose Basic',
    featured: false,
  },
  {
    id: 'PRO',
    name: 'Pro',
    tagline: 'For advanced Etsy sellers.',
    planKey: 'GROWTH',
    price: {
      MONTHLY: { state: 'PENDING', reason: PENDING_PRICE },
      ANNUAL: { state: 'PENDING', reason: PENDING_ANNUAL },
    },
    stripePriceId: { MONTHLY: null, ANNUAL: null },
    cta: 'Choose Pro',
    featured: true,
    // "Advanced", not "Most popular". See PublicPlan.featured.
    featuredLabel: 'Advanced',
  },
]

/**
 * Is this plan, at this interval, something a visitor can actually buy today?
 *
 * Four answers, and the distinctions matter to what the button does:
 *
 *   FREE_SIGNUP   Free. Costs nothing, so there is nothing to check out — the
 *                 button is a real link to the real signup route.
 *   NO_PRICE      The price has not been approved. The button is disabled and
 *                 the card says so.
 *   NO_MAPPING    There is a price but no Stripe price id behind it, so a
 *                 checkout would have nothing to charge against.
 *   NO_PROVIDER   No payment provider is configured on this deployment.
 *
 * They are checked in that order so the message a visitor reads is the FIRST
 * reason, not the last — "we have not set a price" is more useful than "our
 * payment provider is not configured", and both are true at once today.
 *
 * This function is the only thing allowed to say a plan is purchasable, and it
 * cannot say so while `stripePriceId` is null. A button that takes money must
 * pass through here.
 */
export type CheckoutState = 'FREE_SIGNUP' | 'NO_PRICE' | 'NO_MAPPING' | 'NO_PROVIDER'

export function checkoutState(
  plan: PublicPlan,
  interval: PublicBillingInterval,
  options: { providerConfigured: boolean },
): CheckoutState {
  const price = plan.price[interval]
  if (price.state === 'SET' && price.amount === 0) return 'FREE_SIGNUP'
  if (price.state === 'PENDING') return 'NO_PRICE'
  if (!plan.stripePriceId[interval]) return 'NO_MAPPING'
  if (!options.providerConfigured) return 'NO_PROVIDER'
  /*
   * There is no AVAILABLE branch, and that is not an oversight.
   *
   * Every path above returns a reason this plan cannot be bought, because
   * today every path is true. When a price, a Stripe mapping and a provider
   * all exist, this function gains an AVAILABLE case and a checkout route to
   * go with it — and whoever adds it has to come here and say so, rather than
   * wiring a button past a check that was never consulted.
   */
  return 'NO_PROVIDER'
}

/** What a disabled call to action tells the visitor. One sentence each. */
export const CHECKOUT_REASON: Record<Exclude<CheckoutState, 'FREE_SIGNUP'>, string> = {
  NO_PRICE: 'Pricing for this plan is being finalised.',
  NO_MAPPING: 'This plan is not connected to a payment product yet.',
  NO_PROVIDER: 'No payment provider is connected yet, so nothing can be charged.',
}

/** The entitlements behind a public plan, from the plan that defines them. */
export function entitlementsOf(plan: PublicPlan): Plan {
  const found = PLANS.find((p) => p.key === plan.planKey)
  /*
   * Throwing rather than returning undefined: a public card with no
   * entitlements behind it is a card describing nothing, and it should fail
   * the build's own test run rather than render empty.
   */
  if (!found) throw new Error(`No plan defines entitlements for ${plan.id}`)
  return found
}

/** A public plan by id, for a route that is given one. */
export function publicPlan(id: PublicPlan['id']): PublicPlan {
  const found = PUBLIC_PLANS.find((plan) => plan.id === id)
  if (!found) throw new Error(`Unknown public plan ${id}`)
  return found
}
