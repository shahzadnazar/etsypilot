import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BASELINE_DAYS,
  REPORTING_DAYS,
  baselineWindow,
  previousWindow,
  reportingWindow,
} from '@/domain/clock'
import {
  BASELINE_END,
  BASELINE_START,
  DEMO_NOW,
  PERIOD_DAYS,
  PERIOD_END,
  PERIOD_START,
} from '@/lib/etsy/demo-dataset'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE REPORTING WINDOW ROLLS, AND IN DEMO MODE IT LANDS EXACTLY ON THE
 *   FIXTURE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * `PERIOD_START` and `PERIOD_END` were imported by twelve domain services with
 * no mode check, so every screen that shows a seller money reported on 14 July
 * to 12 August 2026 forever. Measured on a live shop on 12 October with 87
 * orders running to the previous day: six screens, all of them reporting that
 * window, all of them counting 15 orders worth $830.00, with 51 orders worth
 * $3,843.80 outside it.
 *
 * ── WHY THIS FILE EXISTS AT ALL ───────────────────────────────────────────
 *
 * Because the demo window is now DERIVED. The fixture's two instants are no
 * longer read by anything that renders; they are the SPECIFICATION of an
 * arithmetic, and an arithmetic slip would move every artboard figure at once
 * while the unit suite stayed green — most of its assertions are about shapes
 * and ratios, not dates.
 *
 * So the four constants are asserted against the derivation here, where a
 * human can read the comparison, and again as a load-time check in
 * domain/clock.ts, which fires before any screen renders in demo mode.
 */

const REAL_ETSY_MODE = process.env.ETSY_MODE

afterEach(() => {
  vi.useRealTimers()
  if (REAL_ETSY_MODE === undefined) delete process.env.ETSY_MODE
  else process.env.ETSY_MODE = REAL_ETSY_MODE
})

describe('in demo mode the derivation reproduces the fixture exactly', () => {
  it('is the period the dataset declares, to the millisecond', () => {
    expect(reportingWindow()).toEqual({
      start: PERIOD_START,
      end: PERIOD_END,
      days: PERIOD_DAYS,
    })
  })

  it('and the baseline the dataset declares', () => {
    expect(baselineWindow()).toEqual({
      start: BASELINE_START,
      end: BASELINE_END,
      days: BASELINE_DAYS,
    })
  })

  it('and the previous window the analytics screen used to compute by hand', () => {
    /*
     * The arithmetic that was in domain/analytics/service.ts —
     * `PERIOD_START - PERIOD_DAYS days` to `PERIOD_START - 1ms` — written out
     * rather than called, so this fails if the shared helper starts
     * disagreeing with the thing it replaced.
     */
    const start = Date.parse(PERIOD_START)
    expect(previousWindow()).toEqual({
      start: new Date(start - PERIOD_DAYS * 86_400_000).toISOString(),
      end: new Date(start - 1).toISOString(),
      days: PERIOD_DAYS,
    })
  })

  it('reads the fixture clock, not the wall clock', () => {
    /*
     * The positive control for all three above. If `nowIso()` stopped
     * returning DEMO_NOW in demo mode, the window would roll with today's date
     * and every assertion in this file would be measuring the wrong thing —
     * and the three equalities would fail, which is the point, but only if
     * this is genuinely the demo mode they claim to be testing.
     */
    expect(process.env.ETSY_MODE).not.toBe('live')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-03-04T10:00:00.000Z'))
    expect(reportingWindow().start).toBe(PERIOD_START)
    expect(DEMO_NOW.slice(0, 10)).toBe(PERIOD_END.slice(0, 10))
  })
})

describe('on a live deployment it rolls with the clock', () => {
  function live(nowIso: string) {
    process.env.ETSY_MODE = 'live'
    vi.useFakeTimers()
    vi.setSystemTime(new Date(nowIso))
  }

  it('is the thirty UTC days ending with today', () => {
    live('2026-10-12T09:41:00.000Z')
    expect(reportingWindow()).toEqual({
      start: '2026-09-13T00:00:00.000Z',
      end: '2026-10-12T23:59:59.999Z',
      days: 30,
    })
  })

  it('moves a day when the day moves', () => {
    /*
     * THE WHOLE DEFECT, in one assertion. The constants could not do this, and
     * nothing in the suite asked them to.
     */
    live('2026-10-12T23:59:00.000Z')
    const before = reportingWindow()
    live('2026-10-13T00:01:00.000Z')
    const after = reportingWindow()
    expect(after.start).not.toBe(before.start)
    expect(after.start).toBe('2026-09-14T00:00:00.000Z')
    expect(after.end).toBe('2026-10-13T23:59:59.999Z')
  })

  it('crosses a month and a year end without arithmetic drift', () => {
    live('2027-01-03T12:00:00.000Z')
    expect(reportingWindow()).toEqual({
      start: '2026-12-05T00:00:00.000Z',
      end: '2027-01-03T23:59:59.999Z',
      days: 30,
    })
  })

  it('keeps every boundary on a UTC midnight, which the charts bucket on', () => {
    live('2026-10-12T09:41:00.000Z')
    for (const w of [reportingWindow(), baselineWindow(), previousWindow()]) {
      expect(w.start).toMatch(/T00:00:00\.000Z$/)
      expect(w.end).toMatch(/T23:59:59\.999Z$/)
    }
  })

  it('leaves no gap and no overlap between the three windows', () => {
    live('2026-10-12T09:41:00.000Z')
    const period = reportingWindow()
    const previous = previousWindow()
    const baseline = baselineWindow()

    // Exactly adjacent: the previous window ends one millisecond before the
    // reporting window starts. A gap loses a day's orders from both; an
    // overlap counts one twice, in a comparison between the two.
    expect(Date.parse(previous.end) + 1).toBe(Date.parse(period.start))
    expect(Date.parse(baseline.end) + 1).toBe(Date.parse(period.start))

    // And each is the length it says it is.
    const spanDays = (w: { start: string; end: string }) =>
      Math.round((Date.parse(w.end) + 1 - Date.parse(w.start)) / 86_400_000)
    expect(spanDays(period)).toBe(REPORTING_DAYS)
    expect(spanDays(previous)).toBe(REPORTING_DAYS)
    expect(spanDays(baseline)).toBe(BASELINE_DAYS)
  })

  it('states the lengths the screens state about themselves', () => {
    /*
     * Shop Pulse's subtitle says "measured against this shop's own 90-day
     * baseline" and analytics says "vs the previous 30 days". A figure a screen
     * states about itself is the one that has to be true.
     */
    expect(REPORTING_DAYS).toBe(30)
    expect(BASELINE_DAYS).toBe(90)
  })

  it('does not reach back to the fixture for any of it', () => {
    /*
     * The containment check, from the other end. In live mode none of the
     * three windows may contain a fixture instant — which is what twelve
     * services were handing to loadOrders() until this file existed.
     */
    live('2026-10-12T09:41:00.000Z')
    const all = [reportingWindow(), baselineWindow(), previousWindow()].flatMap((w) => [
      w.start,
      w.end,
    ])
    for (const instant of all) {
      expect(all.includes(PERIOD_START), `a live window starts at ${PERIOD_START}`).toBe(false)
      expect(instant).not.toBe(PERIOD_END)
      expect(instant).not.toBe(BASELINE_START)
      expect(instant).not.toBe(BASELINE_END)
    }
  })
})
