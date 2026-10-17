/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE COMPARISON TABLE, BUILT FROM THE ENTITLEMENTS THE PRODUCT ENFORCES.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * A comparison table is the densest collection of claims on a marketing site:
 * sixty-odd cells, each one a promise about what somebody gets for money, and
 * each one read as checkable. It is also the easiest place in a product to
 * write fiction, because a grid wants to be full and an empty row looks like a
 * mistake.
 *
 * So no cell in this file is typed as a number. Every limit is READ from
 * ./plans.ts — the same `limits` object that:
 *
 *     limits.listings            caps the usage meter (./usage.ts) and the
 *                                shell's listing chip
 *     limits.rollbackDays        sizes the window in domain/change-history
 *     limits.auditRetentionDays  sizes it in domain/audit-log
 *     limits.pulseHistoryMonths  sizes Shop Pulse's look-back
 *
 * If a limit changes, the table changes with it. If a plan stops defining one,
 * the table says so rather than keeping the old figure.
 *
 * ── AND THREE KINDS OF CELL, NOT TWO ─────────────────────────────────────
 *
 *   INCLUDED / EXCLUDED  a capability this plan does or does not have.
 *   LIMIT                a number, read from the entitlement.
 *   NOT BUILT            the feature does not exist on ANY plan yet.
 *
 * The third is the one that matters. A comparison table with a tick in the Pro
 * column for something nobody can use is the single most expensive sentence a
 * SaaS pricing page can contain, and it is usually written by accident — by
 * somebody filling in a grid rather than reading the code. Where a row is NOT
 * BUILT, every column says so, in the same words, and the table cannot be made
 * to show a tick for it.
 *
 * ── WHY KEYWORD RESEARCH IS AN ENTIRE CATEGORY OF "NOT BUILT" ────────────
 *
 * Two independent reasons, either sufficient:
 *
 *   IT HAS NO SOURCE.  lib/signals/index.ts returns null outside demo mode —
 *                      every Research screen renders an unbuilt state on a
 *                      real shop. Etsy publishes no search volume through its
 *                      API or anywhere else.
 *   IT MAY NOT BE SOLD. Etsy's API Terms, Prohibited Behavior item 22, forbid
 *                      "charging sellers for Application features that Etsy
 *                      provides free of charge". Marketplace Insights shipped
 *                      in Shop Manager in September 2025 with search and
 *                      listing counts, related terms and trending searches.
 *                      So even once a source exists, keyword research is not
 *                      a thing this product may put behind a price.
 *
 * The category is still shown, because leaving it out would be answering a
 * question a visitor came with by pretending they did not ask it. It is shown
 * with the position written on it.
 */

import { PLANS, AGENCY_NOTE, type Plan, type PlanKey } from './plans'
import { PUBLIC_PLANS, type PublicPlan } from './public-plans'

export type Cell =
  | { kind: 'INCLUDED' }
  | { kind: 'EXCLUDED' }
  | { kind: 'LIMIT'; value: string }
  | { kind: 'NOT_BUILT' }

export interface ComparisonRow {
  label: string
  /** Shown under the label where the row needs a qualification. */
  note?: string
  /** One cell per public plan, in PUBLIC_PLANS order. */
  cells: Cell[]
}

export interface ComparisonCategory {
  name: string
  /** Shown under the category heading. Never marketing copy — a caveat. */
  note?: string
  rows: ComparisonRow[]
}

/** The entitlements behind the three public plans, in display order. */
function tiers(): Plan[] {
  return PUBLIC_PLANS.map((plan) => {
    const found = PLANS.find((p) => p.key === plan.planKey)
    if (!found) throw new Error(`No plan defines entitlements for ${plan.id}`)
    return found
  })
}

/** A row where every column is the same stated absence. */
function notBuilt(label: string, note?: string): ComparisonRow {
  return {
    label,
    ...(note ? { note } : {}),
    cells: PUBLIC_PLANS.map(() => ({ kind: 'NOT_BUILT' as const })),
  }
}

/** A row computed per plan from its entitlements. */
function row(
  label: string,
  cell: (plan: Plan) => Cell,
  note?: string,
): ComparisonRow {
  return { label, ...(note ? { note } : {}), cells: tiers().map(cell) }
}

/** A capability that arrives with a connected shop. */
const withShop = (plan: Plan): Cell =>
  plan.limits.listings > 0 ? { kind: 'INCLUDED' } : { kind: 'EXCLUDED' }

const number = (value: number) => value.toLocaleString('en-US')

export function comparisonCategories(): ComparisonCategory[] {
  return [
    {
      name: 'Etsy keyword research',
      note:
        'Not available on any plan, and not a paid feature when it arrives. Etsy publishes no ' +
        'search volume through its API, and Etsy’s API Terms forbid charging for features Etsy ' +
        'provides free — which Marketplace Insights now does.',
      rows: [
        notBuilt('Keyword research', 'The Research screens have no data source outside the demo.'),
        notBuilt('Keyword lookups'),
        notBuilt('Competition indicators'),
        notBuilt('Trend and seasonality analysis'),
      ],
    },

    {
      name: 'Profit intelligence',
      rows: [
        row(
          'Profit and fee calculators',
          /*
           * The same cell for all three, and written as a constant rather than
           * derived, because this is not an entitlement — the calculators are
           * open to everyone and the public page runs one without an account.
           * Deriving it from `includes` would have put a tick against Free for
           * the right reason and a tick against Basic and Pro for the wrong
           * one: their lists say "Everything in Free" rather than naming them.
           */
          () => ({ kind: 'INCLUDED' }),
          'Open to everyone, account or not. One of them runs on the pricing page itself.',
        ),
        row('Full fee and cost breakdown', () => ({ kind: 'INCLUDED' })),
        row(
          'Profit Reality over your own receipts',
          withShop,
          'Needs a connected shop, because it is arithmetic over your orders rather than a worked example.',
        ),
        row('Pricing scenarios', withShop),
        row('Cost setup for your products', withShop),
      ],
    },

    {
      name: 'Listing intelligence',
      rows: [
        row(
          'Listing audit',
          withShop,
          '14 mechanical rules against your own listing fields. No rule models Etsy’s ranking.',
        ),
        row('Evidence and a fix on every finding', withShop),
        row(
          'Listings audited',
          (plan) =>
            plan.limits.listings === 0
              ? { kind: 'EXCLUDED' }
              : { kind: 'LIMIT', value: `Up to ${number(plan.limits.listings)}` },
          'The same cap as the listings the plan manages — the audit runs over all of them.',
        ),
      ],
    },

    {
      name: 'Shop performance',
      rows: [
        row(
          'Shop Pulse monitoring',
          withShop,
          'Measures your orders against your own 90-day baseline. Three verdicts: correlated, ruled out, unknown.',
        ),
        row(
          'Performance history',
          (plan) =>
            plan.limits.pulseHistoryMonths === null
              ? { kind: 'EXCLUDED' }
              : { kind: 'LIMIT', value: `${plan.limits.pulseHistoryMonths} months` },
        ),
        row('Weekly digest', withShop),
      ],
    },

    {
      name: 'Bulk listing management',
      rows: [
        row(
          'Bulk edits with a confirmed diff',
          withShop,
          'Select, validate, then the exact before-and-after. Nothing reaches Etsy until you confirm it.',
        ),
        row('Validation before anything is sent', withShop),
        row(
          'Rollback window',
          (plan) =>
            plan.limits.rollbackDays === null
              ? { kind: 'EXCLUDED' }
              : { kind: 'LIMIT', value: `${plan.limits.rollbackDays} days` },
          'How far back an applied job can be reversed. Older history stays readable, just not reversible.',
        ),
        row(
          'Listings managed',
          (plan) =>
            plan.limits.listings === 0
              ? { kind: 'EXCLUDED' }
              : { kind: 'LIMIT', value: number(plan.limits.listings) },
        ),
      ],
    },

    {
      name: 'Account and support',
      rows: [
        row(
          'Connected Etsy shops',
          (plan) => ({ kind: 'LIMIT', value: plan.limits.listings === 0 ? 'None' : 'One' }),
          AGENCY_NOTE,
        ),
        row(
          'Audit history kept',
          (plan) =>
            plan.limits.auditRetentionDays === null
              ? { kind: 'EXCLUDED' }
              : { kind: 'LIMIT', value: `${plan.limits.auditRetentionDays} days` },
          'The period the plan commits to. Nothing prunes the log today, so this is a commitment rather than a description.',
        ),
        row(
          'CSV export of your own data',
          () => ({ kind: 'INCLUDED' }),
          'On every plan, including Free. Portability is a right under GDPR Article 20 and free under Article 12(5), so it is not a tier feature.',
        ),
        row(
          'Priority sync and support',
          (plan) =>
            plan.includes.some((line) => /priority/i.test(line))
              ? { kind: 'INCLUDED' }
              : { kind: 'EXCLUDED' },
        ),
        row('Two-factor authentication', () => ({ kind: 'INCLUDED' })),
      ],
    },
  ]
}

/**
 * The four to six lines a pricing CARD shows.
 *
 * Read from the plan's own `includes`, which is the list ./plans.ts opens by
 * promising describes only things that are built. Capped at six because a card
 * that scrolls is a card nobody finishes, and the comparison page is where the
 * full answer lives.
 */
export function cardHighlights(plan: PublicPlan): string[] {
  const entitlements = PLANS.find((p) => p.key === plan.planKey)
  if (!entitlements) throw new Error(`No plan defines entitlements for ${plan.id}`)
  return entitlements.includes.slice(0, 6)
}

/** What a plan does NOT have, where the absence is a real difference. */
export function cardExclusions(plan: PublicPlan): string[] {
  const entitlements = PLANS.find((p) => p.key === plan.planKey)
  return entitlements ? [...entitlements.excludes] : []
}

/** Every plan key a public card maps to. Used by the guards. */
export function mappedPlanKeys(): PlanKey[] {
  return PUBLIC_PLANS.map((plan) => plan.planKey)
}
