/*
 * Shop analytics (artboard 51).
 *
 * Everything here is computed from the shop's own receipts. Nothing is modelled
 * and nothing is imported, which is why the Traffic and ads panel is an
 * UNAVAILABLE card rather than a chart: Etsy publishes no listing views, no
 * search queries and no Etsy Ads performance, and this product does not
 * estimate them.
 *
 * Two provenance rules do most of the work on this screen:
 *
 *   Summing does not demote. Gross sales and order count are sums of verified
 *   receipt values, so they stay VERIFIED.
 *   Dividing does. Average order value and net margin are ratios over those
 *   sums, so they are CALCULATED (D32).
 */

import { computeWaterfall } from '@/domain/profit/waterfall'
import { getEtsyService } from '@/lib/etsy'
import {
  DEMO_COST_INPUTS,
  PERIOD_DAYS,
  PERIOD_END,
  PERIOD_START,
  demoConfirmedCosts,
} from '@/lib/etsy/demo-dataset'
import type { EtsyListing, EtsyOrder } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'
import { marginOf } from '@/domain/listings/service'

export interface DailyPoint {
  /** YYYY-MM-DD, in UTC. */
  date: string
  revenue: number
  orders: number
  /** The same calendar offset in the previous period, or null before it. */
  previousRevenue: number | null
}

export interface TopListing {
  etsyListingId: string
  title: string
  orders: number
  revenue: number
  /** Null where no confirmed cost exists. Never the default rule's figure. */
  margin: number | null
}

export interface SectionShare {
  section: string
  revenue: number
  /** Share of period revenue, 0–100. */
  percent: number
}

export interface AnalyticsInsight {
  headline: string
  detail: string
}

export interface AnalyticsView {
  periodStart: string
  periodEnd: string
  currency: string
  /** Verified sums. */
  grossSales: number
  orderCount: number
  refundedOrders: number
  refundTotal: number
  /** Calculated ratios. Null where there is nothing to divide. */
  averageOrder: number | null
  netMargin: number | null
  refundRate: number | null
  coveragePercent: number
  /** Change against the previous period of equal length, 0–100 percent. */
  change: { grossSales: number | null; orders: number | null; averageOrder: number | null }
  daily: DailyPoint[]
  topListings: TopListing[]
  sections: SectionShare[]
  insights: AnalyticsInsight[]
  /** True when the shop has no orders in the period at all. */
  empty: boolean
}

export async function getAnalytics(ctx: ShopContext): Promise<AnalyticsView> {
  const etsy = getEtsyService()
  const previous = previousPeriod()

  const [shop, orders, priorOrders, catalogue] = await Promise.all([
    etsy.getShop(ctx.shopId),
    etsy.getOrders(ctx.shopId, { since: PERIOD_START, until: PERIOD_END }),
    etsy.getOrders(ctx.shopId, { since: previous.start, until: previous.end }),
    etsy.getListings(ctx.shopId, { limit: 500 }),
  ])

  const listings = catalogue.listings
  const costs = demoConfirmedCosts(listings)
  const grossSales = round2(sum(orders.map((o) => o.gross)))
  const refunded = orders.filter((o) => o.refunds > 0)
  const waterfall = computeWaterfall(orders, DEMO_COST_INPUTS)

  const priorGross = round2(sum(priorOrders.map((o) => o.gross)))
  const priorAov = priorOrders.length === 0 ? null : priorGross / priorOrders.length

  return {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    currency: shop.currency,
    grossSales,
    orderCount: orders.length,
    refundedOrders: refunded.length,
    refundTotal: round2(sum(refunded.map((o) => o.refunds))),
    /*
     * Null, not zero, when there are no orders. There is no average of nothing,
     * and a $0.00 average order reads as a shop selling at no price rather than
     * a shop that has not sold (D34a).
     */
    averageOrder: orders.length === 0 ? null : round2(grossSales / orders.length),
    netMargin: waterfall.marginPercent,
    refundRate: orders.length === 0 ? null : round1((refunded.length / orders.length) * 100),
    coveragePercent: waterfall.coveragePercent,
    change: {
      grossSales: percentChange(priorGross, grossSales),
      orders: percentChange(priorOrders.length, orders.length),
      averageOrder:
        priorAov === null || orders.length === 0
          ? null
          : percentChange(priorAov, grossSales / orders.length),
    },
    daily: dailySeries(orders, priorOrders),
    topListings: topListings(orders, listings, costs),
    sections: sectionShares(orders, listings, grossSales),
    insights: insightsFrom({ orders, listings, costs, grossSales }),
    empty: orders.length === 0,
  }
}

/** The equal-length window immediately before the reporting period. */
export function previousPeriod(): { start: string; end: string } {
  const start = Date.parse(PERIOD_START)
  const span = PERIOD_DAYS * 86_400_000
  return {
    start: new Date(start - span).toISOString(),
    end: new Date(start - 1).toISOString(),
  }
}

/**
 * Null when there is nothing to compare against.
 *
 * A shop with no previous period gets no arrow, rather than "▲ 100%" — which
 * is what dividing by zero produces and what it would appear to mean.
 */
export function percentChange(before: number, after: number): number | null {
  if (before === 0) return null
  return round1(((after - before) / before) * 100)
}

function dailySeries(orders: EtsyOrder[], priorOrders: EtsyOrder[]): DailyPoint[] {
  const byDay = bucketByDay(orders)
  const priorByDay = bucketByDay(priorOrders)
  const priorKeys = [...priorByDay.keys()].sort()

  return [...byDay.keys()]
    .sort()
    .map((date, index) => {
      const day = byDay.get(date)!
      /*
       * Aligned by POSITION in the previous window, not by date. The comparison
       * the chart draws is "day 1 against day 1", and matching on the calendar
       * date would compare against nothing at all.
       */
      const priorKey = priorKeys[index]
      return {
        date,
        revenue: round2(day.revenue),
        orders: day.orders,
        previousRevenue: priorKey ? round2(priorByDay.get(priorKey)!.revenue) : null,
      }
    })
}

function bucketByDay(orders: EtsyOrder[]): Map<string, { revenue: number; orders: number }> {
  const byDay = new Map<string, { revenue: number; orders: number }>()
  for (const order of orders) {
    // UTC, like every other boundary in this product (D24).
    const date = order.placedAt.slice(0, 10)
    const bucket = byDay.get(date) ?? { revenue: 0, orders: 0 }
    bucket.revenue += order.gross
    bucket.orders += 1
    byDay.set(date, bucket)
  }
  return byDay
}

function topListings(
  orders: EtsyOrder[],
  listings: EtsyListing[],
  costs: Map<string, number>,
): TopListing[] {
  const byListing = new Map<string, { orders: number; revenue: number }>()
  for (const order of orders) {
    const id = order.items[0]?.etsyListingId
    if (!id) continue
    const bucket = byListing.get(id) ?? { orders: 0, revenue: 0 }
    bucket.orders += 1
    bucket.revenue += order.gross
    byListing.set(id, bucket)
  }

  const titles = new Map(listings.map((l) => [l.etsyListingId, l]))
  return [...byListing.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([id, stats]) => {
      const listing = titles.get(id)
      const cost = costs.get(id)
      return {
        etsyListingId: id,
        title: listing?.title ?? 'Unknown listing',
        orders: stats.orders,
        revenue: round2(stats.revenue),
        margin: listing && cost !== undefined ? marginOf(listing.price, cost) : null,
      }
    })
}

function sectionShares(
  orders: EtsyOrder[],
  listings: EtsyListing[],
  grossSales: number,
): SectionShare[] {
  const sectionOf = new Map(listings.map((l) => [l.etsyListingId, l.section]))
  const bySection = new Map<string, number>()
  for (const order of orders) {
    const id = order.items[0]?.etsyListingId ?? ''
    const section = sectionOf.get(id) ?? 'No section'
    bySection.set(section, (bySection.get(section) ?? 0) + order.gross)
  }

  return [...bySection.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([section, revenue]) => ({
      section,
      revenue: round2(revenue),
      percent: grossSales === 0 ? 0 : round1((revenue / grossSales) * 100),
    }))
}

/**
 * Insights, and the rules they obey.
 *
 * Each one is a statement about figures on this screen, phrased as an
 * observation rather than a recommendation the product cannot stand behind.
 * Nothing here claims causality, and nothing appears unless the numbers support
 * it — an empty insights panel is a valid state.
 */
function insightsFrom(args: {
  orders: EtsyOrder[]
  listings: EtsyListing[]
  costs: Map<string, number>
  grossSales: number
}): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = []
  const top = topListings(args.orders, args.listings, args.costs)

  const best = top.filter((t) => t.margin !== null).sort((a, b) => b.margin! - a.margin!)[0]
  const worst = top.filter((t) => t.margin !== null).sort((a, b) => a.margin! - b.margin!)[0]
  /*
   * Ten points, not any difference at all.
   *
   * The first version reported "carries your best margin" on a 0.7-point
   * spread. An insight that fires on noise is worse than no insight: it teaches
   * the reader that this panel is decoration.
   */
  const MATERIAL_SPREAD = 10
  if (
    best &&
    worst &&
    best.etsyListingId !== worst.etsyListingId &&
    best.margin! - worst.margin! >= MATERIAL_SPREAD
  ) {
    insights.push({
      headline: `${best.title} carries your best margin.`,
      detail: `${best.margin}% on ${best.orders} orders, against ${worst.margin}% on ${worst.title}. Both figures use your entered costs and the recorded fee rates.`,
    })
  }

  const uncosted = top.filter((t) => t.margin === null)
  if (uncosted.length > 0) {
    insights.push({
      headline: `${uncosted.length} of your top listings ${uncosted.length === 1 ? 'has' : 'have'} no cost.`,
      detail: `${uncosted.length === 1 ? 'Its' : 'Their'} margin is blank rather than estimated, so ${uncosted.length === 1 ? 'it is' : 'they are'} excluded from every margin figure on this page.`,
    })
  }

  return insights
}

/*
 * Repeat-customer rate is deliberately absent.
 *
 * The artboard shows "Repeat-customer rate is 11.2%", and computing it requires
 * a buyer identifier on every receipt. The same artboard's sales map states
 * that individual buyers are "never shown or stored" — and the cheapest way to
 * keep that promise is for the buyer identifier never to enter the product at
 * all. EtsyOrder does not carry one.
 *
 * So the metric is not shown, rather than shown from data this product declined
 * to hold. Stated on the page beside the panel it would have been in.
 */
export const REPEAT_CUSTOMER_STANCE =
  'EtsyPilot does not read or store buyer identifiers, so it cannot count repeat buyers. The sales map is aggregated by country from the same receipts, and regions with fewer than five orders are suppressed.'

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
