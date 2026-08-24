/*
 * Sales map (artboards 57–58).
 *
 * Aggregated by country from the shop's own receipts, which only Etsy can
 * release to the seller. Two privacy properties are structural rather than
 * conventional:
 *
 *   1. The row model carries a COUNTRY and three aggregates. There is no field
 *      a buyer name, address or identifier could be put in, so no future change
 *      to the page can start showing one.
 *
 *   2. Regions with fewer than five orders are folded into one "other regions"
 *      row before the data leaves this file. A country with two orders in a
 *      small market is close to naming the buyers, and suppressing it in the
 *      component would mean the number had already been computed and shipped.
 */

import { getEtsyService } from '@/lib/etsy'
import { PERIOD_END, PERIOD_START } from '@/lib/etsy/demo-dataset'
import type { EtsyOrder } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'

/** Below this, a country is folded into the aggregate row. */
export const SUPPRESSION_THRESHOLD = 5

export interface CountryRow {
  code: string
  name: string
  orders: number
  sales: number
  /*
   * Null on the aggregate row. An average across suppressed countries would be
   * a figure about a group the seller cannot see the members of, and it is not
   * a number anybody can act on.
   */
  averageOrder: number | null
  /** True for the folded "other regions" row. */
  aggregate: boolean
}

export interface SalesMapView {
  periodStart: string
  periodEnd: string
  currency: string
  rows: CountryRow[]
  totalOrders: number
  /** How many distinct countries were folded away, for the caption. */
  suppressedCountries: number
  /** 0–4, for the choropleth's five steps. */
  stepFor: (row: CountryRow) => number
  empty: boolean
}

export async function getSalesMap(ctx: ShopContext): Promise<SalesMapView> {
  const etsy = getEtsyService()
  const [shop, orders] = await Promise.all([
    etsy.getShop(ctx.shopId),
    etsy.getOrders(ctx.shopId, { since: PERIOD_START, until: PERIOD_END }),
  ])

  const rows = aggregateByCountry(orders)
  const maxOrders = Math.max(...rows.filter((r) => !r.aggregate).map((r) => r.orders), 1)

  return {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    currency: shop.currency,
    rows,
    totalOrders: orders.length,
    suppressedCountries: countSuppressed(orders),
    stepFor: (row) => (row.aggregate ? 0 : Math.min(4, Math.floor((row.orders / maxOrders) * 5))),
    empty: orders.length === 0,
  }
}

export function aggregateByCountry(orders: EtsyOrder[]): CountryRow[] {
  const byCountry = new Map<string, { orders: number; sales: number }>()
  for (const order of orders) {
    const bucket = byCountry.get(order.countryCode) ?? { orders: 0, sales: 0 }
    bucket.orders += 1
    bucket.sales += order.gross
    byCountry.set(order.countryCode, bucket)
  }

  const named: CountryRow[] = []
  let otherOrders = 0
  let otherSales = 0
  let otherCountries = 0

  for (const [code, stats] of byCountry) {
    if (stats.orders < SUPPRESSION_THRESHOLD) {
      otherOrders += stats.orders
      otherSales += stats.sales
      otherCountries += 1
      continue
    }
    named.push({
      code,
      name: COUNTRY_NAMES[code] ?? code,
      orders: stats.orders,
      sales: round2(stats.sales),
      averageOrder: round2(stats.sales / stats.orders),
      aggregate: false,
    })
  }

  named.sort((a, b) => b.orders - a.orders)

  if (otherCountries > 0) {
    named.push({
      code: 'OTHER',
      name: `${otherCountries} other ${otherCountries === 1 ? 'region' : 'regions'}`,
      orders: otherOrders,
      sales: round2(otherSales),
      averageOrder: null,
      aggregate: true,
    })
  }

  return named
}

function countSuppressed(orders: EtsyOrder[]): number {
  const byCountry = new Map<string, number>()
  for (const order of orders) {
    byCountry.set(order.countryCode, (byCountry.get(order.countryCode) ?? 0) + 1)
  }
  return [...byCountry.values()].filter((n) => n < SUPPRESSION_THRESHOLD).length
}

/*
 * Only the countries the demo shop sells to, plus the handful a seller is most
 * likely to see. An unrecognised code renders as the code itself rather than as
 * a guess — "XX" is a truthful answer and "Unknown" is not much of one.
 */
const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  GB: 'United Kingdom',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  NL: 'Netherlands',
  IE: 'Ireland',
  NZ: 'New Zealand',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  ES: 'Spain',
  IT: 'Italy',
  JP: 'Japan',
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
