/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   AN INSTANT INSIDE THE WINDOW THE PRODUCT ACTUALLY REPORTS ON.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Four integration files declared `const IN_PERIOD = '2026-07-20T10:00:00.000Z'`
 * with a comment explaining that it had to be "inside the demo dataset's own
 * reporting period, so an order written here is one the profit screen and the
 * Action Center actually read". That was true of a window that never moved, and
 * the window moves now — so the same literal puts every seeded order two months
 * outside it, and the screens correctly report nothing.
 *
 * Which is exactly the shape the comment itself recorded: "The assertion was
 * right and the fixture was in the wrong month." It happened again, for the
 * same reason, one directory away. So the tests ask too.
 *
 * ── WHY THESE ARE FUNCTIONS ───────────────────────────────────────────────
 *
 * `reportingWindow()` reads `nowIso()`, which reads the mode, and the
 * integration suite flips `ETSY_MODE` in `beforeEach`. A module-scope constant
 * would be computed at import time — before the mode is set — and would hand
 * back the demo window to a live-mode test, which is a subtler version of the
 * bug it exists to avoid.
 */

import { baselineWindow, previousWindow, reportingWindow } from '@/domain/clock'

const HOUR = 3_600_000

/**
 * 10:00 on the second day of the reporting window.
 *
 * Inside it with a day's margin at each end, so a test is never balanced on a
 * boundary: the window's last day is today, and a seeded order timestamped
 * later than "now" would be a receipt from the future.
 */
export function inReportingWindow(): string {
  return new Date(Date.parse(reportingWindow().start) + 24 * HOUR + 10 * HOUR).toISOString()
}

/** 09:00 on the day after the window opens. For a recorded change or an event. */
export function earlyInReportingWindow(): string {
  return new Date(Date.parse(reportingWindow().start) + 24 * HOUR + 9 * HOUR).toISOString()
}

/** Inside the previous window: what "the period before" is measured over. */
export function inPreviousWindow(): string {
  return new Date(Date.parse(previousWindow().start) + 10 * HOUR).toISOString()
}

/** Inside the 90-day baseline, which Shop Pulse compares the period against. */
export function inBaselineWindow(): string {
  return new Date(Date.parse(baselineWindow().start) + 10 * HOUR).toISOString()
}

/**
 * A window wide enough to read everything a test seeded, whatever today is.
 *
 * Several files passed `{ since: PERIOD_START, until: PERIOD_END }` to a
 * repository directly, to read back what they had written. The repository
 * window is not the product's reporting window — it is just a filter — so this
 * is deliberately generous rather than exact.
 */
export function wideWindow(): { since: string; until: string } {
  return {
    since: new Date(Date.parse(baselineWindow().start) - 365 * 24 * HOUR).toISOString(),
    until: new Date(Date.parse(reportingWindow().end) + 24 * HOUR).toISOString(),
  }
}
