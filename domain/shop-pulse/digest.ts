/*
 * The weekly Shop Pulse digest (artboard 104, D12).
 *
 * The rule that shapes this module:
 *
 *   "If nothing crossed your baseline that week, we do not send an email.
 *    A digest with nothing in it trains you to ignore the next one."
 *
 * So buildDigest returns null rather than an empty digest. There is no shape
 * that can carry "nothing happened" to the mailer.
 */

import type { Diagnosis } from '@/lib/events/types'
import type { ShopPulseView } from './types'

export interface DigestChange {
  title: string
  detail: string
  diagnosis: Diagnosis
}

export interface Digest {
  shopName: string
  /** The single sentence the email leads with. */
  headline: string
  /** Says plainly that observing is not acting. */
  reassurance: string
  metrics: { label: string; value: string; note: string; negative: boolean }[]
  changes: DigestChange[]
  cta: { label: string; href: string }
  /** Why it arrived and how to stop it — one click, no confirmation. */
  footer: string
}

export interface DigestOptions {
  shopName: string
  currency: string
  includeProfit: boolean
  netProfit?: number
  coveragePercent?: number
  day: 'Mon' | 'Thu' | 'Sun'
}

/**
 * Returns null when nothing crossed the baseline. Callers must handle null by
 * sending nothing at all.
 */
export function buildDigest(pulse: ShopPulseView, opts: DigestOptions): Digest | null {
  const crossed = pulse.orders.series.some((p) => p.outside)
  const hasFindings = pulse.changes.length > 0
  if (!crossed && !hasFindings) return null

  const correlated = pulse.counts.CORRELATED
  const unknown = pulse.counts.UNKNOWN
  const deviation = Math.abs(pulse.orders.deviationPercent)

  const metrics: Digest['metrics'] = [
    {
      label: 'Orders',
      value: String(Math.round(pulse.orders.actualTotal)),
      note: `${signed(pulse.orders.deviationPercent)}`,
      negative: pulse.orders.deviationPercent < 0,
    },
    {
      label: 'Revenue',
      value: money(pulse.revenue.actualTotal, pulse.currency),
      note: `${signed(pulse.revenue.deviationPercent)}`,
      negative: pulse.revenue.deviationPercent < 0,
    },
  ]

  if (opts.includeProfit && opts.netProfit !== undefined) {
    metrics.push({
      label: 'Net profit',
      value: money(opts.netProfit, pulse.currency),
      note: `${opts.coveragePercent ?? 0}% coverage`,
      negative: false,
    })
  }

  return {
    shopName: opts.shopName,
    headline: `Orders were ${deviation.toFixed(1)}% below your baseline this week`,
    // Observing is not acting. Said in the second sentence, every time.
    reassurance: `${describe(correlated, unknown)} Nothing has been changed in your shop.`,
    metrics,
    changes: pulse.changes.slice(0, 3).map((c) => ({
      title: c.title,
      detail: c.evidence.observed[1] ?? c.detail,
      diagnosis: c.diagnosis,
    })),
    cta: { label: 'Open Shop Pulse', href: '/shop-pulse' },
    footer: `Sent weekly on ${dayName(opts.day)}s because you have Shop Pulse alerts on. Change frequency or turn this off in notification settings — one click, no confirmation needed.`,
  }
}

function describe(correlated: number, unknown: number): string {
  const parts: string[] = []
  if (correlated > 0) {
    parts.push(`${correlated} change${correlated === 1 ? '' : 's'} correlate${correlated === 1 ? 's' : ''} with the drop`)
  }
  if (unknown > 0) {
    parts.push(`${unknown} ${unknown === 1 ? 'is' : 'are'} still unexplained`)
  }
  if (parts.length === 0) return 'No recorded change accounts for it.'
  return `${capitalise(parts.join(' and '))}.`
}

function dayName(day: 'Mon' | 'Thu' | 'Sun'): string {
  return { Mon: 'Monday', Thu: 'Thursday', Sun: 'Sunday' }[day]
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function signed(percent: number): string {
  return `${percent > 0 ? '▲ ' : '▼ '}${Math.abs(percent).toFixed(1)}%`
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}
