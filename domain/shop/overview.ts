/*
 * Shop overview.
 *
 * A domain service: the UI asks this, never the Etsy adapter. Every metric it
 * returns carries provenance, because that is part of the return type.
 */

import { getEtsyService } from '@/lib/etsy'
import {
  DEMO_BASELINE,
  DEMO_COST_INPUTS,
  DEMO_COUNTS,
  PERIOD_END,
  PERIOD_START,
} from '@/lib/etsy/demo-dataset'
import { calculated, verified } from '@/lib/provenance/builders'
import type { Provenanced } from '@/lib/provenance/types'
import type { ShopContext } from '@/lib/permissions'
import { computeWaterfall } from '@/domain/profit/waterfall'

export interface OverviewMetric {
  key: string
  /** Key into METHODOLOGIES, so the badge can open its explanation. */
  methodologyKey: string
  label: string
  display: string
  /** Delta against the shop's own prior comparable period. */
  deltaPercent: number | null
  note?: string
  provenance: Provenanced<number>['provenance']
}

export interface ShopOverview {
  shopName: string
  currency: string
  timezone: string
  lastSyncedAt: string | null
  periodStart: string
  periodEnd: string
  metrics: OverviewMetric[]
  coveragePercent: number
  netProfit: number
}

export async function getShopOverview(ctx: ShopContext): Promise<ShopOverview> {
  const etsy = getEtsyService()
  const shop = await etsy.getShop(ctx.shopId)
  const orders = await etsy.getOrders(ctx.shopId, { since: PERIOD_START, until: PERIOD_END })

  const profit = computeWaterfall(orders, DEMO_COST_INPUTS)

  const grossRevenue = profit.grossRevenue
  const orderCount = orders.length

  const metrics: OverviewMetric[] = [
    {
      key: 'gross',
      methodologyKey: 'grossSales',
      label: 'Gross sales',
      display: currency(grossRevenue, shop.currency),
      deltaPercent: pctChange(grossRevenue, DEMO_BASELINE.revenue),
      note: `vs baseline ${currency(DEMO_BASELINE.revenue, shop.currency)}`,
      provenance: verified(null, 'Your Etsy order receipts', shop.lastSyncedAt ?? undefined)
        .provenance,
    },
    {
      key: 'orders',
      methodologyKey: 'orders',
      label: 'Orders',
      display: String(orderCount),
      deltaPercent: pctChange(orderCount, DEMO_BASELINE.orders),
      note: `vs baseline ${DEMO_BASELINE.orders}`,
      provenance: verified(null, 'Your Etsy order receipts', shop.lastSyncedAt ?? undefined)
        .provenance,
    },
    {
      key: 'net',
      methodologyKey: 'netProfit',
      label: 'Net profit',
      display: currency(profit.netProfit, shop.currency),
      deltaPercent: null,
      note: `${profit.coveragePercent}% cost coverage`,
      provenance: calculated(null, 'Gross revenue minus fees, processing, ads and your cost inputs.', {
        coverage: profit.coveragePercent,
      }).provenance,
    },
    {
      key: 'listings',
      methodologyKey: 'activeListings',
      label: 'Active listings',
      display: String(DEMO_COUNTS.activeListings),
      deltaPercent: null,
      note: `${DEMO_COUNTS.drafts} drafts`,
      provenance: verified(null, 'Your connected Etsy shop', shop.lastSyncedAt ?? undefined)
        .provenance,
    },
  ]

  return {
    shopName: shop.name,
    currency: shop.currency,
    timezone: shop.timezone,
    lastSyncedAt: shop.lastSyncedAt,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    metrics,
    coveragePercent: profit.coveragePercent,
    netProfit: profit.netProfit,
  }
}

function pctChange(actual: number, baseline: number): number {
  if (baseline === 0) return 0
  return Math.round(((actual - baseline) / baseline) * 1000) / 10
}

function currency(amount: number, code: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  }).format(amount)
}
