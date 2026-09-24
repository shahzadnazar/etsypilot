/*
 * Platform growth metrics, as data.
 *
 * Pure: no database, no `server-only`, no React.
 *
 * ── AGGREGATE ONLY, AND STRUCTURALLY SO ───────────────────────────────────
 *
 * No account is named on this screen, and the way that is guaranteed is that
 * nothing in this module HAS a name to render. There is no email field, no
 * account id, no shop name — every type below is a bucket and a count. A
 * metrics page that named people would be read as a leaderboard of sellers,
 * and the accounts list already exists for the question "who is this".
 *
 * ── TWO COLUMNS THIS SCREEN CANNOT TRUST, AND SAYS SO ─────────────────────
 *
 * `users.onboarding_state` defaults to NOT_STARTED and NOTHING IN THE PRODUCT
 * EVER WRITES IT — grepped, not assumed. So the funnel below is an accurate
 * report of a column that is not maintained, which is a different thing from
 * an accurate report of onboarding. It is rendered with that stated, rather
 * than omitted (the reader would not know the funnel exists) or quietly
 * presented as behaviour (the reader would believe it).
 *
 * Trial-to-paid conversion has a subtler version of the same problem: a
 * subscription row carries its CURRENT status, not its history, so an account
 * that trialled and converted is indistinguishable from one that never
 * trialled. The rate is therefore computed over the accounts we can still SEE
 * evidence of a trial for, and carries that coverage with it — rather than
 * being presented as a conversion rate it cannot be.
 */

import { calculated, unavailable } from '@/lib/provenance/builders'
import type { Provenanced } from '@/lib/provenance/types'
import { countedRows, fromUnmaintainedColumn } from './provenance'
import { PLANS, type PlanKey } from '@/domain/billing/plans'

/**
 * The onboarding states, in the order a person moves through them.
 *
 * NOT_STARTED is the column's default and the only value anything writes, so
 * it is first and the rest are the states the column was designed for.
 */
export const ONBOARDING_STATES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'] as const
export type OnboardingState = (typeof ONBOARDING_STATES)[number]

export const ONBOARDING_LABEL: Record<OnboardingState, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETE: 'Complete',
}

/**
 * Said on the screen, not left in a comment.
 *
 * Exported so the page renders it from the same module the funnel is computed
 * in, rather than as a sentence somebody remembered to write beside it.
 */
export const ONBOARDING_CAVEAT =
  'This is what the column says, and the column is not maintained: nothing in the product writes users.onboarding_state after provisioning sets it. The funnel is therefore an accurate report of a stored value and not a measurement of how far people actually get.'

/* ────────────────────────────── the inputs ──────────────────────────────── */

/** Everything the screen needs, already aggregated by the repository. */
export interface MetricsInput {
  totalAccounts: number
  /** Signups per calendar month, oldest first. A month with none is 0, not null. */
  signupsByMonth: { month: string; count: number }[]
  onboardingCounts: { state: string; count: number }[]
  /** Shops whose connection is real rather than the demo dataset. */
  connectedShops: number
  demoShops: number
  shopsWithNoConnection: number
  totalShops: number
  planCounts: { plan: string | null; count: number }[]
  /** Accounts we can still see evidence of a trial for. */
  everTrialed: number
  /** Of those, the ones now on a paying status. */
  trialedAndPaying: number
  /** Accounts with a paying status at all. */
  paying: number
}

/* ───────────────────────────── the outputs ──────────────────────────────── */

export interface Bucket {
  key: string
  label: string
  /*
   * Provenanced, so a bucket count cannot reach a screen without saying where
   * it came from. That matters more here than on any other operator screen:
   * the onboarding funnel reads a column NOTHING WRITES, and it used to render
   * with exactly the same weight as the shop breakdown, which counts real
   * rows. The caveat was a paragraph underneath; now it is on the figure.
   */
  count: Provenanced<number>
  /** Share of the relevant total, 0–100. Null when the total is zero. */
  percent: number | null
}

function share(count: number, total: number): number | null {
  /*
   * Null, not zero, when there is nothing to take a share OF. "0% of no
   * accounts" is a division by zero dressed up as a measurement, and a reader
   * cannot tell it from a real nought.
   */
  return total === 0 ? null : Math.round((count / total) * 1000) / 10
}

/**
 * The onboarding funnel, every state present.
 *
 * Every state including the ones at zero (D34), plus a bucket for anything
 * stored that the code does not recognise — counted rather than dropped, so
 * the buckets always add up to the account total.
 */
export function onboardingFunnel(input: MetricsInput): Bucket[] {
  const counted = new Map(input.onboardingCounts.map((entry) => [entry.state, entry.count]))
  /*
   * UNAVAILABLE, not CALCULATED, and the count travels alongside.
   *
   * Nothing in the product writes users.onboarding_state after provisioning
   * sets it. So the number is an accurate report of a stored value and NOT a
   * measurement of how far anyone gets — and CALCULATED would say "we worked
   * this out", which invites the reader to believe the result. There is no
   * result here to believe.
   *
   * The figure is still shown. Hiding it would leave a reader unable to tell
   * that the funnel exists; showing it unbadged was the state this pass found.
   */
  const fromColumn = (count: number): Provenanced<number> => ({
    value: count,
    provenance: {
      ...fromUnmaintainedColumn(
        'Read from users.onboarding_state, which nothing in the product writes after provisioning sets it.',
        'This is what the column says. It is not a measurement of how far anyone actually gets.',
      ).provenance,
      source: 'EtsyPilot database · users.onboarding_state',
    },
  })

  const known = ONBOARDING_STATES.map((state) => ({
    key: state,
    label: ONBOARDING_LABEL[state],
    count: fromColumn(counted.get(state) ?? 0),
    percent: share(counted.get(state) ?? 0, input.totalAccounts),
  }))

  const recognised = new Set<string>(ONBOARDING_STATES)
  const other = input.onboardingCounts
    .filter((entry) => !recognised.has(entry.state))
    .reduce((total, entry) => total + entry.count, 0)

  return [
    ...known,
    {
      key: 'UNKNOWN',
      label: 'Unrecognised state',
      count: fromColumn(other),
      percent: share(other, input.totalAccounts),
    },
  ]
}

/**
 * Shops by what is actually behind them.
 *
 * A DEMO shop is not a connected shop and is not an unconnected one either —
 * it is a shop with no Etsy behind it by design. Folding it into either would
 * misstate the number this screen exists to report: how many real shops are
 * connected.
 */
export function shopBreakdown(input: MetricsInput): Bucket[] {
  return [
    {
      key: 'CONNECTED',
      label: 'Connected to a real Etsy shop',
      count: countedRows(input.connectedShops, 'shops'),
      percent: share(input.connectedShops, input.totalShops),
    },
    {
      key: 'NOT_CONNECTED',
      label: 'No Etsy connection',
      count: countedRows(input.shopsWithNoConnection, 'shops'),
      percent: share(input.shopsWithNoConnection, input.totalShops),
    },
    {
      key: 'DEMO',
      label: 'Demo shop',
      count: countedRows(input.demoShops, 'shops'),
      percent: share(input.demoShops, input.totalShops),
    },
  ]
}

/** Plan distribution, every plan present, plus accounts with no billing row. */
export function planDistribution(input: MetricsInput): Bucket[] {
  const counted = new Map(input.planCounts.map((entry) => [entry.plan, entry.count]))
  const known = PLANS.map((plan) => ({
    key: plan.key as PlanKey,
    label: plan.name,
    count: countedRows(counted.get(plan.key) ?? 0, 'subscriptions'),
    percent: share(counted.get(plan.key) ?? 0, input.totalAccounts),
  }))

  const noRecord = counted.get(null) ?? 0
  return [
    ...known,
    {
      key: 'NO_RECORD',
      label: 'No billing record',
      count: countedRows(noRecord, 'users left outer join subscriptions'),
      percent: share(noRecord, input.totalAccounts),
    },
  ]
}

/**
 * Trial-to-paid conversion, with the provenance that produced it.
 *
 * ── IT IS NOT A CONVERSION RATE, AND SAYS SO ──────────────────────────────
 *
 * A subscription row carries its CURRENT status, not its history. An account
 * that trialled in March and pays now looks identical to one that signed up
 * paying, because the trial left no trace once the status moved on. So the
 * denominator is not "everyone who ever trialled" — it is "everyone we can
 * still see evidence of a trial for", which is a smaller and knowable set.
 *
 * The coverage is that set as a share of paying accounts, so a figure computed
 * over three of two hundred says so rather than looking like a business
 * metric. UNAVAILABLE, not zero, when there is no evidence at all.
 */
export function trialConversion(input: MetricsInput): Provenanced<number> {
  if (input.everTrialed === 0) {
    return unavailable(
      'No account has a trial we can still see, so there is nothing to compute a conversion from.',
      'A subscription row carries only its current status; a trial that ended leaves no record of having happened.',
    )
  }

  const rate = Math.round((input.trialedAndPaying / input.everTrialed) * 1000) / 10
  const coverage = input.paying === 0 ? 0 : Math.round((input.everTrialed / input.paying) * 100)

  return calculated(
    rate,
    'Of the accounts with a trial still visible on their subscription, the share now on a paying status.',
    {
      coverage: Math.min(100, coverage),
      limitations: [
        'Not a true conversion rate. A subscription row carries its current status, not its history, so an account that trialled and converted long ago is indistinguishable from one that never trialled — those are not in the denominator.',
      ],
    },
  )
}

/**
 * Signups as a monthly series for the chart.
 *
 * A month with no signups is ZERO, not null, and the distinction is the whole
 * reason this function exists rather than the repository's rows going straight
 * to the chart. The chart breaks its line at null, which means "not observed";
 * a month in a window we queried and that had no signups WAS observed, and it
 * measured nought. Breaking the line there would draw a gap where there is a
 * fact.
 */
export function signupSeries(
  input: MetricsInput,
  months: number,
  now: Date,
): { month: string; value: number }[] {
  const counted = new Map(input.signupsByMonth.map((entry) => [entry.month, entry.count]))
  const series: { month: string; value: number }[] = []

  for (let back = months - 1; back >= 0; back -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    const key = date.toISOString().slice(0, 7)
    series.push({ month: key, value: counted.get(key) ?? 0 })
  }
  return series
}
