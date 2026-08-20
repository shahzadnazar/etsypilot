/*
 * Baseline computation.
 *
 * The expected range is built ONLY from this shop's own order history, by
 * weekday - never from other shops, category averages or anything Etsy has not
 * released to this seller.
 *
 * By weekday rather than flat: a Tuesday and a Sunday are not comparable in
 * most shops, and a flat mean would flag every weekend as a deviation.
 */

import type { EtsyOrder } from '@/lib/etsy/interface'
import type { Baseline, BaselinePoint } from './types'

/**
 * How many standard deviations define the expected band.
 *
 * Two sigma, not one and a half: a tighter band flagged ordinary quiet stretches
 * as findings, and an alert the seller learns to dismiss is worse than no alert.
 */
const BAND_SIGMA = 2

interface BaselineArgs {
  metric: 'orders' | 'revenue'
  priorOrders: EtsyOrder[]
  periodOrders: EtsyOrder[]
  periodStart: string
  periodDays: number
  timezone: string
  coveragePercent: number
  listingsTooNew: number
}

export function computeBaseline(args: BaselineArgs): Baseline {
  const value = (o: EtsyOrder) => (args.metric === 'orders' ? 1 : o.gross)

  // Group the prior window by weekday, so each day is compared against its own kind.
  const priorByWeekday = new Map<number, number[]>()
  const priorDaily = bucketByDay(args.priorOrders, args.timezone, value)
  for (const [day, total] of priorDaily) {
    const weekday = new Date(day).getUTCDay()
    const bucket = priorByWeekday.get(weekday) ?? []
    bucket.push(total)
    priorByWeekday.set(weekday, bucket)
  }

  const stats = new Map<number, { mean: number; stddev: number }>()
  for (const [weekday, values] of priorByWeekday) {
    stats.set(weekday, meanAndStddev(values))
  }

  const actualDaily = bucketByDay(args.periodOrders, args.timezone, value)
  const startMs = new Date(args.periodStart).getTime()

  const series: BaselinePoint[] = []
  for (let i = 0; i < args.periodDays; i++) {
    const date = new Date(startMs + i * 86_400_000).toISOString().slice(0, 10)
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay()
    const stat = stats.get(weekday) ?? { mean: 0, stddev: 0 }
    const actual = actualDaily.get(date) ?? 0
    const lower = Math.max(0, stat.mean - BAND_SIGMA * stat.stddev)
    const upper = stat.mean + BAND_SIGMA * stat.stddev

    series.push({
      date,
      actual: round2(actual),
      expected: round2(stat.mean),
      lower: round2(lower),
      upper: round2(upper),
      outside: actual < lower || actual > upper,
    })
  }

  const expectedTotal = round2(series.reduce((s, p) => s + p.expected, 0))
  const actualTotal = round2(series.reduce((s, p) => s + p.actual, 0))

  return {
    metric: args.metric,
    windowDays: 90,
    series,
    expectedTotal,
    actualTotal,
    deviationPercent:
      expectedTotal === 0 ? 0 : round1(((actualTotal - expectedTotal) / expectedTotal) * 100),
    coveragePercent: args.coveragePercent,
    listingsTooNew: args.listingsTooNew,
  }
}

/** Day keys are in the shop's own timezone, so "a day" means what the seller means. */
function bucketByDay(
  orders: EtsyOrder[],
  timezone: string,
  value: (o: EtsyOrder) => number,
): Map<string, number> {
  const out = new Map<string, number>()
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  for (const o of orders) {
    const key = fmt.format(new Date(o.placedAt))
    out.set(key, (out.get(key) ?? 0) + value(o))
  }
  return out
}

function meanAndStddev(values: number[]): { mean: number; stddev: number } {
  if (values.length === 0) return { mean: 0, stddev: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return { mean, stddev: Math.sqrt(variance) }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
