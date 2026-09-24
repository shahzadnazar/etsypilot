/*
 * Where an operator figure came from.
 *
 * Pure: no database, no `server-only`, no React. The four modules that report
 * counts — usage, subscriptions, operations, etsy-health — state their
 * provenance through these, so the same claim is not written out five times
 * and cannot drift into five slightly different claims.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   THE OPERATOR SCREENS ARE WHERE "WHY IS THIS SELLER'S FIGURE WRONG" IS
 *   ANSWERED, AND THEY WERE THE ONES NOT SAYING WHERE A FIGURE CAME FROM.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A seller sees a provenance chip on every figure. An operator saw a bare
 * number on 7 of 13 screens. That is worse than an inconsistency: the person
 * being asked to explain a discrepancy was the one person in the product
 * working from numbers that did not say whether they were measured or
 * inferred.
 *
 * ── THE CLASS THAT IS TRUE, NOT THE FLATTERING ONE ────────────────────────
 *
 * Every choice below is argued rather than assumed, because VERIFIED is
 * always the more comfortable answer and is usually the wrong one.
 */

import { calculated, unavailable, verified } from '@/lib/provenance/builders'
import type { Provenanced } from '@/lib/provenance/types'

/**
 * A count of rows in one of OUR OWN tables. VERIFIED.
 *
 * Verified means "received from a system of record", and for these figures we
 * ARE the system of record — the row either exists or it does not, and nothing
 * was modelled, sampled or inferred to produce the number. That is a stronger
 * claim than the seller screens can usually make, and here it is true.
 *
 * The source is named so the claim can be checked. "Verified" with no table
 * behind it is a badge, not a provenance.
 */
export function countedRows(count: number, table: string): Provenanced<number> {
  return {
    value: count,
    provenance: {
      type: 'VERIFIED',
      source: `EtsyPilot database · ${table}`,
      methodology: `A count of rows in ${table}. Nothing is modelled or inferred; the row is there or it is not.`,
    },
  }
}

/**
 * A count of rows matching a threshold WE chose. CALCULATED, not verified.
 *
 * "Stalled", "near a limit", "expiring soon" are not states a row carries.
 * They are a comparison between a stored value and a number written in this
 * codebase, and the number could have been different. Reporting them as
 * VERIFIED would put our own editorial judgement behind Etsy's badge.
 *
 * The threshold goes IN THE METHODOLOGY, so an operator reading the
 * explanation is told which number they are being measured against rather
 * than having to find it in the source.
 */
export function countedAgainstThreshold(
  count: number,
  what: string,
  threshold: string,
): Provenanced<number> {
  return calculated(count, `${what} The threshold is ${threshold}, which is a number this product chose rather than one any row carries.`, {
    limitations: [
      'A different threshold would give a different count. This is our judgement about what is worth attention, not a state the data reports.',
    ],
  })
}

/**
 * A usage count. CALCULATED, and the reason is specific and load-bearing.
 *
 * `usage_records.used` is never written by anything — grepped, not assumed.
 * So the usage screen does not read a counter: it counts the underlying rows
 * (active listings, ai_generations in the month) and compares them with the
 * plan's limit. That is a calculation over two sources, and it can disagree
 * with the seller's own meter if either drifts.
 *
 * Calling it VERIFIED would be the single most misleading badge in the
 * console, because usage is exactly the figure an operator is asked to check
 * when a seller says a limit is wrong.
 */
export function countedUsage(count: number, what: string): Provenanced<number> {
  return calculated(
    count,
    `${what} Counted from the underlying rows and compared with the plan's limit — usage_records.used is never written by anything in the product, so there is no stored counter to read.`,
    {
      limitations: [
        'Counted at render time, not stored. A figure the seller saw a moment ago can differ if a listing or a generation landed in between.',
      ],
    },
  )
}

/**
 * Anything derived from `users.onboarding_state`. UNAVAILABLE.
 *
 * The column defaults to NOT_STARTED and NOTHING IN THE PRODUCT EVER WRITES
 * IT. A funnel over it is an accurate report of a stored value and not a
 * measurement of how far anyone gets.
 *
 * UNAVAILABLE rather than CALCULATED, and the distinction is the whole point:
 * calculated would say "we worked this out", which invites the reader to
 * believe the result. There is no figure here to believe. The count is
 * carried alongside so the screen can still show what the column says, while
 * the badge says the column is not maintained.
 */
export function fromUnmaintainedColumn(reason: string, remedy: string): Provenanced<never> {
  return unavailable(reason, remedy)
}

/**
 * A plan or a price read from our own billing tables. VERIFIED.
 *
 * Not from Stripe, and the source says so. EtsyPilot's `subscriptions` table
 * is what the product enforces limits against, so it is the right thing to
 * report — but an operator debugging a billing dispute needs to know they are
 * looking at our copy rather than the processor's.
 */
export function fromBilling(value: number | string | null): Provenanced<number | string> {
  return verified(value, 'EtsyPilot database · subscriptions')
}
