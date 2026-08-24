/*
 * Experiment tracker (artboards 59–60).
 *
 * This is the surface where the product's central rule is most likely to be
 * broken, so the shape enforces it. An experiment on a live Etsy shop has no
 * control group: the seller changed something and the world carried on
 * changing too. Seasonality, a competitor's price, an Etsy algorithm update and
 * the change itself all land in the same numbers.
 *
 * So a verdict here is NEVER causal. The three values mean:
 *
 *   POSITIVE      orders moved up after the change, by more than this shop's
 *                 own variation would explain
 *   NEGATIVE      the same, downwards
 *   INCONCLUSIVE  the movement is inside normal variation, or there is not
 *                 enough post-change data to tell
 *
 * "Correlated with", never "caused by" — the same vocabulary Shop Pulse uses,
 * and for the same reason.
 */

import { getEtsyService } from '@/lib/etsy'
import { DEMO_NOW, narrativeGroups, PERIOD_END } from '@/lib/etsy/demo-dataset'
import { DEMO_EVENTS } from '@/lib/etsy/demo-events'
import type { DomainEvent } from '@/lib/events/types'
import type { EtsyOrder } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'

export const VERDICTS = ['POSITIVE', 'NEGATIVE', 'INCONCLUSIVE'] as const
export type Verdict = (typeof VERDICTS)[number]

export const VERDICT_LABEL: Record<Verdict, string> = {
  POSITIVE: 'Positive',
  NEGATIVE: 'Negative',
  INCONCLUSIVE: 'Inconclusive',
}

/**
 * The minimum post-change window before a verdict is anything but inconclusive.
 *
 * Stated on every card, because a seller who reads "Positive" after four days
 * will act on four days of data. The threshold is EtsyPilot's, not a
 * statistical standard, and the cards say so.
 */
export const MIN_POST_DAYS = 14

/** Movement smaller than this is inside the noise of a shop this size. */
export const MATERIAL_CHANGE_PERCENT = 15

export interface ExperimentWindow {
  orders: number
  days: number
  /** Orders per day. The comparable figure — the windows differ in length. */
  rate: number
}

export interface Experiment {
  id: string
  name: string
  hypothesis: string
  startedAt: string
  /** The listings it applies to. */
  listingIds: string[]
  primaryMetric: 'VERIFIED_ORDERS'
  /** The change job this experiment is attached to, where there is one. */
  linkedJobId?: string
  /** Set when the seller rolled the change back. */
  rolledBackAt?: string
}

export interface ExperimentResult {
  experiment: Experiment
  before: ExperimentWindow
  after: ExperimentWindow
  /** Change in orders per day, as a percentage. Null when there is no before. */
  ratePercentChange: number | null
  verdict: Verdict
  /*
   * Other recorded changes inside the after-window.
   *
   * An experiment that overlaps a stockout, a deactivation or another edit
   * cannot separate its own effect from theirs, so it is downgraded to
   * inconclusive and the overlap is named. This is the difference between a
   * tracker and a rumour mill: the seasonal-titles experiment reads as a 31%
   * fall, and the fall is the Aug 6 deactivation of that whole section.
   */
  overlappingEvents: { at: string; description: string }[]
  /** Why this verdict, in plain words. Never omitted. */
  reasoning: string
  /** What this reading cannot tell the seller. Never empty. */
  limitations: string[]
}

export interface ExperimentsView {
  results: ExperimentResult[]
  minPostDays: number
  empty: boolean
}

export async function getExperiments(ctx: ShopContext): Promise<ExperimentsView> {
  const etsy = getEtsyService()
  const [orders, catalogue] = await Promise.all([
    // A wide window: an experiment's "before" reaches behind the reporting
    // period, and reading only the period would compare against a truncated
    // history without saying so.
    etsy.getOrders(ctx.shopId, { since: '2026-04-15T00:00:00.000Z', until: PERIOD_END }),
    etsy.getListings(ctx.shopId, { limit: 500 }),
  ])

  const groups = narrativeGroups(catalogue.listings)
  const experiments = demoExperiments({
    priceGroup: groups.priceGroup.map((l) => l.etsyListingId),
    tagGroup: groups.tagGroup.map((l) => l.etsyListingId),
    seasonal: groups.seasonal.map((l) => l.etsyListingId),
  })
  const results = experiments.map((experiment) =>
    evaluate(experiment, orders, DEMO_NOW, DEMO_EVENTS),
  )

  return { results, minPostDays: MIN_POST_DAYS, empty: results.length === 0 }
}

/**
 * Compare orders per day before and after the change, on the affected listings.
 *
 * Rates, not totals. The artboard's own card compares "41 orders / 14 d" with
 * "52 orders / 7 d" and calls it positive — but 41 over 14 days is 2.9 a day
 * and 52 over 7 is 7.4, so the totals understate it by more than half. Two
 * windows of different lengths are not comparable until they are divided by
 * their lengths, and the card shows both figures so the reader can see it.
 */
export function evaluate(
  experiment: Experiment,
  orders: EtsyOrder[],
  now: string,
  events: DomainEvent[] = [],
): ExperimentResult {
  const affected = new Set(experiment.listingIds)
  const startMs = Date.parse(experiment.startedAt)
  const endMs = Date.parse(experiment.rolledBackAt ?? now)

  const beforeDays = MIN_POST_DAYS
  const beforeStart = startMs - beforeDays * 86_400_000
  const afterDays = Math.max(0, Math.round((endMs - startMs) / 86_400_000))

  const inWindow = (order: EtsyOrder, from: number, to: number) => {
    const at = Date.parse(order.placedAt)
    if (at < from || at >= to) return false
    return affected.has(order.items[0]?.etsyListingId ?? '')
  }

  const beforeOrders = orders.filter((o) => inWindow(o, beforeStart, startMs)).length
  const afterOrders = orders.filter((o) => inWindow(o, startMs, endMs)).length

  const before: ExperimentWindow = {
    orders: beforeOrders,
    days: beforeDays,
    rate: round2(beforeOrders / beforeDays),
  }
  const after: ExperimentWindow = {
    orders: afterOrders,
    days: afterDays,
    rate: afterDays === 0 ? 0 : round2(afterOrders / afterDays),
  }

  const ratePercentChange =
    before.rate === 0 ? null : round1(((after.rate - before.rate) / before.rate) * 100)

  const overlapping = events
    .filter((event) => {
      // A group event names its listings in `listingIds`; a per-listing one
      // in `listingId`. An event that names neither belongs to no listing.
      const touched = event.listingIds ?? (event.listingId ? [event.listingId] : [])
      if (!touched.some((id) => affected.has(id))) return false
      const at = Date.parse(event.timestamp)
      // Not the experiment's own change. An experiment overlapping itself is
      // not a confound.
      if (Math.abs(at - startMs) < 86_400_000) return false
      return at >= startMs && at < endMs
    })
    .map((event) => ({
      at: event.timestamp,
      description: `${describeEvent(event)} on a listing in this experiment`,
    }))

  return {
    experiment,
    before,
    after,
    ratePercentChange,
    overlappingEvents: overlapping,
    ...verdictFor(after, ratePercentChange, overlapping.length),
  }
}

function describeEvent(event: DomainEvent): string {
  switch (event.type) {
    case 'PRICE_CHANGED':
      return 'A price change'
    case 'TAGS_CHANGED':
      return 'A tag change'
    case 'TITLE_CHANGED':
      return 'A title change'
    case 'QUANTITY_CHANGED':
      return 'A quantity change'
    case 'STOCKOUT':
      return 'A stockout'
    case 'RESTOCKED':
      return 'A restock'
    case 'LISTING_DEACTIVATED':
      return 'A listing being deactivated'
    case 'LISTING_REACTIVATED':
      return 'A listing being relisted'
    default:
      return 'Another recorded change'
  }
}

function verdictFor(
  after: ExperimentWindow,
  change: number | null,
  overlaps: number,
): { verdict: Verdict; reasoning: string; limitations: string[] } {
  const limitations = [
    'A live shop has no control group. Seasonality, competitor pricing and Etsy’s own ranking all moved during this window too.',
    'Only orders on the affected listings are counted. A change that moved sales onto a different listing would read as a fall here.',
    'This is a correlation between a change and what followed it. It is not evidence that the change caused it.',
  ]

  /*
   * An overlap beats every other reading.
   *
   * Checked first, and deliberately: a large movement with a known other cause
   * inside the window is the MOST misleading thing this screen could report,
   * because the size of the number is what makes it convincing.
   */
  if (overlaps > 0) {
    return {
      verdict: 'INCONCLUSIVE',
      reasoning: `${overlaps} other recorded ${overlaps === 1 ? 'change' : 'changes'} happened to these listings inside the measurement window, so this reading cannot separate your change from ${overlaps === 1 ? 'it' : 'them'}.`,
      limitations,
    }
  }

  if (after.days < MIN_POST_DAYS) {
    return {
      verdict: 'INCONCLUSIVE',
      reasoning: `Only ${after.days} days of post-change data. EtsyPilot does not call a result before ${MIN_POST_DAYS} days, because a short window on a small shop is mostly noise.`,
      limitations,
    }
  }
  if (change === null) {
    return {
      verdict: 'INCONCLUSIVE',
      reasoning: 'There were no orders on these listings before the change, so there is nothing to compare against.',
      limitations,
    }
  }
  if (Math.abs(change) < MATERIAL_CHANGE_PERCENT) {
    return {
      verdict: 'INCONCLUSIVE',
      reasoning: `Orders per day moved ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}%, which is inside the normal variation for a shop this size. Nothing here separates it from an ordinary fortnight.`,
      limitations,
    }
  }
  return {
    verdict: change > 0 ? 'POSITIVE' : 'NEGATIVE',
    reasoning: `Orders per day ${change > 0 ? 'rose' : 'fell'} ${Math.abs(change)}% over ${after.days} days on the affected listings, which is larger than this shop's usual variation.`,
    limitations,
  }
}

/*
 * The demo shop's experiments, attached to the narrative groups.
 *
 * Those groups are the ones the demo data gives a designed, measurable history
 * to: the price group really does slow after Jul 24, and the tag group really
 * is unaffected by the Jul 28 job. So the verdicts below are computed from the
 * shop's own orders, including the inconclusive one — it is inconclusive
 * because the numbers say so, not because a card was written that way.
 *
 * There is no positive result here, and that is left alone rather than
 * arranged. A tracker that always has one success on it is a tracker nobody
 * should trust. The POSITIVE branch is exercised by unit test instead.
 */
function demoExperiments(groups: {
  priceGroup: string[]
  tagGroup: string[]
  seasonal: string[]
}): Experiment[] {
  return [
    {
      id: 'EXP-1',
      name: 'Price +8% on the linen range',
      hypothesis: 'A modest rise holds order volume and raises revenue per order.',
      startedAt: '2026-07-24T00:00:00.000Z',
      listingIds: groups.priceGroup,
      primaryMetric: 'VERIFIED_ORDERS',
      linkedJobId: '4821',
    },
    {
      id: 'EXP-2',
      name: 'Autumn tags on the home range',
      hypothesis: 'Seasonal gifting tags increase orders before September.',
      startedAt: '2026-07-28T00:00:00.000Z',
      listingIds: groups.tagGroup,
      primaryMetric: 'VERIFIED_ORDERS',
      linkedJobId: '4809',
    },
    {
      id: 'EXP-3',
      name: 'Shorter titles on the seasonal range',
      hypothesis: 'A shorter, clearer title reads better in search results.',
      startedAt: '2026-07-20T00:00:00.000Z',
      listingIds: groups.seasonal,
      primaryMetric: 'VERIFIED_ORDERS',
      linkedJobId: '4788',
    },
  ]
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
