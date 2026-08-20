/*
 * Plans (D22, as approved).
 *
 * Three tiers. Agency is held until the features behind it exist, and returns
 * as a new tier at a price set then — not as the old card revived.
 *
 * Every line here describes something that is built. rules.md section 7 forbids
 * selling a capability that does not exist, and the quiet line under the table
 * is the honest form of "we know you want more": it makes a commitment about
 * billing, not about a date.
 *
 * Phase 8 adds Stripe. Nothing in this file changes when it does — a plan is a
 * description of what the product does, not of how it is charged.
 */

export type PlanKey = 'FREE' | 'SOLO' | 'GROWTH'

export interface Plan {
  key: PlanKey
  name: string
  priceMonthly: number
  positioning: string
  includes: string[]
  /** Real limits, used by the usage meters. Null means not applicable. */
  limits: {
    listings: number | null
    aiGenerations: number
    rollbackDays: number | null
    pulseHistoryMonths: number | null
  }
  /** Shown only where the absence is a real difference between tiers. */
  excludes: string[]
}

export const PLANS: Plan[] = [
  {
    key: 'FREE',
    name: 'Free',
    priceMonthly: 0,
    positioning: 'Research and calculators, no shop connection',
    includes: [
      'Keyword, niche and product research',
      'All six calculators',
      'Methodology and data sources',
      '5 AI generations / month',
    ],
    limits: { listings: null, aiGenerations: 5, rollbackDays: null, pulseHistoryMonths: null },
    excludes: ['No shop connection, profit or bulk editing'],
  },
  {
    key: 'SOLO',
    name: 'Solo',
    priceMonthly: 15,
    positioning: 'One shop, up to 200 listings',
    includes: [
      'Everything in Free',
      'Connect one Etsy shop, up to 200 listings',
      'Profit Reality with scenarios, and cost setup',
      'Bulk edits with validation, diff and 30-day rollback',
      'Shop Pulse with 90-day baseline and weekly digest',
      '60 AI generations / month',
    ],
    limits: { listings: 200, aiGenerations: 60, rollbackDays: 30, pulseHistoryMonths: 3 },
    // D22 consequence 3: do not advertise the absence of something no tier has.
    excludes: ['One shop'],
  },
  {
    key: 'GROWTH',
    name: 'Growth',
    priceMonthly: 29,
    positioning: 'One shop, up to 2,000 listings',
    includes: [
      'Everything in Solo',
      'Up to 2,000 listings',
      '500 AI generations / month',
      '90-day rollback window',
      '12-month Shop Pulse history',
      'Full data export (CSV and JSON)',
      'Priority sync and support',
    ],
    limits: { listings: 2000, aiGenerations: 500, rollbackDays: 90, pulseHistoryMonths: 12 },
    excludes: [],
  },
]

/** Approved verbatim (D22). Do not edit this sentence. */
export const AGENCY_NOTE =
  'Managing several shops or a team? Multi-shop, roles and client approvals are in development. Tell us what you need — we will not bill you for something that does not exist yet.'

/** D17: 14 days of Growth, no card, nothing charges automatically. */
export const TRIAL_TERMS = {
  days: 14,
  plan: 'Growth',
  cardRequired: false,
  endNote:
    'No card on file. Nothing is charged when the trial ends — your account moves to Free and your data stays. Add a card only when you decide to continue.',
} as const

export const REFUND_TERMS =
  'Refunds within 14 days of a charge. Cancel any time; access continues to the end of the paid period.'

/** What happens at a limit. Nothing is deleted, and the seller chooses. */
export const LIMIT_POLICY =
  'Downgrading keeps your data. If a plan limit is exceeded, EtsyPilot pauses new bulk jobs instead of deleting anything — you choose what to remove.'

/**
 * The demo shop's plan.
 *
 * One constant, read by the billing screen AND the app shell's usage chip. Two
 * screens naming different plans for the same shop is the kind of small
 * contradiction that costs more trust than the feature earns.
 */
export const DEMO_PLAN: PlanKey = 'GROWTH'

export function planOf(key: PlanKey): Plan {
  const plan = PLANS.find((p) => p.key === key)
  if (!plan) throw new Error(`Unknown plan ${key}`)
  return plan
}

export function nextPlanAfter(key: PlanKey): Plan | null {
  const i = PLANS.findIndex((p) => p.key === key)
  return PLANS[i + 1] ?? null
}
