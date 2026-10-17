/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE FOUR FOUNDING TIERS, AND THE FACT THAT TWO OF THEM HAVE NO PLAN
 *   BEHIND THEM YET.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The owner set four tiers and their prices: Starter $20, Growth $27, Pro $35,
 * Studio $45. `./plans.ts` holds three, at different prices:
 *
 *     PLANS                       FOUNDING TIERS
 *     Free     $0                 —
 *     Solo     $15                Starter  $20
 *     Growth   $29                Growth   $27
 *     —                           Pro      $35
 *     —                           Studio   $45
 *
 * That is a real conflict and it is written down rather than resolved by
 * inventing limits. `./plans.ts` opens with "Every line here describes
 * something that is built. rules.md section 7 forbids selling a capability
 * that does not exist" — so making up a listing cap and an AI quota for Pro
 * and Studio to fill out a pricing table is exactly the thing that file exists
 * to prevent.
 *
 * ── WHAT THIS FILE DOES INSTEAD ───────────────────────────────────────────
 *
 * Starter and Growth read their contents from the real plans they map to, so
 * the pricing page and the billing screen cannot disagree about what a tier
 * includes. Pro and Studio carry their price — which IS decided — and say
 * plainly that their limits are not set yet. A waitlist page may say "the
 * price is this and the limits are still being set"; it may not print a number
 * nobody has chosen.
 *
 * Every button says "Join the waitlist" rather than "Subscribe", because there
 * is no payment provider wired up and a button that cannot take money must not
 * pretend it can.
 *
 * ── WHEN THIS IS RESOLVED ─────────────────────────────────────────────────
 *
 * By amending ./plans.ts: renaming Solo to Starter, repricing both, and adding
 * Pro and Studio with the capabilities that justify them. At that point this
 * file collapses to a price table and `limitsKnown` goes away. It is a
 * translation layer with an expiry date, not a second source of truth.
 */

import { PLANS, type Plan, type PlanKey } from './plans'

export type BillingPeriod = 'MONTHLY' | 'SIX_MONTH'

export interface FoundingTier {
  name: string
  /** Price per month, billed monthly. */
  monthly: number
  /** Total for six months, paid once. 15% off, rounded. */
  sixMonth: number
  /** The plan in ./plans.ts this tier maps to, where one exists. */
  planKey: PlanKey | null
  /**
   * False where no plan defines this tier's limits yet.
   *
   * The page renders the absence rather than filling it. A pricing table with
   * invented caps is a promise about capability, and this product's own rules
   * forbid selling one that does not exist.
   */
  limitsKnown: boolean
  positioning: string
  /** Most popular, as the owner set it. Exactly one tier may carry it. */
  popular?: true
}

export const FOUNDING_TIERS: readonly FoundingTier[] = [
  {
    name: 'Starter',
    monthly: 20,
    sixMonth: 102,
    planKey: 'SOLO',
    limitsKnown: true,
    positioning: 'One shop, the full decision loop',
  },
  {
    name: 'Growth',
    monthly: 27,
    sixMonth: 138,
    planKey: 'GROWTH',
    limitsKnown: true,
    positioning: 'A bigger catalogue and a longer memory',
  },
  {
    name: 'Pro',
    monthly: 35,
    sixMonth: 180,
    planKey: null,
    limitsKnown: false,
    positioning: 'For shops where this is the full-time job',
    popular: true,
  },
  {
    name: 'Studio',
    monthly: 45,
    sixMonth: 228,
    planKey: null,
    limitsKnown: false,
    positioning: 'The largest catalogues, and what comes after them',
  },
] as const

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE RENAME STOPS AT THIS FILE, AND THAT IS A DECISION FOR THE OWNER.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The plans in ./plans.ts were renamed to Free, Basic and Pro. The four
 * founding tiers here were NOT, and the reason is arithmetic rather than
 * caution: there are four paid tiers and three plan names, and the tier
 * already called `Pro` here is $35 while the plan now called Pro is $29.
 * Renaming Growth → Pro would put two different things called Pro on one
 * table at two different prices.
 *
 *     PLANS (./plans.ts)          FOUNDING TIERS (this file)
 *     Free     $0                 —
 *     Basic    $15                Starter  $20
 *     Pro      $29                Growth   $27
 *     —                           Pro      $35
 *     —                           Studio   $45
 *
 * Every way out of that invents something the owner has not decided: a price,
 * a set of limits for Pro and Studio, or the removal of a tier whose price
 * was set deliberately. So nothing here moved.
 *
 * ── WHAT THE PUBLIC PAGE THEREFORE SAYS ──────────────────────────────────
 *
 * /pricing still reads Starter, Growth, Pro, Studio. Two of those cards take
 * their feature list from the plan they map to, so Starter's list opens
 * "Everything in Free" and Growth's opens "Everything in Basic" — names that
 * are correct on /billing, where those tiers are cards, and dangle here,
 * where they are not.
 *
 * That is visible and it is the smallest wrong thing available. The card is
 * NOT labelled with its plan's name to patch it: a visitor reading "Growth"
 * above "Pro plan", one column away from a different card called "Pro", is
 * worse served than one reading a feature list that mentions a tier they
 * cannot see.
 *
 * Resolving it is a pricing decision. The shape of the fix is already written
 * at the top of this file: amend ./plans.ts to carry all four tiers with the
 * capabilities that justify them, and this translation layer collapses into a
 * price table.
 */

/** What a tier includes, from the plan it maps to. Empty where none does. */
export function includesFor(tier: FoundingTier): string[] {
  if (!tier.planKey) return []
  const plan: Plan | undefined = PLANS.find((p) => p.key === tier.planKey)
  return plan ? [...plan.includes] : []
}

/** The real limits behind a tier, or null where no plan defines them. */
export function limitsFor(tier: FoundingTier): Plan['limits'] | null {
  if (!tier.planKey) return null
  return PLANS.find((p) => p.key === tier.planKey)?.limits ?? null
}

/** Per-month equivalent on the six-month price, rounded to whole pounds. */
export function perMonth(tier: FoundingTier): number {
  return Math.round(tier.sixMonth / 6)
}

/** Approved by the owner. One line, and it is a commitment about billing. */
export const FOUNDING_NOTE = 'Founding price — locked for life for the first 50 shops.'
