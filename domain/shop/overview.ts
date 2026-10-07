/*
 * Shop overview.
 *
 * A domain service: the UI asks this, never the Etsy adapter. Every metric it
 * returns carries provenance, because that is part of the return type.
 */

import { loadOrders, ordersWereRead } from '@/domain/orders/load'
import { shopHeader } from '@/domain/sync/source'
import {
  DEMO_BASELINE,
  PERIOD_END,
  PERIOD_START,
} from '@/lib/etsy/demo-dataset'
import { calculated, unavailable, verified } from '@/lib/provenance/builders'
import type { Provenanced } from '@/lib/provenance/types'
import type { ShopContext } from '@/lib/permissions'
import { computeWaterfall } from '@/domain/profit/waterfall'
import { costInputsFrom, loadCosts } from '@/domain/costs/load'

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
  /** NULL when fees for the period are unknown. See the 'net' tile below. */
  netProfit: number | null
}

export async function getShopOverview(ctx: ShopContext): Promise<ShopOverview> {
  const [shop, { orders, source }] = await Promise.all([
    shopHeader(ctx),
    loadOrders(ctx, { since: PERIOD_START, until: PERIOD_END }),
  ])

  const profit = computeWaterfall(orders, costInputsFrom(await loadCosts(ctx)))

  /*
   * ══════════════════════════════════════════════════════════════════════
   *   $0.00 ON THE FIRST SCREEN OF THE PRODUCT IS THE WORST VERSION OF
   *   "ABSENT LOOKS LIKE ZERO".
   * ══════════════════════════════════════════════════════════════════════
   *
   * Every tile below is derived from `orders`. Handed an empty array because
   * nothing has been read, they would read "Gross sales $0.00 · down 100% vs
   * baseline" — a confident, VERIFIED, catastrophic-looking figure about a
   * shop nobody has looked at. The delta makes it worse than a bare zero: it
   * is a claim that the shop collapsed.
   *
   * `read` decides between a figure and an em dash, and it also removes the
   * delta, because there is nothing to compare.
   */
  const read = ordersWereRead(source)
  const currencyCode = shop?.currency ?? 'USD'
  const unread = unavailable(
    'Nothing has been read from this shop yet, so there are no figures for this period.',
    'The first sync fills these in. Until then they are withheld rather than shown as zero.',
  ).provenance

  const grossRevenue = profit.grossRevenue
  const orderCount = orders.length

  const metrics: OverviewMetric[] = [
    {
      key: 'gross',
      methodologyKey: 'grossSales',
      label: 'Gross sales',
      display: read ? currency(grossRevenue, currencyCode) : '—',
      deltaPercent: read ? pctChange(grossRevenue, DEMO_BASELINE.revenue) : null,
      note: read
        ? `vs baseline ${currency(DEMO_BASELINE.revenue, currencyCode)}`
        : 'Not synced yet',
      provenance: read
        ? verified(null, 'Your Etsy order receipts', shop?.lastSyncedAt ?? undefined).provenance
        : unread,
    },
    {
      key: 'orders',
      methodologyKey: 'orders',
      label: 'Orders',
      display: read ? String(orderCount) : '—',
      deltaPercent: read ? pctChange(orderCount, DEMO_BASELINE.orders) : null,
      note: read ? `vs baseline ${DEMO_BASELINE.orders}` : 'Not synced yet',
      provenance: read
        ? verified(null, 'Your Etsy order receipts', shop?.lastSyncedAt ?? undefined).provenance
        : unread,
    },
    {
      key: 'net',
      methodologyKey: 'netProfit',
      label: 'Net profit',
      /*
       * AN EM DASH, NOT A FIGURE, WHEN THE FEES ARE NOT KNOWN.
       *
       * This is the dashboard's headline tile. `currency(profit.netProfit)`
       * on a period with unread fees would have printed revenue minus the
       * seller's own costs and called it net profit — above the truth, on the
       * first screen of the product. The provenance badge changes with it, so
       * the absence is explained rather than just blank.
       */
      display:
        !read || profit.netProfit === null ? '—' : currency(profit.netProfit, currencyCode),
      deltaPercent: null,
      note: !read
        ? 'Not synced yet'
        : profit.netProfit === null
          ? 'Etsy fees for this period have not been read'
          : `${profit.coveragePercent}% cost coverage`,
      provenance: !read
        ? unread
        : profit.netProfit === null
          ? unavailable(
              'Etsy reports fees through the payment-account ledger, not the order receipt, and that ledger has not been read for this period.',
              'Revenue and your own costs are known. Net profit without the fees would read higher than the truth, so it is withheld.',
            ).provenance
          : calculated(null, 'Gross revenue minus fees, processing, ads and your cost inputs.', {
              coverage: profit.coveragePercent,
            }).provenance,
    },
    {
      key: 'listings',
      methodologyKey: 'activeListings',
      label: 'Active listings',
      /*
       * FROM THE SHOP ROW, NOT FROM DEMO_COUNTS.
       *
       * This read `String(DEMO_COUNTS.activeListings)` — a constant — under a
       * VERIFIED badge sourced to "Your connected Etsy shop". Every shop in a
       * live deployment would have shown 450 active listings and 38 drafts,
       * verified, whatever their catalogue actually held. `shopHeader` already
       * returns the real count (null until the listings sync has run), which
       * the app shell's plan chip has been using since the listings slice.
       *
       * The drafts note goes with it: there is no draft count on the shop row,
       * and quoting the demo one beside a real figure would be worse than
       * saying nothing.
       */
      display: shop?.activeListingCount === null || shop === null
        ? '—'
        : String(shop.activeListingCount),
      deltaPercent: null,
      note: shop?.activeListingCount === null ? 'Not synced yet' : 'active on Etsy',
      provenance:
        shop?.activeListingCount === null || shop === null
          ? unread
          : verified(null, 'Your connected Etsy shop', shop.lastSyncedAt ?? undefined).provenance,
    },
  ]

  return {
    shopName: shop?.name ?? 'Shop not found',
    currency: currencyCode,
    timezone: shop?.timezone ?? 'UTC',
    lastSyncedAt: shop?.lastSyncedAt ?? null,
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
