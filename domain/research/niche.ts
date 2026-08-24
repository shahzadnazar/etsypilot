/*
 * Niche research (artboard 102).
 *
 * The screen answers "is this worth entering?" and the answer is deliberately
 * never yes or no. EtsyPilot does not tell a seller to enter a niche — it
 * states the CONDITIONS the numbers imply, so the seller decides against
 * something they can check.
 *
 * That is not a copy choice. A recommendation is a claim about a future this
 * product cannot see; a condition is a statement about the figures on the
 * screen, and every one below is derived from them.
 */

import { getSignalsService } from '@/lib/signals'
import { calculateFees } from '@/domain/fees/calculate'
import type { NicheSignals } from '@/lib/signals/interface'

export interface Condition {
  /** The condition, with the number that makes it checkable. */
  text: string
  /** Which figure on the page it comes from. */
  from: string
}

export interface NicheView {
  term: string
  market: string
  signals: NicheSignals
  conditions: Condition[]
  /** True when the term has not been sampled enough to say anything. */
  sparse: boolean
  /** Terms the sampler HAS observed, offered when the asked-for one is sparse. */
  known: string[]
  mode: 'MOCK' | 'LIVE'
}

/** Margin the conditions are written to clear. Stated on the page. */
export const TARGET_MARGIN = 0.4

export async function getNiche(query: { q?: string; market?: string } = {}): Promise<NicheView> {
  const signals = getSignalsService()
  const market = query.market?.trim() || 'United States'
  const term = query.q?.trim() || 'linen table linens'
  const data = await signals.getNiche(term, market)
  const { KNOWN_NICHES } = await import('@/lib/signals/mock')

  return {
    term,
    market,
    signals: data,
    conditions: conditionsFrom(data),
    sparse: data.demand.value === null,
    known: KNOWN_NICHES,
    mode: signals.mode,
  }
}

/**
 * The conditions, derived rather than written.
 *
 * Each one carries a number that came off this page, so a seller can disagree
 * with it by checking the figure it came from. A condition with no number in it
 * would be advice, which is the thing this screen refuses to give.
 */
export function conditionsFrom(niche: NicheSignals): Condition[] {
  const conditions: Condition[] = []
  const price = niche.priceBand?.value ?? null
  const listings = niche.listings.value ?? null
  const concentration = niche.concentration?.value ?? null

  if (price && listings) {
    const midpoint = Math.round((price.min + price.max) / 2)
    conditions.push({
      text: `You can sell above $${midpoint} — below the band's midpoint, ${listings.toLocaleString('en-US')} listings compete on price alone.`,
      from: 'Price band and listings',
    })

    /*
     * Costed through the same fee engine the calculators use, so the figure
     * here and the figure in the Fee Calculator cannot disagree. A cost ceiling
     * worked out by hand beside a calculator that works it out properly is a
     * number that stops being true the first time a rate changes.
     */
    const fees = calculateFees({ itemPrice: midpoint, shipping: 0, tax: 0, offsiteAd: false })
    const ceiling = Math.floor(midpoint * (1 - TARGET_MARGIN) - fees.totalFees)
    if (ceiling > 0) {
      conditions.push({
        text: `Your product cost stays under $${ceiling} to clear ${Math.round(TARGET_MARGIN * 100)}% margin after fees at that price.`,
        from: 'Price band and the recorded fee rates',
      })
    } else {
      conditions.push({
        text: `At $${midpoint} the recorded fee rates alone leave no room for a ${Math.round(TARGET_MARGIN * 100)}% margin, whatever the product costs. The price has to be higher or the target lower.`,
        from: 'Price band and the recorded fee rates',
      })
    }
  }

  const peak = peakMonths(niche)
  if (peak) {
    conditions.push({
      text: `You are listing before ${peak.leadMonth} — modelled demand roughly ${peak.multiple}× from ${peak.fromMonth} to ${peak.peakMonth}, and the prep window closes before it.`,
      from: 'Twelve-month demand shape',
    })
  }

  if (concentration !== null && concentration > 0) {
    conditions.push({
      text: `You differentiate on something other than the term itself — the ten largest shops hold ${concentration}% of observed listings.`,
      from: 'Concentration',
    })
  }

  return conditions
}

/**
 * The seasonal shape, read off the history rather than assumed.
 *
 * Null when the history is too sparse or too flat to say anything — which is
 * the honest answer for a niche that does not have a season, and stops the
 * screen inventing one for every term.
 */
function peakMonths(
  niche: NicheSignals,
): { fromMonth: string; peakMonth: string; leadMonth: string; multiple: number } | null {
  const points = niche.history.filter((p) => p.index !== null)
  if (points.length < 8) return null

  const peak = points.reduce((best, p) => (p.index! > best.index! ? p : best))
  const trough = points.reduce((worst, p) => (p.index! < worst.index! ? p : worst))
  const multiple = Math.round((peak.index! / Math.max(1, trough.index!)) * 10) / 10
  // Under 1.5x is not a season, it is noise with a shape.
  if (multiple < 1.5) return null

  const peakIndex = niche.history.findIndex((p) => p.month === peak.month)
  const fromIndex = Math.max(0, peakIndex - 3)
  const leadIndex = Math.max(0, peakIndex - 2)

  return {
    fromMonth: monthName(niche.history[fromIndex]!.month),
    peakMonth: monthName(peak.month),
    leadMonth: monthName(niche.history[leadIndex]!.month),
    multiple,
  }
}

function monthName(month: string): string {
  // A month key has no day and no zone. Formatting it through a zoned formatter
  // is how an axis comes to start a month early (D24).
  return new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${month}-15T12:00:00.000Z`),
  )
}
