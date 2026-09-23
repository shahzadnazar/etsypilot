/*
 * The account detail screen, as data.
 *
 * Pure: no database, no `server-only`, no React. Which section a viewer sees,
 * and what the money figures claim about themselves, are both decidable from
 * here and both testable without a Postgres or a browser.
 *
 * ── SECTIONS ARE GATED ON THE VIEWER, NOT THE SUBJECT ─────────────────────
 *
 * Six sections, each behind the permission that owns that kind of data. An
 * operator holding users.detail and nothing else sees identity and shop. One
 * holding financials.view as well sees the money. The screen is composed from
 * the viewer's own permissions rather than assembled and then censored.
 *
 * OMITTED, NEVER LOCKED. A padlock tells someone what exists and that they
 * cannot have it, which is the reconnaissance the 404-instead-of-403 rule
 * exists to deny (D91). A section the viewer may not see is not rendered at
 * all, is not counted, and leaves no gap where it would have been.
 *
 * ── AND NOTHING HERE WRITES ───────────────────────────────────────────────
 *
 * This module is in the operator closure that tests/unit/operator-write-
 * boundary.test.ts walks (D94). It imports no database handle and no Etsy
 * service, and it could not acquire either: it takes rows that were already
 * read and turns them into things to render.
 */

import type { Permission } from './roles'
import { calculated, unavailable } from '@/lib/provenance/builders'
import type { Provenanced } from '@/lib/provenance/types'

/* -------------------------------------------------------- what was fetched */

/**
 * A value that was read, or a value that was NOT ASKED FOR.
 *
 * `{ read: false }` is not `null`, and keeping them apart in the TYPE is the
 * point. A viewer without `financials.view` causes no profit query to run, so
 * their result has no profit in it — and a plain `null` there would be
 * indistinguishable from a shop whose profit has never been computed. The
 * screen would then tell a manager "never computed" about a shop that
 * reconciles every night, which is D34's absent-versus-zero failure wearing a
 * different hat. The compiler refuses to let a caller read `.value` without
 * first deciding what `read: false` means.
 *
 * Declared HERE, in the pure module, and imported by the repository rather
 * than the other way round. `lib/repositories/admin-reads-every-shop.ts` is
 * `server-only`; a type-only import of it would still put that filename in
 * this module's import line, and the filename is a guard other tests read.
 */
export type Read<T> = { read: false } | { read: true; value: T }

/**
 * Which sections to actually query.
 *
 * DATA, NOT AUTHORISATION. The repository decides nothing about who may see
 * what — the page does that, from the viewer's own permissions, and passes the
 * answer down. What this buys is that a viewer who may not see a seller's
 * money causes no query against that seller's money: the data is not fetched
 * and then hidden, it is never fetched.
 */
export interface AccountDetailReads {
  connection: boolean
  plan: boolean
  usage: boolean
  financials: boolean
}

/* ---------------------------------------------------------------- sections */

export const ACCOUNT_SECTIONS = [
  {
    key: 'identity',
    title: 'Identity',
    permission: 'users.detail',
    blurb: 'Who this account is, and where their platform role comes from.',
  },
  {
    key: 'shop',
    title: 'Shop',
    permission: 'users.detail',
    blurb: 'The shop they own, and how they are attached to it.',
  },
  {
    key: 'connection',
    title: 'Etsy connection',
    permission: 'etsy.view',
    blurb: 'What Etsy has granted, and when it was last used.',
  },
  {
    key: 'plan',
    title: 'Plan',
    permission: 'subscriptions.view',
    blurb: 'What they are subscribed to, and what happens next.',
  },
  {
    key: 'usage',
    title: 'Usage',
    permission: 'usage.view',
    blurb: 'How much of the plan this period has used.',
  },
  {
    key: 'financials',
    title: 'Financials',
    permission: 'financials.view',
    blurb: 'Their own money, for the most recent computed period.',
  },
] as const satisfies readonly { key: string; title: string; permission: Permission; blurb: string }[]

export type AccountSectionKey = (typeof ACCOUNT_SECTIONS)[number]['key']

/**
 * The sections this viewer may see, in order.
 *
 * Takes a predicate rather than a permission list so the caller passes the
 * SAME `access.can` the rest of the panel gates on — a second copy of the
 * viewer's permissions is a second thing to keep in step.
 */
export function visibleSections(
  can: (permission: Permission) => boolean,
): readonly (typeof ACCOUNT_SECTIONS)[number][] {
  return ACCOUNT_SECTIONS.filter((section) => can(section.permission))
}

/**
 * What to actually query, derived from what the viewer may see.
 *
 * The screen is composed from the viewer's permissions rather than assembled
 * and then censored, and this is the half of that sentence the database hears.
 * A manager without `financials.view` does not cause a query against a
 * seller's profit record — not a query whose result is discarded, none at all.
 *
 * Derived from `visibleSections` rather than from `can` a second time, so the
 * thing rendered and the thing fetched cannot disagree. Identity and Shop have
 * no flag because the gate on the page already requires `users.detail`: a
 * viewer who cannot see them never gets past the front door.
 */
export function detailReads(
  sections: readonly { key: AccountSectionKey }[],
): AccountDetailReads {
  const visible = new Set(sections.map((section) => section.key))
  return {
    connection: visible.has('connection'),
    plan: visible.has('plan'),
    usage: visible.has('usage'),
    financials: visible.has('financials'),
  }
}

/* -------------------------------------------------------------- financials */

/**
 * What the financial figures say about themselves.
 *
 * Every number carries a Provenance, which is what makes "an estimate shown as
 * verified" a type error rather than a design slip. Nothing here is VERIFIED:
 * a sum over rows is a formula over inputs, so it is CALCULATED, and the rows
 * it sums are only as fresh as the last sync — which is stated rather than
 * implied.
 */
export interface FinancialSummary {
  periodStart: Date
  periodEnd: Date
  computedAt: Date
  /** 0–100. What share of the period's orders have a confirmed cost. */
  coveragePercent: number
  grossRevenue: Provenanced<string>
  fees: Provenanced<string>
  orderCount: Provenanced<number>
  /** Null-valued when coverage is 0: see below. */
  netProfit: Provenanced<string>
  /** Said in words on the screen, not left to the reader to infer. */
  coverageStatement: string
}

/**
 * What the screen shows when there is nothing to show.
 *
 * Three outcomes, and they are three because conflating any two of them tells
 * a lie. NOT_READ is "this viewer may not see it", NEVER_COMPUTED is "nobody
 * has reconciled this shop", and a SUMMARY whose netProfit is UNAVAILABLE is
 * "we have the revenue but no costs". A zero appears in none of them.
 */
export type FinancialsView =
  | { kind: 'NOT_READ' }
  | { kind: 'NEVER_COMPUTED' }
  | { kind: 'SUMMARY'; summary: FinancialSummary }

function sum(...values: string[]): string {
  return values.reduce((total, value) => total + Number(value || 0), 0).toFixed(2)
}

export function financialsFor(detail: {
  profit: Read<{
    periodStart: Date
    periodEnd: Date
    grossRevenue: string
    etsyFees: string
    paymentProcessing: string
    offsiteAds: string
    netProfit: string
    coveragePercent: number
    computedAt: Date
  } | null>
  orders: Read<{ count: number } | null>
  shop: { lastSyncedAt: Date | null } | null
}): FinancialsView {
  /*
   * NOT READ is not NEVER COMPUTED. A viewer without financials.view causes no
   * profit query at all, and reporting that as "never computed" would state a
   * fact about the seller's bookkeeping on the strength of a fact about the
   * viewer's permissions. The type makes it impossible to skip this branch.
   */
  if (!detail.profit.read) return { kind: 'NOT_READ' }
  /*
   * NEVER COMPUTED is not zero, and the distinction is the whole point of
   * this branch. A shop whose profit has never been reconciled and a shop
   * that genuinely earned nothing produce the same numerals and mean opposite
   * things. D34: a figure that is absent and a figure that is zero must not
   * look alike.
   */
  if (!detail.profit.value) return { kind: 'NEVER_COMPUTED' }

  const profit = detail.profit.value
  const freshness = detail.shop?.lastSyncedAt?.toISOString()
  const synced = freshness
    ? 'Summed from orders synced from Etsy.'
    : 'Summed from stored orders. This shop has never synced, so the rows may be incomplete.'

  const fees = sum(profit.etsyFees, profit.paymentProcessing, profit.offsiteAds)

  /*
   * COVERAGE DECIDES WHETHER "NET PROFIT" IS A HONEST NAME FOR THE FIGURE.
   *
   * The profit record's coveragePercent is the share of the period's orders
   * with a confirmed cost. At 0 there are no costs in the calculation at all,
   * so what remains is revenue minus Etsy's fees — which is not profit, and
   * labelling it profit would be the single most damaging number this product
   * could render. It is UNAVAILABLE, with the reason and the remedy, rather
   * than a figure with a caveat next to it that a reader may not join up.
   *
   * Between 1 and 99 the figure is real but partial, so it carries the
   * coverage and a limitation naming the percentage. Only at 100 is it a
   * complete answer.
   */
  const netProfit =
    profit.coveragePercent === 0
      ? unavailable(
          'No confirmed costs for this period, so net profit cannot be calculated.',
          'The seller adds costs in Settings → Costs. Until then only revenue and fees are known.',
        )
      : calculated(profit.netProfit, 'Revenue minus Etsy fees, processing, ads, shipping and costs.', {
          coverage: profit.coveragePercent,
          ...(profit.coveragePercent < 100
            ? {
                limitations: [
                  `Only ${profit.coveragePercent}% of this period's orders have a confirmed cost. The rest are excluded, so the real figure is lower.`,
                ],
              }
            : {}),
        })

  return {
    kind: 'SUMMARY',
    summary: {
      periodStart: profit.periodStart,
      periodEnd: profit.periodEnd,
      computedAt: profit.computedAt,
      coveragePercent: profit.coveragePercent,
      grossRevenue: calculated(profit.grossRevenue, synced, { coverage: 100 }),
      fees: calculated(fees, 'Etsy fees, payment processing and offsite ads, added together.', {
        coverage: 100,
      }),
      /*
       * A count over a KNOWN period, so zero is a real zero — there were no
       * orders — rather than an absence. That is why it is a plain number and
       * not another NEVER_COMPUTED branch.
       */
      orderCount: calculated(
        (detail.orders.read ? detail.orders.value?.count : null) ?? 0,
        'Orders placed in this period.',
        { coverage: 100 },
      ),
      netProfit: netProfit as Provenanced<string>,
      coverageStatement: coverageStatement(profit.coveragePercent),
    },
  }
}

/** Coverage in words. Stated, never implied. */
export function coverageStatement(coveragePercent: number): string {
  if (coveragePercent === 0) {
    return 'No confirmed costs for this period. Net profit is not calculated — only revenue and fees are known.'
  }
  if (coveragePercent >= 100) {
    return 'Every order in this period has a confirmed cost.'
  }
  return `${coveragePercent}% of this period's orders have a confirmed cost. Net profit excludes the rest, so the real figure is lower.`
}
