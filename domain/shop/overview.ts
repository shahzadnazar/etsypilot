/*
 * Shop overview.
 *
 * A domain service: the UI asks this, never the Etsy adapter. Every metric it
 * returns carries provenance, because that is part of the return type.
 */

import { loadOrders, ordersWereRead } from '@/domain/orders/load'
import { shopHeader } from '@/domain/sync/source'
import { PERIOD_END, PERIOD_START } from '@/lib/etsy/demo-dataset'
import { previousPeriod } from '@/domain/analytics/service'
import { demoBaseline } from './demo'
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
  /*
   * ── THE BASELINE IS THIS SHOP'S OWN PREVIOUS PERIOD ─────────────────────
   *
   * It was DEMO_BASELINE: 512 orders and $20,287 of revenue, the Willow & Fern
   * figures. Measured in a browser on a live account with two orders:
   *
   *     Gross sales  $74.00   ▼ 99.6%   vs baseline $20,287.00
   *     Orders       2        ▼ 99.6%   vs baseline 512
   *
   * A real seller, on the first screen after signing in, told their shop had
   * collapsed by 99.6% against a shop that is not theirs. The comment two
   * paragraphs down already named this exact failure for the unread case —
   * "the delta makes it worse than a bare zero: it is a claim that the shop
   * collapsed" — and the read case was making the same claim from a constant.
   *
   * The same prior window the analytics screen compares against, so the two
   * screens cannot disagree about what "vs baseline" means.
   */
  const previous = previousPeriod()
  const [shop, { orders, source }, { orders: priorOrders }] = await Promise.all([
    shopHeader(ctx),
    loadOrders(ctx, { since: PERIOD_START, until: PERIOD_END }),
    loadOrders(ctx, { since: previous.start, until: previous.end }),
  ])

  /*
   * Null where there is nothing to compare against.
   *
   * A shop whose first period this is has no earlier period, and a baseline of
   * zero would make every shop's first month read "▲ ∞" or "▲ 100%". The tile
   * drops its delta and says why instead — the same choice the unread case
   * makes below, for the same reason.
   */
  const baseline = demoBaseline() ?? {
    orders: priorOrders.length,
    revenue: round2(priorOrders.reduce((sum, o) => sum + o.gross, 0)),
  }
  const comparable = baseline.orders > 0 || baseline.revenue > 0

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
      deltaPercent: read && comparable ? pctChange(grossRevenue, baseline.revenue) : null,
      note: !read
        ? 'Not synced yet'
        : comparable
          ? `vs ${currency(baseline.revenue, currencyCode)} the period before`
          : 'No earlier period to compare against yet',
      provenance: read
        ? verified(null, 'Your Etsy order receipts', shop?.lastSyncedAt ?? undefined).provenance
        : unread,
    },
    {
      key: 'orders',
      methodologyKey: 'orders',
      label: 'Orders',
      display: read ? String(orderCount) : '—',
      deltaPercent: read && comparable ? pctChange(orderCount, baseline.orders) : null,
      note: !read
        ? 'Not synced yet'
        : comparable
          ? `vs ${baseline.orders} the period before`
          : 'No earlier period to compare against yet',
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

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
