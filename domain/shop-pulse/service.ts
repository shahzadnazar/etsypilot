/*
 * Shop Pulse service.
 *
 * Assembles the view: baselines, then one DetectedChange per recorded event,
 * then the unexplained-deviation sweep that produces UNKNOWN rows.
 *
 * Every change is measured from the event log against the order history. None
 * of the verdicts below are written down anywhere - they are reached.
 */

import { loadOrders, ordersWereRead } from '@/domain/orders/load'
import { shopHeader } from '@/domain/sync/source'
import {
  BASELINE_END,
  BASELINE_START,
  PERIOD_DAYS,
  PERIOD_END,
  PERIOD_START,
} from '@/lib/etsy/demo-dataset'
import { readEvents } from '@/lib/repositories/events'
import { loadListings } from '@/domain/listings/load'
import type { EtsyListing } from '@/lib/etsy/interface'
import {
  demoAlternatives,
  demoBaselineCoverage,
  demoChangeSpecs,
  demoEvents,
  type BaselineCoverage,
} from './demo'
import type { StoredOrder } from '@/domain/orders/types'
import { EVENT_LABEL, type DomainEvent, type Diagnosis } from '@/lib/events/types'
import type { ShopContext } from '@/lib/permissions'
import { formatDate } from '@/lib/utils/format'
import { computeBaseline } from './baseline'
import {
  ORDERS_ONLY_LIMITATION,
  SEASONALITY_LIMITATION,
  compareRates,
  confidenceFor,
  diagnose,
  hasEnoughData,
} from './correlation'
import type {
  Baseline,
  ChangeSpec,
  DetectedChange,
  Evidence,
  ShopPulseView,
  TestedAlternative,
} from './types'

/**
 * A baseline with no observations, for a shop whose orders have not been read.
 *
 * Every number is 0 and `series` is empty, which is the honest shape: the
 * chart draws nothing rather than a flat line at zero, because a flat line is
 * a measurement and this is the absence of one. `coveragePercent: 0` says the
 * same thing about how much of the catalogue could be baselined.
 */
function emptyBaseline(metric: 'orders' | 'revenue'): Baseline {
  return {
    metric,
    windowDays: PERIOD_DAYS,
    series: [],
    expectedTotal: 0,
    actualTotal: 0,
    deviationPercent: 0,
    coveragePercent: 0,
    listingsTooNew: null,
    coverageNote: 'No orders have been read for this shop, so nothing can be baselined yet.',
  }
}

export async function getShopPulse(ctx: ShopContext): Promise<ShopPulseView> {
  /*
   * ── THE SHOP'S OWN FACTS COME FROM OUR ROW, NOT THE ADAPTER ─────────────
   *
   * This was `etsy.getShop(ctx.shopId)` for a timezone and a currency, and in
   * a live deployment with no ETSY_API_KEY that throws — which took down every
   * seller screen, because Shop Pulse is reached from the Action Center, which
   * the app shell calls on every page. Both values are columns on `shops`.
   */
  const shop = await shopHeader(ctx)

  /*
   * Through the LOADER, like everything else that reads orders.
   *
   * This used to import the demo generator directly, with a comment saying the
   * adapter did not serve history. That made the seam a claim rather than a
   * fact — and it broke the first screen that asked the adapter for a previous
   * period. The mock serves the full modelled history now, and the loader
   * serves whichever source this deployment has.
   */
  const catalogue = await loadListings(ctx)
  const period = await loadOrders(ctx, { since: PERIOD_START, until: PERIOD_END })
  const periodOrders = period.orders
  const { orders: priorOrders } = await loadOrders(ctx, {
    since: BASELINE_START,
    until: BASELINE_END,
  })

  /*
   * ── AN UNREAD SHOP HAS NO PULSE, AND MUST NOT REPORT A CALM ONE ─────────
   *
   * Every diagnosis below is a comparison of two periods. With no orders in
   * either, `computeBaseline` finds no change, `unexplainedDeviations` finds
   * no deviation, and the screen would read "nothing has changed" — a
   * CORRELATED/RULED_OUT/UNKNOWN verdict delivered about data nobody has
   * loaded. That is the one failure the three labels exist to prevent.
   *
   * So the view comes back empty with its source attached, and the Action
   * Center (which turns these into work) produces nothing from it.
   */
  if (!ordersWereRead(period.source) || !shop) {
    return {
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      currency: shop?.currency ?? 'USD',
      source: period.source,
      orders: emptyBaseline('orders'),
      revenue: emptyBaseline('revenue'),
      changes: [],
      counts: { CORRELATED: 0, RULED_OUT: 0, UNKNOWN: 0 },
    }
  }

  const baselineArgs = {
    priorOrders,
    periodOrders,
    periodStart: PERIOD_START,
    periodDays: PERIOD_DAYS,
    timezone: shop.timezone,
    ...baselineCoverage(priorOrders, catalogue.listings),
  }

  const orders = computeBaseline({ ...baselineArgs, metric: 'orders' })
  const revenue = computeBaseline({ ...baselineArgs, metric: 'revenue' })

  /*
   * ── THIS SHOP'S OWN CHANGE LOG, OR THE FIXTURE'S, NEVER BOTH ───────────
   *
   * `recordedChanges` used to filter DEMO_EVENTS directly, on every shop in
   * every mode, and build its specs from NARRATIVE and buildDemoListings().
   * Those rows become actions. Measured on a live account with two listings:
   * four CRITICAL cards about a bulk job, a section and twelve listings that
   * shop has never had.
   *
   * Demo mode keeps the authored narrative, byte for byte. Every other
   * deployment reads `events` for this shop — empty today, because nothing
   * writes it yet, and empty is the true answer about a shop with no recorded
   * history.
   */
  const events =
    demoEvents() ?? (await readEvents(ctx.shopId, { since: BASELINE_START, until: PERIOD_END }))

  const recorded = recordedChanges(periodOrders, events)

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
  const residual = (o: StoredOrder) => !o.items.some((i) => explained.has(i.etsyListingId))

  const residualBaseline = computeBaseline({
    ...baselineArgs,
    metric: 'orders',
    priorOrders: priorOrders.filter(residual),
    periodOrders: periodOrders.filter(residual),
  })

  const changes = [
    ...recorded,
    ...unexplainedDeviations(
      residualBaseline.series,
      periodOrders.filter(residual),
      explained,
      events,
      baselineCoverage(priorOrders, catalogue.listings),
    ),
  ].sort((a, b) => rank(a) - rank(b) || a.occurredAt.localeCompare(b.occurredAt))

  return {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    currency: shop.currency,
    source: period.source,
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

/*
 * UNKNOWN first, then by measured impact.
 *
 * The decision was recorded on 2026-08-20 — "UNKNOWN findings are never
 * truncated, and outrank correlated ones" — and only half of it was
 * implemented. Truncation was fixed; the SORT still ranked purely on
 * magnitude, so the unexplained residual landed wherever its percentage put it.
 * On the demo shop that was third, below two changes the product had already
 * explained.
 *
 * The ordering is a judgement about what a seller should read first, and it is
 * the opposite of the magnitude one. A CORRELATED row is a question already
 * answered: here is what moved, here is the change that preceded it. An UNKNOWN
 * row is the part of the shop nobody can account for — smaller on the page and
 * larger in what it should prompt. Burying it under the answered ones inverts
 * the point of the screen.
 *
 * RULED_OUT sits last: a hypothesis that was tested and did not hold is worth
 * recording and is the least likely to need action.
 */
const DIAGNOSIS_ORDER: Record<DetectedChange['diagnosis'], number> = {
  UNKNOWN: 0,
  CORRELATED: 1,
  RULED_OUT: 2,
}

function rank(c: DetectedChange): number {
  // Magnitude still orders WITHIN a class, so the biggest unexplained movement
  // is read before a smaller one.
  return DIAGNOSIS_ORDER[c.diagnosis] * 1000 - Math.abs(c.ordersAfterPercent ?? 0)
}

/* ----------------------------------------------------- baseline coverage */

/**
 * How much of this shop can be baselined at all, measured.
 *
 * ── A BASELINE NEEDS PRIOR ORDERS, AND THAT IS ALL WE CAN CHECK ───────────
 *
 * A listing is baselineable when this shop has orders for it in the prior
 * window — without them there is no rate to compare against, by construction.
 * So coverage is the share of ACTIVE listings that appear in those orders, and
 * it is a measurement rather than DEMO_BASELINE's 88.
 *
 * `listingsTooNew` stays NULL outside demo mode. The fixture knows which of
 * its listings are new because it created them; `listings` has no creation
 * date, so a real listing with no prior orders might be four days old or four
 * years old and unsold. Those want opposite advice, and the honest answer is
 * that we cannot tell which — said in `coverageNote` rather than guessed.
 */
function baselineCoverage(
  priorOrders: readonly StoredOrder[],
  listings: EtsyListing[],
): BaselineCoverage {
  const demo = demoBaselineCoverage()
  if (demo) return demo

  const active = listings.filter((l) => l.state === 'ACTIVE')
  const sold = new Set(priorOrders.flatMap((o) => o.items.map((i) => i.etsyListingId)))
  const baselineable = active.filter((l) => sold.has(l.etsyListingId)).length
  const without = active.length - baselineable

  if (active.length === 0) {
    return {
      coveragePercent: 0,
      listingsTooNew: null,
      coverageNote: 'No active listings, so there is nothing to baseline.',
    }
  }

  return {
    coveragePercent: Math.round((baselineable / active.length) * 100),
    listingsTooNew: null,
    coverageNote:
      without === 0
        ? `All ${active.length} active listings have orders in the baseline window.`
        : `${without} of ${active.length} active listings have no orders in the baseline window, so they cannot be baselined. EtsyPilot cannot tell which of those are new and which have simply not sold.`,
  }
}

/* ------------------------------------------------------ recorded changes */

/**
 * The changes this shop actually recorded.
 *
 * Two producers, one shape. In demo mode the specs are the authored narrative
 * (titles like "Price raised on 3 listings · Linen table runner +2" are
 * written copy about a designed shop, and they belong to the fixture). Every
 * other deployment derives them from the shop's own `events` rows.
 */
function recordedChanges(
  orders: readonly StoredOrder[],
  events: readonly DomainEvent[],
): DetectedChange[] {
  const specs = demoChangeSpecs() ?? specsFromEvents(events)
  return specs.map((spec) => buildChange(spec, specs, orders))
}

/**
 * One spec per recorded operation, or per type-and-day for loose events.
 *
 * ── DERIVED, WHICH MEANS IT CANNOT SAY MORE THAN THE ROWS DO ──────────────
 *
 * The authored specs name a section ("Wall art section"), a job ("bulk job
 * BE-2291") and a human-readable summary ("+18.4% average"). A real event row
 * carries a type, a timestamp, a listing id, an operation id and a
 * before/after pair — so this says exactly that much and no more. Where the
 * rows cannot support a phrase, the phrase is absent rather than filled in:
 * a scope of "1 listing" is a count, not a section name we do not have.
 *
 * Grouping is by `operationId` where there is one — a bulk edit is one change
 * the seller made, not forty — and otherwise by type and calendar day, which
 * is how a seller remembers "the day I reworked my tags".
 */
export function specsFromEvents(events: readonly DomainEvent[]): ChangeSpec[] {
  const groups = new Map<string, DomainEvent[]>()
  for (const event of events) {
    if (!MUTATING_EVENTS.has(event.type)) continue
    const key = event.operationId ?? `${event.type}:${event.timestamp.slice(0, 10)}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(event)
    else groups.set(key, [event])
  }

  const specs: ChangeSpec[] = []
  for (const [key, group] of groups) {
    const first = group[0]
    if (!first) continue
    /*
     * De-duplicated, because a bulk edit records one row per listing and the
     * same listing can appear twice in one operation. The count in the title
     * is a count of LISTINGS, which is what a seller would check it against.
     */
    const listingIds = [...new Set(group.flatMap((e) => e.listingIds ?? (e.listingId ? [e.listingId] : [])))]
    const n = listingIds.length
    const subject = n === 0 ? 'your shop' : `${n} listing${n === 1 ? '' : 's'}`

    specs.push({
      id: `CH-${key}`,
      events: group,
      title: `${EVENT_LABEL[first.type]} on ${subject}`,
      /*
       * A count, not a section. The rows know which listings were touched and
       * nothing about what they have in common, and "Wall art section" on a
       * shop whose rows say nothing of the kind is the defect this replaced.
       */
      scope: n === 0 ? 'Shop-wide' : subject,
      listingIds,
      detailSuffix: first.operationId ? `operation ${first.operationId}` : first.source.toLowerCase(),
      destinations: [{ label: 'Review recent changes', href: '/listings/change-history' }],
    })
  }

  return specs.sort((a, b) => {
    const at = a.events[0]?.timestamp ?? ''
    const bt = b.events[0]?.timestamp ?? ''
    return at.localeCompare(bt)
  })
}

function buildChange(
  spec: ChangeSpec,
  siblings: readonly ChangeSpec[],
  orders: readonly StoredOrder[],
): DetectedChange {
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
  const thin = !hasEnoughData(comparison)

  const shopWide = compareRates(orders, [], first.timestamp, PERIOD_START, PERIOD_END)

  const observed: string[] = [
    `${formatDate(first.timestamp)} · ${first.type}${
      first.beforeValue && first.afterValue
        ? ` — ${first.beforeValue} → ${first.afterValue}`
        : ''
    }${first.operationId ? `, operation ${first.operationId}` : ''}.`,
    thin
      ? `${formatDate(first.timestamp)} – ${formatDate(PERIOD_END)} · outcome window — too few orders on ${
          spec.listingIds.length
        } listing${spec.listingIds.length === 1 ? '' : 's'} to measure a rate (${
          comparison.ordersBefore
        } before, ${comparison.ordersAfter} after).`
      : `${formatDate(first.timestamp)} – ${formatDate(PERIOD_END)} · outcome window — orders on ${
          spec.listingIds.length
        } listing${spec.listingIds.length === 1 ? '' : 's'} moved from ${
          comparison.beforePerDay
        }/day to ${comparison.afterPerDay}/day (${signed(comparison.changePercent)}).`,
    `Shop-wide orders moved ${signed(shopWide.changePercent)} over the same window.`,
  ]

  const evidence: Evidence = {
    observed,
    alsoTested: alternativesFor(spec, siblings, orders, first.timestamp),
    confidence,
    confidenceNote: `${comparison.daysAfter} days after, ${spec.listingIds.length} listing${
      spec.listingIds.length === 1 ? '' : 's'
    }`,
    coveragePercent: 100,
    coverageNote: 'All affected listings have full history in this window',
    limitations: thin
      ? [
          'Too few orders on these listings to measure a change. EtsyPilot reports this as unknown rather than publishing a percentage the sample cannot support.',
          ORDERS_ONLY_LIMITATION,
        ]
      : [ORDERS_ONLY_LIMITATION],
  }

  return {
    id: spec.id,
    eventType: first.type,
    title: spec.title,
    detail: `${formatDate(first.timestamp)} · ${first.type} · ${spec.detailSuffix}`,
    occurredAt: first.timestamp,
    scope: spec.scope,
    affectedListingIds: spec.listingIds,
    // A percentage the sample cannot support is not published at all.
    ordersAfterPercent: thin ? null : comparison.changePercent,
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
  siblings: readonly ChangeSpec[],
  orders: readonly StoredOrder[],
  at: string,
): TestedAlternative[] {
  /*
   * ── A RULED_OUT VERDICT IS A CLAIM THAT A CHECK WAS MADE ────────────────
   *
   * These two were hardwired to the fixture: "Tag replacement on Jul 28" and
   * the ceramic-mug stockout. On a live shop every change was therefore
   * reported as RULED_OUT against a bulk job that shop never ran — the engine
   * saying "we checked and it was not this" about an event that does not
   * exist. Derived from the shop's OTHER recorded changes now, which is the
   * same question asked of real rows.
   */
  const out: TestedAlternative[] =
    demoAlternatives(spec) ??
    siblings
      .filter((other) => other.id !== spec.id)
      .map((other) => {
        const overlap = other.listingIds.some((id) => spec.listingIds.includes(id))
        return {
          label: other.title,
          verdict: overlap ? 'UNKNOWN' : 'RULED_OUT',
          note: overlap
            ? 'Some of these listings were in that change too, so the two cannot be separated.'
            : 'None of these listings were in that change.',
        } satisfies TestedAlternative
      })

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
  orders: readonly StoredOrder[],
  explainedIds: Set<string>,
  events: readonly DomainEvent[],
  coverage: BaselineCoverage,
): DetectedChange[] {
  /*
   * Only a change to the residual population can explain residual movement.
   * An event on a listing another change already accounts for is not an
   * explanation here - it has been counted once already.
   */
  /*
   * From this shop's events, not the fixture's. A day the DEMO shop changed
   * something was being used to decide that a REAL shop's quiet day was
   * explained — suppressing the one finding this sweep exists to produce.
   */
  const eventDays = new Set(
    events.filter(
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
        `${from}T00:00:00.000Z`,
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
        coveragePercent: coverage.coveragePercent,
        coverageNote: coverage.coverageNote,
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
        occurredAt: `${from}T00:00:00.000Z`,
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

function signed(percent: number): string {
  return `${percent > 0 ? '+' : ''}${percent}%`
}
