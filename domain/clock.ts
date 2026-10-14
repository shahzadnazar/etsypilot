import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHAT TIME IT IS. ONE ANSWER, AND IN DEMO MODE IT IS THE FIXTURE'S.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * `DEMO_NOW` is 2026-08-12T14:06:00Z — the instant the Willow & Fern dataset
 * is composed around, so that "renews in 3 days" and "last synced 7 minutes
 * ago" line up with the artboards. Nine files imported it directly and used it
 * as the current time on every shop, in every mode.
 *
 * ── WHAT THAT DID TO A REAL SELLER, MEASURED ──────────────────────────────
 *
 * On 7 October 2026, on a live account with two listings:
 *
 *     Linen napkin set   renews Aug 15, 2026   → labelled "Expiring",
 *                                                counted in "1 expiring
 *                                                within 7 days"
 *     Waffle hand towel  renews Oct 10, 2026   → labelled "Active", counted
 *                                                in nothing
 *
 * The first expired fifty-three days ago and the product was still urging
 * action on it. The second genuinely expires in three days and the product
 * said nothing. Exactly inverted — one false alarm and one missed one — and
 * both from the same frozen clock. A listings screen that cannot tell which
 * listings are about to lapse is worse than no listings screen, because the
 * seller stops checking Etsy for it.
 *
 * ── WHY A FUNCTION AND NOT A CONSTANT ─────────────────────────────────────
 *
 * So there is one place to ask, and so the demo answer is reached through a
 * mode check rather than through an import. The guard in
 * tests/unit/fixture-containment.test.ts allows `DEMO_NOW` here and nowhere
 * else outside the dataset itself.
 */

import { isDemoMode } from '@/lib/etsy'
import { DEMO_NOW } from '@/lib/etsy/demo-dataset'

/**
 * The current instant, as an ISO string.
 *
 * In demo mode this is the fixture's clock, so the demo shop's renewal dates,
 * session times and rollback windows read exactly as they were designed to. On
 * every other deployment it is the real one.
 */
export function nowIso(): string {
  return isDemoMode() ? DEMO_NOW : new Date().toISOString()
}

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHAT PERIOD THE PRODUCT REPORTS ON. ONE ANSWER, DERIVED, NOT WRITTEN.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * `PERIOD_START` and `PERIOD_END` sat in lib/etsy/demo-dataset.ts under the
 * comment "The period every screen reports on", and twelve domain services
 * imported them with no mode check at all: profit, costs, analytics, the sales
 * map, experiments, Shop Pulse, its chart events, the Action Center, the audit,
 * the dashboard overview, the seasonal calendar and the extension. That is
 * every screen in the product that shows a seller money.
 *
 * ── WHAT THAT DID TO A REAL SELLER, MEASURED ──────────────────────────────
 *
 * On 12 October 2026, on a live shop with 87 synced orders running from 2 June
 * to 11 October — the most recent one yesterday — all six money screens
 * reported on 14 July to 12 August and counted 15 orders worth $830.00.
 * Fifty-one orders worth $3,843.80, every one of them more recent than the
 * window, were invisible to the product. The dashboard said "Gross sales
 * $830.00 ▲ 26.5% vs $656.00 the period before"; both figures were from the
 * summer, and the comparison was between two windows that had both closed two
 * months earlier.
 *
 * This is the same defect `nowIso()` above was written for, in the two
 * constants sitting beside `DEMO_NOW` in the same file. The fix was never
 * carried across, and tests/unit/fixture-containment.test.ts named these five
 * symbols and excused them.
 *
 * ── THE WINDOW THE FIXTURE ALREADY CHOSE ──────────────────────────────────
 *
 * The live window is a product decision, and the fixture had already made it.
 * `DEMO_NOW` is 2026-08-12T14:06Z; the fixture's period is
 * 2026-07-14T00:00:00.000Z to 2026-08-12T23:59:59.999Z. That is exactly "the
 * thirty UTC days ending with the day it is now", and its baseline —
 * 2026-04-15 to 2026-07-13 — is exactly "the ninety UTC days before that".
 * The artboards were composed around a rolling thirty-day window; nobody had
 * written the rolling part down.
 *
 * So these functions are that formula applied to `nowIso()`, and in demo mode
 * they REPRODUCE the five constants rather than reading them. That is checked:
 * tests/unit/reporting-window.test.ts asserts the derived demo window equals
 * `PERIOD_START`/`PERIOD_END`/`BASELINE_START`/`BASELINE_END`/`PERIOD_DAYS`
 * exactly, which makes the dataset the SPECIFICATION of the formula instead of
 * the source of the figures. Deriving it also means the demo has no second code
 * path to drift down: one arithmetic, one set of values, byte-identical output.
 *
 * ── THE DAY BOUNDARIES, AND THE ONE COST ──────────────────────────────────
 *
 * Midnight to midnight UTC (D24), because the daily charts bucket by UTC day
 * and `previousWindow()` has to be the same length as the window it precedes.
 * A window ending at the current instant would put a part-day bucket on the
 * end of every chart and compare 29.6 days against 30.
 *
 * The cost is that the final day of the window is itself incomplete until
 * midnight, so a total is up to one day short of a full thirty and a delta
 * against the previous thirty is understated by that much. That is the trade
 * the fixture has always made — DEMO_NOW is 14:06 on the period's last day —
 * and the alternative, ending at the close of YESTERDAY, hides this morning's
 * orders from a seller who just made them. A short last day is visible on the
 * chart; a missing one is not.
 */

import {
  BASELINE_END,
  BASELINE_START,
  PERIOD_DAYS,
  PERIOD_END,
  PERIOD_START,
} from '@/lib/etsy/demo-dataset'

/** Whole days in the reporting window. The fixture's PERIOD_DAYS, live too. */
export const REPORTING_DAYS = PERIOD_DAYS

/**
 * Whole days in the comparison baseline.
 *
 * Ninety, because Shop Pulse's copy says "measured against this shop's own
 * 90-day baseline" and the figure a screen states about itself is the one that
 * has to be true.
 */
export const BASELINE_DAYS = 90

const DAY_MS = 86_400_000

export interface ReportingWindow {
  /** Inclusive, midnight UTC. */
  start: string
  /** Inclusive, 23:59:59.999 UTC. */
  end: string
  /** Whole days covered, start and end included. */
  days: number
}

/** Midnight UTC at the start of the day `instant` falls in. */
function startOfDay(instant: string): number {
  const d = new Date(instant)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function windowEndingOn(lastDayStart: number, days: number): ReportingWindow {
  return {
    start: new Date(lastDayStart - (days - 1) * DAY_MS).toISOString(),
    end: new Date(lastDayStart + DAY_MS - 1).toISOString(),
    days,
  }
}

/**
 * The period every screen reports on: the last thirty UTC days, ending today.
 *
 * In demo mode `nowIso()` is the fixture's clock, so this is the fixture's
 * period — the same two instants the dataset declares, arrived at by the same
 * rule a live shop gets.
 */
export function reportingWindow(): ReportingWindow {
  return windowEndingOn(startOfDay(nowIso()), REPORTING_DAYS)
}

/**
 * The ninety days before the reporting window. Shop Pulse baselines on this.
 *
 * Ninety days of real orders rather than a stored average, so the baseline is a
 * measurement and not an assertion — the dataset's own reason for having one.
 */
export function baselineWindow(): ReportingWindow {
  const period = reportingWindow()
  return windowEndingOn(startOfDay(period.start) - DAY_MS, BASELINE_DAYS)
}

/**
 * The thirty days immediately before the reporting window.
 *
 * What "vs the period before" and "vs the previous 30 days" mean, on the
 * dashboard and on analytics, which must not be able to disagree about it.
 */
export function previousWindow(): ReportingWindow {
  const period = reportingWindow()
  return windowEndingOn(startOfDay(period.start) - DAY_MS, REPORTING_DAYS)
}

/*
 * ── allowanceResetsOn() IS GONE WITH THE METER THAT NEEDED IT ────────────
 *
 * It computed the first of next month, UTC, because two seller-facing
 * surfaces printed that date and each had it written out as a literal
 * '2026-09-01' — so on 12 October both told a seller their allowance had
 * reset six weeks earlier.
 *
 * Both callers were the AI side: the AI Copilot's header and the AI
 * generations meter on /billing. D95 removed the Copilot and the monthly
 * generation allowance with it, and the one meter left — active listings
 * against the plan's cap — is not monthly and resets on no date.
 *
 * domain/admin/usage.ts had its own copy over an injected `now` — kept
 * separate so that importing an operator module into a seller service would
 * not drag the cross-shop repository into every seller screen — and that one
 * is gone too, for the same reason and in the same change. There is no
 * monthly allowance anywhere in the product now.
 *
 * The arithmetic is three lines and `with-ai-and-extension` has both copies
 * in its history. lib/errors/types.ts still tells a seller who hits a
 * monthly limit that "your allowance resets at the start of next month", so
 * the words survive the mechanism. An exported function nobody calls makes a
 * reader look for the feature that called it.
 */

/*
 * A sanity check at module load, not a test.
 *
 * The demo window is DERIVED now, so an arithmetic slip would move every
 * artboard figure at once and a unit suite that happens not to assert a date
 * would not notice. These four comparisons are the fixture's own declaration
 * of what the formula must produce, and in demo mode they are checked before
 * any screen renders. tests/unit/reporting-window.test.ts asserts the same
 * thing where a human can read it.
 */
if (isDemoMode()) {
  const period = reportingWindow()
  const baseline = baselineWindow()
  if (period.start !== PERIOD_START || period.end !== PERIOD_END) {
    throw new Error(
      `The derived demo period is ${period.start}..${period.end}, and lib/etsy/demo-dataset.ts declares ${PERIOD_START}..${PERIOD_END}.`,
    )
  }
  if (baseline.start !== BASELINE_START || baseline.end !== BASELINE_END) {
    throw new Error(
      `The derived demo baseline is ${baseline.start}..${baseline.end}, and the dataset declares ${BASELINE_START}..${BASELINE_END}.`,
    )
  }
}
