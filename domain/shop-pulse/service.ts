/*
 * Shop Pulse service.
 *
 * Assembles the view: baselines, then one DetectedChange per recorded event,
 * then the unexplained-deviation sweep that produces UNKNOWN rows.
 *
 * Every change is measured from the event log against the order history. None
 * of the verdicts below are written down anywhere - they are reached.
 */

import { getEtsyService } from '@/lib/etsy'
import {
  BASELINE_END,
  BASELINE_START,
  DEMO_BASELINE,
  NARRATIVE,
  PERIOD_DAYS,
  PERIOD_END,
  PERIOD_START,
  buildDemoListings,
  buildDemoPriorOrders,
  narrativeGroups,
} from '@/lib/etsy/demo-dataset'
import { DEMO_EVENTS } from '@/lib/etsy/demo-events'
import type { EtsyOrder } from '@/lib/etsy/interface'
import type { DomainEvent, Diagnosis } from '@/lib/events/types'
import type { ShopContext } from '@/lib/permissions'
import { formatDate } from '@/lib/utils/format'
import { computeBaseline } from './baseline'
import {
  ORDERS_ONLY_LIMITATION,
  SEASONALITY_LIMITATION,
  compareRates,
  confidenceFor,
  diagnose,
} from './correlation'
import type { DetectedChange, Evidence, ShopPulseView, TestedAlternative } from './types'

export async function getShopPulse(ctx: ShopContext): Promise<ShopPulseView> {
  const etsy = getEtsyService()
  const shop = await etsy.getShop(ctx.shopId)
  const periodOrders = await etsy.getOrders(ctx.shopId, {
    since: PERIOD_START,
    until: PERIOD_END,
  })
  // Baseline history is read through the same adapter in live mode; the demo
  // adapter serves it directly since it is not part of the reporting period.
  const priorOrders = buildDemoPriorOrders(buildDemoListings()).filter(
    (o) => o.placedAt >= BASELINE_START && o.placedAt <= BASELINE_END,
  )

  const baselineArgs = {
    priorOrders,
    periodOrders,
    periodStart: PERIOD_START,
    periodDays: PERIOD_DAYS,
    timezone: shop.timezone,
    coveragePercent: DEMO_BASELINE.coveragePercent,
    listingsTooNew: DEMO_BASELINE.listingsTooNew,
  }

  const orders = computeBaseline({ ...baselineArgs, metric: 'orders' })
  const revenue = computeBaseline({ ...baselineArgs, metric: 'revenue' })

  const recorded = recordedChanges(periodOrders)

  /*
   * The UNKNOWN sweep runs on the RESIDUAL - orders on listings that no
   * correlated change already accounts for.
   *
   * Without this the sweep re-reports the same shortfall a recorded change
   * already explains, and every quiet day in a below-baseline period becomes
   * its own "unexplained" row. What is left after subtracting the explained
   * part is the only thing that is genuinely unexplained.
   */
  const explained = new Set(
    recorded.filter((c) => c.diagnosis === 'CORRELATED').flatMap((c) => c.affectedListingIds),
  )
  const residual = (o: EtsyOrder) => !o.items.some((i) => explained.has(i.etsyListingId))

  const residualBaseline = computeBaseline({
    ...baselineArgs,
    metric: 'orders',
    priorOrders: priorOrders.filter(residual),
    periodOrders: periodOrders.filter(residual),
  })

  const changes = [
    ...recorded,
    ...unexplainedDeviations(residualBaseline.series, periodOrders.filter(residual), explained),
  ].sort((a, b) => rank(a) - rank(b) || a.occurredAt.localeCompare(b.occurredAt))

  return {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    currency: shop.currency,
    orders,
    revenue,
    changes,
    counts: {
      CORRELATED: changes.filter((c) => c.diagnosis === 'CORRELATED').length,
      RULED_OUT: changes.filter((c) => c.diagnosis === 'RULED_OUT').length,
      UNKNOWN: changes.filter((c) => c.diagnosis === 'UNKNOWN').length,
    },
  }
}

/** Ordered by measured impact, so the biggest movement is read first. */
function rank(c: DetectedChange): number {
  return -Math.abs(c.ordersAfterPercent ?? 0)
}

/* ------------------------------------------------------ recorded changes */

interface ChangeSpec {
  id: string
  events: DomainEvent[]
  title: string
  scope: string
  listingIds: string[]
  detailSuffix: string
  destinations: { label: string; href: string }[]
}

function recordedChanges(orders: EtsyOrder[]): DetectedChange[] {
  const priceEvents = DEMO_EVENTS.filter((e) => e.type === 'PRICE_CHANGED')
  const tagEvent = DEMO_EVENTS.find((e) => e.operationId === 'BE-2291')
  const stockout = DEMO_EVENTS.find((e) => e.type === 'STOCKOUT')
  const deactivation = DEMO_EVENTS.find((e) => e.type === 'LISTING_DEACTIVATED')

  const specs: ChangeSpec[] = []

  if (priceEvents.length > 0) {
    specs.push({
      id: 'CH-PRICE',
      events: priceEvents,
      title: `Price raised on ${priceEvents.length} listings`,
      scope: 'Linen table runner +2',
      listingIds: NARRATIVE.priceGroup.slice(),
      detailSuffix: '+18.4% average',
      destinations: [
        { label: 'Review these 3 listings', href: '/listings?ids=price-group' },
        { label: 'Open in Bulk Editor', href: '/listings/bulk-editor' },
        { label: 'See profit impact', href: '/profit' },
      ],
    })
  }

  if (tagEvent) {
    specs.push({
      id: 'CH-TAGS',
      events: [tagEvent],
      title: 'Tags replaced on 12 listings',
      scope: 'Wall art section',
      // A different set of listings from the price group - which is exactly why
      // this comes back RULED_OUT rather than CORRELATED.
      listingIds: wallArtListingIds(),
      detailSuffix: 'bulk job BE-2291',
      destinations: [{ label: 'View the bulk job', href: '/listings/change-history' }],
    })
  }

  if (stockout) {
    specs.push({
      id: 'CH-STOCK',
      events: [stockout],
      title: 'Out of stock for 6 days',
      scope: 'Ceramic mug set',
      listingIds: [NARRATIVE.stockoutListing],
      detailSuffix: 'restocked Aug 10',
      destinations: [
        { label: 'Review this listing', href: '/listings?ids=stockout' },
        { label: 'See profit impact', href: '/profit' },
      ],
    })
  }

  if (deactivation) {
    specs.push({
      id: 'CH-DEACT',
      events: [deactivation],
      title: '4 listings deactivated',
      scope: 'Seasonal section',
      listingIds: seasonalListingIds(),
      detailSuffix: 'manual',
      destinations: [{ label: 'Review the section', href: '/listings?section=Seasonal' }],
    })
  }

  return specs.map((spec) => buildChange(spec, orders))
}

function buildChange(spec: ChangeSpec, orders: EtsyOrder[]): DetectedChange {
  const first = spec.events[0]
  if (!first) throw new Error('change spec with no events')

  const comparison = compareRates(
    orders,
    spec.listingIds,
    first.timestamp,
    PERIOD_START,
    PERIOD_END,
  )
  const diagnosis = diagnose(comparison, true)
  const confidence = confidenceFor(comparison, spec.listingIds.length)

  const shopWide = compareRates(orders, [], first.timestamp, PERIOD_START, PERIOD_END)

  const observed: string[] = [
    `${formatDate(first.timestamp)} · ${first.type}${
      first.beforeValue && first.afterValue
        ? ` — ${first.beforeValue} → ${first.afterValue}`
        : ''
    }${first.operationId ? `, operation ${first.operationId}` : ''}.`,
    `${formatDate(first.timestamp)} – ${formatDate(PERIOD_END)} · outcome window — orders on ${
      spec.listingIds.length
    } listing${spec.listingIds.length === 1 ? '' : 's'} moved from ${
      comparison.beforePerDay
    }/day to ${comparison.afterPerDay}/day (${signed(comparison.changePercent)}).`,
    `Shop-wide orders moved ${signed(shopWide.changePercent)} over the same window.`,
  ]

  const evidence: Evidence = {
    observed,
    alsoTested: alternativesFor(spec, orders, first.timestamp),
    confidence,
    confidenceNote: `${comparison.daysAfter} days after, ${spec.listingIds.length} listing${
      spec.listingIds.length === 1 ? '' : 's'
    }`,
    coveragePercent: 100,
    coverageNote: 'All affected listings have full history in this window',
    limitations: [ORDERS_ONLY_LIMITATION],
  }

  return {
    id: spec.id,
    eventType: first.type,
    title: spec.title,
    detail: `${formatDate(first.timestamp)} · ${first.type} · ${spec.detailSuffix}`,
    occurredAt: first.timestamp,
    scope: spec.scope,
    affectedListingIds: spec.listingIds,
    ordersAfterPercent: comparison.changePercent,
    diagnosis,
    evidence,
    destinations: spec.destinations,
  }
}

/**
 * The alternatives each change is tested against.
 *
 * Kept visible even when they come back negative - knowing what did NOT cause a
 * drop is half the diagnosis.
 */
function alternativesFor(
  spec: ChangeSpec,
  orders: EtsyOrder[],
  at: string,
): TestedAlternative[] {
  const out: TestedAlternative[] = []

  if (spec.id !== 'CH-TAGS') {
    const overlap = wallArtListingIds().some((id) => spec.listingIds.includes(id))
    out.push({
      label: 'Tag replacement on Jul 28',
      verdict: overlap ? 'UNKNOWN' : 'RULED_OUT',
      note: overlap
        ? 'Some of these listings were in that job, so the two changes cannot be separated.'
        : 'These listings were not in that job.',
    })
  }

  if (spec.id !== 'CH-STOCK') {
    const stockAffected = spec.listingIds.includes(NARRATIVE.stockoutListing)
    out.push({
      label: 'Stock',
      verdict: stockAffected ? 'UNKNOWN' : 'RULED_OUT',
      note: stockAffected
        ? 'One of these listings was out of stock during the window.'
        : 'All stayed in stock throughout the window.',
    })
  }

  out.push({
    label: 'Seasonality',
    verdict: 'UNKNOWN',
    note: SEASONALITY_LIMITATION,
  })

  return out
}

/* -------------------------------------------------- unexplained deviations */

/**
 * Days that fell outside the expected band with no recorded event behind them.
 *
 * This is the UNKNOWN generator. It exists so the absence of an explanation is
 * itself reported, rather than the run quietly returning fewer rows.
 */
/**
 * Event types that could plausibly move orders.
 *
 * A sync completing is not a change to the shop, so it must not be allowed to
 * explain away a deviation - which it silently did until the restock on Aug 10
 * split a five-day unexplained run into two two-day runs and neither survived
 * the minimum-length filter.
 */
const MUTATING_EVENTS = new Set([
  'PRICE_CHANGED',
  'TITLE_CHANGED',
  'TAGS_CHANGED',
  'DESCRIPTION_CHANGED',
  'QUANTITY_CHANGED',
  'LISTING_DEACTIVATED',
  'LISTING_REACTIVATED',
  'STOCKOUT',
  'RESTOCKED',
  'BULK_EDIT_COMPLETED',
  'AI_CHANGE_APPLIED',
])

function unexplainedDeviations(
  series: ShopPulseView['orders']['series'],
  orders: EtsyOrder[],
  explainedIds: Set<string>,
): DetectedChange[] {
  /*
   * Only a change to the residual population can explain residual movement.
   * An event on a listing another change already accounts for is not an
   * explanation here - it has been counted once already.
   */
  const eventDays = new Set(
    DEMO_EVENTS.filter(
      (e) =>
        MUTATING_EVENTS.has(e.type) &&
        !(e.listingId !== null && explainedIds.has(e.listingId)),
    ).map((e) => e.timestamp.slice(0, 10)),
  )

  const runs: string[][] = []
  let current: string[] = []
  for (const point of series) {
    const unexplained = point.outside && point.actual < point.lower && !eventDays.has(point.date)
    if (unexplained) current.push(point.date)
    else if (current.length > 0) {
      runs.push(current)
      current = []
    }
  }
  if (current.length > 0) runs.push(current)

  // A single quiet day is noise. Three or more consecutive is a finding.
  return runs
    .filter((run) => run.length >= 3)
    .map((run, i) => {
      const from = run[0]
      const to = run[run.length - 1]
      if (!from || !to) throw new Error('empty run')

      const comparison = compareRates(
        orders,
        [],
        `${from}T04:00:00.000Z`,
        PERIOD_START,
        PERIOD_END,
      )

      const evidence: Evidence = {
        observed: [
          `${formatDate(`${from}T12:00:00.000Z`)} – ${formatDate(
            `${to}T12:00:00.000Z`,
          )} · orders fell below the expected range on ${run.length} consecutive days.`,
          `Shop-wide orders moved ${signed(comparison.changePercent)} from the start of that run.`,
          'No event in your history falls in this window.',
        ],
        alsoTested: [
          {
            label: 'Recorded changes',
            verdict: 'RULED_OUT',
            note: 'No price, tag, stock or listing-state change was recorded in this window.',
          },
          { label: 'Seasonality', verdict: 'UNKNOWN', note: SEASONALITY_LIMITATION },
        ],
        confidence: 'LOW',
        confidenceNote: `${run.length} days, no recorded change`,
        coveragePercent: DEMO_BASELINE.coveragePercent,
        coverageNote: `${DEMO_BASELINE.listingsTooNew} listings are too new to baseline`,
        limitations: [
          ORDERS_ONLY_LIMITATION,
          'EtsyPilot cannot see Etsy’s ranking algorithm and does not model it. We are not guessing at a cause.',
        ],
      }

      return {
        id: `CH-UNKNOWN-${i + 1}`,
        eventType: null,
        title: 'Orders below range, no change recorded',
        detail: `${formatDate(`${from}T12:00:00.000Z`)} – ${formatDate(
          `${to}T12:00:00.000Z`,
        )} · no event in your history`,
        occurredAt: `${from}T04:00:00.000Z`,
        scope: 'Shop-wide',
        affectedListingIds: [],
        ordersAfterPercent: comparison.changePercent,
        diagnosis: 'UNKNOWN' as Diagnosis,
        evidence,
        destinations: [
          { label: 'Review recent changes', href: '/listings/change-history' },
          { label: 'Open Action Center', href: '/action-center' },
        ],
      }
    })
}

/* ------------------------------------------------------------- listing sets */

/*
 * Listing sets come from the shared resolver, never from a local filter.
 * Overlapping or drifted sets would make the engine inherit one change's
 * movement while measuring another - the mistake that turns a correlation
 * engine into a rumour mill.
 */
function wallArtListingIds(): string[] {
  return narrativeGroups(buildDemoListings()).tagGroup.map((l) => l.etsyListingId)
}

function seasonalListingIds(): string[] {
  return narrativeGroups(buildDemoListings()).seasonal.map((l) => l.etsyListingId)
}

function signed(percent: number): string {
  return `${percent > 0 ? '+' : ''}${percent}%`
}
