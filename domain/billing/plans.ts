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
    /** Listings the plan may manage. 0 means the plan connects no shop. */
    listings: number
    aiGenerations: number
    rollbackDays: number | null
    pulseHistoryMonths: number | null
    /*
     * How long the audit log keeps this shop's records. Null on Free, which
     * connects no shop and therefore has no shop records to keep.
     *
     * It lives here rather than in the audit-log domain because the retention
     * block on that page is a statement about the seller's plan, and a second
     * copy of "90 days on Solo" written next to the table is a copy that gets
     * left behind the day the plan changes.
     */
    auditRetentionDays: number | null
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
    /*
     * Zero listings, not null. Free connects no shop, so it manages no
     * listings — and `null` was being read elsewhere as "unlimited", which
     * turned an upgrade from Free into a warning that bulk jobs would pause.
     * An ambiguous null in a limits table is a bug waiting for a reader.
     */
    limits: { listings: 0, aiGenerations: 5, rollbackDays: null, pulseHistoryMonths: null, auditRetentionDays: null },
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
    limits: { listings: 200, aiGenerations: 60, rollbackDays: 30, pulseHistoryMonths: 3, auditRetentionDays: 90 },
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
    limits: { listings: 2000, aiGenerations: 500, rollbackDays: 90, pulseHistoryMonths: 12, auditRetentionDays: 365 },
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

/** D17. The window is a number so it can be computed against, never restated. */
export const REFUND_WINDOW_DAYS = 14

export const REFUND_TERMS =
  `Refunds within ${REFUND_WINDOW_DAYS} days of a charge, from this page. Cancel any time; access continues to the end of the paid period.`

/** What happens at a limit. Nothing is deleted, and the seller chooses. */
export const LIMIT_POLICY =
  'Downgrading keeps your data. If a plan limit is exceeded, EtsyPilot pauses new bulk jobs instead of deleting anything — you choose what to remove.'

/**
 * The demo shop's plan.
 *
 * One constant, read by the billing screen AND the app shell's usage chip. Two
 * screens naming different plans for the same shop is the kind of small
 * contradiction that costs more trust than the feature earns.
 *
 * Solo rather than the top tier, deliberately: on Growth there is no upgrade
 * card, so the prorated-charge disclosure — the part of this screen most worth
 * reviewing — would never appear. On Solo the demo shows both directions, and
 * its 412 listings sit over the 200 cap, which exercises the over-limit state
 * too.
 */
export const DEMO_PLAN: PlanKey = 'SOLO'

export function planOf(key: PlanKey): Plan {
  const plan = PLANS.find((p) => p.key === key)
  if (!plan) throw new Error(`Unknown plan ${key}`)
  return plan
}

export function nextPlanAfter(key: PlanKey): Plan | null {
  const i = PLANS.findIndex((p) => p.key === key)
  return PLANS[i + 1] ?? null
}
